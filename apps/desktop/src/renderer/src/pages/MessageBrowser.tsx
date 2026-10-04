import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useUIStore } from '@/stores/uiStore'
import { useClusterStore } from '@/stores/clusterStore'
import { useDataStore } from '@/stores/dataStore'
import { JsonViewer } from '@/components/common/JsonViewer'
import { AIMarkdown } from '@/components/common/AIMarkdown'
import type {
  KafkaMessage,
  FetchOptions,
  TopicPartition,
  ProduceOptions,
  PayloadFormat
} from '@/types'
const field = 'rounded border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary'
const button = 'rounded bg-surface-3 px-3 py-2 text-sm hover:bg-surface-4 disabled:opacity-40'
interface Preset {
  name: string
  options: Omit<FetchOptions, 'topic'>
}
interface Template {
  name: string
  message: ProduceOptions
}
export default function MessageBrowser() {
  const { selectedTopicName: topic, addNotification } = useUIStore()
  const { activeClusterId: cluster } = useClusterStore()
  const { messages, fetchMessages, messagesLoading } = useDataStore()
  const [partitions, setPartitions] = useState<TopicPartition[]>([])
  const [mode, setMode] = useState('latest')
  const [position, setPosition] = useState('')
  const [partition, setPartition] = useState(-1)
  const [limit, setLimit] = useState(50)
  const [keyFilter, setKey] = useState('')
  const [regex, setRegex] = useState(false)
  const [valueFilter, setValue] = useState('')
  const [jsonpath, setJsonpath] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [selected, setSelected] = useState<KafkaMessage | null>(null)
  const [tail, setTail] = useState(false)
  const [produce, setProduce] = useState(false)
  const [ai, setAI] = useState('')
  const [aiBusy, setAIBusy] = useState(false)
  const [presets, setPresets] = useState<Preset[]>([])
  const [presetName, setPresetName] = useState('')
  const cursors = useRef<Record<number, string>>({})
  const bottom = useRef<HTMLDivElement>(null)
  const list = topic ? (messages[topic] ?? []) : []
  const options = useMemo<Omit<FetchOptions, 'topic'>>(
    () => ({
      partition: partition < 0 ? undefined : partition,
      limit,
      offset: mode === 'offset' ? position || '0' : mode === 'timestamp' ? 'earliest' : mode,
      timestamp: mode === 'timestamp' && position ? new Date(position).getTime() : undefined,
      keyFilter,
      keyFilterType: regex ? 'regex' : 'exact',
      valueFilter,
      valueFilterType: jsonpath ? 'jsonpath' : 'substring',
      timestampStart: from || undefined,
      timestampEnd: to || undefined
    }),
    [partition, limit, mode, position, keyFilter, regex, valueFilter, jsonpath, from, to]
  )
  const fetch = useCallback(
    async (extra: Partial<FetchOptions> & { append?: boolean } = {}) => {
      if (!topic || !cluster) return
      const data = await fetchMessages(cluster, topic, { ...options, ...extra })
      cursors.current = { ...useDataStore.getState().messageNextOffsets[topic] }
      for (const message of data) {
        const next = BigInt(message.offset) + 1n
        if (
          !cursors.current[message.partition] ||
          next > BigInt(cursors.current[message.partition])
        )
          cursors.current[message.partition] = String(next)
      }
    },
    [topic, cluster, options, fetchMessages]
  )
  useEffect(() => {
    if (!cluster || !topic) return
    let active = true
    void window.api.topics.partitions(cluster, topic).then((res) => {
      if (active && res.success && res.data) setPartitions(res.data)
    })
    void window.api.settings.get(`cluster:${cluster}:filters:${topic}`).then((res) => {
      if (active && res.data) setPresets(JSON.parse(res.data))
    })
    cursors.current = {}
    void fetch()
    return () => {
      active = false
      useDataStore.getState().cancelMessages(topic)
    }
  }, [cluster, topic])
  useEffect(() => {
    if (!tail) return
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      await fetch({
        offsets: { ...cursors.current },
        offset: 'latest',
        timestamp: undefined,
        append: true
      })
      if (alive) {
        bottom.current?.scrollIntoView({ behavior: 'smooth' })
        timer = setTimeout(poll, 1500)
      }
    }
    void poll()
    return () => {
      alive = false
      clearTimeout(timer)
      if (topic) useDataStore.getState().cancelMessages(topic)
    }
  }, [tail, fetch])
  useEffect(() => {
    const refresh = () => void fetch()
    window.addEventListener('kafkalens:refresh', refresh)
    return () => window.removeEventListener('kafkalens:refresh', refresh)
  }, [fetch])
  const page = async (backward: boolean) => {
    const offsets: Record<number, string> = {}
    for (const p of partitions) {
      const values = list.filter((m) => m.partition === p.partitionId).map((m) => BigInt(m.offset))
      if (values.length)
        offsets[p.partitionId] = String(
          backward
            ? values.reduce((a, b) => (a < b ? a : b))
            : values.reduce((a, b) => (a > b ? a : b)) + 1n
        )
      else offsets[p.partitionId] = String(p.logStartOffset)
    }
    if (!backward) Object.assign(offsets, useDataStore.getState().messageNextOffsets[topic!] ?? {})
    cursors.current = {}
    await fetch({
      offsets,
      offset: 'earliest',
      timestamp: undefined,
      direction: backward ? 'backward' : 'forward'
    })
  }
  const savePreset = async () => {
    if (!presetName.trim() || !cluster || !topic) return
    const next = [...presets.filter((p) => p.name !== presetName), { name: presetName, options }]
    const result = await window.api.settings.set(
      `cluster:${cluster}:filters:${topic}`,
      JSON.stringify(next)
    )
    if (result.success) {
      setPresets(next)
      setPresetName('')
    } else addNotification('error', result.error ?? 'Could not save filter')
  }
  const applyPreset = (name: string) => {
    const preset = presets.find((p) => p.name === name)
    if (!preset) return
    const p = preset.options
    setPartition(p.partition ?? -1)
    setLimit(p.limit ?? 50)
    setMode(
      p.timestamp !== undefined
        ? 'timestamp'
        : p.offset && /^\d+$/.test(p.offset)
          ? 'offset'
          : (p.offset ?? 'latest')
    )
    setPosition(
      p.timestamp !== undefined
        ? new Date(p.timestamp).toISOString().slice(0, 16)
        : p.offset && /^\d+$/.test(p.offset)
          ? p.offset
          : ''
    )
    setKey(p.keyFilter ?? '')
    setRegex(p.keyFilterType === 'regex')
    setValue(p.valueFilter ?? '')
    setJsonpath(p.valueFilterType === 'jsonpath')
    setFrom(p.timestampStart ?? '')
    setTo(p.timestampEnd ?? '')
  }
  const explain = async () => {
    if (!selected) return
    setAIBusy(true)
    setAI('')
    const response = await window.api.ai.explainMessage(
      selected.value,
      selected.schemaId
        ? JSON.stringify((await window.api.schema.getById(cluster!, selected.schemaId)).data)
        : undefined
    )
    setAI(response.data?.content ?? response.error ?? 'No response')
    setAIBusy(false)
  }
  if (!topic || !cluster)
    return (
      <div className="p-12 text-text-muted">
        Select a connected cluster and a topic to browse messages.
      </div>
    )
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="font-mono mr-auto">{topic}</h1>
          <select
            aria-label="Partition"
            value={partition}
            onChange={(e) => setPartition(Number(e.target.value))}
            className={field}
          >
            <option value={-1}>All partitions</option>
            {partitions.map((p) => (
              <option key={p.partitionId} value={p.partitionId}>
                Partition {p.partitionId}
              </option>
            ))}
          </select>
          <select
            aria-label="Offset mode"
            value={mode}
            onChange={(e) => {
              setMode(e.target.value)
              setPosition('')
            }}
            className={field}
          >
            {['latest', 'earliest', 'offset', 'timestamp'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          {['offset', 'timestamp'].includes(mode) && (
            <input
              aria-label="Seek position"
              className={field}
              type={mode === 'timestamp' ? 'datetime-local' : 'number'}
              min={0}
              value={position}
              onChange={(e) => setPosition(e.target.value)}
            />
          )}
          <select
            aria-label="Page size"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className={field}
          >
            {[10, 50, 100, 500].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          <button
            className={button}
            disabled={messagesLoading}
            onClick={() => {
              cursors.current = {}
              void fetch()
            }}
          >
            Fetch
          </button>
          <button className={button} onClick={() => setTail((v) => !v)}>
            {tail ? 'Stop tail' : 'Live tail'}
          </button>
          <button className={button} onClick={() => setProduce(true)}>
            Produce
          </button>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            aria-label="Key filter"
            placeholder="Key"
            className={field}
            value={keyFilter}
            onChange={(e) => setKey(e.target.value)}
          />
          <label className="text-xs flex items-center gap-1">
            <input type="checkbox" checked={regex} onChange={(e) => setRegex(e.target.checked)} />
            Regex
          </label>
          <input
            aria-label="Value filter"
            placeholder={jsonpath ? 'JSONPath, e.g. $.customer.id' : 'Value contains'}
            className={field}
            value={valueFilter}
            onChange={(e) => setValue(e.target.value)}
          />
          <label className="text-xs flex items-center gap-1">
            <input
              type="checkbox"
              checked={jsonpath}
              onChange={(e) => setJsonpath(e.target.checked)}
            />
            JSONPath
          </label>
          <label className="text-xs">
            From{' '}
            <input
              aria-label="From timestamp"
              className={field}
              type="datetime-local"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="text-xs">
            To{' '}
            <input
              aria-label="To timestamp"
              className={field}
              type="datetime-local"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
        <div className="flex gap-2">
          <select
            aria-label="Saved filters"
            className={field}
            onChange={(e) => applyPreset(e.target.value)}
            defaultValue=""
          >
            <option value="">Saved filters</option>
            {presets.map((p) => (
              <option key={p.name}>{p.name}</option>
            ))}
          </select>
          <input
            aria-label="Filter name"
            className={field}
            placeholder="Filter name"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
          />
          <button className={button} onClick={() => void savePreset()}>
            Save filter
          </button>
          <button className={button} disabled={messagesLoading} onClick={() => void page(true)}>
            Previous
          </button>
          <button className={button} disabled={messagesLoading} onClick={() => void page(false)}>
            Next
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-surface-1">
            <tr>
              {['Offset', 'Partition', 'Timestamp', 'Key', 'Value', 'Format'].map((v) => (
                <th className="p-3 text-left" key={v}>
                  {v}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {messagesLoading && !list.length
              ? Array.from({ length: 8 }, (_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="p-3">
                      <div className="h-4 animate-pulse bg-surface-3 rounded" />
                    </td>
                  </tr>
                ))
              : list.map((m) => (
                  <tr
                    key={`${m.partition}:${m.offset}`}
                    className="border-b border-border hover:bg-surface-2"
                  >
                    <td className="p-3">
                      <button
                        className="text-accent"
                        onClick={() => {
                          setSelected(m)
                          setAI('')
                        }}
                      >
                        {m.offset}
                      </button>
                    </td>
                    <td>{m.partition}</td>
                    <td>{new Date(Number(m.timestamp)).toLocaleString()}</td>
                    <td>{m.key?.slice(0, 50) ?? 'null'}</td>
                    <td>{m.value.slice(0, 100)}</td>
                    <td>
                      {m.valueFormat}
                      {m.schemaId ? ` #${m.schemaId}` : ''}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
        {!messagesLoading && !list.length && (
          <p className="p-8 text-text-muted">No matching messages in this offset range.</p>
        )}
        <div ref={bottom} />
      </div>
      {selected && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Message details"
          className="fixed inset-8 z-50 overflow-auto rounded-xl border border-border bg-surface-1 p-6 space-y-4"
        >
          <div className="flex justify-between">
            <h2>
              Partition {selected.partition} · offset {selected.offset}
            </h2>
            <button className={button} onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
          {selected.decodeError && <p className="text-warning">{selected.decodeError}</p>}
          <div className="flex gap-2">
            <button
              className={button}
              onClick={() => void navigator.clipboard.writeText(selected.value)}
            >
              Copy value
            </button>
            <button className={button} disabled={aiBusy} onClick={() => void explain()}>
              Explain with AI
            </button>
            {aiBusy && (
              <button className={button} onClick={() => void window.api.ai.cancel()}>
                Cancel AI
              </button>
            )}
          </div>
          <p className="text-xs text-text-secondary">Key: {selected.key ?? 'null'}</p>
          <JsonViewer message={selected} />
          <pre className="text-xs">{JSON.stringify(selected.headers, null, 2)}</pre>
          {ai && <AIMarkdown content={ai} />}
        </div>
      )}
      {produce && (
        <Producer
          cluster={cluster}
          topic={topic}
          onClose={() => setProduce(false)}
          onSent={() => void fetch()}
        />
      )}
    </div>
  )
}
function Producer({
  cluster,
  topic,
  onClose,
  onSent
}: {
  cluster: string
  topic: string
  onClose: () => void
  onSent: () => void
}) {
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const [headers, setHeaders] = useState('{}')
  const [partition, setPartition] = useState('')
  const [format, setFormat] = useState<PayloadFormat>('json')
  const [schema, setSchema] = useState('')
  const [name, setName] = useState('')
  const [templates, setTemplates] = useState<Template[]>([])
  const [busy, setBusy] = useState(false)
  const notify = useUIStore((s) => s.addNotification)
  const produce = useDataStore((s) => s.produceMessage)
  const storage = `cluster:${cluster}:templates:${topic}`
  useEffect(() => {
    void window.api.settings.get(storage).then((res) => {
      if (res.data) setTemplates(JSON.parse(res.data))
    })
  }, [storage])
  const options = (): ProduceOptions => {
    const parsed: unknown = JSON.parse(headers)
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      Object.values(parsed).some((v) => typeof v !== 'string')
    )
      throw new Error('Headers must be a JSON object containing string values')
    return {
      topic,
      key: key || null,
      value,
      partition: partition ? Number(partition) : undefined,
      headers: parsed as Record<string, string>,
      valueFormat: format,
      schemaId: schema ? Number(schema) : undefined
    }
  }
  const send = async () => {
    setBusy(true)
    try {
      if (await produce(cluster, options())) {
        notify('success', 'Message produced')
        onSent()
        onClose()
      }
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Could not produce')
    } finally {
      setBusy(false)
    }
  }
  const save = async () => {
    try {
      const next = [...templates.filter((t) => t.name !== name), { name, message: options() }]
      const res = await window.api.settings.set(storage, JSON.stringify(next))
      if (!res.success) throw new Error(res.error)
      setTemplates(next)
      setName('')
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Could not save template')
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Produce message"
        className="w-full max-w-2xl rounded-xl bg-surface-1 border border-border p-6 space-y-3"
      >
        <h2>Produce to {topic}</h2>
        <select
          aria-label="Message template"
          className={field}
          defaultValue=""
          onChange={(e) => {
            const t = templates.find((t) => t.name === e.target.value)
            if (t) {
              setKey(t.message.key ?? '')
              setValue(t.message.value)
              setHeaders(JSON.stringify(t.message.headers ?? {}, null, 2))
              setPartition(String(t.message.partition ?? ''))
              setFormat(t.message.valueFormat ?? 'json')
              setSchema(String(t.message.schemaId ?? ''))
            }
          }}
        >
          <option value="">Load template</option>
          {templates.map((t) => (
            <option key={t.name}>{t.name}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            aria-label="Message key"
            placeholder="Key"
            className={field}
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <input
            aria-label="Target partition"
            placeholder="Partition (automatic)"
            type="number"
            min={0}
            className={field}
            value={partition}
            onChange={(e) => setPartition(e.target.value)}
          />
          <select
            aria-label="Payload format"
            className={field}
            value={format}
            onChange={(e) => setFormat(e.target.value as PayloadFormat)}
          >
            {['json', 'string', 'avro', 'binary'].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </div>
        {format === 'avro' && (
          <input
            aria-label="Schema ID"
            placeholder="Schema Registry ID"
            type="number"
            min={1}
            className={field}
            value={schema}
            onChange={(e) => setSchema(e.target.value)}
          />
        )}
        <textarea
          aria-label="Message value"
          className={field + ' w-full font-mono'}
          rows={10}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <textarea
          aria-label="Message headers"
          className={field + ' w-full font-mono'}
          rows={3}
          value={headers}
          onChange={(e) => setHeaders(e.target.value)}
        />
        <div className="flex gap-2">
          <input
            aria-label="Template name"
            className={field}
            placeholder="Template name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button className={button} disabled={!name.trim()} onClick={() => void save()}>
            Save template
          </button>
          <button className={button + ' ml-auto'} onClick={onClose}>
            Cancel
          </button>
          <button className={button} disabled={busy} onClick={() => void send()}>
            {busy ? 'Sending…' : 'Produce'}
          </button>
        </div>
      </div>
    </div>
  )
}
