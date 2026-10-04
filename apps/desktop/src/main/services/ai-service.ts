import { SYSTEM_PROMPTS } from '../prompts'
import type {
  AISettings,
  AIResponse,
  AIFeature,
  TopicMatch,
  LagSample,
  TopicMetrics,
  ClusterHealthContext
} from '../../renderer/src/types'
export function redactPayload(payload: string, fields: string[]): string {
  if (!fields.length) return payload
  const redactText = (text: string): string =>
    fields.reduce(
      (value, field) =>
        value.replace(
          new RegExp(
            `(${field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:=]\\s*)(?:"[^"\\r\\n]*"|'[^'\\r\\n]*'|[^\\s,;]+)`,
            'gi'
          ),
          '$1[REDACTED]'
        ),
      text
    )
  const visit = (value: unknown, depth = 0): unknown => {
    if (depth >= 100) return '[TRUNCATED]'
    if (typeof value === 'string') return redactText(value)
    if (Array.isArray(value)) return value.map((v) => visit(v, depth + 1))
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).map(([key, v]) => [
          key,
          fields.some((f) => key.toLowerCase().includes(f.toLowerCase()))
            ? '[REDACTED]'
            : visit(v, depth + 1)
        ])
      )
    return value
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    return redactText(payload)
  }
  return JSON.stringify(visit(parsed), null, 2)
}

interface ProviderResponse {
  choices?: { message?: { content?: string }; finish_reason?: string }[]
  content?: { text?: string }[]
  candidates?: { content?: { parts?: { text?: string }[] } }[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    input_tokens?: number
    output_tokens?: number
  }
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
}
export class AIService {
  private config: AISettings | null = null
  private historyRecorder?: (feature: AIFeature, settings: AISettings, response: AIResponse) => void
  setHistoryRecorder(
    record: (feature: AIFeature, settings: AISettings, response: AIResponse) => void
  ): void {
    this.historyRecorder = record
  }
  private requests = new Set<AbortController>()
  configure(config: AISettings): void {
    this.cancel()
    this.config = { ...config, redactedFields: config.redactedFields.filter(Boolean) }
  }
  cancel(): void {
    for (const request of this.requests) request.abort()
    this.requests.clear()
  }
  isConfigured(): boolean {
    return !!(this.config?.enabled && this.config?.consent && this.config.apiKey)
  }
  private assertFeature(feature: AIFeature): AISettings {
    if (!this.isConfigured())
      throw new Error('Enable AI, accept payload sharing, and add an API key in Settings.')
    if (
      this.config!.features?.[feature] === false ||
      (feature === 'anomalies' && this.config!.features?.anomalies !== true)
    )
      throw new Error('This AI feature is disabled in Settings.')
    return this.config!
  }
  async explainMessage(payload: string, schema?: string): Promise<AIResponse> {
    return this.chat(
      'messages',
      SYSTEM_PROMPTS.explainMessage,
      JSON.stringify({
        payload: parsePayload(payload),
        schema: parsePayload(schema ?? 'No schema')
      })
    )
  }
  async analyzeDLQRootCause(kind: string, message: string, payload: string): Promise<AIResponse> {
    return this.chat(
      'dlq',
      SYSTEM_PROMPTS.analyzeDLQRootCause,
      JSON.stringify({
        exceptionClass: kind,
        exceptionMessage: message,
        payload: parsePayload(payload)
      })
    )
  }
  async adviseTopicConfig(
    topic: string,
    configs: Record<string, string>,
    metrics: TopicMetrics
  ): Promise<AIResponse> {
    return this.chat(
      'topics',
      SYSTEM_PROMPTS.adviseTopicConfig,
      JSON.stringify({ topic, configs, metrics })
    )
  }
  async explainSchemaDiff(subject: string, before: string, after: string): Promise<AIResponse> {
    return this.chat(
      'schemas',
      SYSTEM_PROMPTS.explainSchemaDiff,
      JSON.stringify({ subject, before: parsePayload(before), after: parsePayload(after) })
    )
  }
  async summarizeClusterHealth(data: ClusterHealthContext): Promise<AIResponse> {
    return this.chat('health', SYSTEM_PROMPTS.summarizeClusterHealth, JSON.stringify(data))
  }
  async searchTopics(query: string, topics: string[]): Promise<TopicMatch[]> {
    const response = await this.chat(
      'search',
      SYSTEM_PROMPTS.searchTopics,
      JSON.stringify({ query, topics })
    )
    const value: unknown = JSON.parse(response.content.replace(/^```(?:json)?\s*|\s*```$/g, ''))
    if (!Array.isArray(value))
      throw new Error('AI returned an invalid topic search response. Try again.')
    const known = new Set(topics)
    return value
      .filter(
        (v): v is TopicMatch =>
          !!v && typeof v.name === 'string' && typeof v.reason === 'string' && known.has(v.name)
      )
      .slice(0, 20)
  }
  async lagAnomaly(group: string, samples: LagSample[]): Promise<AIResponse> {
    return this.chat('anomalies', SYSTEM_PROMPTS.lagAnomaly, JSON.stringify({ group, samples }))
  }
  async models(settings: AISettings): Promise<string[]> {
    if (settings.provider !== 'openai')
      throw new Error('Enter a custom model name for this provider.')
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${settings.apiKey}` },
      signal: AbortSignal.timeout(15000)
    })
    if (!response.ok)
      throw new Error('Could not list models. Check the API key and provider permissions.')
    const data = (await response.json()) as { data: { id: string }[] }
    return data.data
      .map((m) => m.id)
      .filter((id) => /^(gpt-|o[1-9])/.test(id))
      .sort()
  }
  private async chat(feature: AIFeature, system: string, payload: string): Promise<AIResponse> {
    const config = this.assertFeature(feature)
    const user = redactPayload(payload, config.redactedFields)
    if (user.length > 500000)
      throw new Error(
        'This payload is too large for AI. Select a smaller message or configuration.'
      )
    const controller = new AbortController()
    this.requests.add(controller)
    const timer = setTimeout(() => controller.abort(), 30000)
    let url: string
    let headers: Record<string, string>
    let body: unknown
    if (config.provider === 'openai') {
      url = 'https://api.openai.com/v1/chat/completions'
      headers = { Authorization: `Bearer ${config.apiKey}` }
      body = {
        model: config.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        max_completion_tokens: 4096
      }
    } else if (config.provider === 'anthropic') {
      url = 'https://api.anthropic.com/v1/messages'
      headers = { 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' }
      body = {
        model: config.model,
        system,
        messages: [{ role: 'user', content: user }],
        max_tokens: 4096
      }
    } else {
      url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`
      headers = { 'x-goog-api-key': config.apiKey }
      body = {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: 4096 }
      }
    }
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      })
      if (!response.ok)
        throw new Error(
          `AI request failed (${response.status}). Check your API key, model access, and provider quota.`
        )
      const data = (await response.json()) as ProviderResponse
      const content =
        data.choices?.[0]?.message?.content ??
        data.content?.map((c) => c.text ?? '').join('') ??
        data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ??
        ''
      if (!content)
        throw new Error('AI returned no text. Try a different model or a smaller input.')
      const result: AIResponse = {
        content,
        usage: {
          promptTokens:
            data.usage?.prompt_tokens ??
            data.usage?.input_tokens ??
            data.usageMetadata?.promptTokenCount ??
            0,
          completionTokens:
            data.usage?.completion_tokens ??
            data.usage?.output_tokens ??
            data.usageMetadata?.candidatesTokenCount ??
            0
        }
      }
      if (config.historyEnabled && !controller.signal.aborted)
        this.historyRecorder?.(feature, config, result)
      return result
    } catch (error) {
      if (controller.signal.aborted)
        throw new Error('AI request cancelled or timed out. Try again.')
      throw error
    } finally {
      clearTimeout(timer)
      this.requests.delete(controller)
    }
  }
}
function parsePayload(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}
export const aiService = new AIService()
