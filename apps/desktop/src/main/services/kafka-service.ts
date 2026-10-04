import { Kafka, KafkaConfig, ConfigResourceTypes, ConfigSource, logLevel } from 'kafkajs'
import type { Admin, Producer } from 'kafkajs'
import { readFileSync } from 'fs'
import { createBulkAdmin } from '../lib/bulk-offsets'
import type { BulkAdmin } from '../lib/bulk-offsets'
import { payloadService } from './payload-service'
import { matchesMessage, validateFilters } from '../lib/message-filter'
import type {
  FetchOptions,
  ProduceOptions,
  KafkaMessage,
  Topic,
  MessagePage
} from '../../renderer/src/types'
import { storeService } from './store-service'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClusterConnectionConfig {
  bootstrapServers: string
  authMethod: 'none' | 'sasl-plain' | 'sasl-scram-256' | 'sasl-scram-512' | 'ssl'
  ssl?: boolean
  sslRejectUnauthorized?: boolean
  username?: string
  password?: string
  sslCertPath?: string
  sslClientCertPath?: string
  sslKeyPath?: string
}

export interface ConnectionResult {
  success: boolean
  brokerCount?: number
  kafkaVersion?: string
  error?: string
}

export interface TopicInfo {
  name: string
  partitions: number
  replicationFactor: number
  messageCount: number
  retentionMs: number
  retentionBytes: number
  cleanupPolicy: string
  isInternal: boolean
  isDLQ: boolean
  configs: Record<string, string>
  underReplicatedPartitions: number
}

const DLQ_PATTERNS = [
  /[.\-_]dlq([.\-_]|$)/i,
  /[.\-_]dlt([.\-_]|$)/i,
  /[.\-_]retry([.\-_]|$)/i,
  /[.\-_]error([.\-_]|$)/i,
  /dead[.\-_]?letter/i
]

function isDLQTopic(name: string): boolean {
  return DLQ_PATTERNS.some((p) => p.test(name))
}

export interface TopicMetadata {
  name: string
  partitions: PartitionInfo[]
}

export interface PartitionInfo {
  partitionId: number
  leader: number
  leaderHost: string
  replicas: number[]
  isr: number[]
  logStartOffset: number
  logEndOffset: number
  isUnderReplicated: boolean
}

export interface CreateTopicOpts {
  name: string
  partitions: number
  replicationFactor: number
  configs?: Record<string, string>
}

export type FetchMessagesOpts = FetchOptions
export type KafkaMessageResult = KafkaMessage
export type ProduceMessageOpts = ProduceOptions

export interface ConsumerGroupInfo {
  groupId: string
  state: string
  members: number
  protocolType: string
  totalLag: number
  lagError?: string
  topics: string[]
}

export interface ConsumerGroupDetail {
  groupId: string
  state: string
  members: Array<{
    memberId: string
    clientId: string
    host: string
    assignments: Array<{ topic: string; partitions: number[] }>
  }>
}

export interface ConsumerGroupOffsetInfo {
  topic: string
  partition: number
  currentOffset: number
  logEndOffset: number
  lag: number
}

export type OffsetResetSpec = import('../../renderer/src/types').OffsetSpec

export interface BrokerInfo {
  id: number
  host: string
  port: number
  rack?: string
  isController: boolean
}

// ---------------------------------------------------------------------------
// Internal connection record
// ---------------------------------------------------------------------------

interface KafkaConnection {
  kafka: Kafka
  admin: Admin
  counts: BulkAdmin['counts']
  highOffsets: BulkAdmin['highOffsets']
  producer: Producer | null
  config: ClusterConnectionConfig
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class KafkaService {
  private connections = new Map<string, KafkaConnection>()
  private progress = new Map<
    string,
    { nextOffsets: Record<number, string>; ends: Record<number, string> }
  >()
  private reads = new Map<string, { cluster: string; cancel: () => void }>()
  cancelRead(id: string): void {
    this.reads.get(id)?.cancel()
  }
  async disconnectAll(): Promise<void> {
    await Promise.all([...this.connections.keys()].map((id) => this.disconnect(id)))
  }

  // -----------------------------------------------------------------------
  // Connection lifecycle
  // -----------------------------------------------------------------------

  async connect(clusterId: string, config: ClusterConnectionConfig): Promise<ConnectionResult> {
    let admin: Admin | undefined
    try {
      if (this.connections.has(clusterId)) {
        await this.disconnect(clusterId)
      }

      const kafka = this.createKafkaInstance(config)
      const bulk = createBulkAdmin(kafka)
      admin = bulk.admin
      await admin.connect()

      const cluster = await admin.describeCluster()

      this.connections.set(clusterId, {
        kafka,
        admin,
        counts: bulk.counts,
        highOffsets: bulk.highOffsets,
        producer: null,
        config
      })

      return {
        success: true,
        brokerCount: cluster.brokers.length,
        kafkaVersion: undefined
      }
    } catch (err: unknown) {
      await admin?.disconnect().catch(() => {})
      return { success: false, error: errorMessage(err) }
    }
  }

  async disconnect(clusterId: string): Promise<void> {
    for (const read of this.reads.values()) if (read.cluster === clusterId) read.cancel()
    const conn = this.connections.get(clusterId)
    if (!conn) return

    try {
      if (conn.producer) await conn.producer.disconnect()
    } catch {
      /* best effort */
    }
    try {
      await conn.admin.disconnect()
    } catch {
      /* best effort */
    }

    this.connections.delete(clusterId)
  }

  async testConnection(config: ClusterConnectionConfig): Promise<ConnectionResult> {
    const tempId = `__test_${Date.now()}`
    try {
      const result = await this.connect(tempId, config)
      await this.disconnect(tempId)
      return result
    } catch (err: unknown) {
      await this.disconnect(tempId).catch(() => {})
      return { success: false, error: errorMessage(err) }
    }
  }

  async isConnected(clusterId: string): Promise<boolean> {
    const connection = this.connections.get(clusterId)
    if (!connection) return false
    try {
      await connection.admin.describeCluster()
      return true
    } catch {
      return false
    }
  }

  // -----------------------------------------------------------------------
  // Topics
  // -----------------------------------------------------------------------

  async listTopics(clusterId: string): Promise<Topic[]> {
    const { admin, counts: bulkCounts } = this.getConnection(clusterId)

    const topicNames = await admin.listTopics()
    if (topicNames.length === 0) return []

    const metadata = await admin.fetchTopicMetadata({ topics: topicNames })

    const configResources = topicNames.map((name) => ({
      type: ConfigResourceTypes.TOPIC as number,
      name
    }))
    const configPromise = admin.describeConfigs({
      includeSynonyms: false,
      resources: configResources
    })

    const OFFSET_TIMEOUT_MS = 3_000
    const OFFSET_BATCH_SIZE = 50

    async function fetchOffsetsWithTimeout(adm: Admin, topic: string): Promise<number | null> {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const result = await Promise.race([
          adm.fetchTopicOffsets(topic),
          new Promise<null>((resolve) => {
            timer = setTimeout(() => resolve(null), OFFSET_TIMEOUT_MS)
          })
        ])
        if (!result) return null
        let count = 0
        for (const po of result) {
          const high = parseInt(po.high, 10) || 0
          const low = parseInt(po.low, 10) || 0
          count += Math.max(0, high - low)
        }
        return count
      } catch {
        return null
      } finally {
        if (timer) clearTimeout(timer)
      }
    }

    const offsetByTopic = new Map<string, number | null>()
    const topicList = metadata.topics.map((t) => t.name)
    const [{ resources: configResults }] = await Promise.all([
      configPromise,
      (async () => {
        if (bulkCounts) {
          let timer: ReturnType<typeof setTimeout> | undefined
          try {
            const counts = await Promise.race([
              bulkCounts(metadata.topics),
              new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error('Offsets timed out')), OFFSET_TIMEOUT_MS)
              })
            ])
            for (const topic of topicList) offsetByTopic.set(topic, counts.get(topic) ?? null)
            return
          } catch {
            /* Restricted brokers or an incompatible SDK use the public per-topic API. */
          } finally {
            if (timer) clearTimeout(timer)
          }
        }
        for (let i = 0; i < topicList.length; i += OFFSET_BATCH_SIZE) {
          const batch = topicList.slice(i, i + OFFSET_BATCH_SIZE)
          const counts = await Promise.all(
            batch.map((name) => fetchOffsetsWithTimeout(admin, name))
          )
          batch.forEach((name, idx) => offsetByTopic.set(name, counts[idx]))
        }
      })()
    ])

    const configByTopic = new Map<string, Record<string, string>>()
    for (const res of configResults) {
      const map: Record<string, string> = {}
      for (const entry of res.configEntries) {
        map[entry.configName] = entry.configValue
      }
      configByTopic.set(res.resourceName, map)
    }

    let configuredPatterns: string[] = []
    try {
      const raw = storeService.getSetting('display')
      const values = raw ? JSON.parse(raw).dlqPatterns : []
      if (Array.isArray(values))
        configuredPatterns = values.filter(
          (value: unknown): value is string => typeof value === 'string' && value.length > 0
        )
    } catch {
      /* Default detection remains available if local preferences are damaged. */
    }

    const results: Topic[] = []

    for (const topicMeta of metadata.topics) {
      const configs = configByTopic.get(topicMeta.name) ?? {}

      let underReplicated = 0
      for (const p of topicMeta.partitions) {
        if (p.isr.length < p.replicas.length) {
          underReplicated++
        }
      }

      const replicationFactor =
        topicMeta.partitions.length > 0 ? topicMeta.partitions[0].replicas.length : 0

      results.push({
        name: topicMeta.name,
        partitions: topicMeta.partitions.length,
        replicationFactor,
        messageCount: offsetByTopic.get(topicMeta.name) ?? 0,
        messageCountError:
          offsetByTopic.get(topicMeta.name) === null ? 'Could not read topic offsets' : undefined,
        retentionMs: parseInt(configs['retention.ms'] ?? '-1', 10),
        retentionBytes: parseInt(configs['retention.bytes'] ?? '-1', 10),
        cleanupPolicy: (configs['cleanup.policy'] ?? 'delete') as Topic['cleanupPolicy'],
        isInternal: topicMeta.name.startsWith('__'),
        isDLQ: configuredPatterns.length
          ? configuredPatterns.some((pattern) =>
              topicMeta.name.toLowerCase().includes(pattern.toLowerCase())
            )
          : isDLQTopic(topicMeta.name),
        configs,
        offlinePartitions: topicMeta.partitions.filter((p) => p.leader < 0).length,
        underReplicatedPartitions: underReplicated
      })
    }

    return results
  }

  async getTopicMetadata(clusterId: string, topic: string): Promise<TopicMetadata> {
    const { admin } = this.getConnection(clusterId)

    const metadata = await admin.fetchTopicMetadata({ topics: [topic] })
    const topicMeta = metadata.topics[0]
    if (!topicMeta) throw new Error(`Topic "${topic}" not found`)

    const cluster = await admin.describeCluster()
    const brokerMap = new Map(cluster.brokers.map((b) => [b.nodeId, `${b.host}:${b.port}`]))

    const offsetsByPartition = new Map<number, { high: string; low: string }>()
    try {
      const offsets = await admin.fetchTopicOffsets(topic)
      for (const po of offsets) {
        offsetsByPartition.set(po.partition, { high: po.high, low: po.low })
      }
    } catch {
      /* ignore */
    }

    const partitions: PartitionInfo[] = topicMeta.partitions.map((p) => {
      const po = offsetsByPartition.get(p.partitionId)
      return {
        partitionId: p.partitionId,
        leader: p.leader,
        leaderHost: brokerMap.get(p.leader) ?? 'unknown',
        replicas: p.replicas,
        isr: p.isr,
        logStartOffset: parseInt(po?.low ?? '0', 10),
        logEndOffset: parseInt(po?.high ?? '0', 10),
        isUnderReplicated: p.isr.length < p.replicas.length
      }
    })

    return { name: topic, partitions }
  }

  async getTopicConfig(clusterId: string, topic: string): Promise<Record<string, string>> {
    const { admin } = this.getConnection(clusterId)

    const { resources } = await admin.describeConfigs({
      includeSynonyms: false,
      resources: [{ type: ConfigResourceTypes.TOPIC as number, name: topic }]
    })

    const result: Record<string, string> = {}
    for (const entry of resources[0]?.configEntries ?? []) {
      result[entry.configName] = entry.configValue
    }
    return result
  }

  async createTopic(clusterId: string, opts: CreateTopicOpts): Promise<void> {
    const { admin } = this.getConnection(clusterId)

    const configEntries = opts.configs
      ? Object.entries(opts.configs).map(([name, value]) => ({ name, value }))
      : []

    await admin.createTopics({
      topics: [
        {
          topic: opts.name,
          numPartitions: opts.partitions,
          replicationFactor: opts.replicationFactor,
          configEntries
        }
      ]
    })
  }

  async deleteTopic(clusterId: string, topic: string): Promise<void> {
    const { admin } = this.getConnection(clusterId)
    await admin.deleteTopics({ topics: [topic] })
  }

  async alterTopicConfig(
    clusterId: string,
    topic: string,
    configs: Record<string, string>
  ): Promise<void> {
    const { admin } = this.getConnection(clusterId)

    // AlterConfigs replaces all overrides: retain existing dynamic values.
    const described = await admin.describeConfigs({
      includeSynonyms: false,
      resources: [{ type: ConfigResourceTypes.TOPIC, name: topic }]
    })
    const overrides = Object.fromEntries(
      (described.resources[0]?.configEntries ?? [])
        .filter((c) => !c.isDefault && !c.readOnly && !c.isSensitive && c.configValue !== null)
        .map((c) => [c.configName, c.configValue])
    )
    configs = { ...overrides, ...configs }
    await admin.alterConfigs({
      validateOnly: false,
      resources: [
        {
          type: ConfigResourceTypes.TOPIC as number,
          name: topic,
          configEntries: Object.entries(configs).map(([name, value]) => ({
            name,
            value
          }))
        }
      ]
    })
  }

  // -----------------------------------------------------------------------
  // Messages
  // -----------------------------------------------------------------------

  async fetchMessagePage(clusterId: string, opts: FetchOptions): Promise<MessagePage> {
    const requestId = opts.requestId ?? crypto.randomUUID()
    try {
      const messages = await this.fetchMessages(clusterId, { ...opts, requestId })
      const progress = this.progress.get(requestId)
      return {
        messages,
        nextOffsets: progress?.nextOffsets ?? {},
        hasMore: progress
          ? Object.entries(progress.ends).some(
              ([p, end]) => BigInt(progress.nextOffsets[Number(p)] ?? end) < BigInt(end)
            )
          : false
      }
    } finally {
      this.progress.delete(requestId)
    }
  }
  async fetchMessages(clusterId: string, opts: FetchMessagesOpts): Promise<KafkaMessageResult[]> {
    validateFilters(opts)
    const conn = this.getConnection(clusterId)
    const limit = opts.limit ?? 50
    const snapshot = await conn.admin.fetchTopicOffsets(opts.topic)
    const starts = new Map<number, string>()
    const ends = new Map<number, bigint>()
    const timestampOffsets =
      opts.timestamp !== undefined
        ? await conn.admin.fetchTopicOffsetsByTimestamp(opts.topic, opts.timestamp)
        : undefined
    for (const p of snapshot) {
      if (opts.partition !== undefined && opts.partition !== p.partition) continue
      const low = BigInt(p.low),
        high = BigInt(p.high)
      let start = opts.offset === 'earliest' ? low : high - BigInt(limit)
      const explicit =
        opts.offsets?.[p.partition] ??
        (opts.offset && !['latest', 'earliest'].includes(opts.offset) ? opts.offset : undefined)
      if (explicit !== undefined) start = BigInt(explicit)
      if (opts.direction === 'backward' && explicit !== undefined) {
        ends.set(p.partition, start < high ? start : high)
        start -= BigInt(limit)
      } else ends.set(p.partition, high)
      if (timestampOffsets) {
        const timestampOffset = timestampOffsets.find((t) => t.partition === p.partition)
        start =
          timestampOffset && timestampOffset.offset !== '-1' ? BigInt(timestampOffset.offset) : high
      }
      start = start < low ? low : start > high ? high : start
      if (start < (ends.get(p.partition) ?? high)) starts.set(p.partition, String(start))
    }
    const requestId = opts.requestId ?? crypto.randomUUID()
    const progress = {
      nextOffsets: Object.fromEntries(
        snapshot.map((p) => [p.partition, starts.get(p.partition) ?? p.high])
      ),
      ends: Object.fromEntries([...ends].map(([p, end]) => [p, String(end)]))
    }
    if (this.progress.size > 128) this.progress.clear()
    this.progress.set(requestId, progress)
    if (!starts.size) return []
    const groupId = `kafkalens-browser-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const consumer = conn.kafka.consumer({
      groupId,
      maxWaitTimeInMs: 100,
      sessionTimeout: 10000,
      allowAutoTopicCreation: false
    })
    const messages: KafkaMessage[] = []
    let bytes = 0
    const counts = new Map<number, number>()
    const remaining = new Set(starts.keys())
    let finish = () => {}
    let ready = false
    let cancelled = false
    const collected = new Promise<void>((resolve) => {
      finish = resolve
    })
    this.reads.set(requestId, {
      cluster: clusterId,
      cancel: () => {
        cancelled = true
        finish()
      }
    })
    let timer: ReturnType<typeof setTimeout> | undefined
    consumer.on(consumer.events.GROUP_JOIN, () => {
      for (const partition of starts.keys())
        consumer.seek({ topic: opts.topic, partition, offset: starts.get(partition)! })
      const ignored = snapshot.filter((p) => !starts.has(p.partition)).map((p) => p.partition)
      if (ignored.length) consumer.pause([{ topic: opts.topic, partitions: ignored }])
      ready = true
    })
    consumer.on(consumer.events.CRASH, () => {
      cancelled = true
      finish()
    })
    try {
      await consumer.connect()
      await consumer.subscribe({ topic: opts.topic, fromBeginning: true })
      await consumer.run({
        autoCommit: false,
        eachBatchAutoResolve: false,
        eachBatch: async ({ batch, resolveOffset, heartbeat, isStale }) => {
          if (!ready || cancelled || isStale() || !remaining.has(batch.partition)) return
          for (const message of batch.messages) {
            if (cancelled || isStale()) return
            if (BigInt(message.offset) < BigInt(starts.get(batch.partition)!)) continue
            if (BigInt(message.offset) >= ends.get(batch.partition)!) break
            const [key, value] = await Promise.all([
              payloadService.decode(clusterId, message.key),
              payloadService.decode(clusterId, message.value)
            ])
            const result: KafkaMessage = {
              topic: batch.topic,
              partition: batch.partition,
              offset: message.offset,
              timestamp: message.timestamp,
              key: message.key === null ? null : key.value,
              value: value.value,
              keyFormat: key.format,
              valueFormat: value.format,
              schemaId: value.schemaId,
              keySchemaId: key.schemaId,
              rawKey: key.raw,
              isTombstone: message.value === null,
              rawValue: value.raw,
              decodeError: value.error ?? key.error,
              rawHeaders: Object.fromEntries(
                Object.entries(message.headers ?? {}).map(([k, v]) => [
                  k,
                  (Array.isArray(v) ? v : [v])
                    .filter((x) => x !== undefined)
                    .map((x) => Buffer.from(x!).toString('base64'))
                ])
              ),
              headers: Object.fromEntries(
                Object.entries(message.headers ?? {}).map(([k, v]) => [
                  k,
                  Buffer.isBuffer(v) ? decodeHeader(k, v) : (v?.toString() ?? '')
                ])
              )
            }
            if (matchesMessage(result, opts)) {
              messages.push(result)
              counts.set(batch.partition, (counts.get(batch.partition) ?? 0) + 1)
            }
            progress.nextOffsets[batch.partition] = (BigInt(message.offset) + 1n).toString()
            bytes += Buffer.byteLength(result.value) + Buffer.byteLength(result.rawValue ?? '')
            resolveOffset(message.offset)
            if (bytes > 32 * 1024 * 1024 || messages.length >= 10000) {
              finish()
              break
            }
            if (
              (counts.get(batch.partition) ?? 0) >= limit ||
              BigInt(message.offset) + 1n >= ends.get(batch.partition)!
            ) {
              remaining.delete(batch.partition)
              consumer.pause([{ topic: opts.topic, partitions: [batch.partition] }])
              break
            }
            await heartbeat()
          }
          if (
            remaining.has(batch.partition) &&
            BigInt(batch.lastOffset()) >= ends.get(batch.partition)! - 1n &&
            (counts.get(batch.partition) ?? 0) < limit &&
            bytes <= 32 * 1024 * 1024 &&
            messages.length < 10000
          ) {
            progress.nextOffsets[batch.partition] = ends.get(batch.partition)!.toString()
            remaining.delete(batch.partition)
            consumer.pause([{ topic: opts.topic, partitions: [batch.partition] }])
          }
          if (!remaining.size) finish()
        }
      })
      timer = setTimeout(finish, 5000)
      await collected
      if (cancelled) throw new Error('Message request cancelled or connection interrupted')
      const page = messages
        .sort(
          (a, b) =>
            Number(a.timestamp) - Number(b.timestamp) ||
            a.partition - b.partition ||
            (BigInt(a.offset) < BigInt(b.offset) ? -1 : 1)
        )
        .slice(opts.offset === 'latest' ? -limit : 0, opts.offset === 'latest' ? undefined : limit)
      const kept = new Set(page.map((m) => `${m.partition}:${m.offset}`))
      for (const message of messages)
        if (
          !kept.has(`${message.partition}:${message.offset}`) &&
          BigInt(message.offset) < BigInt(progress.nextOffsets[message.partition])
        )
          progress.nextOffsets[message.partition] = message.offset
      return page
    } finally {
      if (timer) clearTimeout(timer)
      this.reads.delete(requestId)
      await consumer.stop().catch(() => {})
      await consumer.disconnect().catch(() => {})
      await conn.admin.deleteGroups([groupId]).catch(() => {})
    }
  }

  async produceMessage(
    clusterId: string,
    opts: ProduceMessageOpts
  ): Promise<{ partition: number; offset: string }> {
    const conn = this.getConnection(clusterId)

    if (!conn.producer) {
      conn.producer = conn.kafka.producer()
      await conn.producer.connect()
    }

    const headers: Record<string, string> = opts.headers ?? {}
    const kafkaHeaders = opts.rawHeaders
      ? Object.fromEntries(
          Object.entries(opts.rawHeaders).map(([k, values]) => [
            k,
            values.map((v) => Buffer.from(v, 'base64'))
          ])
        )
      : Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, Buffer.from(v)]))

    const result = await conn.producer.send({
      topic: opts.topic,
      messages: [
        {
          key: opts.rawKey !== undefined ? Buffer.from(opts.rawKey, 'base64') : (opts.key ?? null),
          value: opts.tombstone
            ? null
            : opts.rawValue !== undefined
              ? Buffer.from(opts.rawValue, 'base64')
              : await payloadService.encode(clusterId, opts.value, opts.valueFormat, opts.schemaId),
          headers: kafkaHeaders,
          partition: opts.partition
        }
      ]
    })

    const record = result[0]
    return {
      partition: record.partition ?? opts.partition ?? 0,
      offset: record.baseOffset ?? '0'
    }
  }

  // -----------------------------------------------------------------------
  // Consumer Groups
  // -----------------------------------------------------------------------

  async listConsumerGroups(clusterId: string): Promise<ConsumerGroupInfo[]> {
    const connection = this.getConnection(clusterId)
    const { admin } = connection

    const { groups } = await admin.listGroups()
    if (groups.length === 0) return []

    const groupIds = groups.map((g) => g.groupId)
    const described = await admin.describeGroups(groupIds)

    // Read coordinators concurrently, then share one high-watermark snapshot
    // across all groups instead of fetching each topic again for every group.
    const committed = await mapConcurrent(described.groups, 8, async (group) => {
      try {
        return {
          group,
          offsets: await admin.fetchOffsets({ groupId: group.groupId }),
          error: undefined
        }
      } catch {
        return { group, offsets: [], error: 'Could not read committed offsets for this group.' }
      }
    })
    const high = await this.topicHighOffsets(
      connection,
      committed.flatMap((g) => g.offsets)
    )

    return committed.map(({ group: g, offsets, error }) => {
      const topics = new Set<string>()
      for (const member of g.members) {
        try {
          for (const assignment of parseMemberAssignment(member.memberAssignment))
            topics.add(assignment.topic)
        } catch {
          /* assignment parsing is best-effort */
        }
      }

      let totalLag = 0
      let lagError = error
      for (const offset of offsets) topics.add(offset.topic)
      try {
        totalLag = groupOffsetRows(offsets, high).reduce((sum, offset) => sum + offset.lag, 0)
      } catch {
        lagError = 'Could not read topic end offsets. Check broker access and refresh.'
      }

      return {
        groupId: g.groupId,
        state: g.state,
        members: g.members.length,
        protocolType: g.protocolType,
        totalLag,
        lagError,
        topics: Array.from(topics)
      }
    })
  }

  async describeConsumerGroup(clusterId: string, groupId: string): Promise<ConsumerGroupDetail> {
    const { admin } = this.getConnection(clusterId)

    const described = await admin.describeGroups([groupId])
    const group = described.groups[0]
    if (!group) throw new Error(`Consumer group "${groupId}" not found`)

    const members = group.members.map((m) => {
      const assignments: Array<{ topic: string; partitions: number[] }> = []

      try {
        const assignment = m.memberAssignment
        if (assignment && Buffer.isBuffer(assignment) && assignment.length > 0) {
          const parsed = parseMemberAssignment(assignment)
          assignments.push(...parsed)
        }
      } catch {
        /* ignore parse failures */
      }

      return {
        memberId: m.memberId,
        clientId: m.clientId,
        host: m.clientHost,
        assignments
      }
    })

    return {
      groupId: group.groupId,
      state: group.state,
      members
    }
  }

  async getConsumerGroupOffsets(
    clusterId: string,
    groupId: string
  ): Promise<ConsumerGroupOffsetInfo[]> {
    const connection = this.getConnection(clusterId)
    const offsets = await connection.admin.fetchOffsets({ groupId })
    return groupOffsetRows(offsets, await this.topicHighOffsets(connection, offsets))
  }

  private async topicHighOffsets(
    connection: KafkaConnection,
    offsets: Awaited<ReturnType<Admin['fetchOffsets']>>
  ): Promise<Map<string, Map<number, number>>> {
    const topics = new Map<string, Set<number>>()
    for (const offset of offsets) {
      const partitions = topics.get(offset.topic) ?? new Set<number>()
      for (const partition of offset.partitions) partitions.add(partition.partition)
      if (partitions.size) topics.set(offset.topic, partitions)
    }
    if (!topics.size) return new Map()
    if (connection.highOffsets) {
      try {
        return await connection.highOffsets(
          [...topics].map(([name, partitions]) => ({
            name,
            partitions: [...partitions].map((partitionId) => ({ partitionId }))
          }))
        )
      } catch {
        // A deleted topic or restricted broker must not hide unrelated groups.
      }
    }
    return new Map(
      await mapConcurrent([...topics.keys()], 8, async (topic) => {
        try {
          const values = await connection.admin.fetchTopicOffsets(topic)
          return [topic, new Map(values.map((p) => [p.partition, Number(p.high)]))] as const
        } catch {
          return [topic, new Map<number, number>()] as const
        }
      })
    )
  }

  async resetConsumerGroupOffsets(
    clusterId: string,
    groupId: string,
    topic: string,
    offsetSpec: OffsetResetSpec
  ): Promise<void> {
    const { admin } = this.getConnection(clusterId)

    const described = await admin.describeGroups([groupId])
    if (described.groups[0]?.members.length)
      throw new Error('Stop the consumers before resetting offsets')
    if (offsetSpec.type === 'earliest') {
      await admin.resetOffsets({ groupId, topic, earliest: true })
    } else if (offsetSpec.type === 'latest') {
      await admin.resetOffsets({ groupId, topic, earliest: false })
    } else if (offsetSpec.type === 'to-offset') {
      const topicOffsets = await admin.fetchTopicOffsets(topic)
      if (
        !/^\d+$/.test(String(offsetSpec.value)) ||
        topicOffsets.some(
          (p) =>
            BigInt(String(offsetSpec.value)) < BigInt(p.low) ||
            BigInt(String(offsetSpec.value)) > BigInt(p.high)
        )
      )
        throw new Error('Offset is outside the retained range for one or more partitions')
      await admin.setOffsets({
        groupId,
        topic,
        partitions: topicOffsets.map((p) => ({
          partition: p.partition,
          offset: String(offsetSpec.value)
        }))
      })
    } else if (offsetSpec.type === 'to-timestamp') {
      const ends = await admin.fetchTopicOffsets(topic)
      const offsetsByTimestamp = await admin.fetchTopicOffsetsByTimestamp(
        topic,
        Number(offsetSpec.value)
      )
      await admin.setOffsets({
        groupId,
        topic,
        partitions: offsetsByTimestamp.map((p) => ({
          partition: p.partition,
          offset: p.offset === '-1' ? ends.find((e) => e.partition === p.partition)!.high : p.offset
        }))
      })
    } else {
      throw new Error('Choose a supported offset reset mode')
    }
  }

  async deleteConsumerGroup(clusterId: string, groupId: string): Promise<void> {
    const { admin } = this.getConnection(clusterId)
    const described = await admin.describeGroups([groupId])
    if (described.groups[0]?.members.length)
      throw new Error('Stop the consumers before deleting this group')
    await admin.deleteGroups([groupId])
  }

  // -----------------------------------------------------------------------
  // Brokers
  // -----------------------------------------------------------------------

  async listBrokers(clusterId: string): Promise<BrokerInfo[]> {
    const { admin } = this.getConnection(clusterId)
    const cluster = await admin.describeCluster()

    return cluster.brokers.map((b) => ({
      id: b.nodeId,
      host: b.host,
      port: b.port,
      rack: (b as { rack?: string }).rack,
      isController: b.nodeId === cluster.controller
    }))
  }

  async describeClusterConfig(clusterId: string): Promise<Record<string, string>> {
    const { admin } = this.getConnection(clusterId)
    const { controller } = await admin.describeCluster()
    if (controller === null)
      throw new Error('Cluster controller metadata is unavailable. Refresh the broker list.')
    const { resources } = await admin.describeConfigs({
      includeSynonyms: true,
      resources: [{ type: ConfigResourceTypes.BROKER, name: String(controller) }]
    })
    const defaults: Record<string, string> = {}
    for (const entry of resources[0]?.configEntries ?? []) {
      const value = [entry, ...(entry.configSynonyms ?? [])].find(
        (c) =>
          c.configSource === ConfigSource.DYNAMIC_DEFAULT_BROKER_CONFIG ||
          c.configSource === ConfigSource.DEFAULT_CONFIG
      )
      if (value?.configValue !== null && value?.configValue !== undefined && !entry.isSensitive)
        defaults[entry.configName] = value.configValue
    }
    return defaults
  }

  async describeBrokerConfig(clusterId: string, brokerId: number): Promise<Record<string, string>> {
    const { admin } = this.getConnection(clusterId)

    const { resources } = await admin.describeConfigs({
      includeSynonyms: false,
      resources: [
        {
          type: ConfigResourceTypes.BROKER as number,
          name: String(brokerId)
        }
      ]
    })

    const result: Record<string, string> = {}
    for (const entry of resources[0]?.configEntries ?? []) {
      result[entry.configName] = entry.configValue
    }
    return result
  }

  // -----------------------------------------------------------------------
  // Partitions
  // -----------------------------------------------------------------------

  async getPartitions(clusterId: string, topic: string): Promise<PartitionInfo[]> {
    const meta = await this.getTopicMetadata(clusterId, topic)
    return meta.partitions
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private getConnection(clusterId: string): KafkaConnection {
    const conn = this.connections.get(clusterId)
    if (!conn) {
      throw new Error(`No active connection for cluster "${clusterId}". Call connect() first.`)
    }
    return conn
  }

  private createKafkaInstance(config: ClusterConnectionConfig): Kafka {
    const brokers = config.bootstrapServers
      .split(',')
      .map((b) => b.trim())
      .filter(Boolean)

    const kafkaConfig: KafkaConfig = {
      clientId: 'kafkalens',
      brokers,
      logLevel: logLevel.WARN,
      connectionTimeout: 10_000,
      requestTimeout: 30_000
    }

    if (config.authMethod === 'sasl-plain') {
      kafkaConfig.sasl = {
        mechanism: 'plain',
        username: config.username ?? '',
        password: config.password ?? ''
      }
    } else if (config.authMethod === 'sasl-scram-256') {
      kafkaConfig.sasl = {
        mechanism: 'scram-sha-256',
        username: config.username ?? '',
        password: config.password ?? ''
      }
    } else if (config.authMethod === 'sasl-scram-512') {
      kafkaConfig.sasl = {
        mechanism: 'scram-sha-512',
        username: config.username ?? '',
        password: config.password ?? ''
      }
    }

    const wantsSsl = config.ssl === true || config.authMethod === 'ssl'
    if (wantsSsl) {
      const rejectUnauthorized = config.sslRejectUnauthorized !== false
      if (config.sslCertPath) {
        kafkaConfig.ssl = {
          rejectUnauthorized,
          ca: [readFileSync(config.sslCertPath, 'utf-8')],
          cert: config.sslClientCertPath
            ? readFileSync(config.sslClientCertPath, 'utf8')
            : undefined,
          key: config.sslKeyPath ? readFileSync(config.sslKeyPath, 'utf8') : undefined
        }
      } else {
        kafkaConfig.ssl = {
          rejectUnauthorized,
          cert: config.sslClientCertPath
            ? readFileSync(config.sslClientCertPath, 'utf8')
            : undefined,
          key: config.sslKeyPath ? readFileSync(config.sslKeyPath, 'utf8') : undefined
        }
      }
    }

    return new Kafka(kafkaConfig)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  read: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++
        results[index] = await read(items[index])
      }
    })
  )
  return results
}

function groupOffsetRows(
  offsets: Awaited<ReturnType<Admin['fetchOffsets']>>,
  high: Map<string, Map<number, number>>
): ConsumerGroupOffsetInfo[] {
  return offsets.flatMap(({ topic, partitions }) =>
    partitions.map((p) => {
      const currentOffset = Number(p.offset)
      const logEndOffset = high.get(topic)?.get(p.partition)
      if (logEndOffset === undefined || !Number.isFinite(logEndOffset) || logEndOffset < 0)
        throw new Error(
          `Could not read end offsets for "${topic}". Check broker access and refresh.`
        )
      return {
        topic,
        partition: p.partition,
        currentOffset,
        logEndOffset,
        lag: currentOffset >= 0 ? Math.max(0, logEndOffset - currentOffset) : logEndOffset
      }
    })
  )
}

function errorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|Connection error/i.test(message))
    return 'Could not connect to a broker. Check bootstrap servers, network access, and advertised listener addresses.'
  if (/SASL|authentication/i.test(message))
    return 'Authentication failed. Check the selected SASL mechanism, username, and password.'
  if (/certificate|TLS|SSL|ENOENT/i.test(message))
    return 'TLS connection failed. Check CA, client certificate and key paths, and certificate validity.'
  return message
}

/**
 * Parse the Kafka consumer protocol MemberAssignment bytes.
 * Format: Version(2) [TopicName(string) Partitions(int32[])]
 */
function parseMemberAssignment(buf: Buffer): Array<{ topic: string; partitions: number[] }> {
  const results: Array<{ topic: string; partitions: number[] }> = []
  let offset = 0

  if (buf.length < 6) return results

  // version (int16)
  offset += 2

  // number of topics (int32)
  const topicCount = buf.readInt32BE(offset)
  offset += 4

  for (let t = 0; t < topicCount && offset < buf.length; t++) {
    // topic name length (int16)
    const nameLen = buf.readInt16BE(offset)
    offset += 2
    const topic = buf.toString('utf-8', offset, offset + nameLen)
    offset += nameLen

    // number of partitions (int32)
    const partCount = buf.readInt32BE(offset)
    offset += 4

    const partitions: number[] = []
    for (let p = 0; p < partCount && offset + 4 <= buf.length; p++) {
      partitions.push(buf.readInt32BE(offset))
      offset += 4
    }

    results.push({ topic, partitions })
  }

  return results
}

export const kafkaService = new KafkaService()

function decodeHeader(key: string, value: Buffer): string {
  if (/original-partition$|retry-count$|deliveryAttempt$/.test(key) && value.length === 4)
    return value.readInt32BE(0).toString()
  if (/original-offset$|original-timestamp$/.test(key) && value.length === 8)
    return value.readBigInt64BE(0).toString()
  return value.toString('utf8')
}
