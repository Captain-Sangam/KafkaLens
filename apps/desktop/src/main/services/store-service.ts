import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'node:path'
import { credentialService } from './credential-service'
import type {
  ClusterConfig,
  AISettings,
  ConfigSnapshot,
  AIHistoryEntry,
  AIFeature,
  AIResponse
} from '../../renderer/src/types'

export class StoreService {
  private db!: Database.Database
  init(dbPath = path.join(app.getPath('userData'), 'kafkalens.db')): void {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('secure_delete = ON')
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS clusters (id TEXT PRIMARY KEY, name TEXT NOT NULL, bootstrap_servers TEXT NOT NULL, auth_method TEXT NOT NULL DEFAULT 'none', ssl INTEGER NOT NULL DEFAULT 0, ssl_reject_unauthorized INTEGER NOT NULL DEFAULT 1, username TEXT, password TEXT, ssl_cert_path TEXT, schema_registry_url TEXT, schema_registry_username TEXT, schema_registry_password TEXT, environment_label TEXT NOT NULL DEFAULT 'local', color_tag TEXT NOT NULL DEFAULT '#6366f1', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS favorites (cluster_id TEXT NOT NULL, topic_name TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(cluster_id, topic_name));
      CREATE TABLE IF NOT EXISTS dlq_reviews (cluster_id TEXT NOT NULL, topic_name TEXT NOT NULL, partition INTEGER NOT NULL, offset_val TEXT NOT NULL, reviewed_at INTEGER NOT NULL, PRIMARY KEY(cluster_id, topic_name, partition, offset_val));
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS ai_history (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, feature TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL, response TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS config_history (cluster_id TEXT, broker_id INTEGER, at INTEGER, configs TEXT, PRIMARY KEY(cluster_id, broker_id, at));`)
    const cols = new Set(
      (this.db.pragma('table_info(clusters)') as { name: string }[]).map((c) => c.name)
    )
    for (const [column, definition] of Object.entries({
      ssl: 'INTEGER NOT NULL DEFAULT 0',
      ssl_reject_unauthorized: 'INTEGER NOT NULL DEFAULT 1',
      extra_json: "TEXT NOT NULL DEFAULT '{}'",
      has_credentials: 'INTEGER NOT NULL DEFAULT 0'
    })) {
      if (!cols.has(column)) this.db.exec(`ALTER TABLE clusters ADD COLUMN ${column} ${definition}`)
    }
    // Persist every legacy secret in Keychain before removing plaintext. Failure leaves the original intact.
    const legacy = this.db
      .prepare(
        'SELECT * FROM clusters WHERE username IS NOT NULL OR password IS NOT NULL OR schema_registry_username IS NOT NULL OR schema_registry_password IS NOT NULL'
      )
      .all() as Record<string, unknown>[]
    for (const row of legacy) {
      const secrets = Object.fromEntries(
        Object.entries({
          username: row.username,
          password: row.password,
          registryUsername: row.schema_registry_username,
          registryPassword: row.schema_registry_password
        }).filter(([, v]) => typeof v === 'string')
      ) as Record<string, string>
      credentialService.set(`cluster:${row.id}`, secrets)
      this.db
        .prepare(
          'UPDATE clusters SET username=NULL,password=NULL,schema_registry_username=NULL,schema_registry_password=NULL,has_credentials=1 WHERE id=?'
        )
        .run(row.id)
    }
    const aiRaw = this.getSetting('ai_config')
    if (aiRaw) {
      const ai = JSON.parse(aiRaw) as AISettings
      if (ai.apiKey) {
        credentialService.set('ai', { apiKey: ai.apiKey })
        this.setSetting(
          'ai_config',
          JSON.stringify({ ...ai, apiKey: undefined, hasCredentials: true })
        )
      }
    }
    if (legacy.length || (aiRaw && JSON.parse(aiRaw).apiKey)) {
      this.db.pragma('wal_checkpoint(TRUNCATE)')
      this.db.exec('VACUUM')
      this.db.pragma('wal_checkpoint(TRUNCATE)')
    }
  }
  getClusters(): ClusterConfig[] {
    return (
      this.db.prepare('SELECT * FROM clusters ORDER BY name').all() as Record<string, unknown>[]
    ).map((r) => this.mapCluster(r))
  }
  getCluster(id: string): ClusterConfig | undefined {
    const row = this.db.prepare('SELECT * FROM clusters WHERE id=?').get(id) as
      Record<string, unknown> | undefined
    return row ? this.mapCluster(row) : undefined
  }
  saveCluster(cluster: ClusterConfig): void {
    const secrets = Object.fromEntries(
      Object.entries({
        username: cluster.username,
        password: cluster.password,
        registryUsername: cluster.schemaRegistryAuth?.username,
        registryPassword: cluster.schemaRegistryAuth?.password
      }).filter(([, v]) => typeof v === 'string' && v.length)
    ) as Record<string, string>
    if (Object.keys(secrets).length) credentialService.set(`cluster:${cluster.id}`, secrets)
    const existing = this.db
      .prepare('SELECT has_credentials FROM clusters WHERE id=?')
      .get(cluster.id) as { has_credentials: number } | undefined
    if (!Object.keys(secrets).length && existing?.has_credentials)
      credentialService.delete(`cluster:${cluster.id}`)
    this.db
      .prepare(
        `INSERT OR REPLACE INTO clusters (id,name,bootstrap_servers,auth_method,ssl,ssl_reject_unauthorized,ssl_cert_path,schema_registry_url,environment_label,color_tag,created_at,updated_at,extra_json,has_credentials) VALUES (@id,@name,@bootstrapServers,@authMethod,@ssl,@verify,@ca,@registry,@env,@color,@created,@updated,@extra,@secrets)`
      )
      .run({
        id: cluster.id,
        name: cluster.name,
        bootstrapServers: cluster.bootstrapServers,
        authMethod: cluster.authMethod,
        ssl: cluster.ssl ? 1 : 0,
        verify: cluster.sslRejectUnauthorized === false ? 0 : 1,
        ca: cluster.sslCertPath ?? null,
        registry: cluster.schemaRegistryUrl ?? null,
        env: cluster.environmentLabel,
        color: cluster.colorTag,
        created: cluster.createdAt,
        updated: Date.now(),
        extra: JSON.stringify({
          sslClientCertPath: cluster.sslClientCertPath,
          sslKeyPath: cluster.sslKeyPath
        }),
        secrets: Object.keys(secrets).length ? 1 : 0
      })
  }
  updateCluster(id: string, updates: Partial<ClusterConfig>): void {
    const current = this.getCluster(id)
    if (!current) throw new Error('Cluster not found')
    this.saveCluster({ ...current, ...updates, id, createdAt: current.createdAt })
  }
  deleteCluster(id: string): void {
    const row = this.db.prepare('SELECT has_credentials FROM clusters WHERE id=?').get(id) as
      { has_credentials: number } | undefined
    if (row?.has_credentials) credentialService.delete(`cluster:${id}`)
    this.db.transaction(() => {
      for (const table of ['favorites', 'dlq_reviews', 'config_history'])
        this.db.prepare(`DELETE FROM ${table} WHERE cluster_id=?`).run(id)
      this.db.prepare('DELETE FROM clusters WHERE id=?').run(id)
      const prefix = `cluster:${id}:`
      this.db.prepare('DELETE FROM settings WHERE substr(key,1,length(?))=?').run(prefix, prefix)
    })()
  }
  private mapCluster(row: Record<string, unknown>): ClusterConfig {
    const secret = row.has_credentials ? credentialService.get(`cluster:${row.id}`) : {}
    return {
      id: String(row.id),
      name: String(row.name),
      bootstrapServers: String(row.bootstrap_servers),
      authMethod: row.auth_method as ClusterConfig['authMethod'],
      ssl: !!row.ssl,
      sslRejectUnauthorized: row.ssl_reject_unauthorized !== 0,
      sslCertPath: typeof row.ssl_cert_path === 'string' ? row.ssl_cert_path : undefined,
      schemaRegistryUrl:
        typeof row.schema_registry_url === 'string' ? row.schema_registry_url : undefined,
      environmentLabel: row.environment_label as ClusterConfig['environmentLabel'],
      colorTag: String(row.color_tag),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
      ...JSON.parse(String(row.extra_json ?? '{}')),
      username: secret.username,
      password: secret.password,
      schemaRegistryAuth: secret.registryUsername
        ? { username: secret.registryUsername, password: secret.registryPassword ?? '' }
        : undefined
    }
  }
  getFavorites(id: string): string[] {
    return (
      this.db
        .prepare('SELECT topic_name FROM favorites WHERE cluster_id=? ORDER BY created_at')
        .all(id) as { topic_name: string }[]
    ).map((r) => r.topic_name)
  }
  addFavorite(id: string, topic: string): void {
    this.db.prepare('INSERT OR IGNORE INTO favorites VALUES (?,?,?)').run(id, topic, Date.now())
  }
  removeFavorite(id: string, topic: string): void {
    this.db.prepare('DELETE FROM favorites WHERE cluster_id=? AND topic_name=?').run(id, topic)
  }
  markDLQReviewed(id: string, topic: string, partition: number, offset: string): void {
    this.db
      .prepare('INSERT OR IGNORE INTO dlq_reviews VALUES (?,?,?,?,?)')
      .run(id, topic, partition, offset, Date.now())
  }
  isDLQReviewed(id: string, topic: string, partition: number, offset: string): boolean {
    return !!this.db
      .prepare(
        'SELECT 1 FROM dlq_reviews WHERE cluster_id=? AND topic_name=? AND partition=? AND offset_val=?'
      )
      .get(id, topic, partition, offset)
  }
  getDLQReviewedCount(id: string, topic: string): number {
    return (
      this.db
        .prepare('SELECT COUNT(*) AS cnt FROM dlq_reviews WHERE cluster_id=? AND topic_name=?')
        .get(id, topic) as { cnt: number }
    ).cnt
  }
  getSetting(key: string): string | undefined {
    return (
      this.db.prepare('SELECT value FROM settings WHERE key=?').get(key) as
        { value: string } | undefined
    )?.value
  }
  setSetting(key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run(key, value)
  }
  getAISettings(): AISettings | null {
    const raw = this.getSetting('ai_config')
    if (!raw) return null
    const settings = JSON.parse(raw)
    return {
      ...settings,
      apiKey: settings.hasCredentials ? (credentialService.get('ai').apiKey ?? '') : ''
    } as AISettings
  }
  saveAISettings(settings: AISettings): void {
    if (settings.apiKey) credentialService.set('ai', { apiKey: settings.apiKey })
    else if (this.getAISettings()?.apiKey) credentialService.delete('ai')
    this.setSetting(
      'ai_config',
      JSON.stringify({ ...settings, apiKey: undefined, hasCredentials: !!settings.apiKey })
    )
  }
  recordConfig(id: string, broker: number, configs: Record<string, string>): void {
    const last = this.configHistory(id, broker)[0]
    if (last && JSON.stringify(last.configs) === JSON.stringify(configs)) return
    this.db
      .prepare('INSERT OR REPLACE INTO config_history VALUES (?,?,?,?)')
      .run(id, broker, Date.now(), JSON.stringify(configs))
    this.db
      .prepare(
        'DELETE FROM config_history WHERE cluster_id=? AND broker_id=? AND at NOT IN (SELECT at FROM config_history WHERE cluster_id=? AND broker_id=? ORDER BY at DESC LIMIT 50)'
      )
      .run(id, broker, id, broker)
  }
  configHistory(id: string, broker: number): ConfigSnapshot[] {
    return (
      this.db
        .prepare(
          'SELECT at,configs FROM config_history WHERE cluster_id=? AND broker_id=? ORDER BY at DESC LIMIT 50'
        )
        .all(id, broker) as { at: number; configs: string }[]
    ).map((r) => ({ at: r.at, configs: JSON.parse(r.configs) }))
  }
  recordAI(feature: AIFeature, settings: AISettings, response: AIResponse): void {
    this.db
      .prepare('INSERT INTO ai_history(at,feature,provider,model,response) VALUES(?,?,?,?,?)')
      .run(Date.now(), feature, settings.provider, settings.model, JSON.stringify(response))
    this.db
      .prepare(
        'DELETE FROM ai_history WHERE id NOT IN (SELECT id FROM ai_history ORDER BY id DESC LIMIT 50)'
      )
      .run()
  }
  aiHistory(): AIHistoryEntry[] {
    return (
      this.db.prepare('SELECT * FROM ai_history ORDER BY id DESC LIMIT 50').all() as {
        id: number
        at: number
        feature: AIFeature
        provider: AISettings['provider']
        model: string
        response: string
      }[]
    ).map((r) => ({ ...r, response: JSON.parse(r.response) }))
  }
  clearAIHistory(): void {
    this.db.prepare('DELETE FROM ai_history').run()
    this.db.pragma('wal_checkpoint(TRUNCATE)')
  }
  close(): void {
    this.db?.close()
  }
}
export const storeService = new StoreService()
