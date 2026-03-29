import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import {
  ChevronDown,
  RefreshCw,
  Radio,
  Sparkles,
  Copy,
  Check,
  Inbox,
  Send,
  X,
  Plus,
  Trash2,
  Loader2
} from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import { useDataStore } from '@/stores/dataStore'
import { useClusterStore } from '@/stores/clusterStore'
import type { KafkaMessage } from '@/types'

type OffsetMode = 'latest' | 'earliest' | 'custom'

const PAGE_SIZES = [10, 50, 100, 500] as const

function syntaxHighlightJSON(json: string): string {
  return json.replace(
    /("(?:\\.|[^"\\])*")\s*(:)?|(\b(?:true|false)\b)|(null)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (
      match,
      str: string | undefined,
      colon: string | undefined,
      bool: string | undefined,
      nil: string | undefined,
      num: string | undefined
    ) => {
      if (str) {
        if (colon) return `<span class="text-info">${str}</span>:`
        return `<span class="text-success">${str}</span>`
      }
      if (bool) return `<span class="text-[#c084fc]">${bool}</span>`
      if (nil) return `<span class="text-danger">${nil}</span>`
      if (num) return `<span class="text-warning">${num}</span>`
      return match
    }
  )
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '...' : s
}

function SkeletonRow() {
  return (
    <tr className="border-b border-border/50">
      {[...Array(5)].map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3 animate-pulse rounded bg-surface-3" style={{ width: `${40 + Math.random() * 40}%` }} />
        </td>
      ))}
    </tr>
  )
}

export default function MessageBrowser() {
  const { selectedTopicName, addNotification } = useUIStore()
  const { activeClusterId, demoMode } = useClusterStore()
  const { messages, messagesLoading, fetchMessages, produceMessage } = useDataStore()

  const [pageSize, setPageSize] = useState<number>(50)
  const [offsetMode, setOffsetMode] = useState<OffsetMode>('latest')
  const [partition, setPartition] = useState<number>(-1)
  const [liveTail, setLiveTail] = useState(false)
  const [expandedOffset, setExpandedOffset] = useState<string | null>(null)
  const [showProduceModal, setShowProduceModal] = useState(false)

  const liveTailRef = useRef(liveTail)
  liveTailRef.current = liveTail

  const topicMessages = useMemo(() => {
    if (!selectedTopicName) return []
    return messages[selectedTopicName] ?? []
  }, [messages, selectedTopicName])

  const filtered = useMemo(() => {
    if (partition < 0) return topicMessages
    return topicMessages.filter((m) => m.partition === partition)
  }, [topicMessages, partition])

  const partitions = useMemo(() => {
    const set = new Set(topicMessages.map((m) => m.partition))
    return [...set].sort((a, b) => a - b)
  }, [topicMessages])

  const doFetch = useCallback(() => {
    if (!activeClusterId || !selectedTopicName) return
    fetchMessages(activeClusterId, selectedTopicName, {
      partition: partition >= 0 ? partition : undefined,
      offset: offsetMode,
      limit: pageSize
    })
  }, [activeClusterId, selectedTopicName, partition, offsetMode, pageSize, fetchMessages])

  useEffect(() => {
    doFetch()
  }, [doFetch])

  useEffect(() => {
    if (!liveTail || !activeClusterId || !selectedTopicName) return

    const interval = setInterval(() => {
      if (!liveTailRef.current) return
      fetchMessages(activeClusterId, selectedTopicName, {
        partition: partition >= 0 ? partition : undefined,
        offset: 'latest',
        limit: pageSize
      })
    }, 2000)

    return () => clearInterval(interval)
  }, [liveTail, activeClusterId, selectedTopicName, partition, pageSize, fetchMessages])

  const toggleExpand = useCallback((offset: string) => {
    setExpandedOffset((prev) => (prev === offset ? null : offset))
  }, [])

  if (!selectedTopicName) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-text-muted">
        <Inbox className="h-16 w-16 opacity-30" />
        <p className="text-lg">Select a topic from the topic list to browse messages</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-border bg-surface-1 px-5 py-3">
        <h1 className="mr-2 text-sm font-semibold text-text-primary">{selectedTopicName}</h1>

        {/* Partition selector */}
        <div className="relative">
          <select
            value={partition}
            onChange={(e) => setPartition(Number(e.target.value))}
            className="appearance-none rounded-md border border-border bg-surface-0 py-1.5 pl-3 pr-8 text-xs text-text-secondary focus:border-accent focus:outline-none"
          >
            <option value={-1}>All Partitions</option>
            {partitions.map((p) => (
              <option key={p} value={p}>
                Partition {p}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-text-muted" />
        </div>

        {/* Offset mode */}
        <div className="flex rounded-md border border-border">
          {(['latest', 'earliest', 'custom'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setOffsetMode(mode)}
              className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors first:rounded-l-md last:rounded-r-md ${
                offsetMode === mode
                  ? 'bg-accent text-white'
                  : 'bg-surface-0 text-text-secondary hover:bg-surface-2'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Page size */}
        <div className="relative">
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="appearance-none rounded-md border border-border bg-surface-0 py-1.5 pl-3 pr-8 text-xs text-text-secondary focus:border-accent focus:outline-none"
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s} msgs
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-text-muted" />
        </div>

        <div className="flex-1" />

        {/* Produce Message */}
        <button
          onClick={() => setShowProduceModal(true)}
          className="flex items-center gap-1.5 rounded-md border border-border bg-surface-0 px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-2 hover:text-text-primary transition-colors"
        >
          <Send className="h-3 w-3" />
          Produce
        </button>

        {/* Live Tail */}
        <button
          onClick={() => setLiveTail(!liveTail)}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            liveTail
              ? 'bg-success/15 text-success'
              : 'bg-surface-0 text-text-secondary border border-border hover:bg-surface-2'
          }`}
        >
          <Radio className={`h-3 w-3 ${liveTail ? 'animate-pulse' : ''}`} />
          Live Tail
        </button>

        {/* Refresh */}
        <button
          onClick={doFetch}
          className="rounded-md border border-border bg-surface-0 p-1.5 text-text-secondary hover:bg-surface-2 hover:text-text-primary transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${messagesLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Message table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-surface-1 text-text-secondary">
              <th className="px-4 py-2.5 text-left font-medium">Offset</th>
              <th className="px-4 py-2.5 text-left font-medium">Partition</th>
              <th className="px-4 py-2.5 text-left font-medium">Timestamp</th>
              <th className="px-4 py-2.5 text-left font-medium">Key</th>
              <th className="px-4 py-2.5 text-left font-medium">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {messagesLoading && topicMessages.length === 0
              ? [...Array(8)].map((_, i) => <SkeletonRow key={i} />)
              : filtered.map((msg) => (
                  <MessageRow
                    key={`${msg.partition}-${msg.offset}`}
                    message={msg}
                    isExpanded={expandedOffset === `${msg.partition}-${msg.offset}`}
                    onToggle={() => toggleExpand(`${msg.partition}-${msg.offset}`)}
                  />
                ))}
            {!messagesLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="py-12 text-center text-text-muted">
                  No messages found for this partition.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Produce Message Modal */}
      {showProduceModal && (
        <ProduceMessageModal
          topic={selectedTopicName}
          clusterId={activeClusterId!}
          demoMode={demoMode}
          onClose={() => setShowProduceModal(false)}
          onProduce={produceMessage}
          addNotification={addNotification}
          onRefresh={doFetch}
        />
      )}
    </div>
  )
}

function ProduceMessageModal({
  topic,
  clusterId,
  demoMode,
  onClose,
  onProduce,
  addNotification,
  onRefresh
}: {
  topic: string
  clusterId: string
  demoMode: boolean
  onClose: () => void
  onProduce: (clusterId: string, opts: {
    topic: string
    key?: string | null
    value: string
    partition?: number
    headers?: Record<string, string>
  }) => Promise<boolean>
  addNotification: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void
  onRefresh: () => void
}) {
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const [headers, setHeaders] = useState<{ key: string; value: string }[]>([])
  const [targetPartition, setTargetPartition] = useState('')
  const [sending, setSending] = useState(false)

  const addHeader = () => setHeaders((h) => [...h, { key: '', value: '' }])

  const updateHeader = (idx: number, field: 'key' | 'value', val: string) => {
    setHeaders((h) => h.map((item, i) => (i === idx ? { ...item, [field]: val } : item)))
  }

  const removeHeader = (idx: number) => {
    setHeaders((h) => h.filter((_, i) => i !== idx))
  }

  const handleSend = async () => {
    if (!value.trim()) {
      addNotification('error', 'Message value cannot be empty')
      return
    }

    setSending(true)
    try {
      const hdrs: Record<string, string> = {}
      for (const h of headers) {
        if (h.key.trim()) hdrs[h.key.trim()] = h.value
      }

      const success = await onProduce(clusterId, {
        topic,
        key: key.trim() || null,
        value: value.trim(),
        partition: targetPartition ? parseInt(targetPartition, 10) : undefined,
        headers: Object.keys(hdrs).length > 0 ? hdrs : undefined
      })

      if (success) {
        addNotification('success', `Message produced to ${topic}${demoMode ? ' (demo mode)' : ''}`)
        onClose()
        onRefresh()
      } else {
        addNotification('error', 'Failed to produce message')
      }
    } catch {
      addNotification('error', 'Failed to produce message')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-xl border border-border bg-surface-1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-sm font-semibold text-text-primary">Produce Message</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-6 py-5">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <span className="text-text-secondary">Topic:</span>
            <span className="font-mono text-accent">{topic}</span>
          </div>

          {/* Key */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-secondary">Key</label>
            <input
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Message key (optional)"
              className="rounded-md border border-border bg-surface-0 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
          </div>

          {/* Value */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-secondary">Value</label>
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder='{"key": "value"}'
              rows={8}
              className="rounded-md border border-border bg-surface-0 px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none resize-none"
            />
          </div>

          {/* Target Partition */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-secondary">Target Partition (optional)</label>
            <input
              type="number"
              value={targetPartition}
              onChange={(e) => setTargetPartition(e.target.value)}
              placeholder="Auto-assign"
              min={0}
              className="w-40 rounded-md border border-border bg-surface-0 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
          </div>

          {/* Headers */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-text-secondary">Headers</label>
              <button
                onClick={addHeader}
                className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors"
              >
                <Plus className="h-3 w-3" />
                Add Header
              </button>
            </div>
            {headers.map((h, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={h.key}
                  onChange={(e) => updateHeader(i, 'key', e.target.value)}
                  placeholder="Header key"
                  className="flex-1 rounded-md border border-border bg-surface-0 px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
                />
                <input
                  type="text"
                  value={h.value}
                  onChange={(e) => updateHeader(i, 'value', e.target.value)}
                  placeholder="Header value"
                  className="flex-1 rounded-md border border-border bg-surface-0 px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
                />
                <button
                  onClick={() => removeHeader(i)}
                  className="text-text-muted hover:text-danger transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-md border border-border bg-surface-0 px-4 py-2 text-xs font-medium text-text-secondary hover:bg-surface-2 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !value.trim()}
            className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            {sending ? 'Sending...' : 'Send Message'}
          </button>
        </div>
      </div>
    </div>
  )
}

function MessageRow({
  message,
  isExpanded,
  onToggle
}: {
  message: KafkaMessage
  isExpanded: boolean
  onToggle: () => void
}) {
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [aiResponse, setAiResponse] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)

  const copyToClipboard = useCallback((text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 1500)
  }, [])

  const prettyValue = useMemo(() => {
    try {
      return JSON.stringify(JSON.parse(message.value), null, 2)
    } catch {
      return message.value
    }
  }, [message.value])

  const highlightedValue = useMemo(() => syntaxHighlightJSON(prettyValue), [prettyValue])

  const handleExplainAI = async () => {
    setAiLoading(true)
    setAiResponse(null)
    try {
      const result = await window.api.ai.explainMessage(message.value, undefined)
      setAiResponse(typeof result === 'string' ? result : result?.explanation ?? JSON.stringify(result))
    } catch (err) {
      setAiResponse(`Error: ${err instanceof Error ? err.message : 'Failed to get AI explanation'}`)
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <>
      <tr
        className={`cursor-pointer transition-colors ${
          isExpanded ? 'bg-surface-2' : 'bg-surface-0 hover:bg-surface-1'
        }`}
        onClick={onToggle}
      >
        <td className="px-4 py-2.5 font-mono text-xs text-text-secondary">{message.offset}</td>
        <td className="px-4 py-2.5 text-text-secondary">{message.partition}</td>
        <td className="px-4 py-2.5 text-text-secondary">{formatTimestamp(message.timestamp)}</td>
        <td className="px-4 py-2.5 font-mono text-xs text-accent">
          {message.key ?? <span className="italic text-text-muted">null</span>}
        </td>
        <td className="max-w-md px-4 py-2.5 font-mono text-xs text-text-muted">
          {truncate(message.value.replace(/\s+/g, ' '), 80)}
        </td>
      </tr>

      {isExpanded && (
        <tr className="bg-surface-1">
          <td colSpan={5} className="p-0">
            <div className="flex flex-col gap-4 border-t border-border px-6 py-5">
              {/* Metadata */}
              <div className="flex gap-6 text-xs text-text-muted">
                <span>
                  <span className="text-text-secondary">Topic:</span> {message.topic}
                </span>
                <span>
                  <span className="text-text-secondary">Partition:</span> {message.partition}
                </span>
                <span>
                  <span className="text-text-secondary">Offset:</span> {message.offset}
                </span>
                <span>
                  <span className="text-text-secondary">Timestamp:</span>{' '}
                  {new Date(message.timestamp).toISOString()}
                </span>
                <span>
                  <span className="text-text-secondary">Format:</span> {message.valueFormat}
                </span>
              </div>

              {/* Key */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-text-secondary">Key</span>
                  <CopyButton
                    text={message.key ?? ''}
                    field="key"
                    copiedField={copiedField}
                    onCopy={copyToClipboard}
                  />
                </div>
                <pre className="overflow-auto rounded-md border border-border bg-surface-0 px-4 py-3 font-mono text-xs text-text-primary">
                  {message.key ?? 'null'}
                </pre>
              </div>

              {/* Value */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-text-secondary">Value</span>
                  <CopyButton
                    text={prettyValue}
                    field="value"
                    copiedField={copiedField}
                    onCopy={copyToClipboard}
                  />
                </div>
                <pre
                  className="max-h-80 overflow-auto rounded-md border border-border bg-surface-0 px-4 py-3 font-mono text-xs leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: highlightedValue }}
                />
              </div>

              {/* Headers */}
              {Object.keys(message.headers).length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-text-secondary">Headers</span>
                  <div className="overflow-hidden rounded-md border border-border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-surface-2">
                          <th className="px-3 py-1.5 text-left font-medium text-text-secondary">Key</th>
                          <th className="px-3 py-1.5 text-left font-medium text-text-secondary">Value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {Object.entries(message.headers).map(([k, v]) => (
                          <tr key={k} className="bg-surface-0">
                            <td className="px-3 py-1.5 font-mono text-accent">{k}</td>
                            <td className="px-3 py-1.5 font-mono text-text-primary">{v}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* AI Explain */}
              <div className="flex flex-col gap-3">
                <div className="flex justify-end">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleExplainAI()
                    }}
                    disabled={aiLoading}
                    className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-4 py-2 text-xs font-medium text-text-secondary hover:border-accent hover:text-accent transition-colors disabled:opacity-50"
                  >
                    {aiLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    {aiLoading ? 'Analyzing...' : 'Explain with AI'}
                  </button>
                </div>

                {(aiLoading || aiResponse) && (
                  <div className="rounded-md border border-border bg-surface-0 px-4 py-3">
                    {aiLoading ? (
                      <div className="flex items-center gap-2 text-xs text-text-muted">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Analyzing message content...
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap text-xs leading-relaxed text-text-primary">
                        {aiResponse}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function CopyButton({
  text,
  field,
  copiedField,
  onCopy
}: {
  text: string
  field: string
  copiedField: string | null
  onCopy: (text: string, field: string) => void
}) {
  const isCopied = copiedField === field
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onCopy(text, field)
      }}
      className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors"
    >
      {isCopied ? (
        <>
          <Check className="h-3 w-3 text-success" />
          <span className="text-success">Copied</span>
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          Copy
        </>
      )}
    </button>
  )
}
