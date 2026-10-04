import { useEffect, useState } from 'react'
import { useClusterStore } from '@/stores/clusterStore'
import { useDataStore } from '@/stores/dataStore'
import { useUIStore } from '@/stores/uiStore'
import { Button, Input, Select } from '@/components/common/Controls'
import { download } from '@/lib/files'
import { useRefresh } from '@/lib/useRefresh'
import type { ConfigSnapshot, TopicPartition } from '@/types'
const CONFIG_DESCRIPTIONS: Record<string, string> = {
  'log.retention.hours': 'Hours to keep logs before deletion',
  'num.partitions': 'Default partitions for newly created topics',
  'default.replication.factor': 'Default replica count for auto-created topics',
  'min.insync.replicas': 'Minimum replicas that must acknowledge writes',
  'log.segment.bytes': 'Maximum log segment size in bytes',
  'compression.type': 'Default compression type',
  'message.max.bytes': 'Maximum accepted message size in bytes',
  'num.io.threads': 'Threads for disk IO',
  'num.network.threads': 'Threads for processing network requests'
}
export function BrokerConfig() {
  const { activeClusterId } = useClusterStore()
  const { brokers, brokersLoading, fetchBrokers } = useDataStore()
  const { addNotification, setSelectedTopic, setCurrentPage } = useUIStore()
  const [broker, setBroker] = useState<number>(useUIStore.getState().selectedBrokerId ?? 0)
  const [configs, setConfigs] = useState<Record<number, Record<string, string>>>({})
  const [clusterConfig, setClusterConfig] = useState<Record<string, string>>({})
  const [history, setHistory] = useState<ConfigSnapshot[]>([])
  const [partitions, setPartitions] = useState<
    { topic: string; partition: TopicPartition; role: string }[]
  >([])
  const [search, setSearch] = useState('')
  const [view, setView] = useState('broker')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function refresh() {
    if (!activeClusterId) return
    setBusy(true)
    setError('')
    await fetchBrokers(activeClusterId)
    const list = useDataStore.getState().brokers
    const loaded = await Promise.all(
      list.map(async (b) => [b.id, await window.api.brokers.config(activeClusterId, b.id)] as const)
    )
    if (useClusterStore.getState().activeClusterId !== activeClusterId) {
      setBusy(false)
      return
    }
    setConfigs(
      Object.fromEntries(loaded.filter(([, r]) => r.success).map(([id, r]) => [id, r.data ?? {}]))
    )
    for (const [, r] of loaded)
      if (!r.success) setError(r.error ?? 'Could not load broker configuration')
    const global = await window.api.brokers.clusterConfig(activeClusterId)
    if (global.success) setClusterConfig(global.data ?? {})
    else setError(global.error ?? 'Cluster defaults could not be read')
    setBusy(false)
  }
  useRefresh(refresh)
  useEffect(() => {
    setConfigs({})
    setHistory([])
    setPartitions([])
    setBroker(useUIStore.getState().selectedBrokerId ?? 0)
    void refresh()
  }, [activeClusterId])
  useEffect(() => {
    if (brokers.length && !brokers.some((b) => b.id === broker)) setBroker(brokers[0].id)
  }, [brokers, broker])
  useEffect(() => {
    let alive = true
    setHistory([])
    setPartitions([])
    if (activeClusterId) {
      void window.api.brokers.history(activeClusterId, broker).then((r) => {
        if (alive && r.success) setHistory(r.data ?? [])
      })
      if (view === 'partitions')
        void window.api.brokers.partitions(activeClusterId, broker).then((r) => {
          if (alive) {
            if (r.success) setPartitions(r.data ?? [])
            else addNotification('error', r.error ?? 'Could not load broker partitions')
          }
        })
    }
    return () => {
      alive = false
    }
  }, [activeClusterId, broker, configs, view])
  const current = view === 'cluster' ? clusterConfig : (configs[broker] ?? {})
  const keys = Object.keys(current)
    .filter((k) => k.toLowerCase().includes(search.toLowerCase()))
    .sort()
  const allKeys = [...new Set(Object.values(configs).flatMap((c) => Object.keys(c)))]
    .filter((k) => k.includes(search))
    .sort()
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">Brokers</h1>
        <Select
          aria-label="Broker"
          value={broker}
          onChange={(e) => setBroker(Number(e.target.value))}
        >
          {brokers.map((b) => (
            <option key={b.id} value={b.id}>
              Broker {b.id} · {b.host}:{b.port}
              {b.isController ? ' · Controller' : ''}
              {b.rack ? ` · ${b.rack}` : ''}
            </option>
          ))}
        </Select>
        <Button onClick={refresh} disabled={busy}>
          Refresh
        </Button>
      </div>
      <div className="flex gap-2">
        {['broker', 'cluster', 'compare', 'history', 'partitions'].map((v) => (
          <Button key={v} onClick={() => setView(v)} className={view === v ? 'text-accent' : ''}>
            {v}
          </Button>
        ))}
        <Input
          aria-label="Filter broker configs"
          placeholder="Filter configs…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button
          onClick={() => download(`broker-${broker}-config.json`, JSON.stringify(current, null, 2))}
        >
          Export JSON
        </Button>
        <Button
          onClick={() =>
            download(
              `broker-${broker}.properties`,
              Object.entries(current)
                .map(([k, v]) => `${k}=${v}`)
                .join('\n'),
              'text/plain'
            )
          }
        >
          Export properties
        </Button>
      </div>
      {(busy || brokersLoading) && (
        <p role="status" className="animate-pulse">
          Loading broker metadata…
        </p>
      )}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {view === 'cluster' && (
        <p className="text-xs text-text-muted">
          Cluster defaults and dynamic cluster overrides; settings specific to one broker are
          excluded.
        </p>
      )}
      {['broker', 'cluster'].includes(view) && (
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="text-left p-2">Config key</th>
              <th className="text-left">Value</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k} className="border-t border-border">
                <td className="p-2 font-mono">
                  {k}
                  {CONFIG_DESCRIPTIONS[k] && (
                    <p className="font-sans text-text-muted mt-1">{CONFIG_DESCRIPTIONS[k]}</p>
                  )}
                </td>
                <td className="font-mono break-all">{current[k] ?? 'Hidden by broker'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {view === 'compare' && (
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="text-left p-2">Key</th>
              {brokers.map((b) => (
                <th key={b.id}>Broker {b.id}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allKeys.map((k) => {
              const differs = new Set(Object.values(configs).map((c) => c[k])).size > 1
              return (
                <tr key={k} className={`border-t border-border ${differs ? 'bg-warning/10' : ''}`}>
                  <td className="p-2">
                    {k}
                    {differs ? ' · differs' : ''}
                  </td>
                  {brokers.map((b) => (
                    <td key={b.id} className="p-2">
                      {configs[b.id]?.[k] ?? 'Unavailable'}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {view === 'history' && (
        <div className="space-y-3">
          <p className="text-xs text-text-muted">
            Snapshots are captured when inspected, with the latest 50 changes retained locally.
          </p>
          {history.map((snapshot, i) => {
            const previous = history[i + 1]?.configs
            const changed = Object.keys(snapshot.configs).filter(
              (k) => !previous || snapshot.configs[k] !== previous[k]
            )
            return (
              <div key={snapshot.at} className="rounded border border-border p-3">
                <h3 className="text-sm">{new Date(snapshot.at).toLocaleString()}</h3>
                {changed.map((k) => (
                  <p key={k} className="text-xs font-mono mt-1">
                    {k}: {previous ? `${previous[k] ?? 'unset'} → ` : ''}
                    {snapshot.configs[k]}
                  </p>
                ))}
                {!changed.length && <p className="text-xs">No changes</p>}
              </div>
            )
          })}
        </div>
      )}
      {view === 'partitions' && (
        <div className="space-y-1">
          {partitions.map((p) => (
            <button
              key={`${p.topic}:${p.partition.partitionId}`}
              className="block p-2 text-xs text-accent"
              onClick={() => {
                setSelectedTopic(p.topic)
                setCurrentPage('partitions')
              }}
            >
              {p.topic} · Partition {p.partition.partitionId} · {p.role} ·{' '}
              {p.partition.isUnderReplicated ? 'Under replicated' : 'Healthy'}
            </button>
          ))}
          <p className="text-xs text-text-muted">
            Log directory sizes and leader epochs are unavailable through the current Kafka client.
          </p>
        </div>
      )}
    </div>
  )
}
