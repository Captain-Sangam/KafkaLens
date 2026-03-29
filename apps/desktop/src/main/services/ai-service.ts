import { SYSTEM_PROMPTS } from '../prompts'

type AIProvider = 'openai' | 'anthropic' | 'google'

interface AIConfig {
  provider: AIProvider
  apiKey: string
  model: string
  redactedFields: string[]
}

interface AIResponse {
  content: string
  usage?: { promptTokens: number; completionTokens: number }
}

const PROVIDER_DEFAULTS: Record<AIProvider, { url: string; model: string }> = {
  openai: { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o' },
  anthropic: { url: 'https://api.anthropic.com/v1/messages', model: 'claude-sonnet-4-20250514' },
  google: { url: 'https://generativelanguage.googleapis.com/v1beta/models', model: 'gemini-2.0-flash' },
}

function redactPayload(payload: string, redactedFields: string[]): string {
  if (!redactedFields.length) return payload
  try {
    const obj = JSON.parse(payload)
    redactObject(obj, redactedFields)
    return JSON.stringify(obj, null, 2)
  } catch {
    return payload
  }
}

function redactObject(obj: unknown, fields: string[]): void {
  if (!obj || typeof obj !== 'object') return
  if (Array.isArray(obj)) {
    obj.forEach((item) => redactObject(item, fields))
    return
  }
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    if (fields.some((f) => key.toLowerCase().includes(f.toLowerCase()))) {
      ;(obj as Record<string, unknown>)[key] = '[REDACTED]'
    } else {
      redactObject((obj as Record<string, unknown>)[key], fields)
    }
  }
}

class AIService {
  private config: AIConfig | null = null

  configure(config: Record<string, unknown>): void {
    this.config = {
      provider: (config.provider as AIProvider) ?? 'openai',
      apiKey: String(config.apiKey ?? ''),
      model: String(config.model ?? PROVIDER_DEFAULTS[(config.provider as AIProvider) ?? 'openai'].model),
      redactedFields: Array.isArray(config.redactedFields)
        ? config.redactedFields.map(String)
        : typeof config.redactedFields === 'string'
          ? config.redactedFields.split(',').map((s: string) => s.trim()).filter(Boolean)
          : []
    }
  }

  isConfigured(): boolean {
    return this.config !== null && this.config.apiKey.length > 0
  }

  async explainMessage(payload: string, schema?: string): Promise<AIResponse> {
    const redacted = this.redact(payload)
    let userPrompt = `Kafka message payload:\n\`\`\`json\n${redacted}\n\`\`\``
    if (schema) {
      userPrompt += `\n\nSchema:\n\`\`\`\n${schema}\n\`\`\``
    }
    return this.chat(SYSTEM_PROMPTS.explainMessage, userPrompt)
  }

  async analyzeDLQRootCause(
    exceptionClass: string,
    exceptionMessage: string,
    payload: string
  ): Promise<AIResponse> {
    const redacted = this.redact(payload)
    const userPrompt = [
      `Exception class: ${exceptionClass}`,
      `Exception message: ${exceptionMessage}`,
      `\nMessage payload:\n\`\`\`json\n${redacted}\n\`\`\``
    ].join('\n')
    return this.chat(SYSTEM_PROMPTS.analyzeDLQRootCause, userPrompt)
  }

  async adviseTopicConfig(
    topicName: string,
    config: Record<string, string>,
    metrics: { messageCount: number; partitions: number; consumerLag: number }
  ): Promise<AIResponse> {
    const userPrompt = [
      `Topic: ${topicName}`,
      `\nConfiguration:\n\`\`\`json\n${JSON.stringify(config, null, 2)}\n\`\`\``,
      `\nMetrics:`,
      `- Message count: ${metrics.messageCount}`,
      `- Partitions: ${metrics.partitions}`,
      `- Consumer lag: ${metrics.consumerLag}`
    ].join('\n')
    return this.chat(SYSTEM_PROMPTS.adviseTopicConfig, userPrompt)
  }

  async explainSchemaDiff(subject: string, before: string, after: string): Promise<AIResponse> {
    const userPrompt = [
      `Schema subject: ${subject}`,
      `\nPrevious version:\n\`\`\`\n${before}\n\`\`\``,
      `\nNew version:\n\`\`\`\n${after}\n\`\`\``
    ].join('\n')
    return this.chat(SYSTEM_PROMPTS.explainSchemaDiff, userPrompt)
  }

  async summarizeClusterHealth(data: {
    topics: number
    consumerGroups: number
    brokers: number
    underReplicatedPartitions: number
    totalLag: number
    dlqMessages: number
  }): Promise<AIResponse> {
    const userPrompt = [
      'Cluster statistics:',
      `- Topics: ${data.topics}`,
      `- Consumer groups: ${data.consumerGroups}`,
      `- Brokers: ${data.brokers}`,
      `- Under-replicated partitions: ${data.underReplicatedPartitions}`,
      `- Total consumer lag: ${data.totalLag}`,
      `- DLQ messages: ${data.dlqMessages}`
    ].join('\n')
    return this.chat(SYSTEM_PROMPTS.summarizeClusterHealth, userPrompt)
  }

  private redact(payload: string): string {
    return redactPayload(payload, this.config?.redactedFields ?? [])
  }

  private async chat(systemPrompt: string, userPrompt: string): Promise<AIResponse> {
    if (!this.config || !this.config.apiKey) {
      throw new Error('AI is not configured. Add your API key in Settings.')
    }

    const { provider } = this.config

    switch (provider) {
      case 'openai':
        return this.chatOpenAI(systemPrompt, userPrompt)
      case 'anthropic':
        return this.chatAnthropic(systemPrompt, userPrompt)
      case 'google':
        return this.chatGoogle(systemPrompt, userPrompt)
      default:
        throw new Error(`Unsupported AI provider: ${provider}`)
    }
  }

  private async chatOpenAI(systemPrompt: string, userPrompt: string): Promise<AIResponse> {
    const { apiKey, model } = this.config!

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_completion_tokens: 4096
      })
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`OpenAI API error (${res.status}): ${body}`)
    }

    const data = await res.json()
    const choice = data.choices?.[0]
    const content = choice?.message?.content ?? ''

    if (!content && choice?.finish_reason === 'length') {
      return {
        content: 'The response was too long and got truncated. Try a model with a larger context window.',
        usage: data.usage ? { promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens } : undefined
      }
    }

    return {
      content: content || 'AI returned an empty response.',
      usage: data.usage
        ? { promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens }
        : undefined
    }
  }

  private async chatAnthropic(systemPrompt: string, userPrompt: string): Promise<AIResponse> {
    const { apiKey, model } = this.config!

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Anthropic API error (${res.status}): ${body}`)
    }

    const data = await res.json()
    const content = data.content?.[0]?.text ?? ''

    return {
      content: content || 'AI returned an empty response.',
      usage: data.usage
        ? { promptTokens: data.usage.input_tokens, completionTokens: data.usage.output_tokens }
        : undefined
    }
  }

  private async chatGoogle(systemPrompt: string, userPrompt: string): Promise<AIResponse> {
    const { apiKey, model } = this.config!

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: { maxOutputTokens: 4096 }
      })
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Google AI API error (${res.status}): ${body}`)
    }

    const data = await res.json()
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    const usage = data.usageMetadata

    return {
      content: content || 'AI returned an empty response.',
      usage: usage
        ? { promptTokens: usage.promptTokenCount ?? 0, completionTokens: usage.candidatesTokenCount ?? 0 }
        : undefined
    }
  }
}

export const aiService = new AIService()
