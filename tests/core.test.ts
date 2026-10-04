import { describe, it, expect, vi, beforeEach } from 'vitest'
import { lagGrowthPerMinute } from '../apps/desktop/src/renderer/src/lib/lag-growth'
import { AIService, redactPayload } from '../apps/desktop/src/main/services/ai-service'
import { validateFilters, matchesMessage } from '../apps/desktop/src/main/lib/message-filter'
import { createTopicInput, offsetInput, fetchInput } from '../apps/desktop/src/main/lib/validation'
import { exportCluster, csv } from '../apps/desktop/src/renderer/src/lib/files'
import type { KafkaMessage, ClusterConfig } from '../apps/desktop/src/renderer/src/types'
const msg: KafkaMessage = {
  topic: 't',
  partition: 0,
  offset: '0',
  timestamp: '1700000000000',
  key: 'order-1',
  value: '{"a":{"b":false}}',
  headers: {},
  keyFormat: 'string',
  valueFormat: 'json'
}
describe('input validation and filters', () => {
  it('rejects malformed topics, missing reset values, and excessive reads', () => {
    expect(
      createTopicInput.safeParse({ name: '../bad', partitions: 1, replicationFactor: 1 }).success
    ).toBe(false)
    expect(offsetInput.safeParse({ type: 'to-offset' }).success).toBe(false)
    expect(fetchInput.safeParse({ topic: 't', limit: 501 }).success).toBe(false)
  })
  it('accepts JSONPath existence for false and rejects executable paths and invalid regex', () => {
    expect(
      matchesMessage(msg, { topic: 't', valueFilter: '$.a.b', valueFilterType: 'jsonpath' })
    ).toBe(true)
    expect(() => validateFilters({ topic: 't', keyFilter: '[', keyFilterType: 'regex' })).toThrow()
    expect(() =>
      validateFilters({ topic: 't', keyFilter: '(a)\\1', keyFilterType: 'regex' })
    ).toThrow()
    expect(
      matchesMessage(
        { ...msg, key: 'a'.repeat(100000) + 'b' },
        { topic: 't', keyFilter: '^(a|aa)+$', keyFilterType: 'regex' }
      )
    ).toBe(false)
    expect(
      matchesMessage(msg, {
        topic: 't',
        valueFilter: '$[?(@.a.constructor.constructor("return process")())]',
        valueFilterType: 'jsonpath'
      })
    ).toBe(false)
  })
  it('handles timestamps as epoch milliseconds', () => {
    expect(matchesMessage(msg, { topic: 't', timestampStart: '2023-11-15T00:00:00Z' })).toBe(false)
  })
})

describe('consumer lag growth', () => {
  it('uses recent growth per minute rather than absolute lag', () => {
    expect(
      lagGrowthPerMinute([
        { at: 0, lag: 0 },
        { at: 60000, lag: 100000 },
        { at: 90000, lag: 100000 },
        { at: 120000, lag: 100000 }
      ])
    ).toBe(0)
    expect(
      lagGrowthPerMinute([
        { at: 0, lag: 1000 },
        { at: 30000, lag: 2000 },
        { at: 60000, lag: 3000 }
      ])
    ).toBe(2000)
  })
  it('does not alert for rapid manual refreshes or falling lag', () => {
    expect(
      lagGrowthPerMinute([
        { at: 0, lag: 0 },
        { at: 100, lag: 1000 },
        { at: 200, lag: 2000 }
      ])
    ).toBe(0)
    expect(
      lagGrowthPerMinute([
        { at: 0, lag: 1000 },
        { at: 30000, lag: 900 },
        { at: 60000, lag: 800 }
      ])
    ).toBe(0)
  })
})
describe('AI consent and provider contract', () => {
  beforeEach(() => vi.unstubAllGlobals())
  it('redacts nested objects and arrays before leaving the process', () => {
    expect(
      JSON.parse(
        redactPayload('{"users":[{"password":"secret","name":"a"}],"accessToken":"x"}', [
          'password',
          'token'
        ])
      )
    ).toEqual({ users: [{ password: '[REDACTED]', name: 'a' }], accessToken: '[REDACTED]' })
  })

  it('redacts secrets inside plain-text payload and exception fields and bounds nesting', () => {
    expect(
      JSON.parse(
        redactPayload(
          JSON.stringify({
            payload: 'password="private word"',
            exceptionMessage: 'token=private-token'
          }),
          ['password', 'token']
        )
      )
    ).toEqual({ payload: 'password=[REDACTED]', exceptionMessage: 'token=[REDACTED]' })
    let nested: unknown = { password: 'private-deep' }
    for (let i = 0; i < 200; i++) nested = { value: nested }
    const redacted = redactPayload(JSON.stringify(nested), ['password'])
    expect(redacted).not.toContain('private-deep')
    expect(redacted).toContain('[TRUNCATED]')
  })
  it('records only responses when local history is explicitly enabled', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'Response' } }] })
      })
    )
    const ai = new AIService(),
      record = vi.fn()
    ai.setHistoryRecorder(record)
    const config = {
      enabled: true,
      consent: true,
      provider: 'openai' as const,
      apiKey: 'test',
      model: 'test',
      redactedFields: ['password']
    }
    ai.configure(config)
    await ai.explainMessage('{"password":"private"}')
    expect(record).not.toHaveBeenCalled()
    ai.configure({ ...config, historyEnabled: true })
    await ai.explainMessage('{"password":"private"}')
    expect(record).toHaveBeenCalledWith(
      'messages',
      expect.objectContaining({ historyEnabled: true }),
      expect.objectContaining({ content: 'Response' })
    )
  })

  it('cancels in-flight requests immediately when AI is disabled', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(
          (_url, opts: { signal: AbortSignal }) =>
            new Promise((_, reject) =>
              opts.signal.addEventListener('abort', () => reject(new Error('aborted')))
            )
        )
    )
    const ai = new AIService(),
      record = vi.fn()
    const config = {
      enabled: true,
      consent: true,
      historyEnabled: true,
      provider: 'openai' as const,
      apiKey: 'test',
      model: 'test',
      redactedFields: []
    }
    ai.setHistoryRecorder(record)
    ai.configure(config)
    const pending = expect(ai.explainMessage('{}')).rejects.toThrow('cancelled')
    ai.configure({ ...config, enabled: false })
    await pending
    expect(record).not.toHaveBeenCalled()
    expect(ai.isConfigured()).toBe(false)
  })
  it('bounds provider requests with a timeout', async () => {
    vi.useFakeTimers()
    try {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockImplementation(
            (_url, opts: { signal: AbortSignal }) =>
              new Promise((_, reject) =>
                opts.signal.addEventListener('abort', () => reject(new Error('aborted')))
              )
          )
      )
      const ai = new AIService()
      ai.configure({
        enabled: true,
        consent: true,
        provider: 'openai',
        apiKey: 'test',
        model: 'test',
        redactedFields: []
      })
      const pending = expect(ai.explainMessage('{}')).rejects.toThrow('timed out')
      await vi.advanceTimersByTimeAsync(30001)
      await pending
    } finally {
      vi.useRealTimers()
    }
  })
  it('uses the Anthropic request and usage contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'Explanation' }],
        usage: { input_tokens: 5, output_tokens: 7 }
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    const ai = new AIService()
    ai.configure({
      enabled: true,
      consent: true,
      provider: 'anthropic',
      apiKey: 'fixture-key',
      model: 'claude-test',
      redactedFields: []
    })
    expect(await ai.explainMessage('{}')).toEqual({
      content: 'Explanation',
      usage: { promptTokens: 5, completionTokens: 7 }
    })
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(options.headers['x-api-key']).toBe('fixture-key')
    expect(JSON.parse(options.body).max_tokens).toBe(4096)
  })

  it('requires explicit background anomaly opt-in at the service boundary', async () => {
    const ai = new AIService()
    ai.configure({
      enabled: true,
      consent: true,
      provider: 'openai',
      apiKey: 'test',
      model: 'test',
      redactedFields: []
    })
    await expect(ai.lagAnomaly('g', [{ at: 0, lag: 1000 }])).rejects.toThrow('disabled')
  })
  it('requires consent and respects disabled features', async () => {
    const ai = new AIService()
    ai.configure({
      enabled: true,
      provider: 'openai',
      apiKey: 'test',
      model: 'test',
      redactedFields: []
    })
    await expect(ai.explainMessage('x')).rejects.toThrow('sharing')
    ai.configure({
      enabled: true,
      consent: true,
      provider: 'openai',
      apiKey: 'test',
      model: 'test',
      redactedFields: [],
      features: { messages: false }
    })
    await expect(ai.explainMessage('x')).rejects.toThrow('disabled')
  })
  it('uses the configured Gemini provider and aborts when disabled', async () => {
    const ai = new AIService()
    const request = vi.fn(async (url: string, opts: RequestInit) => {
      expect(url).toContain('generativelanguage')
      expect(url).not.toContain('test-secret')
      expect(opts.headers).toMatchObject({ 'x-goog-api-key': 'test-secret' })
      return new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] }),
        { status: 200 }
      )
    })
    vi.stubGlobal('fetch', request)
    ai.configure({
      enabled: true,
      consent: true,
      provider: 'google',
      apiKey: 'test-secret',
      model: 'gemini-test',
      redactedFields: []
    })
    expect((await ai.explainMessage('x')).content).toBe('OK')
    ai.configure({
      enabled: false,
      provider: 'google',
      apiKey: 'test-secret',
      model: 'gemini-test',
      redactedFields: []
    })
    expect(ai.isConfigured()).toBe(false)
  })
})
describe('exports', () => {
  it('excludes Kafka and Registry credentials', () => {
    const result = exportCluster({
      id: 'x',
      username: 'u',
      password: 'secret',
      schemaRegistryAuth: { username: 'r', password: 'p' },
      sslClientCertPath: '/a',
      sslKeyPath: '/b'
    } as ClusterConfig)
    expect(result).not.toHaveProperty('password')
    expect(result).not.toHaveProperty('username')
    expect(result).not.toHaveProperty('schemaRegistryAuth')
    expect(result.sslKeyPath).toBe('/b')
  })
  it('escapes CSV formulas, commas and quotes', () =>
    expect(csv([['=SUM(A1)', 'a,b', '"x"']])).toBe('"\'=SUM(A1)","a,b","""x"""'))
})
