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

  configure(
    clusterId: string,
    config: { url: string; username?: string; password?: string }
  ): void {
    this.registries.set(clusterId, {
      url: config.url.replace(/\/+$/, ''),
      username: config.username,
      password: config.password
    })
  }

  isConfigured(clusterId: string): boolean {
    return this.registries.has(clusterId)
  }

  async listSubjects(clusterId: string): Promise<string[]> {
    return this.request<string[]>(clusterId, 'GET', '/subjects')
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
    version: number
  ): Promise<SchemaVersionInfo> {
    const raw = await this.request<{
      subject: string
      version: number
      id: number
      schema: string
      schemaType?: string
    }>(
      clusterId,
      'GET',
      `/subjects/${encodeURIComponent(subject)}/versions/${version}`
    )

    return {
      subject: raw.subject,
      version: raw.version,
      id: raw.id,
      schema: raw.schema,
      schemaType: raw.schemaType ?? 'AVRO'
    }
  }

  async getSchemaById(
    clusterId: string,
    id: number
  ): Promise<{ schema: string }> {
    return this.request<{ schema: string }>(
      clusterId,
      'GET',
      `/schemas/ids/${id}`
    )
  }

  async getCompatibility(
    clusterId: string,
    subject: string
  ): Promise<string> {
    try {
      const result = await this.request<{ compatibilityLevel: string }>(
        clusterId,
        'GET',
        `/config/${encodeURIComponent(subject)}`
      )
      return result.compatibilityLevel
    } catch (err) {
      // Subject-level config not set — fall back to global
      const global = await this.request<{ compatibilityLevel: string }>(
        clusterId,
        'GET',
        '/config'
      )
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
    version: number
  ): Promise<void> {
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
      const credentials = Buffer.from(
        `${cfg.username}:${cfg.password}`
      ).toString('base64')
      headers['Authorization'] = `Basic ${credentials}`
    }

    const init: RequestInit = { method, headers }

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

      throw new Error(
        `Schema Registry ${method} ${path} failed (${response.status}): ${detail || response.statusText}`
      )
    }

    if (method === 'DELETE' && response.status === 204) {
      return undefined as unknown as T
    }

    return (await response.json()) as T
  }
}

export const schemaService = new SchemaRegistryService()
