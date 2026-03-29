interface AIConfig {
  apiKey: string
  model: string
  redactedFields: string[]
}

interface AIResponse {
  content: string
  usage?: { promptTokens: number; completionTokens: number }
}

const SYSTEM_PROMPTS = {
  explainMessage:
    'You are a Kafka message analyst. Given a Kafka message payload, explain what this event represents in plain English. Identify key fields and their likely business meaning. Note any anomalies (missing fields, unexpected nulls, unusual values). Be concise.',
  analyzeDLQRootCause:
    'You are a Kafka debugging expert. Given a Dead Letter Queue message with its exception details, analyze the probable root cause, suggest a fix (code-level where possible), and advise whether the message is safe to replay. Be specific and actionable.',
  adviseTopicConfig:
    "You are a Kafka infrastructure advisor. Given a topic's configuration and metrics, compare against known best practices and provide specific recommendations with justification. Flag any risks. Suggest optimal config values.",
  explainSchemaDiff:
    'You are a schema evolution expert. Given two versions of a schema, explain what changed in plain English, whether the change is backward/forward compatible and why, and the impact on existing consumers and producers.',
  summarizeClusterHealth:
    'You are a Kafka cluster health analyst. Given cluster statistics, provide a plain English health report. Highlight any concerns about under-replicated partitions, consumer lag, DLQ accumulation, or other issues. Provide actionable recommendations.'
} as const

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
      apiKey: String(config.apiKey ?? ''),
      model: String(config.model ?? 'gpt-4o'),
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
      throw new Error('AI is not configured. Add your OpenAI API key in Settings.')
    }

    const { apiKey, model } = this.config

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
        content: 'The response was too long and got truncated. Try selecting fewer config keys or a model with a larger context window.',
        usage: data.usage ? { promptTokens: data.usage.prompt_tokens, completionTokens: data.usage.completion_tokens } : undefined
      }
    }

    return {
      content: content || 'AI returned an empty response.',
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens
          }
        : undefined
    }
  }
}

export const aiService = new AIService()
