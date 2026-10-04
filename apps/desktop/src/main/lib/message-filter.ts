import { JSONPath } from 'jsonpath-plus'
import { RE2 } from 're2-wasm'
const patterns = new Map<string, RE2>()
function keyPattern(pattern: string): RE2 {
  const cached = patterns.get(pattern)
  if (cached) return cached
  if (pattern.length > 200)
    throw new Error('Key regular expressions must be at most 200 characters.')
  let compiled: RE2
  try {
    compiled = new RE2(pattern, 'u')
  } catch {
    throw new Error(
      'Use a valid key regular expression. Lookaround and backreferences are not supported.'
    )
  }
  if (patterns.size >= 100) patterns.clear()
  patterns.set(pattern, compiled)
  return compiled
}
import type { FetchOptions, KafkaMessage } from '../../renderer/src/types'
export function validateFilters(opts: FetchOptions): void {
  if (opts.keyFilter && opts.keyFilterType === 'regex') keyPattern(opts.keyFilter)
  for (const value of [opts.timestampStart, opts.timestampEnd])
    if (value && !Number.isFinite(Date.parse(value))) throw new Error('Choose a valid timestamp')
  if (
    opts.timestampStart &&
    opts.timestampEnd &&
    Date.parse(opts.timestampStart) > Date.parse(opts.timestampEnd)
  )
    throw new Error('Start timestamp must precede end timestamp')
  if (opts.valueFilterType === 'jsonpath' && opts.valueFilter)
    JSONPath({ path: opts.valueFilter, json: {}, eval: false })
}
export function matchesMessage(message: KafkaMessage, opts: FetchOptions): boolean {
  if (opts.timestampStart && Number(message.timestamp) < Date.parse(opts.timestampStart))
    return false
  if (opts.timestampEnd && Number(message.timestamp) > Date.parse(opts.timestampEnd)) return false
  if (
    opts.keyFilter &&
    !(opts.keyFilterType === 'regex'
      ? keyPattern(opts.keyFilter).test(message.key ?? '')
      : message.key === opts.keyFilter)
  )
    return false
  if (opts.valueFilter) {
    if (opts.valueFilterType === 'jsonpath') {
      try {
        return (
          (
            JSONPath({
              path: opts.valueFilter,
              json: JSON.parse(message.value),
              eval: false
            }) as unknown[]
          ).length > 0
        )
      } catch {
        return false
      }
    }
    return message.value.includes(opts.valueFilter)
  }
  return true
}
