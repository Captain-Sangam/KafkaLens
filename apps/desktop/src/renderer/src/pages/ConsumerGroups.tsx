import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import {
  RefreshCw,
  Search,
  ChevronDown,
  ChevronRight,
  Users,
  RotateCcw,
  Trash2,
  X,
  AlertTriangle,
  Loader2
} from 'lucide-react'
import { useDataStore } from '@/stores/dataStore'
import { useClusterStore } from '@/stores/clusterStore'
import { useUIStore } from '@/stores/uiStore'
import type { ConsumerGroup, ConsumerGroupOffset } from '@/types'

const STATE_STYLES: Record<ConsumerGroup['state'], string> = {
  Stable: 'bg-success/15 text-success',
  Rebalancing: 'bg-warning/15 text-warning',
  Empty: 'bg-surface-4 text-text-muted',
  Dead: 'bg-danger/15 text-danger',
  PreparingRebalance: 'bg-info/15 text-info'
}

function SkeletonRow() {
  return (
    <tr className="border-b border-border/50">
      <td className="w-8 pl-3">
        <div className="h-3 w-3 animate-pulse rounded bg-surface-3" />
      </td>
      {[...Array(6)].map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div
            className="h-3 animate-pulse rounded bg-surface-3"
            style={{ width: `${30 + Math.random() * 50}%` }}
          />
        </td>
      ))}
    </tr>
  )
}

function LagBar({ lag, maxLag }: { lag: number; maxLag: number }) {
  const pct = maxLag > 0 ? Math.min((lag / maxLag) * 100, 100) : 0
  const color = lag >= 10_000 ? 'bg-danger' : lag >= 100 ? 'bg-warning' : 'bg-success'

  return (
    <div className="flex items-center gap-2">
      <span className="w-14 tabular-nums text-right text-xs">{lag.toLocaleString()}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function ExpandedOffsets({
  groupId,
  clusterId
}: {
  groupId: string
  clusterId: string
}) {
  const { consumerGroupOffsets, fetchConsumerGroupOffsets } = useDataStore()
  const [loading, setLoading] = useState(false)
  const fetchedRef = useRef(false)

  const offsets = consumerGroupOffsets[groupId] ?? []

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    setLoading(true)
    fetchConsumerGroupOffsets(clusterId, groupId).finally(() => setLoading(false))
  }, [clusterId, groupId, fetchConsumerGroupOffsets])

  const maxLag = useMemo(() => Math.max(...offsets.map((o) => o.lag), 1), [offsets])

  if (loading && offsets.length === 0) {
    return (
      <div className="flex items-center gap-2 px-6 py-4 text-xs text-text-muted">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading offset data...
      </div>
    )
  }

  if (offsets.length === 0) {
    return (
      <div className="px-6 py-4 text-xs text-text-muted">No offset data available for this group.</div>
    )
  }

  return (
    <div className="animate-fade-in px-4 pb-3">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-text-muted">
            <th className="px-3 py-2 text-left font-medium">Topic</th>
            <th className="px-3 py-2 text-right font-medium">Partition</th>
            <th className="px-3 py-2 text-right font-medium">Current Offset</th>
            <th className="px-3 py-2 text-right font-medium">Log End Offset</th>
            <th className="w-48 px-3 py-2 font-medium">Lag</th>
            <th className="px-3 py-2 text-right font-medium">Last Committed</th>
          </tr>
        </thead>
        <tbody>
          {offsets.map((o) => (
            <tr
              key={`${o.topic}-${o.partition}`}
              className="border-b border-border/50 text-text-secondary hover:bg-surface-3/50"
            >
              <td className="px-3 py-1.5 font-mono text-text-primary">{o.topic}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{o.partition}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {o.currentOffset.toLocaleString()}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {o.logEndOffset.toLocaleString()}
              </td>
              <td className="px-3 py-1.5">
                <LagBar lag={o.lag} maxLag={maxLag} />
              </td>
              <td className="px-3 py-1.5 text-right text-text-muted">
                {o.lastCommittedAt ? new Date(o.lastCommittedAt).toLocaleTimeString() : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

type ResetMode = 'earliest' | 'latest' | 'to-offset' | 'to-timestamp'

function ResetOffsetsDropdown({
  groupId,
  topics,
  clusterId,
  isProd,
  onClose
}: {
  groupId: string
  topics: string[]
  clusterId: string
  isProd: boolean
  onClose: () => void
}) {
  const { resetOffsets } = useDataStore()
  const { addNotification } = useUIStore()

  const [mode, setMode] = useState<ResetMode>('earliest')
  const [offsetValue, setOffsetValue] = useState('')
  const [timestampValue, setTimestampValue] = useState('')
  const [selectedTopic, setSelectedTopic] = useState(topics[0] ?? '')
  const [confirmText, setConfirmText] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const handleReset = async () => {
    if (isProd && !showConfirm) {
      setShowConfirm(true)
      return
    }

    if (isProd && confirmText !== groupId) {
      addNotification('error', 'Group ID confirmation does not match')
      return
    }

    setSubmitting(true)
    try {
      const spec = (() => {
        switch (mode) {
          case 'earliest':
            return { type: 'earliest' as const }
          case 'latest':
            return { type: 'latest' as const }
          case 'to-offset':
            return { type: 'to-offset' as const, value: parseInt(offsetValue, 10) }
          case 'to-timestamp':
            return { type: 'to-timestamp' as const, value: new Date(timestampValue).getTime() }
        }
      })()

      const success = await resetOffsets(clusterId, groupId, selectedTopic, spec)
      if (success) {
        addNotification('success', `Offsets reset to ${mode} for group ${groupId}`)
        onClose()
      } else {
        addNotification('error', `Failed to reset offsets for group ${groupId}`)
      }
    } catch {
      addNotification('error', `Failed to reset offsets for group ${groupId}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-border bg-surface-1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold text-text-primary">Reset Offsets</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <span className="text-text-secondary">Group:</span>
            <span className="font-mono text-accent">{groupId}</span>
          </div>

          {/* Topic selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-secondary">Topic</label>
            <select
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
              className="rounded-md border border-border bg-surface-0 px-3 py-2 text-xs text-text-primary focus:border-accent focus:outline-none"
            >
              {topics.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Reset mode */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-secondary">Reset To</label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { value: 'earliest', label: 'Earliest' },
                  { value: 'latest', label: 'Latest' },
                  { value: 'to-offset', label: 'Specific Offset' },
                  { value: 'to-timestamp', label: 'Specific Timestamp' }
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setMode(opt.value)
                    setShowConfirm(false)
                  }}
                  className={`rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                    mode === opt.value
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border bg-surface-0 text-text-secondary hover:bg-surface-2'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {mode === 'to-offset' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-secondary">Offset</label>
              <input
                type="number"
                value={offsetValue}
                onChange={(e) => setOffsetValue(e.target.value)}
                placeholder="Enter offset number"
                min={0}
                className="rounded-md border border-border bg-surface-0 px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
              />
            </div>
          )}

          {mode === 'to-timestamp' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-secondary">Timestamp</label>
              <input
                type="datetime-local"
                value={timestampValue}
                onChange={(e) => setTimestampValue(e.target.value)}
                className="rounded-md border border-border bg-surface-0 px-3 py-2 text-xs text-text-primary focus:border-accent focus:outline-none"
              />
            </div>
          )}

          {isProd && showConfirm && (
            <div className="flex flex-col gap-2 rounded-md border border-danger/30 bg-danger/5 p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-danger">
                <AlertTriangle className="h-3.5 w-3.5" />
                Production Cluster — Confirm Reset
              </div>
              <p className="text-xs text-text-muted">
                Type the group ID <span className="font-mono text-text-primary">{groupId}</span> to confirm:
              </p>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={groupId}
                className="rounded-md border border-danger/30 bg-surface-0 px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-danger focus:outline-none"
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-border px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-border bg-surface-0 px-4 py-2 text-xs font-medium text-text-secondary hover:bg-surface-2 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleReset}
            disabled={
              submitting ||
              (mode === 'to-offset' && !offsetValue) ||
              (mode === 'to-timestamp' && !timestampValue)
            }
            className="flex items-center gap-2 rounded-md bg-warning/90 px-4 py-2 text-xs font-medium text-white hover:bg-warning transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
            {submitting ? 'Resetting...' : isProd && !showConfirm ? 'Continue' : 'Reset Offsets'}
          </button>
        </div>
      </div>
    </div>
  )
}

function DeleteConfirmDialog({
  groupId,
  clusterId,
  onClose
}: {
  groupId: string
  clusterId: string
  onClose: () => void
}) {
  const { deleteConsumerGroup } = useDataStore()
  const { addNotification } = useUIStore()
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const success = await deleteConsumerGroup(clusterId, groupId)
      if (success) {
        addNotification('success', `Consumer group ${groupId} deleted`)
        onClose()
      } else {
        addNotification('error', `Failed to delete consumer group ${groupId}`)
      }
    } catch {
      addNotification('error', `Failed to delete consumer group ${groupId}`)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl border border-border bg-surface-1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-3 px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-danger/10 p-2">
              <AlertTriangle className="h-5 w-5 text-danger" />
            </div>
            <h3 className="text-sm font-semibold text-text-primary">Delete Consumer Group</h3>
          </div>
          <p className="text-xs text-text-muted">
            Are you sure you want to delete{' '}
            <span className="font-mono text-text-primary">{groupId}</span>? This action cannot be undone.
          </p>
        </div>

        <div className="flex justify-end gap-3 border-t border-border px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-border bg-surface-0 px-4 py-2 text-xs font-medium text-text-secondary hover:bg-surface-2 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-2 rounded-md bg-danger px-4 py-2 text-xs font-medium text-white hover:bg-danger/90 transition-colors disabled:opacity-50"
          >
            {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

function GroupRow({
  group,
  expanded,
  clusterId,
  isProd,
  onToggle
}: {
  group: ConsumerGroup
  expanded: boolean
  clusterId: string
  isProd: boolean
  onToggle: () => void
}) {
  const [showResetDropdown, setShowResetDropdown] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const canDelete = group.state === 'Empty' || group.state === 'Dead'

  return (
    <>
      <tr
        className="cursor-pointer border-b border-border/50 transition-colors hover:bg-surface-2/60"
        onClick={onToggle}
      >
        <td className="pl-3">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-text-muted" />
          ) : (
            <ChevronRight className="h-4 w-4 text-text-muted" />
          )}
        </td>
        <td className="px-4 py-2.5 font-mono text-text-primary">{group.groupId}</td>
        <td className="px-4 py-2.5">
          <span
            className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATE_STYLES[group.state]}`}
          >
            {group.state}
          </span>
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">{group.members}</td>
        <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">
          {group.topics.length}
        </td>
        <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">
          {group.totalLag.toLocaleString()}
        </td>
        <td className="px-4 py-2.5 text-right">
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setShowResetDropdown(true)
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-surface-3 px-2.5 py-1 text-xs text-text-secondary transition-colors hover:bg-surface-4 hover:text-text-primary"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
            {canDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setShowDeleteConfirm(true)
                }}
                className="inline-flex items-center gap-1.5 rounded-md bg-danger/10 px-2.5 py-1 text-xs text-danger transition-colors hover:bg-danger/20"
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </button>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} className="bg-surface-1 p-0">
            <ExpandedOffsets groupId={group.groupId} clusterId={clusterId} />
          </td>
        </tr>
      )}

      {showResetDropdown && (
        <ResetOffsetsDropdown
          groupId={group.groupId}
          topics={group.topics}
          clusterId={clusterId}
          isProd={isProd}
          onClose={() => setShowResetDropdown(false)}
        />
      )}

      {showDeleteConfirm && (
        <DeleteConfirmDialog
          groupId={group.groupId}
          clusterId={clusterId}
          onClose={() => setShowDeleteConfirm(false)}
        />
      )}
    </>
  )
}

export default function ConsumerGroups() {
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { activeClusterId, clusters, connections } = useClusterStore()
  const { consumerGroups, consumerGroupsLoading, fetchConsumerGroups } = useDataStore()

  const isProd = useMemo(() => {
    if (!activeClusterId) return false
    const cluster = clusters.find((c) => c.id === activeClusterId)
    return cluster?.environmentLabel === 'prod'
  }, [activeClusterId, clusters])

  const doRefresh = useCallback(() => {
    if (!activeClusterId) return
    fetchConsumerGroups(activeClusterId)
  }, [activeClusterId, fetchConsumerGroups])

  useEffect(() => {
    doRefresh()
  }, [doRefresh])

  const filtered = useMemo(
    () =>
      consumerGroups.filter((g) => g.groupId.toLowerCase().includes(search.toLowerCase())),
    [consumerGroups, search]
  )

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-accent" />
          <h1 className="text-lg font-semibold text-text-primary">Consumer Groups</h1>
          <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs text-text-muted">
            {consumerGroups.length}
          </span>
        </div>
        <button
          onClick={doRefresh}
          className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-surface-3 hover:text-text-primary"
        >
          <RefreshCw className={`h-4 w-4 ${consumerGroupsLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Search */}
      <div className="border-b border-border px-6 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Filter by group ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-1 py-2 pl-9 pr-4 text-sm text-text-primary placeholder:text-text-muted transition-colors focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-surface-1">
            <tr className="border-b border-border text-text-muted">
              <th className="w-8" />
              <th className="px-4 py-2.5 text-left font-medium">Group ID</th>
              <th className="px-4 py-2.5 text-left font-medium">State</th>
              <th className="px-4 py-2.5 text-right font-medium">Members</th>
              <th className="px-4 py-2.5 text-right font-medium">Topics</th>
              <th className="px-4 py-2.5 text-right font-medium">Total Lag</th>
              <th className="px-4 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {consumerGroupsLoading && consumerGroups.length === 0
              ? [...Array(6)].map((_, i) => <SkeletonRow key={i} />)
              : filtered.map((g) => {
                  const expanded = expandedId === g.groupId
                  return (
                    <GroupRow
                      key={g.groupId}
                      group={g}
                      expanded={expanded}
                      clusterId={activeClusterId!}
                      isProd={isProd}
                      onToggle={() => setExpandedId(expanded ? null : g.groupId)}
                    />
                  )
                })}
            {!consumerGroupsLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-text-muted">
                  No consumer groups match your filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
