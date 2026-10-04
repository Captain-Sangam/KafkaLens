import { useEffect, useState } from 'react'
import { useClusterStore } from '@/stores/clusterStore'
import { useDataStore } from '@/stores/dataStore'
import { useUIStore } from '@/stores/uiStore'
import { useConfirmation } from '@/components/common/ConfirmationDialog'
import { Button, Input, Select } from '@/components/common/Controls'
import { download, csv } from '@/lib/files'
import { useRefresh } from '@/lib/useRefresh'
import type { GroupDetail, OffsetSpec, LagSample } from '@/types'
function LagChart({ samples }: { samples: LagSample[] }) {
  if (samples.length < 2)
    return <p className="text-xs text-text-muted">Collecting lag samples every 15 seconds…</p>
  const max = Math.max(1, ...samples.map((s) => s.lag))
  return (
    <svg
      role="img"
      aria-label="Consumer lag over this session"
      viewBox="0 0 600 100"
      className="h-24 w-full"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-accent"
        points={samples
          .map((s, i) => `${(i / (samples.length - 1)) * 600},${95 - (s.lag / max) * 90}`)
          .join(' ')}
      />
      <text x="0" y="12" fill="currentColor" fontSize="10">
        Peak {max.toLocaleString()} · {new Date(samples[0].at).toLocaleTimeString()} –{' '}
        {new Date(samples.at(-1)!.at).toLocaleTimeString()}
      </text>
    </svg>
  )
}
export default function ConsumerGroups() {
  const { activeClusterId, clusters } = useClusterStore()
  const {
    consumerGroups,
    consumerGroupsLoading,
    consumerGroupOffsets,
    fetchConsumerGroups,
    fetchConsumerGroupOffsets,
    resetOffsets,
    deleteConsumerGroup,
    lagHistory
  } = useDataStore()
  const notify = useUIStore((s) => s.addNotification)
  const { confirm, dialog } = useConfirmation()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState('')
  const [detail, setDetail] = useState<GroupDetail | null>(null)
  const [topic, setTopic] = useState('')
  const [mode, setMode] = useState<OffsetSpec['type']>('earliest')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const production = clusters.find((c) => c.id === activeClusterId)?.environmentLabel === 'prod'
  const group = consumerGroups.find((g) => g.groupId === selected)
  const offsets = consumerGroupOffsets[selected] ?? []
  async function refresh() {
    if (activeClusterId) {
      await fetchConsumerGroups(activeClusterId)
      if (selected) await fetchConsumerGroupOffsets(activeClusterId, selected)
    }
  }
  useRefresh(refresh)
  useEffect(() => {
    setSelected('')
    setDetail(null)
    if (activeClusterId) void fetchConsumerGroups(activeClusterId)
  }, [activeClusterId, fetchConsumerGroups])
  useEffect(() => {
    let alive = true
    setDetail(null)
    setTopic(group?.topics[0] ?? '')
    if (activeClusterId && selected) {
      void fetchConsumerGroupOffsets(activeClusterId, selected)
      void window.api.consumerGroups.describe(activeClusterId, selected).then((r) => {
        if (alive) {
          if (r.success) setDetail(r.data ?? null)
          else notify('error', r.error ?? 'Could not load members')
        }
      })
    }
    return () => {
      alive = false
    }
  }, [activeClusterId, selected])
  async function reset() {
    if (!activeClusterId || !topic) return
    const spec: OffsetSpec = { type: mode }
    if (mode === 'to-offset') {
      if (!/^\d+$/.test(value)) {
        notify('error', 'Enter a non-negative offset')
        return
      }
      spec.value = value
    }
    if (mode === 'to-timestamp') {
      const time = Date.parse(value)
      if (!Number.isFinite(time)) {
        notify('error', 'Choose a valid timestamp')
        return
      }
      spec.value = time
    }
    if (
      !(await confirm({
        title: 'Reset consumer offsets',
        message: `Reset ${selected} on ${topic} to ${mode}${value ? ' ' + value : ''}. Stop all members first.`,
        resource: selected,
        production
      }))
    )
      return
    setBusy(true)
    const ok = await resetOffsets(activeClusterId, selected, topic, spec)
    setBusy(false)
    if (ok) notify('success', 'Consumer offsets reset')
  }
  async function remove() {
    if (
      !activeClusterId ||
      !(await confirm({
        title: 'Delete consumer group',
        message: `Delete ${selected} and its committed offsets?`,
        resource: selected,
        production
      }))
    )
      return
    setBusy(true)
    if (await deleteConsumerGroup(activeClusterId, selected)) setSelected('')
    setBusy(false)
  }
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">Consumer Groups</h1>
        <Input
          aria-label="Filter groups"
          placeholder="Filter groups…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button onClick={refresh} disabled={consumerGroupsLoading}>
          Refresh
        </Button>
      </div>
      {consumerGroupsLoading && (
        <p role="status" className="animate-pulse">
          Loading consumer groups…
        </p>
      )}
      <table className="w-full text-xs">
        <thead>
          <tr>
            {['Group', 'State', 'Protocol', 'Members', 'Topics', 'Total lag'].map((h) => (
              <th key={h} className="text-left p-2">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {consumerGroups
            .filter((g) => g.groupId.toLowerCase().includes(search.toLowerCase()))
            .map((g) => (
              <tr
                key={g.groupId}
                className={`border-t border-border ${g.groupId === selected ? 'bg-accent/10' : ''}`}
              >
                <td className="p-2">
                  <button onClick={() => setSelected(g.groupId)} className="font-mono text-accent">
                    {g.groupId}
                  </button>
                </td>
                <td>{g.state}</td>
                <td>{g.protocolType}</td>
                <td>{g.members}</td>
                <td>{g.topics.join(', ') || '—'}</td>
                <td
                  title={g.lagError}
                  className={
                    g.lagError
                      ? 'text-text-muted'
                      : g.totalLag > 10000
                        ? 'text-danger'
                        : g.totalLag > 100
                          ? 'text-warning'
                          : 'text-success'
                  }
                >
                  {g.lagError ? 'Unavailable' : g.totalLag.toLocaleString()}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
      {group && (
        <section className="space-y-4 rounded border border-border p-4">
          <h2 className="font-semibold">{selected}</h2>
          {group.lagError && (
            <p role="status" className="text-xs text-warning">
              {group.lagError}
            </p>
          )}
          <LagChart samples={lagHistory[selected] ?? []} />
          <div className="flex gap-2">
            <Button
              onClick={() => download(`${selected}-offsets.json`, JSON.stringify(offsets, null, 2))}
            >
              Export JSON
            </Button>
            <Button
              onClick={() =>
                download(
                  `${selected}-offsets.csv`,
                  csv(
                    ['Topic', 'Partition', 'Current offset', 'End offset', 'Lag'],
                    offsets.map((o) => [
                      o.topic,
                      o.partition,
                      o.currentOffset,
                      o.logEndOffset,
                      o.lag
                    ])
                  ),
                  'text/csv'
                )
              }
            >
              Export CSV
            </Button>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr>
                {['Topic', 'Partition', 'Current offset', 'End offset', 'Lag'].map((h) => (
                  <th key={h} className="text-left p-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {offsets.map((o) => (
                <tr key={`${o.topic}:${o.partition}`} className="border-t border-border">
                  <td className="p-2">{o.topic}</td>
                  <td>{o.partition}</td>
                  <td>{o.currentOffset < 0 ? 'Uncommitted' : o.currentOffset}</td>
                  <td>{o.logEndOffset}</td>
                  <td>
                    <div className="flex gap-2 items-center">
                      <span>{o.lag}</span>
                      <div className="h-1.5 w-24 bg-surface-3 rounded">
                        <div
                          className="h-full rounded bg-warning"
                          style={{
                            width: `${(o.lag / Math.max(1, ...offsets.map((v) => v.lag))) * 100}%`
                          }}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3 className="text-sm font-semibold">Members</h3>
          {detail?.members.length ? (
            detail.members.map((m) => (
              <div key={m.memberId} className="text-xs font-mono bg-surface-2 p-2 rounded">
                {m.clientId} · {m.host} · {m.memberId}
                <p>
                  {m.assignments.map((a) => `${a.topic}: [${a.partitions.join(', ')}]`).join(' · ')}
                </p>
              </div>
            ))
          ) : (
            <p className="text-xs text-text-muted">
              No active members. Topics are derived from committed offsets.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Select
              aria-label="Reset topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            >
              {group.topics.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
            <Select
              aria-label="Reset mode"
              value={mode}
              onChange={(e) => {
                setMode(e.target.value as OffsetSpec['type'])
                setValue('')
              }}
            >
              {['earliest', 'latest', 'to-offset', 'to-timestamp'].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
            {mode.startsWith('to-') && (
              <Input
                aria-label="Reset value"
                type={mode === 'to-timestamp' ? 'datetime-local' : 'text'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            )}
            <Button disabled={busy || group.members > 0 || !topic} onClick={reset}>
              Reset offsets
            </Button>
            <Button disabled={busy || group.members > 0} onClick={remove} className="text-danger">
              Delete group
            </Button>
          </div>
          <p className="text-xs text-text-muted">
            Stop active members before reset or deletion. Commit timestamps are not provided by the
            Kafka protocol.
          </p>
        </section>
      )}
      {dialog}
    </div>
  )
}
