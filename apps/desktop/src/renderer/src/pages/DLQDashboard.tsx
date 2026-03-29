import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Check,
  Sparkles,
  RotateCcw,
  Send,
  Inbox,
  MessageSquareWarning,
  Eye,
  Loader2,
  X,
  PlayCircle,
} from 'lucide-react'
import { useClusterStore } from '@/stores/clusterStore'
import { useDataStore } from '@/stores/dataStore'
import { useUIStore } from '@/stores/uiStore'
import type { DLQMessage, Topic } from '@/types'

function SummaryCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string
  value: number | string
  icon: React.ComponentType<{ className?: string }>
  accent: string
}) {
  return (
    <div className="flex items-center gap-4 bg-surface-2 border border-border rounded-xl px-5 py-4">
      <div className={`p-2.5 rounded-lg ${accent}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-2xl font-bold tabular-nums text-text-primary">{value}</div>
        <div className="text-xs text-text-muted mt-0.5">{label}</div>
      </div>
    </div>
  )
}

function shortenException(fqcn: string | undefined): string {
  if (!fqcn) return '—'
  const parts = fqcn.split('.')
  return parts[parts.length - 1]
}

function truncate(str: string | undefined, len: number): string {
  if (!str) return '—'
  return str.length > len ? str.slice(0, len) + '…' : str
}

function ReplayToCustomModal({
  message,
  onClose,
}: {
  message: DLQMessage
  onClose: () => void
}) {
  const [targetTopic, setTargetTopic] = useState('')
  const [sending, setSending] = useState(false)
  const { activeClusterId } = useClusterStore()
  const { produceMessage } = useDataStore()
  const addNotification = useUIStore((s) => s.addNotification)

  const handleReplay = async () => {
    if (!targetTopic.trim()) return
    setSending(true)
    try {
      const ok = await produceMessage(activeClusterId!, {
        topic: targetTopic,
        key: message.key,
        value: message.value,
        headers: message.headers,
      })
      if (ok) {
        addNotification('success', `Replayed message (offset ${message.offset}) to ${targetTopic}`)
        onClose()
      } else {
        addNotification('error', 'Failed to replay message')
      }
    } catch (err) {
      addNotification('error', err instanceof Error ? err.message : 'Replay failed')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-xl border border-border bg-surface-0 shadow-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">Replay to Custom Topic</h3>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-3 hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1.5">Target Topic Name</label>
          <input
            type="text"
            value={targetTopic}
            onChange={(e) => setTargetTopic(e.target.value)}
            placeholder="my-topic-name"
            className="w-full bg-surface-1 border border-border rounded-lg px-3 py-2 text-xs font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs rounded-md bg-surface-3 text-text-secondary hover:text-text-primary transition-colors">
            Cancel
          </button>
          <button
            onClick={handleReplay}
            disabled={sending || !targetTopic.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            {sending && <Loader2 className="w-3 h-3 animate-spin" />}
            Replay
          </button>
        </div>
      </div>
    </div>
  )
}

function MessageDetail({
  message,
  onReviewed,
}: {
  message: DLQMessage
  onReviewed: (offset: string) => void
}) {
  const { activeClusterId } = useClusterStore()
  const { produceMessage } = useDataStore()
  const addNotification = useUIStore((s) => s.addNotification)
  const [showCustomReplay, setShowCustomReplay] = useState(false)
  const [replayingOriginal, setReplayingOriginal] = useState(false)
  const [markingReviewed, setMarkingReviewed] = useState(false)
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)

  let prettyPayload: string
  try {
    prettyPayload = JSON.stringify(JSON.parse(message.value), null, 2)
  } catch {
    prettyPayload = message.value
  }

  const handleReplayOriginal = async () => {
    if (!message.originalTopic) {
      addNotification('error', 'No original topic found in message headers')
      return
    }
    setReplayingOriginal(true)
    try {
      const ok = await produceMessage(activeClusterId!, {
        topic: message.originalTopic,
        key: message.key,
        value: message.value,
        headers: message.headers,
      })
      if (ok) {
        addNotification('success', `Replayed message (offset ${message.offset}) to ${message.originalTopic}`)
      } else {
        addNotification('error', 'Failed to replay message')
      }
    } catch (err) {
      addNotification('error', err instanceof Error ? err.message : 'Replay failed')
    } finally {
      setReplayingOriginal(false)
    }
  }

  const handleMarkReviewed = async () => {
    setMarkingReviewed(true)
    try {
      const res = await window.api.dlq.markReviewed(
        activeClusterId!,
        message.topic,
        message.partition,
        message.offset,
      )
      if (res.success) {
        onReviewed(message.offset)
        addNotification('info', `Marked offset ${message.offset} as reviewed`)
      } else {
        addNotification('error', res.error ?? 'Failed to mark as reviewed')
      }
    } catch (err) {
      addNotification('error', err instanceof Error ? err.message : 'Failed to mark as reviewed')
    } finally {
      setMarkingReviewed(false)
    }
  }

  const handleAiAnalysis = async () => {
    setAiLoading(true)
    setAiAnalysis(null)
    try {
      const res = await window.api.ai.analyzeDLQ(
        message.exceptionClass ?? '',
        message.exceptionMessage ?? '',
        message.value,
      )
      if (res.success && res.data) {
        setAiAnalysis(res.data.content)
      } else {
        addNotification('error', res.error ?? 'AI analysis failed')
      }
    } catch (err) {
      addNotification('error', err instanceof Error ? err.message : 'AI analysis failed')
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <div className="p-4 bg-surface-1 border border-border rounded-lg animate-fade-in space-y-4">
      <div>
        <h4 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">Exception</h4>
        <div className="bg-danger/5 border border-danger/20 rounded-lg p-3">
          <div className="font-mono text-xs text-danger mb-1">{message.exceptionClass}</div>
          <div className="text-xs text-text-secondary">{message.exceptionMessage}</div>
        </div>
      </div>

      <div>
        <h4 className="text-xs font-medium text-text-muted uppercase tracking-wide mb-2">
          Original Message Payload
        </h4>
        <pre className="bg-surface-0 border border-border rounded-lg p-3 text-xs font-mono text-text-secondary overflow-auto max-h-48">
          {prettyPayload}
        </pre>
      </div>

      <div className="flex gap-6 text-xs flex-wrap">
        <div>
          <span className="text-text-muted">Original Topic: </span>
          <span className="font-mono text-text-primary">{message.originalTopic ?? '—'}</span>
        </div>
        <div>
          <span className="text-text-muted">Partition: </span>
          <span className="tabular-nums text-text-primary">{message.originalPartition ?? '—'}</span>
        </div>
        <div>
          <span className="text-text-muted">Offset: </span>
          <span className="tabular-nums text-text-primary">{message.originalOffset ?? '—'}</span>
        </div>
        <div>
          <span className="text-text-muted">Retry Count: </span>
          <span className="tabular-nums text-text-primary">{message.retryCount ?? 0}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1 flex-wrap">
        <button
          onClick={handleReplayOriginal}
          disabled={replayingOriginal}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-accent/15 text-accent hover:bg-accent/25 transition-colors disabled:opacity-50"
        >
          {replayingOriginal ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
          Replay to Original Topic
        </button>
        <button
          onClick={() => setShowCustomReplay(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-surface-3 text-text-secondary hover:text-text-primary hover:bg-surface-4 transition-colors"
        >
          <Send className="w-3 h-3" />
          Replay to Custom Topic
        </button>
        {!message.isReviewed && (
          <button
            onClick={handleMarkReviewed}
            disabled={markingReviewed}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-surface-3 text-text-secondary hover:text-text-primary hover:bg-surface-4 transition-colors disabled:opacity-50"
          >
            {markingReviewed ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
            Mark as Reviewed
          </button>
        )}
        <button
          onClick={handleAiAnalysis}
          disabled={aiLoading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-surface-3 text-text-secondary hover:text-text-primary hover:bg-surface-4 transition-colors ml-auto disabled:opacity-50"
        >
          {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          Root Cause Analysis (AI)
        </button>
      </div>

      {aiLoading && (
        <div className="bg-surface-2 border border-border rounded-lg p-4 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-accent" />
          <span className="text-xs text-text-muted">Analyzing root cause...</span>
        </div>
      )}

      {aiAnalysis && (
        <div className="bg-surface-2 border border-accent/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-accent" />
            <h4 className="text-xs font-medium text-accent">AI Root Cause Analysis</h4>
          </div>
          <div className="text-xs text-text-secondary whitespace-pre-wrap leading-relaxed">
            {aiAnalysis}
          </div>
        </div>
      )}

      {showCustomReplay && (
        <ReplayToCustomModal message={message} onClose={() => setShowCustomReplay(false)} />
      )}
    </div>
  )
}

function MessageRow({
  message,
  isSelected,
  onToggle,
  onReviewed,
}: {
  message: DLQMessage
  isSelected: boolean
  onToggle: () => void
  onReviewed: (offset: string) => void
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className={`border-b border-border/50 cursor-pointer transition-colors ${
          message.isReviewed ? 'opacity-60' : ''
        } ${isSelected ? 'bg-accent/5' : 'hover:bg-surface-3/50'}`}
      >
        <td className="pl-2">
          {isSelected ? (
            <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
          )}
        </td>
        <td className="py-1.5 px-3 text-right tabular-nums font-mono text-text-primary">
          {message.offset}
        </td>
        <td className="py-1.5 px-3 text-text-secondary">
          {new Date(message.timestamp).toLocaleString()}
        </td>
        <td className="py-1.5 px-3 font-mono text-text-primary">{message.key ?? '—'}</td>
        <td className="py-1.5 px-3">
          <span className="text-danger">{shortenException(message.exceptionClass)}</span>
        </td>
        <td className="py-1.5 px-3 text-text-secondary max-w-[250px] truncate">
          {truncate(message.exceptionMessage, 60)}
        </td>
        <td className="py-1.5 px-3 text-right tabular-nums text-text-secondary">
          {message.retryCount ?? 0}
        </td>
        <td className="py-1.5 px-3 text-center">
          {message.isReviewed && <Check className="w-3.5 h-3.5 text-success mx-auto" />}
        </td>
      </tr>
      {isSelected && (
        <tr>
          <td colSpan={8} className="p-3 bg-surface-2/50">
            <MessageDetail message={message} onReviewed={onReviewed} />
          </td>
        </tr>
      )}
    </>
  )
}

function DLQTopicMessages({
  topic,
  messages,
  loading,
  onReviewed,
}: {
  topic: Topic
  messages: DLQMessage[]
  loading: boolean
  onReviewed: (topicName: string, offset: string) => void
}) {
  const [selectedOffset, setSelectedOffset] = useState<string | null>(null)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-4 h-4 animate-spin text-accent mr-2" />
        <span className="text-xs text-text-muted">Loading messages...</span>
      </div>
    )
  }

  return (
    <div className="px-4 pb-3 animate-fade-in space-y-3">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-text-muted border-b border-border">
            <th className="w-6" />
            <th className="text-right py-2 px-3 font-medium">Offset</th>
            <th className="text-left py-2 px-3 font-medium">Timestamp</th>
            <th className="text-left py-2 px-3 font-medium">Key</th>
            <th className="text-left py-2 px-3 font-medium">Exception</th>
            <th className="text-left py-2 px-3 font-medium">Message</th>
            <th className="text-right py-2 px-3 font-medium">Retries</th>
            <th className="text-center py-2 px-3 font-medium">Reviewed</th>
          </tr>
        </thead>
        <tbody>
          {messages.map((m) => {
            const isSelected = selectedOffset === m.offset
            return (
              <MessageRow
                key={m.offset}
                message={m}
                isSelected={isSelected}
                onToggle={() => setSelectedOffset(isSelected ? null : m.offset)}
                onReviewed={(offset) => onReviewed(topic.name, offset)}
              />
            )
          })}
          {messages.length === 0 && (
            <tr>
              <td colSpan={8} className="text-center py-8 text-text-muted">
                No messages in this DLQ topic.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function DLQTopicRow({
  topic,
  originalTopic,
  expanded,
  onToggle,
  messages,
  loading,
  onReviewed,
  lastMessageTime,
}: {
  topic: Topic
  originalTopic: string
  expanded: boolean
  onToggle: () => void
  messages: DLQMessage[]
  loading: boolean
  onReviewed: (topicName: string, offset: string) => void
  lastMessageTime: string
}) {
  return (
    <>
      <tr
        className="border-b border-border/50 hover:bg-surface-2/60 cursor-pointer transition-colors"
        onClick={onToggle}
      >
        <td className="pl-3">
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-text-muted" />
          ) : (
            <ChevronRight className="w-4 h-4 text-text-muted" />
          )}
        </td>
        <td className="py-2.5 px-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />
            <span className="font-mono text-text-primary">{topic.name}</span>
          </div>
        </td>
        <td className="py-2.5 px-4 text-right tabular-nums text-text-secondary">
          {topic.messageCount.toLocaleString()}
        </td>
        <td className="py-2.5 px-4 font-mono text-text-secondary">{originalTopic}</td>
        <td className="py-2.5 px-4 text-right text-text-muted">{lastMessageTime}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5} className="bg-surface-1 p-0">
            <DLQTopicMessages
              topic={topic}
              messages={messages}
              loading={loading}
              onReviewed={onReviewed}
            />
          </td>
        </tr>
      )}
    </>
  )
}

export default function DLQDashboard() {
  const { activeClusterId } = useClusterStore()
  const { topics, messages: storeMessages, messagesLoading, fetchTopics, fetchMessages } = useDataStore()
  const addNotification = useUIStore((s) => s.addNotification)

  const [expandedTopic, setExpandedTopic] = useState<string | null>(null)
  const [localDlqMessages, setLocalDlqMessages] = useState<Record<string, DLQMessage[]>>({})
  const [bulkReplaying, setBulkReplaying] = useState(false)
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 })

  useEffect(() => {
    if (activeClusterId) fetchTopics(activeClusterId)
  }, [activeClusterId, fetchTopics])

  const dlqTopics = useMemo(() => topics.filter((t) => t.isDLQ), [topics])

  const getDlqMessages = useCallback((topicName: string): DLQMessage[] => {
    if (localDlqMessages[topicName]) return localDlqMessages[topicName]
    const raw = storeMessages[topicName]
    if (raw) {
      return raw.map((m) => ({
        ...m,
        exceptionClass: m.headers['kafka_dlt-exception-fqcn'] ?? undefined,
        exceptionMessage: m.headers['kafka_dlt-exception-message'] ?? undefined,
        originalTopic: m.headers['kafka_dlt-original-topic'] ?? undefined,
        originalPartition: m.headers['kafka_dlt-original-partition'] ? Number(m.headers['kafka_dlt-original-partition']) : undefined,
        originalOffset: m.headers['kafka_dlt-original-offset'] ?? undefined,
        retryCount: m.headers['x-retry-count'] ? Number(m.headers['x-retry-count']) : 0,
        isReviewed: false,
      })) as DLQMessage[]
    }
    return []
  }, [localDlqMessages, storeMessages])

  const handleToggleTopic = useCallback((topicName: string) => {
    if (expandedTopic === topicName) {
      setExpandedTopic(null)
      return
    }
    setExpandedTopic(topicName)

    if (activeClusterId && !storeMessages[topicName]) {
      fetchMessages(activeClusterId, topicName, { limit: 50 })
    }
  }, [expandedTopic, activeClusterId, storeMessages, fetchMessages])

  const handleReviewed = useCallback((topicName: string, offset: string) => {
    setLocalDlqMessages((prev) => {
      const msgs = (prev[topicName] ?? getDlqMessages(topicName)).map((m) =>
        m.offset === offset ? { ...m, isReviewed: true } : m,
      )
      return { ...prev, [topicName]: msgs }
    })
  }, [getDlqMessages])

  const allMessages = useMemo(() => {
    const result: DLQMessage[] = []
    for (const t of dlqTopics) {
      result.push(...getDlqMessages(t.name))
    }
    return result
  }, [dlqTopics, getDlqMessages])

  const totalMessages = dlqTopics.reduce((sum, t) => sum + t.messageCount, 0)
  const unreviewedCount = allMessages.filter((m) => !m.isReviewed).length

  const handleBulkReplay = async () => {
    const unreviewed = allMessages.filter((m) => !m.isReviewed && m.originalTopic)
    if (unreviewed.length === 0) {
      addNotification('info', 'No unreviewed messages to replay')
      return
    }

    setBulkReplaying(true)
    setBulkProgress({ current: 0, total: unreviewed.length })
    let successCount = 0

    for (let i = 0; i < unreviewed.length; i++) {
      const msg = unreviewed[i]
      setBulkProgress({ current: i + 1, total: unreviewed.length })

      try {
        const { produceMessage } = useDataStore.getState()
        const ok = await produceMessage(activeClusterId!, {
          topic: msg.originalTopic!,
          key: msg.key,
          value: msg.value,
          headers: msg.headers,
        })
        if (ok) successCount++
      } catch {
        // continue with next message
      }
    }

    setBulkReplaying(false)
    addNotification(
      successCount === unreviewed.length ? 'success' : 'warning',
      `Replayed ${successCount}/${unreviewed.length} messages`,
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
        <AlertTriangle className="w-5 h-5 text-warning" />
        <h1 className="text-lg font-semibold text-text-primary">Dead Letter Queues</h1>
        <span className="text-xs bg-danger/15 text-danger px-2 py-0.5 rounded-full">
          {dlqTopics.length} DLQ topics
        </span>
        <div className="ml-auto">
          <button
            onClick={handleBulkReplay}
            disabled={bulkReplaying || unreviewedCount === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            {bulkReplaying ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Replaying {bulkProgress.current}/{bulkProgress.total}...
              </>
            ) : (
              <>
                <PlayCircle className="w-3.5 h-3.5" />
                Replay All Unreviewed ({unreviewedCount})
              </>
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 px-6 py-4 border-b border-border">
        <SummaryCard
          label="DLQ Topics"
          value={dlqTopics.length}
          icon={Inbox}
          accent="bg-warning/15 text-warning"
        />
        <SummaryCard
          label="Total Stuck Messages"
          value={totalMessages.toLocaleString()}
          icon={MessageSquareWarning}
          accent="bg-danger/15 text-danger"
        />
        <SummaryCard
          label="Unreviewed Messages"
          value={unreviewedCount}
          icon={AlertTriangle}
          accent="bg-info/15 text-info"
        />
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-surface-1">
            <tr className="text-text-muted border-b border-border">
              <th className="w-8" />
              <th className="text-left py-2.5 px-4 font-medium">Topic Name</th>
              <th className="text-right py-2.5 px-4 font-medium">Messages</th>
              <th className="text-left py-2.5 px-4 font-medium">Original Topic</th>
              <th className="text-right py-2.5 px-4 font-medium">Last Message</th>
            </tr>
          </thead>
          <tbody>
            {dlqTopics.map((t) => {
              const expanded = expandedTopic === t.name
              const originalTopic = t.name.replace(/-dl[tq]$/, '').replace(/-error$/, '').replace(/-retry$/, '')
              const msgs = getDlqMessages(t.name)
              const lastTime = msgs.length > 0
                ? new Date(msgs[msgs.length - 1].timestamp).toLocaleString()
                : '—'

              return (
                <DLQTopicRow
                  key={t.name}
                  topic={t}
                  originalTopic={originalTopic}
                  expanded={expanded}
                  onToggle={() => handleToggleTopic(t.name)}
                  messages={msgs}
                  loading={messagesLoading && expanded}
                  onReviewed={handleReviewed}
                  lastMessageTime={lastTime}
                />
              )
            })}
            {dlqTopics.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-12 text-text-muted">
                  No DLQ topics found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
