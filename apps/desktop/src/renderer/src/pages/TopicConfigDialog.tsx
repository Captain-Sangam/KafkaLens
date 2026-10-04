import { useEffect, useState } from 'react'
import { useClusterStore } from '@/stores/clusterStore'
import { useDataStore } from '@/stores/dataStore'
import { useUIStore } from '@/stores/uiStore'
import { useConfirmation } from '@/components/common/ConfirmationDialog'
import { Button, Input } from '@/components/common/Controls'
import { AIMarkdown } from '@/components/common/AIMarkdown'
import { download } from '@/lib/files'
import type { Topic } from '@/types'
export function TopicConfigDialog({ topic, onClose }: { topic: Topic; onClose: () => void }) {
  const { activeClusterId, clusters } = useClusterStore()
  const {
    consumerGroupOffsets,
    consumerGroups,
    fetchConsumerGroups,
    fetchConsumerGroupOffsets,
    fetchTopics
  } = useDataStore()
  const { setSelectedTopic, setCurrentPage, addNotification } = useUIStore()
  const { confirm, dialog } = useConfirmation()
  const [draft, setDraft] = useState({ ...topic.configs })
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [ai, setAI] = useState('')
  const [newKey, setNewKey] = useState('')
  useEffect(() => {
    if (activeClusterId) void fetchConsumerGroups(activeClusterId)
  }, [activeClusterId, fetchConsumerGroups])
  async function save() {
    if (!activeClusterId) return
    const changes = Object.fromEntries(
      Object.entries(draft).filter(([k, v]) => topic.configs[k] !== v)
    )
    if (!Object.keys(changes).length) return
    if (
      !(await confirm({
        title: 'Change topic configuration',
        message: `Apply ${JSON.stringify(changes)} to ${topic.name}? Changing retention can remove retained messages.`,
        resource: topic.name,
        production: clusters.find((c) => c.id === activeClusterId)?.environmentLabel === 'prod'
      }))
    )
      return
    setBusy(true)
    const r = await window.api.topics.alterConfig(activeClusterId, topic.name, changes)
    setBusy(false)
    if (r.success) {
      await fetchTopics(activeClusterId)
      addNotification('success', 'Topic configuration updated')
      onClose()
    } else addNotification('error', r.error ?? 'Could not change topic configuration')
  }
  async function advise() {
    if (!activeClusterId) return
    setBusy(true)
    for (const g of consumerGroups.filter((g) => g.topics.includes(topic.name)))
      await fetchConsumerGroupOffsets(activeClusterId, g.groupId)
    const metadata = await window.api.topics.partitions(activeClusterId, topic.name)
    const offsets = useDataStore.getState().consumerGroupOffsets
    const consumerLag = Object.values(offsets)
      .flat()
      .filter((o) => o.topic === topic.name)
      .reduce((n, o) => n + o.lag, 0)
    const r = await window.api.ai.adviseTopicConfig(topic.name, topic.configs, {
      messageCount: topic.messageCount,
      partitions: topic.partitions,
      consumerLag,
      partitionCounts: Object.fromEntries(
        (metadata.data ?? []).map((p) => [p.partitionId, p.logEndOffset - p.logStartOffset])
      )
    })
    setBusy(false)
    if (r.success) setAI(r.data?.content ?? '')
    else addNotification('error', r.error ?? 'AI advice failed')
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Topic configuration"
        className="rounded-xl border border-border bg-surface-1 p-5 w-[800px] max-h-[85vh] overflow-auto space-y-4"
      >
        <div className="flex gap-2">
          <h2 className="font-semibold flex-1">{topic.name}</h2>
          <Button
            onClick={() => {
              setSelectedTopic(topic.name)
              setCurrentPage('partitions')
            }}
          >
            Inspect partitions
          </Button>
          <Button
            onClick={() =>
              download(`${topic.name}-config.json`, JSON.stringify(topic.configs, null, 2))
            }
          >
            Export
          </Button>
          <Button onClick={onClose}>Close</Button>
        </div>
        <p className="text-xs text-text-muted">
          {topic.partitions} partitions · {topic.replicationFactor} replicas ·{' '}
          {topic.messageCount.toLocaleString()} offset span
        </p>
        <Input
          aria-label="Filter topic configs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter configs…"
        />
        <div className="grid grid-cols-2 gap-2 text-xs">
          {Object.keys(draft)
            .filter((k) => k.includes(search))
            .sort()
            .map((k) => (
              <label key={k} className="flex items-center justify-between gap-2">
                {k}
                <Input
                  aria-label={k}
                  value={draft[k] ?? ''}
                  onChange={(e) => setDraft((s) => ({ ...s, [k]: e.target.value }))}
                />
              </label>
            ))}
        </div>
        <div className="flex gap-2">
          <Input
            aria-label="New config key"
            placeholder="New config key"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
          />
          <Button
            onClick={() => {
              if (newKey) setDraft((s) => ({ ...s, [newKey]: '' }))
              setNewKey('')
            }}
          >
            Add
          </Button>
          <Button onClick={save} disabled={busy}>
            Apply changes
          </Button>
          <Button onClick={advise} disabled={busy}>
            Advise with AI
          </Button>
        </div>
        {Object.keys(consumerGroupOffsets).length > 0 && (
          <p className="text-xs text-text-muted">
            Consumer lag uses current committed offsets for this topic.
          </p>
        )}
        {ai && <AIMarkdown content={ai} />}
      </section>
      {dialog}
    </div>
  )
}
