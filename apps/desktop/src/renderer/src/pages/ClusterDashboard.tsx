import { useRefresh } from '@/lib/useRefresh'
import { useState, useEffect, useMemo } from 'react'
import {
  LayoutDashboard,
  Database,
  Users,
  Server,
  AlertTriangle,
  Skull,
  Activity,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Sparkles,
  Loader2,
  Unplug,
  X
} from 'lucide-react'
import { AIMarkdown } from '@/components/common/AIMarkdown'
import { useClusterStore } from '@/stores/clusterStore'
import { useUIStore } from '@/stores/uiStore'
import { useDataStore } from '@/stores/dataStore'
import type { ConsumerGroupState } from '@/types'

const STATE_STYLES: Record<ConsumerGroupState, { bg: string; text: string }> = {
  Stable: { bg: 'bg-success/15', text: 'text-success' },
  Rebalancing: { bg: 'bg-warning/15', text: 'text-warning' },
  Empty: { bg: 'bg-text-muted/15', text: 'text-text-muted' },
  Dead: { bg: 'bg-danger/15', text: 'text-danger' },
  PreparingRebalance: { bg: 'bg-warning/15', text: 'text-warning' }
}

function formatRetention(ms: number): string {
  if (ms < 0) return 'Infinite'
  const days = ms / 86_400_000
  if (days >= 1) return `${Math.round(days)}d`
  const hours = ms / 3_600_000
  return `${Math.round(hours)}h`
}

function SkeletonCard({ label }: { label: string }) {
  return (
    <div
      role="region"
      aria-label={`${label} summary`}
      aria-busy="true"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface-1 p-5 animate-pulse"
    >
      <div className="flex items-center justify-between">
        <div className="h-4 w-24 rounded bg-surface-3" />
        <div className="h-5 w-5 rounded bg-surface-3" />
      </div>
      <div className="h-8 w-16 rounded bg-surface-3" />
      <div className="h-3 w-36 rounded bg-surface-3" />
    </div>
  )
}

function SkeletonRow() {
  return (
    <div className="flex items-center justify-between px-5 py-2.5 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-4 w-4 rounded bg-surface-3" />
        <div className="flex flex-col gap-1">
          <div className="h-4 w-40 rounded bg-surface-3" />
          <div className="h-3 w-20 rounded bg-surface-3" />
        </div>
      </div>
      <div className="h-5 w-16 rounded-full bg-surface-3" />
    </div>
  )
}

function AIHealthModal({
  loading,
  content,
  onClose
}: {
  loading: boolean
  content: string | null
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="animate-fade-in flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-surface-1 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15">
              <Sparkles className="h-4 w-4 text-accent" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">AI Health Summary</h2>
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
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-4 py-12">
              <Loader2 className="h-8 w-8 animate-spin text-accent" />
              <p className="text-sm text-text-secondary">Analyzing cluster health...</p>
            </div>
          ) : content ? (
            <AIMarkdown content={content} />
          ) : (
            <p className="text-sm text-text-muted">No summary available.</p>
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

export default function ClusterDashboard() {
  const { setCurrentPage, navigateToTopic } = useUIStore()
  const { activeClusterId, connections } = useClusterStore()
  const {
    topics,
    consumerGroups,
    brokers,
    topicsLoading,
    consumerGroupsLoading,
    brokersLoading,
    topicsLoaded,
    consumerGroupsLoaded,
    brokersLoaded,
    topicsError,
    consumerGroupsError,
    brokersError,
    fetchTopics,
    fetchConsumerGroups,
    fetchBrokers
  } = useDataStore()

  useRefresh(() => {
    if (activeClusterId) {
      void fetchTopics(activeClusterId)
      void fetchConsumerGroups(activeClusterId)
      void fetchBrokers(activeClusterId)
    }
  })
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiPanelOpen, setAiPanelOpen] = useState(false)

  useEffect(() => {
    if (!activeClusterId) return
    fetchTopics(activeClusterId)
    fetchConsumerGroups(activeClusterId)
    fetchBrokers(activeClusterId)
  }, [activeClusterId, fetchTopics, fetchConsumerGroups, fetchBrokers])

  const initialTopicsLoading = topicsLoading && !topicsLoaded
  const initialGroupsLoading = consumerGroupsLoading && !consumerGroupsLoaded

  const stats = useMemo(() => {
    const userTopics = topics.filter((t) => !t.isInternal)
    const dlqTopics = topics.filter((t) => t.isDLQ)
    const dlqMessages = dlqTopics.reduce((sum, t) => sum + t.messageCount, 0)
    return {
      topicCount: userTopics.length,
      consumerGroupCount: consumerGroups.length,
      brokerCount: brokers.length,
      dlqMessages,
      dlqCount: dlqTopics.length
    }
  }, [topics, consumerGroups, brokers])

  const unhealthyTopics = useMemo(
    () => topics.filter((t) => t.underReplicatedPartitions > 0),
    [topics]
  )

  const topByMessages = useMemo(
    () =>
      [...topics]
        .filter((t) => !t.isInternal)
        .sort((a, b) => b.messageCount - a.messageCount)
        .slice(0, 5),
    [topics]
  )

  const dlqTopics = useMemo(() => topics.filter((t) => t.isDLQ), [topics])

  const handleAiHealthSummary = async () => {
    if (aiLoading) return
    setAiLoading(true)
    setAiPanelOpen(true)
    setAiSummary(null)
    try {
      const configured = await window.api.ai.isConfigured()
      if (!configured?.data) {
        setAiSummary(
          'AI is not configured. Go to Settings (⌘7) → AI Configuration to add your API key.'
        )
        return
      }
      if (!activeClusterId) return
      const store = useDataStore.getState()
      await Promise.all([
        store.fetchTopics(activeClusterId),
        store.fetchConsumerGroups(activeClusterId),
        store.fetchBrokers(activeClusterId)
      ])
      const registry = useClusterStore
        .getState()
        .clusters.find((c) => c.id === activeClusterId)?.schemaRegistryUrl
      if (registry) await store.fetchSchemaSubjects(activeClusterId)
      const fresh = useDataStore.getState()
      if (fresh.clusterId !== activeClusterId) return
      const result = await window.api.ai.clusterHealth({
        topics: fresh.topics.length,
        consumerGroups: fresh.consumerGroups.length,
        brokers: fresh.brokers.length,
        underReplicatedPartitions: fresh.topics.reduce(
          (n, t) => n + t.underReplicatedPartitions,
          0
        ),
        offlinePartitions: fresh.topics.reduce((n, t) => n + (t.offlinePartitions ?? 0), 0),
        topicConfigs: fresh.topics
          .filter((t) => !t.isInternal)
          .slice(0, 50)
          .map((t) => ({ name: t.name, configs: t.configs })),
        lagTrends: fresh.lagHistory,
        totalLag: fresh.consumerGroups.reduce((sum, g) => sum + g.totalLag, 0),
        lagUnavailableGroups: fresh.consumerGroups.filter((g) => g.lagError).length,
        dlqMessages: fresh.topics
          .filter((t) => t.isDLQ)
          .reduce((sum, t) => sum + t.messageCount, 0),
        schemaSubjects: fresh.schemaSubjects.map((s) => ({
          subject: s.subject,
          compatibility: s.compatibility,
          latestVersion: s.latestVersion,
          schemaType: s.schemaType
        }))
      })
      if (result?.success && result.data) {
        setAiSummary(
          typeof result.data === 'string'
            ? result.data
            : (result.data as { content: string }).content
        )
      } else {
        setAiSummary(result?.error ?? 'Unable to generate health summary.')
      }
    } catch {
      setAiSummary('AI health analysis is not available. Check your AI settings.')
    } finally {
      setAiLoading(false)
    }
  }

  const statCards = [
    {
      icon: Database,
      label: 'Topics',
      value: stats.topicCount,
      description: 'User topics (excl. internal)',
      color: 'text-info',
      loading: initialTopicsLoading,
      loaded: topicsLoaded,
      error: topicsError
    },
    {
      icon: Users,
      label: 'Consumer Groups',
      value: stats.consumerGroupCount,
      description: 'Active groups across cluster',
      color: 'text-accent',
      loading: initialGroupsLoading,
      loaded: consumerGroupsLoaded,
      error: consumerGroupsError
    },
    {
      icon: Server,
      label: 'Brokers',
      value: stats.brokerCount,
      description: 'Nodes in cluster',
      color: 'text-success',
      loading: brokersLoading && !brokersLoaded,
      loaded: brokersLoaded,
      error: brokersError
    },
    {
      icon: Skull,
      label: 'DLQ Messages',
      value: stats.dlqMessages,
      description: `Across ${stats.dlqCount} dead-letter topics`,
      color: 'text-danger',
      loading: initialTopicsLoading,
      loaded: topicsLoaded,
      error: topicsError
    }
  ]

  return (
    <div className="flex flex-col gap-6 p-6 overflow-y-auto h-full">
      {/* Connection banner */}
      {!activeClusterId && (
        <div className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning/10 px-5 py-3">
          <Unplug className="h-5 w-5 text-warning shrink-0" />
          <div className="flex flex-col">
            <span className="text-sm font-medium text-text-primary">No cluster connected</span>
            <span className="text-xs text-text-muted">
              Connect to a cluster from the sidebar to view live data.
            </span>
          </div>
        </div>
      )}
      {activeClusterId && connections[activeClusterId]?.status === 'error' && (
        <div className="flex items-center gap-3 rounded-lg border border-danger/30 bg-danger/10 px-5 py-3">
          <AlertTriangle className="h-5 w-5 text-danger shrink-0" />
          <div className="flex flex-col">
            <span className="text-sm font-medium text-text-primary">Connection failed</span>
            <span className="text-xs text-text-muted">
              {connections[activeClusterId]?.error ?? 'Unable to connect to the Kafka broker.'}{' '}
              Check your cluster settings — you may need to change the authentication method.
            </span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LayoutDashboard className="h-6 w-6 text-accent" />
          <h1 className="text-xl font-semibold text-text-primary">Cluster Dashboard</h1>
        </div>
        <button
          onClick={handleAiHealthSummary}
          disabled={aiLoading}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-60"
        >
          {aiLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Get AI Health Summary
        </button>
      </div>

      {/* AI Summary modal */}
      {aiPanelOpen && (
        <AIHealthModal
          loading={aiLoading}
          content={aiSummary}
          onClose={() => setAiPanelOpen(false)}
        />
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4">
        {statCards.map((card) =>
          card.loading ? (
            <SkeletonCard key={card.label} label={card.label} />
          ) : (
            <div
              key={card.label}
              role="region"
              aria-label={`${card.label} summary`}
              aria-busy="false"
              title={card.error ?? undefined}
              className="flex flex-col gap-3 rounded-lg border border-border bg-surface-1 p-5"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-text-secondary">{card.label}</span>
                <card.icon className={`h-5 w-5 ${card.color}`} />
              </div>
              <span className="text-3xl font-bold text-text-primary">
                {card.error && !card.loaded ? 'Unavailable' : card.value.toLocaleString()}
              </span>
              <span className="text-xs text-text-muted">
                {card.error
                  ? card.loaded
                    ? 'Showing previous data; refresh failed'
                    : 'Check broker access and refresh'
                  : card.description}
              </span>
            </div>
          )
        )}
      </div>

      {/* Middle section */}
      <div className="grid grid-cols-2 gap-4">
        {/* Topic Health */}
        <div className="flex flex-col rounded-lg border border-border bg-surface-1">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold text-text-primary">Topic Health</h2>
            <button
              onClick={() => setCurrentPage('topics')}
              className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors"
            >
              View all <ChevronRight className="h-3 w-3" />
            </button>
          </div>

          {initialTopicsLoading ? (
            <div className="flex flex-col divide-y divide-border">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {unhealthyTopics.length > 0 && (
                <div className="px-5 py-3">
                  <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-danger">
                    Under-Replicated
                  </span>
                  {unhealthyTopics.map((t) => (
                    <button
                      key={t.name}
                      onClick={() => navigateToTopic(t.name)}
                      className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-surface-2 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <CircleAlert className="h-4 w-4 text-danger" />
                        <span className="text-sm text-text-primary">{t.name}</span>
                      </div>
                      <span className="text-xs text-danger">
                        {t.underReplicatedPartitions} partition
                        {t.underReplicatedPartitions !== 1 && 's'}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div className="px-5 py-3">
                <span className="mb-2 block text-xs font-medium uppercase tracking-wider text-text-muted">
                  Top by Message Count
                </span>
                {topByMessages.map((t) => (
                  <button
                    key={t.name}
                    onClick={() => navigateToTopic(t.name)}
                    className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-surface-2 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <CircleCheck className="h-4 w-4 text-success" />
                      <span className="text-sm text-text-primary">{t.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-text-muted">
                      <span>{t.messageCount.toLocaleString()} msgs</span>
                      <span>{formatRetention(t.retentionMs)} retention</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Consumer Group Status */}
        <div className="flex flex-col rounded-lg border border-border bg-surface-1">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold text-text-primary">Consumer Group Status</h2>
            <button
              onClick={() => setCurrentPage('consumer-groups')}
              className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors"
            >
              View all <ChevronRight className="h-3 w-3" />
            </button>
          </div>

          {initialGroupsLoading ? (
            <div className="flex flex-col">
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col">
              {consumerGroups.map((group) => {
                const style = STATE_STYLES[group.state] ?? STATE_STYLES.Empty
                return (
                  <div
                    key={group.groupId}
                    className="flex items-center justify-between px-5 py-2.5 border-b border-border last:border-b-0 hover:bg-surface-2 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Activity className="h-4 w-4 text-text-muted" />
                      <div className="flex flex-col">
                        <span className="text-sm text-text-primary">{group.groupId}</span>
                        <span className="text-xs text-text-muted">
                          {group.members} member{group.members !== 1 && 's'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {group.lagError ? (
                        <span className="text-xs text-warning" title={group.lagError}>
                          Lag unavailable
                        </span>
                      ) : (
                        group.totalLag > 0 && (
                          <span className="text-xs text-text-secondary">
                            lag: {group.totalLag.toLocaleString()}
                          </span>
                        )
                      )}
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}
                      >
                        {group.state}
                      </span>
                    </div>
                  </div>
                )
              })}
              {consumerGroups.length === 0 && !initialGroupsLoading && (
                <div className="px-5 py-8 text-center text-sm text-text-muted">
                  {consumerGroupsError ?? 'No consumer groups found.'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* DLQ Summary */}
      <div className="flex flex-col rounded-lg border border-border bg-surface-1">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <h2 className="text-sm font-semibold text-text-primary">DLQ Summary</h2>
          </div>
          <button
            onClick={() => setCurrentPage('dlq')}
            className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors"
          >
            View DLQ Dashboard <ChevronRight className="h-3 w-3" />
          </button>
        </div>

        {initialTopicsLoading ? (
          <div className="flex flex-col divide-y divide-border">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3 animate-pulse">
                <div className="h-4 w-4 rounded bg-surface-3 shrink-0" />
                <div className="h-4 w-40 rounded bg-surface-3" />
                <div className="ml-auto h-3 w-24 rounded bg-surface-3" />
              </div>
            ))}
          </div>
        ) : dlqTopics.length > 0 ? (
          <div className="flex flex-col divide-y divide-border">
            {dlqTopics.map((t) => (
              <button
                key={t.name}
                onClick={() => navigateToTopic(t.name)}
                className="flex items-center gap-3 px-5 py-3 text-left hover:bg-surface-2 transition-colors"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                <span className="truncate text-sm font-medium text-text-primary">{t.name}</span>
                <span className="ml-auto text-xs text-text-muted">
                  {t.messageCount.toLocaleString()} msgs &middot; {t.partitions} partitions
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="px-5 py-8 text-center text-sm text-text-muted">
            No dead-letter topics found.
          </div>
        )}
      </div>
    </div>
  )
}
