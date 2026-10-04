import { TopicConfigDialog } from './TopicConfigDialog'
import { useRefresh } from '@/lib/useRefresh'
import type { TopicMatch } from '@/types'
import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Search,
  Plus,
  Star,
  ArrowUpDown,
  CircleCheck,
  CircleAlert,
  Database,
  Trash2,
  X,
  Loader2,
  AlertTriangle
} from 'lucide-react'
import { useClusterStore } from '@/stores/clusterStore'
import { useUIStore } from '@/stores/uiStore'
import { useDataStore } from '@/stores/dataStore'
import type { Topic } from '@/types'

type FilterKey = 'all' | 'user' | 'internal' | 'dlq'
type SortField =
  'name' | 'partitions' | 'replicationFactor' | 'messageCount' | 'retentionMs' | 'cleanupPolicy'
type SortDir = 'asc' | 'desc'

const FILTER_PILLS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'user', label: 'User Topics' },
  { key: 'internal', label: 'Internal' },
  { key: 'dlq', label: 'DLQ' }
]

function formatRetention(ms: number): string {
  if (ms < 0) return 'Infinite'
  const days = ms / 86_400_000
  if (days >= 1) return `${Math.round(days)}d`
  const hours = ms / 3_600_000
  return `${Math.round(hours)}h`
}

function fuzzyMatch(text: string, query: string): boolean {
  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  let qi = 0
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) qi++
  }
  return qi === q.length
}

// ---------------------------------------------------------------------------
// Create Topic Modal
// ---------------------------------------------------------------------------

interface CreateTopicModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (opts: {
    name: string
    partitions: number
    replicationFactor: number
    configs?: Record<string, string>
  }) => Promise<void>
}

function CreateTopicModal({ open, onClose, onSubmit }: CreateTopicModalProps) {
  const [name, setName] = useState('')
  const [partitions, setPartitions] = useState(3)
  const [replicationFactor, setReplicationFactor] = useState(1)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [retentionMs, setRetentionMs] = useState('')
  const [cleanupPolicy, setCleanupPolicy] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setName('')
      setPartitions(3)
      setReplicationFactor(1)
      setShowAdvanced(false)
      setRetentionMs('')
      setCleanupPolicy('')
    }
  }, [open])

  if (!open) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    const configs: Record<string, string> = {}
    if (retentionMs.trim()) configs['retention.ms'] = retentionMs.trim()
    if (cleanupPolicy.trim()) configs['cleanup.policy'] = cleanupPolicy.trim()

    setSubmitting(true)
    try {
      await onSubmit({
        name: name.trim(),
        partitions,
        replicationFactor,
        configs: Object.keys(configs).length > 0 ? configs : undefined
      })
    } finally {
      setSubmitting(false)
    }
  }

  const inputCls =
    'w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Create topic"
        className="w-full max-w-md rounded-xl border border-border bg-surface-1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-semibold text-text-primary">Create Topic</h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 py-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-secondary">Topic Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-service.events"
              className={inputCls}
              autoFocus
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-secondary">Partitions</label>
              <input
                type="number"
                min={1}
                max={1000}
                value={partitions}
                onChange={(e) => setPartitions(Number(e.target.value))}
                className={inputCls}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-secondary">Replication Factor</label>
              <input
                type="number"
                min={1}
                max={10}
                value={replicationFactor}
                onChange={(e) => setReplicationFactor(Number(e.target.value))}
                className={inputCls}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="self-start text-xs text-accent hover:text-accent-hover transition-colors"
          >
            {showAdvanced ? 'Hide' : 'Show'} Advanced Configs
          </button>

          {showAdvanced && (
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text-secondary">Retention (ms)</label>
                <input
                  type="text"
                  value={retentionMs}
                  onChange={(e) => setRetentionMs(e.target.value)}
                  placeholder="604800000"
                  className={inputCls}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text-secondary">Cleanup Policy</label>
                <select
                  value={cleanupPolicy}
                  onChange={(e) => setCleanupPolicy(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Default (delete)</option>
                  <option value="delete">delete</option>
                  <option value="compact">compact</option>
                  <option value="delete,compact">delete,compact</option>
                </select>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-surface-3 px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-4 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || submitting}
              className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Delete Confirmation Dialog
// ---------------------------------------------------------------------------

interface DeleteDialogProps {
  topicName: string
  isProd: boolean
  onConfirm: () => Promise<void>
  onCancel: () => void
}

function DeleteDialog({ topicName, isProd, onConfirm, onCancel }: DeleteDialogProps) {
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  const canConfirm = isProd ? confirmText === topicName : true

  const handleConfirm = async () => {
    if (!canConfirm) return
    setDeleting(true)
    try {
      await onConfirm()
    } finally {
      setDeleting(false)
    }
  }

  const inputCls =
    'w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Delete topic"
        className="w-full max-w-sm rounded-xl border border-border bg-surface-1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center gap-3 px-6 pt-6 pb-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/15">
            <AlertTriangle className="h-6 w-6 text-danger" />
          </div>
          <h2 className="text-base font-semibold text-text-primary">Delete Topic</h2>
          <p className="text-center text-sm text-text-secondary">
            Are you sure you want to delete{' '}
            <span className="font-mono font-medium text-text-primary">{topicName}</span>? This
            action cannot be undone.
          </p>
        </div>

        {isProd && (
          <div className="px-6 pt-3">
            <label className="mb-1.5 block text-xs font-medium text-danger">
              This is a production cluster. Type the topic name to confirm:
            </label>
            <input
              type="text"
              aria-label="Resource name confirmation"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={topicName}
              className={inputCls}
              autoFocus
            />
          </div>
        )}

        <div className="flex justify-end gap-3 px-6 py-5">
          <button
            onClick={onCancel}
            className="rounded-lg bg-surface-3 px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-4 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm || deleting}
            className="flex items-center gap-2 rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white hover:bg-danger/90 transition-colors disabled:opacity-60"
          >
            {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Topic Row
// ---------------------------------------------------------------------------

function TopicRow({
  topic,
  isFavorite,
  onToggleFavorite,
  onClick,
  onDelete,
  onConfig
}: {
  topic: Topic
  isFavorite: boolean
  onToggleFavorite: () => void
  onClick: () => void
  onDelete: () => void
  onConfig: () => void
}) {
  const healthy = topic.underReplicatedPartitions === 0 && !topic.offlinePartitions

  return (
    <tr
      className="cursor-pointer bg-surface-0 hover:bg-surface-1 transition-colors group"
      tabIndex={0}
      aria-label={`Browse ${topic.name}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      onClick={onClick}
    >
      <td className="px-3 py-2.5">
        <button
          aria-label={`Favorite ${topic.name}`}
          onClick={(e) => {
            e.stopPropagation()
            onToggleFavorite()
          }}
          className="text-text-muted hover:text-warning transition-colors"
        >
          <Star className={`h-4 w-4 ${isFavorite ? 'fill-warning text-warning' : ''}`} />
        </button>
      </td>
      <td className="px-3 py-2.5 text-left">
        <div className="flex items-center gap-2">
          <span className="font-medium text-text-primary">{topic.name}</span>
          {topic.isInternal && (
            <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
              INTERNAL
            </span>
          )}
          {topic.isDLQ && (
            <span className="rounded bg-danger/15 px-1.5 py-0.5 text-[10px] font-medium text-danger">
              DLQ
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2.5 text-right text-text-secondary">{topic.partitions}</td>
      <td className="px-3 py-2.5 text-right text-text-secondary">{topic.replicationFactor}</td>
      <td className="px-3 py-2.5 text-right text-text-secondary">
        {topic.messageCountError ? 'Unavailable' : topic.messageCount.toLocaleString()}
      </td>
      <td className="px-3 py-2.5 text-right text-text-secondary">
        {formatRetention(topic.retentionMs)}
      </td>
      <td className="px-3 py-2.5 text-right text-text-secondary">{topic.cleanupPolicy}</td>
      <td className="px-3 py-2.5 text-right">
        {healthy ? (
          <CircleCheck className="ml-auto h-4 w-4 text-success" />
        ) : (
          <div className="flex items-center justify-end gap-1.5">
            <CircleAlert className="h-4 w-4 text-danger" />
            <span className="text-xs text-danger">{topic.underReplicatedPartitions}</span>
          </div>
        )}
      </td>
      <td className="px-3 py-2.5 text-right">
        <button
          className="text-xs text-accent mr-2"
          onClick={(e) => {
            e.stopPropagation()
            onConfig()
          }}
        >
          Config
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-text-muted hover:text-danger transition-all"
          title="Delete topic"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function TableSkeleton() {
  return (
    <tbody className="divide-y divide-border">
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i} className="bg-surface-0 animate-pulse">
          <td className="px-3 py-2.5">
            <div className="h-4 w-4 rounded bg-surface-3" />
          </td>
          <td className="px-3 py-2.5">
            <div className="h-4 w-48 rounded bg-surface-3" />
          </td>
          <td className="px-3 py-2.5">
            <div className="ml-auto h-4 w-8 rounded bg-surface-3" />
          </td>
          <td className="px-3 py-2.5">
            <div className="ml-auto h-4 w-8 rounded bg-surface-3" />
          </td>
          <td className="px-3 py-2.5">
            <div className="ml-auto h-4 w-16 rounded bg-surface-3" />
          </td>
          <td className="px-3 py-2.5">
            <div className="ml-auto h-4 w-10 rounded bg-surface-3" />
          </td>
          <td className="px-3 py-2.5">
            <div className="ml-auto h-4 w-14 rounded bg-surface-3" />
          </td>
          <td className="px-3 py-2.5">
            <div className="ml-auto h-4 w-4 rounded bg-surface-3" />
          </td>
          <td className="px-3 py-2.5">
            <div className="ml-auto h-4 w-4 rounded bg-surface-3" />
          </td>
        </tr>
      ))}
    </tbody>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function TopicList() {
  const { navigateToTopic, addNotification } = useUIStore()
  const { activeClusterId, connections } = useClusterStore()
  const {
    topics,
    favorites,
    topicsLoading,
    fetchTopics,
    loadFavorites,
    toggleFavorite,
    createTopic,
    deleteTopic
  } = useDataStore()

  const [configTarget, setConfigTarget] = useState<Topic | null>(null)
  const [semantic, setSemantic] = useState<TopicMatch[] | null>(null)
  const [aiLoading, setAILoading] = useState(false)
  useRefresh(() => activeClusterId && fetchTopics(activeClusterId))
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  useEffect(() => {
    if (!activeClusterId) return
    fetchTopics(activeClusterId)
    loadFavorites(activeClusterId)
  }, [activeClusterId, fetchTopics, loadFavorites])

  const isProdCluster = useMemo(() => {
    if (!activeClusterId) return false
    const conn = connections[activeClusterId]
    return conn?.config.environmentLabel === 'prod'
  }, [activeClusterId, connections])

  const handleToggleFavorite = useCallback(
    (topicName: string) => {
      if (!activeClusterId) return
      toggleFavorite(activeClusterId, topicName)
    },
    [activeClusterId, toggleFavorite]
  )

  const handleCreateTopic = useCallback(
    async (opts: {
      name: string
      partitions: number
      replicationFactor: number
      configs?: Record<string, string>
    }) => {
      if (!activeClusterId) return
      const success = await createTopic(activeClusterId, opts)
      if (success) {
        addNotification('success', `Topic "${opts.name}" created successfully.`)
        setCreateModalOpen(false)
      } else {
        addNotification('error', `Failed to create topic "${opts.name}".`)
      }
    },
    [activeClusterId, createTopic, addNotification]
  )

  const handleDeleteTopic = useCallback(
    async (topicName: string) => {
      if (!activeClusterId) return
      const success = await deleteTopic(activeClusterId, topicName)
      if (success) {
        addNotification('success', `Topic "${topicName}" deleted.`)
      } else {
        addNotification('error', `Failed to delete topic "${topicName}".`)
      }
      setDeleteTarget(null)
    },
    [activeClusterId, deleteTopic, addNotification]
  )

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const filtered = useMemo(() => {
    let list = [...topics]

    if (filter === 'user') list = list.filter((t) => !t.isInternal && !t.isDLQ)
    else if (filter === 'internal') list = list.filter((t) => t.isInternal)
    else if (filter === 'dlq') list = list.filter((t) => t.isDLQ)

    if (semantic) list = list.filter((t) => semantic.some((m) => m.name === t.name))
    else if (search) list = list.filter((t) => fuzzyMatch(t.name, search))

    list.sort((a, b) => {
      const aFav = favorites.has(a.name) ? 0 : 1
      const bFav = favorites.has(b.name) ? 0 : 1
      if (aFav !== bFav) return aFav - bFav

      const aVal = a[sortField]
      const bVal = b[sortField]
      const cmp =
        typeof aVal === 'string'
          ? aVal.localeCompare(bVal as string)
          : (aVal as number) - (bVal as number)
      return sortDir === 'asc' ? cmp : -cmp
    })

    return list
  }, [topics, search, filter, sortField, sortDir, favorites, semantic])

  const columns: { key: SortField; label: string; className?: string }[] = [
    { key: 'name', label: 'Name', className: 'text-left' },
    { key: 'partitions', label: 'Partitions' },
    { key: 'replicationFactor', label: 'Replication' },
    { key: 'messageCount', label: 'Messages' },
    { key: 'retentionMs', label: 'Retention' },
    { key: 'cleanupPolicy', label: 'Cleanup' }
  ]

  return (
    <div className="flex flex-col gap-4 p-6 overflow-y-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Database className="h-6 w-6 text-accent" />
          <h1 className="text-xl font-semibold text-text-primary">Topics</h1>
          <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-text-muted">
            {topicsLoading ? '...' : filtered.length}
          </span>
        </div>
        <button
          onClick={() => setCreateModalOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create Topic
        </button>
      </div>

      {/* Search & Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            data-topic-search
            aria-label="Search topics"
            placeholder="Search topics..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setSemantic(null)
            }}
            className="w-full rounded-lg border border-border bg-surface-0 py-2 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
        </div>
        <button
          disabled={!search || aiLoading}
          className="text-xs text-accent"
          onClick={async () => {
            setAILoading(true)
            const r = await window.api.ai.searchTopics(
              search,
              topics.map((t) => t.name)
            )
            setAILoading(false)
            if (r.success) setSemantic(r.data ?? [])
            else addNotification('error', r.error ?? 'Topic search failed')
          }}
        >
          {aiLoading ? 'Searching…' : 'Search with AI'}
        </button>
        <div className="flex gap-1">
          {FILTER_PILLS.map((pill) => (
            <button
              key={pill.key}
              onClick={() => setFilter(pill.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === pill.key
                  ? 'bg-accent text-white'
                  : 'bg-surface-2 text-text-secondary hover:bg-surface-3'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {semantic && (
        <div className="text-xs space-y-1">
          {semantic.map((m) => (
            <p key={m.name}>
              <strong>{m.name}</strong> — {m.reason}
            </p>
          ))}
        </div>
      )}
      {/* Table */}
      <div className="flex-1 overflow-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-1">
              <th className="w-10 px-3 py-2.5" />
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-3 py-2.5 font-medium text-text-secondary cursor-pointer select-none hover:text-text-primary transition-colors ${col.className ?? 'text-right'}`}
                  tabIndex={0}
                  aria-sort={
                    sortField === col.key
                      ? sortDir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSort(col.key)
                  }}
                  onClick={() => handleSort(col.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    <ArrowUpDown
                      className={`h-3 w-3 ${sortField === col.key ? 'text-accent' : 'text-text-muted'}`}
                    />
                  </span>
                </th>
              ))}
              <th className="px-3 py-2.5 text-right font-medium text-text-secondary">Health</th>
              <th className="w-10 px-3 py-2.5" />
            </tr>
          </thead>

          {topicsLoading ? (
            <TableSkeleton />
          ) : (
            <tbody className="divide-y divide-border">
              {filtered.map((topic) => (
                <TopicRow
                  key={topic.name}
                  topic={topic}
                  isFavorite={favorites.has(topic.name)}
                  onToggleFavorite={() => handleToggleFavorite(topic.name)}
                  onClick={() => navigateToTopic(topic.name)}
                  onDelete={() => setDeleteTarget(topic.name)}
                  onConfig={() => setConfigTarget(topic)}
                />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-text-muted">
                    No topics match your search.
                  </td>
                </tr>
              )}
            </tbody>
          )}
        </table>
      </div>

      {configTarget && (
        <TopicConfigDialog topic={configTarget} onClose={() => setConfigTarget(null)} />
      )}
      {/* Modals */}
      <CreateTopicModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSubmit={handleCreateTopic}
      />

      {deleteTarget && (
        <DeleteDialog
          topicName={deleteTarget}
          isProd={isProdCluster}
          onConfirm={() => handleDeleteTopic(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
