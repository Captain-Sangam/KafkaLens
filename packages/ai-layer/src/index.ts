export type AIProvider = 'openai' | 'anthropic' | 'google'

export interface AIConfig {
  provider: AIProvider
  apiKey: string
  model: string
  redactedFields: string[]
}

export interface AIResponse {
  content: string
  usage?: { promptTokens: number; completionTokens: number }
}

export interface AIClient {
  explainMessage(payload: string, schema?: string): Promise<AIResponse>
  analyzeDLQ(exception: string, payload: string): Promise<AIResponse>
  adviseTopic(config: Record<string, string>, metrics: Record<string, number>): Promise<AIResponse>
  explainSchemaDiff(before: string, after: string): Promise<AIResponse>
  summarizeClusterHealth(data: unknown): Promise<AIResponse>
}
