import { useEffect, useState } from 'react'
import { useClusterStore } from '@/stores/clusterStore'
import { useDataStore } from '@/stores/dataStore'
import { useUIStore } from '@/stores/uiStore'
import { useConfirmation } from '@/components/common/ConfirmationDialog'
import { Button, Input, Select } from '@/components/common/Controls'
import { JsonViewer } from '@/components/common/JsonViewer'
import { AIMarkdown } from '@/components/common/AIMarkdown'
import { useRefresh } from '@/lib/useRefresh'
import type { KafkaMessage } from '@/types'
const EMPTY_MESSAGES: KafkaMessage[] = []
function key(m: KafkaMessage) {
  return `${m.partition}:${m.offset}`
}
export default function DLQDashboard() {
  const { activeClusterId, clusters } = useClusterStore()
  const { topics, messages, messagesLoading, fetchTopics, fetchMessages, produceMessage } =
    useDataStore()
  const notify = useUIStore((s) => s.addNotification)
  const { confirm, dialog } = useConfirmation()
  const [topic, setTopic] = useState('')
  const [reviewed, setReviewed] = useState(new Set<string>())
  const [selected, setSelected] = useState(new Set<string>())
  const [expanded, setExpanded] = useState('')
  const [filter, setFilter] = useState('')
  const [reviewFilter, setReviewFilter] = useState('all')
  const [custom, setCustom] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [ai, setAI] = useState('')
  const dlqs = topics.filter((t) => t.isDLQ)
  const loaded = messages[topic] ?? EMPTY_MESSAGES
  const production = clusters.find((c) => c.id === activeClusterId)?.environmentLabel === 'prod'
  async function refresh() {
    if (activeClusterId) {
      await fetchTopics(activeClusterId)
      if (topic) await fetchMessages(activeClusterId, topic, { offset: 'earliest', limit: 100 })
    }
  }
  useRefresh(refresh)
  useEffect(() => {
    setTopic('')
    setReviewed(new Set())
    setSelected(new Set())
    setAI('')
    if (activeClusterId) void fetchTopics(activeClusterId)
  }, [activeClusterId, fetchTopics])
  useEffect(() => {
    setSelected(new Set())
    setExpanded('')
    setReviewed(new Set())
    if (activeClusterId && topic)
      void fetchMessages(activeClusterId, topic, { offset: 'earliest', limit: 100 })
  }, [activeClusterId, topic, fetchMessages])
  useEffect(() => {
    let alive = true
    if (activeClusterId && topic)
      void Promise.all(
        loaded.map(async (m) => {
          const r = await window.api.dlq.isReviewed(activeClusterId, topic, m.partition, m.offset)
          return r.success && r.data ? key(m) : null
        })
      ).then((rows) => {
        if (alive) setReviewed(new Set(rows.filter((v): v is string => v !== null)))
      })
    return () => {
      alive = false
    }
  }, [activeClusterId, topic, loaded])
  async function mark(m: KafkaMessage) {
    if (!activeClusterId) return
    const r = await window.api.dlq.markReviewed(activeClusterId, topic, m.partition, m.offset)
    if (r.success) setReviewed((s) => new Set([...s, key(m)]))
    else notify('error', r.error ?? 'Could not save review')
  }
  async function replay(rows: KafkaMessage[]) {
    if (!activeClusterId || !rows.length) return
    const missing = rows.some((m) => !custom && !m.headers['kafka_dlt-original-topic'])
    if (missing) {
      notify('error', 'Choose a target topic for messages without an original-topic header')
      return
    }
    const destinations = [
      ...new Set(rows.map((m) => custom || m.headers['kafka_dlt-original-topic']))
    ]
    if (destinations.some((t) => t === topic)) {
      notify('error', 'Choose a target different from the DLQ topic')
      return
    }
    if (
      !(await confirm({
        title: 'Replay DLQ messages',
        message: `Produce ${rows.length} selected message(s) to ${destinations.join(', ')}. Successful messages will be marked reviewed; their DLQ records stay in Kafka.`,
        resource: topic,
        production
      }))
    )
      return
    setBusy(true)
    let done = 0
    for (const [i, m] of rows.entries()) {
      if (useClusterStore.getState().activeClusterId !== activeClusterId) break
      setProgress(`${i + 1}/${rows.length}`)
      const ok = await produceMessage(activeClusterId, {
        topic: custom || m.headers['kafka_dlt-original-topic'],
        key: m.key,
        value: m.value,
        rawKey: m.rawKey,
        tombstone: m.isTombstone,
        rawValue: m.rawValue,
        rawHeaders: m.rawHeaders,
        headers: m.headers
      })
      if (ok) {
        done++
        await mark(m)
      }
    }
    setBusy(false)
    setSelected(new Set())
    notify(done === rows.length ? 'success' : 'warning', `Replayed ${done}/${rows.length} messages`)
  }
  async function next() {
    if (!activeClusterId) return
    const metadata = await window.api.topics.partitions(activeClusterId, topic)
    if (!metadata.success) return
    const offsets = Object.fromEntries(
      (metadata.data ?? []).map((p) => {
        const seen = loaded.filter((m) => m.partition === p.partitionId)
        return [
          p.partitionId,
          seen.length
            ? (
                BigInt(
                  seen.reduce((a, b) => (BigInt(a.offset) > BigInt(b.offset) ? a : b)).offset
                ) + 1n
              ).toString()
            : String(p.logStartOffset)
        ]
      })
    )
    Object.assign(offsets, useDataStore.getState().messageNextOffsets[topic] ?? {})
    await fetchMessages(activeClusterId, topic, { offsets, limit: 100, append: true })
  }
  const shown = loaded.filter(
    (m) =>
      (reviewFilter === 'all' || reviewed.has(key(m)) === (reviewFilter === 'reviewed')) &&
      `${m.key ?? ''} ${m.headers['kafka_dlt-exception-fqcn'] ?? ''} ${m.headers['kafka_dlt-exception-message'] ?? ''} ${m.value}`
        .toLowerCase()
        .includes(filter.toLowerCase())
  )
  const message = loaded.find((m) => key(m) === expanded)
  async function analyze() {
    if (!message) return
    setBusy(true)
    const r = await window.api.ai.analyzeDLQ(
      message.headers['kafka_dlt-exception-fqcn'] ?? '',
      message.headers['kafka_dlt-exception-message'] ?? '',
      message.value
    )
    setBusy(false)
    if (r.success) setAI(r.data?.content ?? '')
    else notify('error', r.error ?? 'AI analysis failed')
  }
  return (
    <div className="p-6 space-y-4">
      <div className="flex gap-3 items-center">
        <h1 className="text-lg font-semibold">Dead Letter Queues</h1>
        <Button onClick={refresh}>Refresh</Button>
      </div>
      <div className="flex flex-wrap gap-3">
        {dlqs.map((t) => (
          <button
            key={t.name}
            onClick={() => setTopic(t.name)}
            className={`rounded border p-3 text-xs ${topic === t.name ? 'border-accent' : 'border-border'}`}
          >
            <strong>{t.name}</strong>
            <p>{t.messageCount.toLocaleString()} offset span</p>
          </button>
        ))}
      </div>
      {!dlqs.length && (
        <p className="text-text-muted">No DLQ topics found. Configure name patterns in Settings.</p>
      )}
      {topic && (
        <>
          <div className="flex flex-wrap gap-2">
            <Input
              aria-label="DLQ filter"
              placeholder="Filter exceptions, keys, values…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <Select
              aria-label="Review filter"
              value={reviewFilter}
              onChange={(e) => setReviewFilter(e.target.value)}
            >
              {['all', 'reviewed', 'unreviewed'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </Select>
            <Input
              aria-label="Replay target"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Custom target (otherwise original)"
            />
            <Button
              disabled={busy || !selected.size}
              onClick={() => replay(loaded.filter((m) => selected.has(key(m))))}
            >
              Replay selected ({selected.size}) {busy ? progress : ''}
            </Button>
            <Button onClick={next} disabled={messagesLoading}>
              Load next 100
            </Button>
          </div>
          <p className="text-xs text-text-muted">
            {loaded.length} loaded · {loaded.filter((m) => !reviewed.has(key(m))).length} unreviewed
            among loaded records. Showing up to 2,000 records per topic.
          </p>
          {messagesLoading && (
            <p role="status" className="animate-pulse">
              Loading DLQ messages…
            </p>
          )}
          <table className="w-full text-xs">
            <thead>
              <tr>
                {['Select', 'Partition / Offset', 'Timestamp', 'Key', 'Exception', 'Review'].map(
                  (h) => (
                    <th key={h} className="p-2 text-left">
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {shown.map((m) => (
                <tr key={key(m)} className="border-t border-border">
                  <td className="p-2">
                    <input
                      type="checkbox"
                      aria-label={`Select ${key(m)}`}
                      checked={selected.has(key(m))}
                      onChange={(e) =>
                        setSelected((s) => {
                          const n = new Set(s)
                          if (e.target.checked) n.add(key(m))
                          else n.delete(key(m))
                          return n
                        })
                      }
                    />
                  </td>
                  <td>
                    <button
                      onClick={() => {
                        setExpanded(key(m))
                        setAI('')
                      }}
                      className="text-accent"
                    >
                      {key(m)}
                    </button>
                  </td>
                  <td>{new Date(Number(m.timestamp)).toLocaleString()}</td>
                  <td>{m.key}</td>
                  <td>{m.headers['kafka_dlt-exception-fqcn'] ?? 'Unknown'}</td>
                  <td>
                    {reviewed.has(key(m)) ? (
                      'Reviewed'
                    ) : (
                      <Button onClick={() => mark(m)}>Mark reviewed</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {message && (
            <section className="rounded border border-border p-4 space-y-3">
              <div className="flex gap-2">
                <strong>Message {key(message)}</strong>
                <Button onClick={() => setExpanded('')}>Close</Button>
                <Button disabled={busy} onClick={() => replay([message])}>
                  Replay message
                </Button>
                <Button disabled={busy} onClick={analyze}>
                  Root cause with AI
                </Button>
              </div>
              <p className="text-danger text-xs">
                {message.headers['kafka_dlt-exception-message']}
              </p>
              <p className="text-xs">
                Original topic: {message.headers['kafka_dlt-original-topic'] ?? 'Unknown'} ·
                Partition: {message.headers['kafka_dlt-original-partition'] ?? 'Unknown'} · Offset:{' '}
                {message.headers['kafka_dlt-original-offset'] ?? 'Unknown'} · Retries:{' '}
                {message.headers['x-retry-count'] ?? '0'}
              </p>
              <JsonViewer message={message} />
              {ai && <AIMarkdown content={ai} />}
            </section>
          )}
        </>
      )}
      {dialog}
    </div>
  )
}
