import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'

interface ClusterRow {
  id: string
  name: string
  bootstrapServers: string
  authMethod: string
  username?: string
  password?: string
  sslCertPath?: string
  schemaRegistryUrl?: string
  schemaRegistryUsername?: string
  schemaRegistryPassword?: string
  environmentLabel: string
  colorTag: string
  createdAt: number
  updatedAt: number
}

interface AISettingsRow {
  enabled: boolean
  provider: string
  apiKey: string
  model: string
  redactedFields: string
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS clusters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  bootstrap_servers TEXT NOT NULL,
  auth_method TEXT NOT NULL DEFAULT 'none',
  username TEXT,
  password TEXT,
  ssl_cert_path TEXT,
  schema_registry_url TEXT,
  schema_registry_username TEXT,
  schema_registry_password TEXT,
  environment_label TEXT NOT NULL DEFAULT 'local',
  color_tag TEXT NOT NULL DEFAULT '#6366f1',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS favorites (
  cluster_id TEXT NOT NULL,
  topic_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (cluster_id, topic_name)
);

CREATE TABLE IF NOT EXISTS dlq_reviews (
  cluster_id TEXT NOT NULL,
  topic_name TEXT NOT NULL,
  partition INTEGER NOT NULL,
  offset_val TEXT NOT NULL,
  reviewed_at INTEGER NOT NULL,
  PRIMARY KEY (cluster_id, topic_name, partition, offset_val)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

class StoreService {
  private db!: Database.Database

  init(): void {
    const dbPath = path.join(app.getPath('userData'), 'kafkalens.db')
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(SCHEMA_SQL)
  }

  // ---------------------------------------------------------------------------
  // Clusters
  // ---------------------------------------------------------------------------

  getClusters(): ClusterRow[] {
    const rows = this.db
      .prepare('SELECT * FROM clusters ORDER BY name')
      .all() as Record<string, unknown>[]
    return rows.map(this.mapClusterRow)
  }

  getCluster(id: string): ClusterRow | undefined {
    const row = this.db
      .prepare('SELECT * FROM clusters WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined
    return row ? this.mapClusterRow(row) : undefined
  }

  saveCluster(cluster: ClusterRow): void {
    this.db
      .prepare(
        `INSERT INTO clusters (
          id, name, bootstrap_servers, auth_method,
          username, password, ssl_cert_path,
          schema_registry_url, schema_registry_username, schema_registry_password,
          environment_label, color_tag, created_at, updated_at
        ) VALUES (
          @id, @name, @bootstrapServers, @authMethod,
          @username, @password, @sslCertPath,
          @schemaRegistryUrl, @schemaRegistryUsername, @schemaRegistryPassword,
          @environmentLabel, @colorTag, @createdAt, @updatedAt
        )`
      )
      .run(cluster)
  }

  // TODO: v2 — migrate sensitive fields (password, schemaRegistryPassword) to OS Keychain
  updateCluster(id: string, updates: Partial<ClusterRow>): void {
    const current = this.getCluster(id)
    if (!current) throw new Error(`Cluster not found: ${id}`)

    const merged = { ...current, ...updates, id, updatedAt: Date.now() }
    this.db
      .prepare(
        `UPDATE clusters SET
          name = @name,
          bootstrap_servers = @bootstrapServers,
          auth_method = @authMethod,
          username = @username,
          password = @password,
          ssl_cert_path = @sslCertPath,
          schema_registry_url = @schemaRegistryUrl,
          schema_registry_username = @schemaRegistryUsername,
          schema_registry_password = @schemaRegistryPassword,
          environment_label = @environmentLabel,
          color_tag = @colorTag,
          updated_at = @updatedAt
        WHERE id = @id`
      )
      .run(merged)
  }

  deleteCluster(id: string): void {
    const del = this.db.transaction(() => {
      this.db.prepare('DELETE FROM favorites WHERE cluster_id = ?').run(id)
      this.db.prepare('DELETE FROM dlq_reviews WHERE cluster_id = ?').run(id)
      this.db.prepare('DELETE FROM clusters WHERE id = ?').run(id)
    })
    del()
  }

  // ---------------------------------------------------------------------------
  // Favorites
  // ---------------------------------------------------------------------------

  getFavorites(clusterId: string): string[] {
    const rows = this.db
      .prepare('SELECT topic_name FROM favorites WHERE cluster_id = ? ORDER BY created_at')
      .all(clusterId) as { topic_name: string }[]
    return rows.map((r) => r.topic_name)
  }

  addFavorite(clusterId: string, topicName: string): void {
    this.db
      .prepare(
        'INSERT OR IGNORE INTO favorites (cluster_id, topic_name, created_at) VALUES (?, ?, ?)'
      )
      .run(clusterId, topicName, Date.now())
  }

  removeFavorite(clusterId: string, topicName: string): void {
    this.db
      .prepare('DELETE FROM favorites WHERE cluster_id = ? AND topic_name = ?')
      .run(clusterId, topicName)
  }

  isFavorite(clusterId: string, topicName: string): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM favorites WHERE cluster_id = ? AND topic_name = ?')
      .get(clusterId, topicName)
    return row !== undefined
  }

  // ---------------------------------------------------------------------------
  // DLQ Reviews
  // ---------------------------------------------------------------------------

  markDLQReviewed(clusterId: string, topic: string, partition: number, offset: string): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO dlq_reviews (cluster_id, topic_name, partition, offset_val, reviewed_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(clusterId, topic, partition, offset, Date.now())
  }

  isDLQReviewed(clusterId: string, topic: string, partition: number, offset: string): boolean {
    const row = this.db
      .prepare(
        'SELECT 1 FROM dlq_reviews WHERE cluster_id = ? AND topic_name = ? AND partition = ? AND offset_val = ?'
      )
      .get(clusterId, topic, partition, offset)
    return row !== undefined
  }

  getDLQReviewedCount(clusterId: string, topic: string): number {
    const row = this.db
      .prepare(
        'SELECT COUNT(*) as cnt FROM dlq_reviews WHERE cluster_id = ? AND topic_name = ?'
      )
      .get(clusterId, topic) as { cnt: number }
    return row.cnt
  }

  // ---------------------------------------------------------------------------
  // Settings (generic key-value)
  // ---------------------------------------------------------------------------

  getSetting(key: string): string | undefined {
    const row = this.db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(key) as { value: string } | undefined
    return row?.value
  }

  setSetting(key: string, value: string): void {
    this.db
      .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
      .run(key, value)
  }

  deleteSetting(key: string): void {
    this.db.prepare('DELETE FROM settings WHERE key = ?').run(key)
  }

  getAISettings(): AISettingsRow | null {
    const raw = this.getSetting('ai_config')
    if (!raw) return null
    try {
      return JSON.parse(raw) as AISettingsRow
    } catch {
      return null
    }
  }

  saveAISettings(settings: AISettingsRow): void {
    this.setSetting('ai_config', JSON.stringify(settings))
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private mapClusterRow(row: Record<string, unknown>): ClusterRow {
    return {
      id: row.id as string,
      name: row.name as string,
      bootstrapServers: row.bootstrap_servers as string,
      authMethod: row.auth_method as string,
      username: row.username as string | undefined,
      password: row.password as string | undefined,
      sslCertPath: row.ssl_cert_path as string | undefined,
      schemaRegistryUrl: row.schema_registry_url as string | undefined,
      schemaRegistryUsername: row.schema_registry_username as string | undefined,
      schemaRegistryPassword: row.schema_registry_password as string | undefined,
      environmentLabel: row.environment_label as string,
      colorTag: row.color_tag as string,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number
    }
  }
}

export const storeService = new StoreService()
