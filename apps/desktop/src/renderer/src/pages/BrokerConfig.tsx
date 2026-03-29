import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  Crown,
  Search,
  Server,
  AlertTriangle,
  ArrowLeftRight,
  Download,
  X,
  Loader2,
  Sparkles,
} from 'lucide-react'
import { AIMarkdown } from '@/components/common/AIMarkdown'
import { useClusterStore } from '@/stores/clusterStore'
import { useDataStore } from '@/stores/dataStore'
import { useUIStore } from '@/stores/uiStore'
import type { Broker } from '@/types'

const CONFIG_DESCRIPTIONS: Record<string, string> = {
  'log.retention.hours': 'Number of hours to keep a log file before deleting it',
  'num.partitions': 'Default number of partitions per topic',
  'default.replication.factor': 'Default replication factor for auto-created topics',
  'min.insync.replicas': 'Minimum number of replicas that must acknowledge a write',
  'log.segment.bytes': 'Maximum size of a single log segment file',
  'compression.type': 'Default compression type for topics',
  'message.max.bytes': 'Maximum size of a message the broker can receive',
  'num.io.threads': 'Number of threads for disk I/O operations',
  'num.network.threads': 'Number of threads for network request processing',
  'log.retention.check.interval.ms': 'Frequency in ms to check for log segments eligible for deletion',
}

function getConfigDivergences(
  configs: Record<number, Record<string, string>>,
): Record<string, Set<string>> {
  const divergences: Record<string, Set<string>> = {}
  const allKeys = new Set(Object.values(configs).flatMap((c) => Object.keys(c)))

  for (const key of allKeys) {
    const values = new Set(Object.values(configs).map((c) => c[key] ?? ''))
    if (values.size > 1) {
      divergences[key] = values
    }
  }
  return divergences
}

function BrokerCard({
  broker,
  isSelected,
  onSelect,
}: {
  broker: Broker
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className={`flex flex-col gap-1.5 rounded-lg border p-4 text-left transition-all ${
        isSelected
          ? 'border-accent bg-accent/10 ring-1 ring-accent/30'
          : 'border-border bg-surface-1 hover:border-border-bright hover:bg-surface-2'
      }`}
    >
      <div className="flex items-center gap-2">
        <Server size={16} className={isSelected ? 'text-accent' : 'text-text-muted'} />
        <span className="text-sm font-medium text-text-primary">Broker {broker.id}</span>
        {broker.isController && (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold text-warning">
            <Crown size={10} />
            Controller
          </span>
        )}
      </div>
      <div className="text-xs text-text-secondary">
        {broker.host}:{broker.port}
      </div>
      {broker.rack && (
        <div className="text-[11px] text-text-muted">Rack: {broker.rack}</div>
      )}
    </button>
  )
}

function CompareModal({
  brokers,
  brokerConfigs,
  onClose,
}: {
  brokers: Broker[]
  brokerConfigs: Record<number, Record<string, string>>
  onClose: () => void
}) {
  const [leftId, setLeftId] = useState(brokers[0]?.id ?? 0)
  const [rightId, setRightId] = useState(brokers[1]?.id ?? brokers[0]?.id ?? 0)

  const leftConfig = brokerConfigs[leftId] ?? {}
  const rightConfig = brokerConfigs[rightId] ?? {}

  const allKeys = useMemo(() => {
    const keys = new Set([
      ...Object.keys(leftConfig),
      ...Object.keys(rightConfig),
    ])
    return Array.from(keys).sort()
  }, [leftConfig, rightConfig])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 flex max-h-[80vh] w-full max-w-3xl flex-col rounded-xl border border-border bg-surface-0 shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold text-text-primary">Compare Broker Configs</h3>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-3 hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-4 border-b border-border px-5 py-3">
          <label className="flex items-center gap-2 text-xs text-text-secondary">
            Left:
            <select
              value={leftId}
              onChange={(e) => setLeftId(Number(e.target.value))}
              className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
            >
              {brokers.map((b) => (
                <option key={b.id} value={b.id}>
                  Broker {b.id} — {b.host}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-text-secondary">
            Right:
            <select
              value={rightId}
              onChange={(e) => setRightId(Number(e.target.value))}
              className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
            >
              {brokers.map((b) => (
                <option key={b.id} value={b.id}>
                  Broker {b.id} — {b.host}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-1">
              <tr className="border-b border-border text-left text-text-muted">
                <th className="px-4 py-2 font-medium">Config Key</th>
                <th className="px-4 py-2 font-medium">Broker {leftId}</th>
                <th className="px-4 py-2 font-medium">Broker {rightId}</th>
              </tr>
            </thead>
            <tbody>
              {allKeys.map((key) => {
                const lv = leftConfig[key] ?? '—'
                const rv = rightConfig[key] ?? '—'
                const isDiff = lv !== rv
                return (
                  <tr
                    key={key}
                    className={`border-b border-border/50 ${isDiff ? 'bg-warning/5' : ''}`}
                  >
                    <td className="px-4 py-2 font-mono text-text-secondary">{key}</td>
                    <td className={`px-4 py-2 font-mono ${isDiff ? 'text-warning' : 'text-text-primary'}`}>
                      {lv}
                    </td>
                    <td className={`px-4 py-2 font-mono ${isDiff ? 'text-warning' : 'text-text-primary'}`}>
                      {rv}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function AIReviewModal({
  state,
  brokerLabel,
  onClose
}: {
  state: { loading: boolean; content: string | null }
  brokerLabel: string
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !state.loading) onClose() }}
    >
      <div className="animate-fade-in flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-surface-1 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15">
              <Sparkles className="h-4 w-4 text-accent" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">AI Config Review — {brokerLabel}</h2>
              <p className="text-[11px] text-text-muted">AI-powered analysis</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-3 hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 min-h-[200px]">
          {state.loading && (
            <div className="flex flex-col items-center justify-center gap-4 py-12">
              <Loader2 className="h-8 w-8 animate-spin text-accent" />
              <p className="text-sm text-text-secondary">Reviewing broker configuration...</p>
            </div>
          )}
          {!state.loading && state.content && (
            <AIMarkdown content={state.content} />
          )}
          {!state.loading && !state.content && (
            <p className="text-sm text-text-muted">No response received. Check the console (⌘⌥I) for errors.</p>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-3">
          <button
            onClick={onClose}
            className="rounded-lg bg-surface-3 px-4 py-2 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-4 hover:text-text-primary"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export function BrokerConfig() {
  const { activeClusterId } = useClusterStore()
  const { brokers, brokersLoading, fetchBrokers } = useDataStore()
  const addNotification = useUIStore((s) => s.addNotification)

  const [selectedBrokerId, setSelectedBrokerId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [showCompare, setShowCompare] = useState(false)
  const [brokerConfigs, setBrokerConfigs] = useState<Record<number, Record<string, string>>>({})
  const [configLoading, setConfigLoading] = useState(false)
  const [aiModal, setAiModal] = useState<{ open: boolean; loading: boolean; content: string | null }>({
    open: false, loading: false, content: null
  })

  useEffect(() => {
    if (activeClusterId) fetchBrokers(activeClusterId)
  }, [activeClusterId, fetchBrokers])

  useEffect(() => {
    if (brokers.length > 0 && selectedBrokerId === null) {
      setSelectedBrokerId(brokers[0].id)
    }
  }, [brokers, selectedBrokerId])

  const fetchBrokerConfig = useCallback(async (brokerId: number) => {
    if (brokerConfigs[brokerId]) return
    setConfigLoading(true)
    try {
      const res = await window.api.brokers.config(activeClusterId ?? '', brokerId)
      if (res.success && res.data) {
        setBrokerConfigs((prev) => ({ ...prev, [brokerId]: res.data! }))
      }
    } catch {
      // failed to fetch broker config
    } finally {
      setConfigLoading(false)
    }
  }, [activeClusterId, brokerConfigs])

  useEffect(() => {
    if (selectedBrokerId !== null) {
      fetchBrokerConfig(selectedBrokerId)
    }
  }, [selectedBrokerId, fetchBrokerConfig])

  useEffect(() => {
    for (const b of brokers) {
      if (!brokerConfigs[b.id]) {
        fetchBrokerConfig(b.id)
      }
    }
  }, [brokers, brokerConfigs, fetchBrokerConfig])

  const selectedBroker = brokers.find((b) => b.id === selectedBrokerId)
  const currentConfig = selectedBrokerId !== null ? (brokerConfigs[selectedBrokerId] ?? {}) : {}
  const divergences = useMemo(() => getConfigDivergences(brokerConfigs), [brokerConfigs])

  const configEntries = useMemo(() => {
    const entries = Object.entries(currentConfig).sort(([a], [b]) => a.localeCompare(b))
    if (!search.trim()) return entries
    const q = search.toLowerCase()
    return entries.filter(([key]) => key.toLowerCase().includes(q))
  }, [currentConfig, search])

  const handleExportConfig = () => {
    if (!selectedBroker || Object.keys(currentConfig).length === 0) return

    const lines = Object.entries(currentConfig)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
    const text = `# Broker ${selectedBroker.id} (${selectedBroker.host}:${selectedBroker.port}) Configuration\n# Exported ${new Date().toISOString()}\n\n${lines.join('\n')}`

    navigator.clipboard.writeText(text).then(
      () => addNotification('success', `Broker ${selectedBroker.id} config copied to clipboard`),
      () => addNotification('error', 'Failed to copy to clipboard'),
    )
  }

  const handleAiReview = async () => {
    if (Object.keys(currentConfig).length === 0) return
    setAiModal({ open: true, loading: true, content: null })

    let result = ''
    try {
      const { checkAIConfigured } = await import('@/lib/ai-guard')
      const check = await checkAIConfigured()
      if (!check.ok) {
        result = check.message || 'AI is not configured.'
      } else {
        const label = selectedBroker
          ? `Broker ${selectedBroker.id} (${selectedBroker.host}:${selectedBroker.port})`
          : `Broker ${selectedBrokerId}`
        const trimmed: Record<string, string> = {}
        for (const [k, v] of Object.entries(currentConfig)) {
          if (v && v !== '' && v !== 'null') trimmed[k] = v
        }
        const res = await window.api.ai.adviseTopicConfig(label, trimmed, { messageCount: 0, partitions: 0, consumerLag: 0 })
        if (res.success) {
          const d = res.data
          if (typeof d === 'string' && d) {
            result = d
          } else if (d && typeof d === 'object') {
            const obj = d as Record<string, unknown>
            result = String(obj.content || '') || JSON.stringify(d, null, 2)
          }
        }
        if (!result) {
          result = res.error || 'AI returned an empty response.'
        }
      }
    } catch (err) {
      result = (err instanceof Error ? err.message : String(err)) || 'Unknown error occurred.'
    }

    if (!result) result = 'No response received from the AI service.'
    setAiModal({ open: true, loading: false, content: result })
  }

  const handleOpenCompare = async () => {
    for (const b of brokers) {
      if (!brokerConfigs[b.id]) {
        await fetchBrokerConfig(b.id)
      }
    }
    setShowCompare(true)
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold text-text-primary">Brokers & Configuration</h1>
          <p className="mt-0.5 text-xs text-text-muted">
            {brokersLoading ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading brokers...
              </span>
            ) : (
              <>
                {brokers.length} brokers ·{' '}
                {Object.keys(divergences).length > 0
                  ? `${Object.keys(divergences).length} config divergence${Object.keys(divergences).length !== 1 ? 's' : ''}`
                  : 'All configs aligned'}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAiReview}
            disabled={aiModal.loading || Object.keys(currentConfig).length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-surface-3 px-3 py-1.5 text-xs text-text-primary transition-colors hover:bg-surface-4 disabled:opacity-50"
          >
            {aiModal.loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            AI Config Review
          </button>
          <button
            onClick={handleOpenCompare}
            disabled={brokers.length < 2}
            className="flex items-center gap-1.5 rounded-lg bg-surface-3 px-3 py-1.5 text-xs text-text-primary transition-colors hover:bg-surface-4 disabled:opacity-50"
          >
            <ArrowLeftRight size={14} />
            Compare Brokers
          </button>
          <button
            onClick={handleExportConfig}
            disabled={Object.keys(currentConfig).length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-surface-3 px-3 py-1.5 text-xs text-text-primary transition-colors hover:bg-surface-4 disabled:opacity-50"
          >
            <Download size={14} />
            Export Config
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {brokersLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-accent" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              {brokers.map((broker) => (
                <BrokerCard
                  key={broker.id}
                  broker={broker}
                  isSelected={broker.id === selectedBrokerId}
                  onSelect={() => {
                    setSelectedBrokerId(broker.id)
                    setAiModal((m) => ({ ...m, content: null }))
                  }}
                />
              ))}
            </div>

            {aiModal.open && (
              <AIReviewModal
                state={aiModal}
                brokerLabel={selectedBroker ? `Broker ${selectedBroker.id} (${selectedBroker.host}:${selectedBroker.port})` : 'Broker'}
                onClose={() => setAiModal({ open: false, loading: false, content: null })}
              />
            )}

            {selectedBroker && (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-medium text-text-primary">
                    Configuration — Broker {selectedBroker.id}
                    <span className="ml-2 text-xs font-normal text-text-muted">
                      {selectedBroker.host}:{selectedBroker.port}
                    </span>
                  </h2>
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input
                      type="text"
                      placeholder="Filter configs…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="rounded-lg border border-border bg-surface-2 py-1.5 pl-8 pr-3 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
                    />
                  </div>
                </div>

                {configLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-4 h-4 animate-spin text-accent mr-2" />
                    <span className="text-xs text-text-muted">Loading config...</span>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-surface-1 text-left text-text-muted">
                          <th className="px-4 py-2.5 font-medium">Config Key</th>
                          <th className="px-4 py-2.5 font-medium">Value</th>
                          <th className="px-4 py-2.5 font-medium">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {configEntries.map(([key, value]) => {
                          const hasDivergence = key in divergences
                          return (
                            <tr
                              key={key}
                              className="border-b border-border/50 transition-colors hover:bg-surface-1"
                            >
                              <td className="px-4 py-2.5 font-mono text-text-secondary">{key}</td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-text-primary">{value}</span>
                                  {hasDivergence && (
                                    <span
                                      className="group relative flex items-center"
                                      title={`Value differs across brokers: ${Array.from(divergences[key]).join(', ')}`}
                                    >
                                      <AlertTriangle size={12} className="text-warning" />
                                      <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-surface-4 px-2.5 py-1.5 text-[11px] text-text-primary shadow-lg group-hover:block">
                                        Differs: {Array.from(divergences[key]).join(' vs ')}
                                      </span>
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-text-muted">
                                {CONFIG_DESCRIPTIONS[key] ?? '—'}
                              </td>
                            </tr>
                          )
                        })}
                        {configEntries.length === 0 && (
                          <tr>
                            <td colSpan={3} className="px-4 py-8 text-center text-text-muted">
                              {search ? 'No configs matching your filter' : 'No configuration entries'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {showCompare && (
        <CompareModal
          brokers={brokers}
          brokerConfigs={brokerConfigs}
          onClose={() => setShowCompare(false)}
        />
      )}
    </div>
  )
}
