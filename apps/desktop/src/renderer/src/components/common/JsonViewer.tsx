import type { KafkaMessage } from '@/types'
function Tree({ value, label = 'root' }: { value: unknown; label?: string }) {
  if (value && typeof value === 'object')
    return (
      <details open={label === 'root'} className="pl-3 border-l border-border">
        <summary className="cursor-pointer text-info">
          {label} {Array.isArray(value) ? `[${value.length}]` : `{${Object.keys(value).length}}`}
        </summary>
        {Object.entries(value).map(([key, item]) => (
          <Tree key={key} label={key} value={item} />
        ))}
      </details>
    )
  return (
    <div className="pl-3">
      <span className="text-info">{label}: </span>
      <span className={typeof value === 'string' ? 'text-success' : 'text-warning'}>
        {JSON.stringify(value)}
      </span>
    </div>
  )
}
export function JsonViewer({ message }: { message: KafkaMessage }) {
  if (message.isTombstone) return <p className="text-warning text-xs">Tombstone (null value)</p>
  if (message.valueFormat === 'binary') {
    const bytes = message.value.match(/.{1,2}/g) ?? []
    return (
      <pre className="overflow-auto text-xs">
        {Array.from({ length: Math.ceil(bytes.length / 16) }, (_, i) => {
          const row = bytes.slice(i * 16, i * 16 + 16)
          return `${(i * 16).toString(16).padStart(8, '0')}  ${row.join(' ').padEnd(47)}  ${row
            .map((b) => {
              const c = parseInt(b, 16)
              return c >= 32 && c < 127 ? String.fromCharCode(c) : '.'
            })
            .join('')}`
        }).join('\n')}
      </pre>
    )
  }
  try {
    return (
      <div className="font-mono text-xs overflow-auto">
        <Tree value={JSON.parse(message.value)} />
      </div>
    )
  } catch {
    return <pre className="whitespace-pre-wrap text-xs">{message.value}</pre>
  }
}
