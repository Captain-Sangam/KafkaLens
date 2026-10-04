import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it, expect, vi, afterEach } from 'vitest'
import Database from 'better-sqlite3'
vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))
const secrets = vi.hoisted(() => new Map<string, Record<string, string>>())
vi.mock('../apps/desktop/src/main/services/credential-service', () => ({
  credentialService: {
    set: vi.fn((k: string, v: Record<string, string>) => {
      secrets.set(k, v)
    }),
    get: (k: string) => secrets.get(k) ?? {},
    delete: (k: string) => secrets.delete(k)
  }
}))
import { credentialService } from '../apps/desktop/src/main/services/credential-service'
import { StoreService } from '../apps/desktop/src/main/services/store-service'
import type { ClusterConfig } from '../apps/desktop/src/renderer/src/types'
const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  secrets.clear()
  vi.clearAllMocks()
})
function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'kafkalens-store-'))
  dirs.push(dir)
  return path.join(dir, 'test.db')
}
const config: ClusterConfig = {
  id: 'test',
  name: 'Test',
  bootstrapServers: 'localhost:9092',
  authMethod: 'sasl-plain',
  username: 'user',
  password: 'private-secret',
  schemaRegistryAuth: { username: 'registry', password: 'registry-secret' },
  environmentLabel: 'prod',
  colorTag: '#abcdef',
  createdAt: 1,
  updatedAt: 1,
  ssl: true,
  sslClientCertPath: '/cert',
  sslKeyPath: '/key'
}
describe('secure persistence', () => {
  it('stores credentials only in Keychain and preserves connection metadata', () => {
    const file = fixture()
    const store = new StoreService()
    store.init(file)
    store.saveCluster(config)
    expect(store.getCluster('test')).toMatchObject({ ...config, updatedAt: expect.any(Number) })
    expect(store.getCluster('test')?.sslCertPath).toBeUndefined()
    store.saveAISettings({
      enabled: true,
      provider: 'google',
      model: 'gemini',
      apiKey: 'ai-private',
      redactedFields: [],
      consent: true
    })
    expect(store.getAISettings()?.provider).toBe('google')
    store.close()
    const content = readFileSync(file).toString('latin1')
    for (const secret of ['private-secret', 'registry-secret', 'ai-private'])
      expect(content).not.toContain(secret)
  })
  it('migrates and vacuums legacy plaintext without losing credentials', () => {
    const file = fixture()
    const seed = new StoreService()
    seed.init(file)
    seed.saveCluster({
      ...config,
      username: undefined,
      password: undefined,
      schemaRegistryAuth: undefined
    })
    seed.close()
    const db = new Database(file)
    db.prepare(
      'UPDATE clusters SET username=?,password=?,schema_registry_username=?,schema_registry_password=? WHERE id=?'
    ).run('user', 'legacy-private', 'registry', 'legacy-registry', 'test')
    db.prepare('INSERT INTO settings VALUES (?,?)').run(
      'ai_config',
      JSON.stringify({
        enabled: true,
        provider: 'anthropic',
        model: 'test',
        apiKey: 'legacy-ai',
        redactedFields: []
      })
    )
    db.close()
    const store = new StoreService()
    store.init(file)
    expect(store.getCluster('test')?.password).toBe('legacy-private')
    expect(store.getAISettings()?.apiKey).toBe('legacy-ai')
    store.close()
    const content = readFileSync(file).toString('latin1')
    for (const secret of ['legacy-private', 'legacy-registry', 'legacy-ai'])
      expect(content).not.toContain(secret)
  })
  it('keeps plaintext recoverable if Keychain migration fails', () => {
    const file = fixture()
    const store = new StoreService()
    store.init(file)
    store.saveCluster({
      ...config,
      username: undefined,
      password: undefined,
      schemaRegistryAuth: undefined
    })
    store.close()
    const db = new Database(file)
    db.prepare('UPDATE clusters SET password=? WHERE id=?').run('retained-secret', 'test')
    db.close()
    vi.mocked(credentialService.set).mockImplementationOnce(() => {
      throw new Error('locked')
    })
    const migrate = new StoreService()
    expect(() => migrate.init(file)).toThrow('locked')
    migrate.close()
    const check = new Database(file)
    expect(check.prepare('SELECT password FROM clusters').get()).toEqual({
      password: 'retained-secret'
    })
    check.close()
  })
  it('keeps reviews separate across equal offsets and survives restart', () => {
    const file = fixture()
    let store = new StoreService()
    store.init(file)
    store.markDLQReviewed('a', 't', 0, '7')
    store.markDLQReviewed('a', 't', 1, '7')
    store.close()
    store = new StoreService()
    store.init(file)
    expect(store.getDLQReviewedCount('a', 't')).toBe(2)
    expect(store.isDLQReviewed('b', 't', 0, '7')).toBe(false)
    expect(store.isDLQReviewed('a', 't', 1, '7')).toBe(true)
    store.close()
  })
  it('persists bounded optional response history and clears it durably', () => {
    const file = fixture()
    let store = new StoreService()
    store.init(file)
    const settings = {
      enabled: true,
      provider: 'openai' as const,
      model: 'test',
      apiKey: 'private-api-key',
      redactedFields: []
    }
    for (let i = 0; i < 55; i++) store.recordAI('messages', settings, { content: `Response ${i}` })
    store.close()
    store = new StoreService()
    store.init(file)
    expect(store.aiHistory()).toHaveLength(50)
    expect(store.aiHistory()[0].response.content).toBe('Response 54')
    expect(JSON.stringify(store.aiHistory())).not.toContain('private-api-key')
    store.clearAIHistory()
    store.close()
    store = new StoreService()
    store.init(file)
    expect(store.aiHistory()).toEqual([])
    store.close()
  })
})
