import type { SchemaSubject, SchemaDefinition } from '../../renderer/src/types'
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SchemaVersionInfo {
  subject: string
  version: number
  id: number
  schema: string
  schemaType: string
}

interface RegistryConfig {
  url: string
  username?: string
  password?: string
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class SchemaRegistryService {
  private registries = new Map<string, RegistryConfig>()
  private cache = new Map<string, SchemaDefinition>()
  clear(clusterId: string): void {
    this.registries.delete(clusterId)
    for (const key of this.cache.keys()) if (key.startsWith(clusterId + ':')) this.cache.delete(key)
  }

  configure(
    clusterId: string,
    config: { url: string; username?: string; password?: string }
  ): void {
    this.clear(clusterId)
    const url = new URL(config.url)
    if (!['http:', 'https:'].includes(url.protocol))
      throw new Error('Use an HTTP or HTTPS Schema Registry URL')
    this.registries.set(clusterId, {
      url: config.url.replace(/\/+$/, ''),
      username: config.username,
      password: config.password
    })
  }

  isConfigured(clusterId: string): boolean {
    return this.registries.has(clusterId)
  }

  async listSubjects(clusterId: string): Promise<SchemaSubject[]> {
    const names = await this.request<string[]>(clusterId, 'GET', '/subjects')
    const subjects: SchemaSubject[] = []
    for (let i = 0; i < names.length; i += 8) {
      subjects.push(
        ...(await Promise.all(
          names.slice(i, i + 8).map(async (subject) => {
            const [versions, schema, compatibility] = await Promise.all([
              this.getVersions(clusterId, subject),
              this.getSchema(clusterId, subject, 'latest'),
              this.getCompatibility(clusterId, subject)
            ])
            return {
              subject,
              versions,
              latestVersion: schema.version,
              compatibility: compatibility as SchemaSubject['compatibility'],
              schemaType: schema.schemaType as SchemaSubject['schemaType'],
              schema: schema.schema
            }
          })
        ))
      )
    }
    return subjects
  }

  async getVersions(clusterId: string, subject: string): Promise<number[]> {
    return this.request<number[]>(
      clusterId,
      'GET',
      `/subjects/${encodeURIComponent(subject)}/versions`
    )
  }

  async getSchema(
    clusterId: string,
    subject: string,
    version: number | string
  ): Promise<SchemaVersionInfo> {
    const raw = await this.request<{
      subject: string
      version: number | string
      id: number
      schema: string
      schemaType?: string
    }>(clusterId, 'GET', `/subjects/${encodeURIComponent(subject)}/versions/${version}`)

    return {
      subject: raw.subject,
      version: Number(raw.version),
      id: raw.id,
      schema: raw.schema,
      schemaType: raw.schemaType ?? 'AVRO'
    }
  }

  async getSchemaById(clusterId: string, id: number): Promise<SchemaDefinition> {
    const key = `${clusterId}:${id}`
    const cached = this.cache.get(key)
    if (cached) return cached
    const result = await this.request<SchemaDefinition>(clusterId, 'GET', `/schemas/ids/${id}`)
    if (this.cache.size > 1000) this.cache.delete(this.cache.keys().next().value!)
    this.cache.set(key, result)
    return result
  }

  async getCompatibility(clusterId: string, subject: string): Promise<string> {
    try {
      const result = await this.request<{ compatibilityLevel: string }>(
        clusterId,
        'GET',
        `/config/${encodeURIComponent(subject)}`
      )
      return result.compatibilityLevel
    } catch (err) {
      if ((err as { status?: number }).status !== 404) throw err
      // Subject-level config not set — fall back to global
      const global = await this.request<{ compatibilityLevel: string }>(clusterId, 'GET', '/config')
      return global.compatibilityLevel
    }
  }

  async checkCompatibility(
    clusterId: string,
    subject: string,
    schema: string,
    schemaType: string
  ): Promise<{ is_compatible: boolean }> {
    return this.request<{ is_compatible: boolean }>(
      clusterId,
      'POST',
      `/compatibility/subjects/${encodeURIComponent(subject)}/versions/latest`,
      { schema, schemaType }
    )
  }

  async registerSchema(
    clusterId: string,
    subject: string,
    schema: string,
    schemaType: string
  ): Promise<{ id: number }> {
    return this.request<{ id: number }>(
      clusterId,
      'POST',
      `/subjects/${encodeURIComponent(subject)}/versions`,
      { schema, schemaType }
    )
  }

  async deleteSchemaVersion(
    clusterId: string,
    subject: string,
    version: number | string
  ): Promise<void> {
    const referenced = await this.request<number[]>(
      clusterId,
      'GET',
      `/subjects/${encodeURIComponent(subject)}/versions/${version}/referencedby`
    )
    if (referenced.length)
      throw new Error(
        'This version is referenced by other schemas. Migrate those references before deleting it.'
      )
    await this.request<number>(
      clusterId,
      'DELETE',
      `/subjects/${encodeURIComponent(subject)}/versions/${version}`
    )
  }

  // -----------------------------------------------------------------------
  // Internal HTTP helper
  // -----------------------------------------------------------------------

  private getConfig(clusterId: string): RegistryConfig {
    const cfg = this.registries.get(clusterId)
    if (!cfg) {
      throw new Error(
        `Schema Registry not configured for cluster "${clusterId}". Call configure() first.`
      )
    }
    return cfg
  }

  private async request<T>(
    clusterId: string,
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const cfg = this.getConfig(clusterId)
    const url = `${cfg.url}${path}`

    const headers: Record<string, string> = {
      Accept: 'application/vnd.schemaregistry.v1+json',
      'Content-Type': 'application/vnd.schemaregistry.v1+json'
    }

    if (cfg.username && cfg.password) {
      const credentials = Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64')
      headers['Authorization'] = `Basic ${credentials}`
    }

    const init: RequestInit = { method, headers, signal: AbortSignal.timeout(15_000) }

    if (body !== undefined) {
      init.body = JSON.stringify(body)
    }

    const response = await fetch(url, init)

    if (!response.ok) {
      let detail = ''
      try {
        const errBody = (await response.json()) as { message?: string }
        detail = errBody.message ?? ''
      } catch {
        detail = await response.text().catch(() => '')
      }

      throw Object.assign(
        new Error(
          `Schema Registry request failed (${response.status}): ${detail || response.statusText}`
        ),
        { status: response.status }
      )
    }

    if (method === 'DELETE' && response.status === 204) {
      return undefined as unknown as T
    }

    return (await response.json()) as T
  }
}

export const schemaService = new SchemaRegistryService()
