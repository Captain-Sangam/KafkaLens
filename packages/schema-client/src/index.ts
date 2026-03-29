export interface SchemaRegistryConfig {
  url: string
  auth?: { username: string; password: string }
}

export interface SchemaRegistryClient {
  listSubjects(): Promise<string[]>
  getVersions(subject: string): Promise<number[]>
  getSchema(subject: string, version: number): Promise<{ id: number; schema: string; schemaType: string }>
  getSchemaById(id: number): Promise<{ schema: string }>
  getCompatibility(subject: string): Promise<string>
}
