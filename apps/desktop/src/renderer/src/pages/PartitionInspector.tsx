import { useEffect, useState } from 'react'
import { useClusterStore } from '@/stores/clusterStore'
import { useDataStore } from '@/stores/dataStore'
import { useUIStore } from '@/stores/uiStore'
import { Button, Select } from '@/components/common/Controls'
import { download, csv } from '@/lib/files'
import { useRefresh } from '@/lib/useRefresh'
import type { TopicPartition } from '@/types'
export default function PartitionInspector() {
  const { activeClusterId } = useClusterStore()
  const { topics, fetchTopics } = useDataStore()
  const { selectedTopicName, setSelectedTopic, setCurrentPage, addNotification } = useUIStore()
  const [partitions, setPartitions] = useState<TopicPartition[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const topic = selectedTopicName ?? topics[0]?.name ?? ''
  async function refresh() {
    if (!activeClusterId || !topic) return
    setLoading(true)
    setError('')
    const r = await window.api.topics.partitions(activeClusterId, topic)
    if (useClusterStore.getState().activeClusterId === activeClusterId) {
      if (r.success) setPartitions(r.data ?? [])
      else {
        setError(r.error ?? 'Could not load partitions')
        addNotification('error', r.error ?? 'Could not load partitions')
      }
    }
    setLoading(false)
  }
  useEffect(() => {
    if (activeClusterId) void fetchTopics(activeClusterId)
  }, [activeClusterId, fetchTopics])
  useEffect(() => {
    setPartitions([])
    void refresh()
  }, [activeClusterId, topic])
  useRefresh(refresh)
  const counts = partitions.map((p) => p.logEndOffset - p.logStartOffset)
  const max = Math.max(1, ...counts)
  return (
    <div className="p-6 space-y-5">
      <div className="flex gap-3 items-center">
        <h1 className="text-lg font-semibold">Partition Inspector</h1>
        <Select
          aria-label="Partition topic"
          value={topic}
          onChange={(e) => setSelectedTopic(e.target.value)}
        >
          {topics.map((t) => (
            <option key={t.name}>{t.name}</option>
          ))}
        </Select>
        <Button onClick={refresh} disabled={loading}>
          Refresh
        </Button>
        <Button
          onClick={() =>
            download(
              `${topic}-partitions.csv`,
              csv(
                ['Partition', 'Leader', 'Replicas', 'ISR', 'Start offset', 'End offset', 'Count'],
                partitions.map((p) => [
                  p.partitionId,
                  p.leader,
                  p.replicas.join(' '),
                  p.isr.join(' '),
                  p.logStartOffset,
                  p.logEndOffset,
                  p.logEndOffset - p.logStartOffset
                ])
              ),
              'text/csv'
            )
          }
        >
          Export CSV
        </Button>
        <Button
          onClick={() => {
            setSelectedTopic(topic)
            setCurrentPage('topics')
          }}
        >
          Topic configuration and AI skew advice
        </Button>
        <Button
          onClick={() => {
            setSelectedTopic(topic)
            setCurrentPage('messages')
          }}
        >
          Browse messages
        </Button>
      </div>
      {loading && (
        <p role="status" className="animate-pulse">
          Loading partition metadata…
        </p>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <table className="w-full text-xs">
        <thead>
          <tr>
            {[
              'Partition',
              'Leader',
              'Replicas / ISR',
              'Start / End offset',
              'Distribution',
              'Health'
            ].map((t) => (
              <th key={t} className="p-3 text-left">
                {t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {partitions.map((p, i) => (
            <tr key={p.partitionId} className="border-t border-border">
              <td className="p-3">{p.partitionId}</td>
              <td className="p-3">
                {p.leader < 0 ? (
                  'Offline'
                ) : (
                  <button
                    className="text-accent"
                    onClick={() => {
                      useUIStore.getState().setSelectedBroker(p.leader)
                      setCurrentPage('brokers')
                    }}
                  >
                    {p.leader} ({p.leaderHost})
                  </button>
                )}
              </td>
              <td className="p-3">
                {p.replicas.join(', ')} / {p.isr.join(', ')}
              </td>
              <td className="p-3">
                {p.logStartOffset} / {p.logEndOffset}
              </td>
              <td className="p-3 w-64">
                <div className="bg-surface-3 h-2 rounded">
                  <div
                    className="bg-accent h-2 rounded"
                    style={{ width: `${(counts[i] / max) * 100}%` }}
                  />
                </div>
                {counts[i].toLocaleString()} offset span
              </td>
              <td
                className={`p-3 ${p.leader < 0 || p.isUnderReplicated ? 'text-danger' : 'text-success'}`}
              >
                {p.leader < 0 ? 'Offline' : p.isUnderReplicated ? 'Under replicated' : 'Healthy'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="rounded border border-border p-4">
        <h2 className="mb-3 font-medium">Replica topology</h2>
        <div className="flex flex-wrap gap-3">
          {partitions.map((p) => (
            <div key={p.partitionId} className="rounded bg-surface-2 p-3 text-xs">
              <strong>Partition {p.partitionId}</strong>
              <div className="flex gap-2 mt-2">
                {p.replicas.map((b) => (
                  <span
                    key={b}
                    className={`rounded border px-2 py-1 ${b === p.leader ? 'border-accent' : p.isr.includes(b) ? 'border-success' : 'border-danger'}`}
                  >
                    Broker {b}
                    {b === p.leader ? ' · leader' : ''}
                    {!p.isr.includes(b) ? ' · outside ISR' : ''}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-text-muted">
        Offset spans may include gaps from compaction. Leader epochs are unavailable through the
        current Kafka client.
      </p>
    </div>
  )
}
