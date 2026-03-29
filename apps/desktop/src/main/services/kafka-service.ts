import { Kafka, KafkaConfig, ConfigResourceTypes, logLevel } from 'kafkajs'
import type { Admin, Producer } from 'kafkajs'
import { readFileSync } from 'fs'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClusterConnectionConfig {
  bootstrapServers: string
  authMethod: 'none' | 'sasl-plain' | 'sasl-scram-256' | 'sasl-scram-512' | 'ssl'
  username?: string
  password?: string
  sslCertPath?: string
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
  configs: Record<string, string>
  underReplicatedPartitions: number
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
  topic: string
  numPartitions: number
  replicationFactor: number
  configs?: Record<string, string>
}

export interface FetchMessagesOpts {
  topic: string
  partition?: number
  offset?: string // 'latest', 'earliest', or a specific number
  timestamp?: number
  limit: number
}

export interface KafkaMessageResult {
  topic: string
  partition: number
  offset: string
  timestamp: string
  key: string | null
  value: string
  headers: Record<string, string>
}

export interface ProduceMessageOpts {
  topic: string
  key?: string
  value: string
  headers?: Record<string, string>
  partition?: number
}

export interface ConsumerGroupInfo {
  groupId: string
  state: string
  members: number
  protocolType: string
  totalLag: number
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

export type OffsetResetSpec =
  | { type: 'earliest' }
  | { type: 'latest' }
  | { type: 'offset'; value: number }
  | { type: 'timestamp'; value: number }

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
  producer: Producer | null
  config: ClusterConnectionConfig
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class KafkaService {
  private connections = new Map<string, KafkaConnection>()

  // -----------------------------------------------------------------------
  // Connection lifecycle
  // -----------------------------------------------------------------------

  async connect(
    clusterId: string,
    config: ClusterConnectionConfig
  ): Promise<ConnectionResult> {
    try {
      if (this.connections.has(clusterId)) {
        await this.disconnect(clusterId)
      }

      const kafka = this.createKafkaInstance(config)
      const admin = kafka.admin()
      await admin.connect()

      const cluster = await admin.describeCluster()

      this.connections.set(clusterId, { kafka, admin, producer: null, config })

      return {
        success: true,
        brokerCount: cluster.brokers.length,
        kafkaVersion: undefined
      }
    } catch (err: unknown) {
      return { success: false, error: errorMessage(err) }
    }
  }

  async disconnect(clusterId: string): Promise<void> {
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

  isConnected(clusterId: string): boolean {
    return this.connections.has(clusterId)
  }

  // -----------------------------------------------------------------------
  // Topics
  // -----------------------------------------------------------------------

  async listTopics(clusterId: string): Promise<TopicInfo[]> {
    const { admin } = this.getConnection(clusterId)

    const topicNames = await admin.listTopics()
    if (topicNames.length === 0) return []

    const metadata = await admin.fetchTopicMetadata({ topics: topicNames })

    const configResources = topicNames.map((name) => ({
      type: ConfigResourceTypes.TOPIC as number,
      name
    }))
    const { resources: configResults } = await admin.describeConfigs({
      includeSynonyms: false,
      resources: configResources
    })

    const configByTopic = new Map<string, Record<string, string>>()
    for (const res of configResults) {
      const map: Record<string, string> = {}
      for (const entry of res.configEntries) {
        map[entry.configName] = entry.configValue
      }
      configByTopic.set(res.resourceName, map)
    }

    const results: TopicInfo[] = []

    for (const topicMeta of metadata.topics) {
      const configs = configByTopic.get(topicMeta.name) ?? {}

      let messageCount = 0
      let underReplicated = 0
      try {
        const offsets = await admin.fetchTopicOffsets(topicMeta.name)
        for (const po of offsets) {
          const high = parseInt(po.high, 10) || 0
          const low = parseInt(po.low, 10) || 0
          messageCount += high - low
        }
      } catch {
        /* offset fetch may fail for empty topics */
      }

      for (const p of topicMeta.partitions) {
        if (p.isr.length < p.replicas.length) {
          underReplicated++
        }
      }

      const replicationFactor =
        topicMeta.partitions.length > 0
          ? topicMeta.partitions[0].replicas.length
          : 0

      results.push({
        name: topicMeta.name,
        partitions: topicMeta.partitions.length,
        replicationFactor,
        messageCount,
        retentionMs: parseInt(configs['retention.ms'] ?? '-1', 10),
        retentionBytes: parseInt(configs['retention.bytes'] ?? '-1', 10),
        cleanupPolicy: configs['cleanup.policy'] ?? 'delete',
        isInternal: topicMeta.name.startsWith('__'),
        configs,
        underReplicatedPartitions: underReplicated
      })
    }

    return results
  }

  async getTopicMetadata(
    clusterId: string,
    topic: string
  ): Promise<TopicMetadata> {
    const { admin } = this.getConnection(clusterId)

    const metadata = await admin.fetchTopicMetadata({ topics: [topic] })
    const topicMeta = metadata.topics[0]
    if (!topicMeta) throw new Error(`Topic "${topic}" not found`)

    const cluster = await admin.describeCluster()
    const brokerMap = new Map(
      cluster.brokers.map((b) => [b.nodeId, `${b.host}:${b.port}`])
    )

    let offsetsByPartition = new Map<number, { high: string; low: string }>()
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

  async getTopicConfig(
    clusterId: string,
    topic: string
  ): Promise<Record<string, string>> {
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
          topic: opts.topic,
          numPartitions: opts.numPartitions,
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

  async fetchMessages(
    clusterId: string,
    opts: FetchMessagesOpts
  ): Promise<KafkaMessageResult[]> {
    const conn = this.getConnection(clusterId)
    const groupId = `kafkalens-browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const consumer = conn.kafka.consumer({
      groupId,
      maxWaitTimeInMs: 3000,
      sessionTimeout: 15000
    })

    const messages: KafkaMessageResult[] = []
    let resolveCollected: (() => void) | null = null

    try {
      await consumer.connect()
      await consumer.subscribe({
        topic: opts.topic,
        fromBeginning: opts.offset === 'earliest'
      })

      const collected = new Promise<void>((resolve) => {
        resolveCollected = resolve
      })

      let seekApplied = false

      await consumer.run({
        autoCommit: false,
        eachBatchAutoResolve: true,
        eachBatch: async ({ batch, resolveOffset, heartbeat }) => {
          for (const message of batch.messages) {
            if (opts.partition !== undefined && batch.partition !== opts.partition) {
              continue
            }

            messages.push({
              topic: batch.topic,
              partition: batch.partition,
              offset: message.offset,
              timestamp: message.timestamp,
              key: message.key?.toString() ?? null,
              value: message.value?.toString() ?? '',
              headers: Object.fromEntries(
                Object.entries(message.headers ?? {}).map(([k, v]) => [
                  k,
                  Buffer.isBuffer(v) ? v.toString() : (v?.toString() ?? '')
                ])
              )
            })

            resolveOffset(message.offset)
            await heartbeat()

            if (messages.length >= opts.limit) {
              resolveCollected?.()
              return
            }
          }
        }
      })

      if (
        opts.offset &&
        opts.offset !== 'latest' &&
        opts.offset !== 'earliest'
      ) {
        const metadata = await conn.admin.fetchTopicMetadata({
          topics: [opts.topic]
        })
        const partitions =
          opts.partition !== undefined
            ? [opts.partition]
            : metadata.topics[0].partitions.map((p) => p.partitionId)

        for (const p of partitions) {
          consumer.seek({
            topic: opts.topic,
            partition: p,
            offset: opts.offset
          })
        }
        seekApplied = true
      }

      if (opts.timestamp !== undefined) {
        const metadata = await conn.admin.fetchTopicMetadata({
          topics: [opts.topic]
        })
        const partitions =
          opts.partition !== undefined
            ? [opts.partition]
            : metadata.topics[0].partitions.map((p) => p.partitionId)

        const offsetsByTimestamp = await conn.admin.fetchTopicOffsetsByTimestamp(
          opts.topic,
          opts.timestamp
        )

        for (const po of offsetsByTimestamp) {
          if (partitions.includes(po.partition) && po.offset !== '-1') {
            consumer.seek({
              topic: opts.topic,
              partition: po.partition,
              offset: po.offset
            })
          }
        }
        seekApplied = true
      }

      const timeout = new Promise<void>((resolve) => setTimeout(resolve, 5000))
      await Promise.race([collected, timeout])

      return messages.slice(0, opts.limit)
    } finally {
      try {
        await consumer.disconnect()
      } catch {
        /* best effort */
      }
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
    const kafkaHeaders = Object.fromEntries(
      Object.entries(headers).map(([k, v]) => [k, Buffer.from(v)])
    )

    const result = await conn.producer.send({
      topic: opts.topic,
      messages: [
        {
          key: opts.key ?? null,
          value: opts.value,
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

  async listConsumerGroups(
    clusterId: string
  ): Promise<ConsumerGroupInfo[]> {
    const { admin } = this.getConnection(clusterId)

    const { groups } = await admin.listGroups()
    if (groups.length === 0) return []

    const groupIds = groups.map((g) => g.groupId)
    const described = await admin.describeGroups(groupIds)

    const results: ConsumerGroupInfo[] = []

    for (const g of described.groups) {
      const topics = new Set<string>()
      for (const member of g.members) {
        try {
          const assignment = member.memberAssignment
          if (assignment && Buffer.isBuffer(assignment) && assignment.length > 0) {
            let offset = 0
            const version = assignment.readInt16BE(offset); offset += 2
            const topicCount = assignment.readInt32BE(offset); offset += 4
            for (let t = 0; t < topicCount && offset < assignment.length - 2; t++) {
              const topicLen = assignment.readInt16BE(offset); offset += 2
              if (topicLen > 0 && offset + topicLen <= assignment.length) {
                topics.add(assignment.toString('utf-8', offset, offset + topicLen))
                offset += topicLen
              }
              if (offset + 4 <= assignment.length) {
                const partCount = assignment.readInt32BE(offset); offset += 4
                offset += partCount * 4
              }
            }
          }
        } catch {
          /* assignment parsing is best-effort */
        }
      }

      let totalLag = 0
      try {
        const offsets = await admin.fetchOffsets({ groupId: g.groupId })
        for (const o of offsets) {
          if (o.offset === '-1') continue
          try {
            const topicOffsets = await admin.fetchTopicOffsets(o.topic)
            const partInfo = topicOffsets.find((p) => String(p.partition) === String(o.partition))
            if (partInfo) {
              const lag = Number(partInfo.offset) - Number(o.offset)
              if (lag > 0) totalLag += lag
            }
          } catch {
            /* skip topics we can't access */
          }
        }
      } catch {
        /* offsets unavailable */
      }

      results.push({
        groupId: g.groupId,
        state: g.state,
        members: g.members.length,
        protocolType: g.protocolType,
        totalLag,
        topics: Array.from(topics)
      })
    }

    return results
  }

  async describeConsumerGroup(
    clusterId: string,
    groupId: string
  ): Promise<ConsumerGroupDetail> {
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
    const { admin } = this.getConnection(clusterId)

    const groupOffsets = await admin.fetchOffsets({ groupId })
    const results: ConsumerGroupOffsetInfo[] = []

    const topicNames = [...new Set(groupOffsets.map((o) => o.topic))]

    for (const topic of topicNames) {
      const topicEndOffsets = await admin.fetchTopicOffsets(topic)
      const endOffsetMap = new Map(
        topicEndOffsets.map((o) => [o.partition, parseInt(o.high, 10)])
      )

      const partitionOffsets = groupOffsets.filter((o) => o.topic === topic)
      for (const po of partitionOffsets) {
        for (const p of po.partitions) {
          const currentOffset = parseInt(p.offset, 10)
          const logEndOffset = endOffsetMap.get(p.partition) ?? 0
          const lag =
            currentOffset >= 0 ? Math.max(0, logEndOffset - currentOffset) : logEndOffset

          results.push({
            topic,
            partition: p.partition,
            currentOffset,
            logEndOffset,
            lag
          })
        }
      }
    }

    return results
  }

  async resetConsumerGroupOffsets(
    clusterId: string,
    groupId: string,
    topic: string,
    offsetSpec: OffsetResetSpec
  ): Promise<void> {
    const { admin } = this.getConnection(clusterId)

    if (offsetSpec.type === 'earliest') {
      await admin.resetOffsets({ groupId, topic, earliest: true })
    } else if (offsetSpec.type === 'latest') {
      await admin.resetOffsets({ groupId, topic, earliest: false })
    } else if (offsetSpec.type === 'offset') {
      const topicOffsets = await admin.fetchTopicOffsets(topic)
      await admin.setOffsets({
        groupId,
        topic,
        partitions: topicOffsets.map((p) => ({
          partition: p.partition,
          offset: String(offsetSpec.value)
        }))
      })
    } else if (offsetSpec.type === 'timestamp') {
      const offsetsByTimestamp = await admin.fetchTopicOffsetsByTimestamp(
        topic,
        offsetSpec.value
      )
      await admin.setOffsets({
        groupId,
        topic,
        partitions: offsetsByTimestamp.map((p) => ({
          partition: p.partition,
          offset: p.offset
        }))
      })
    }
  }

  async deleteConsumerGroup(
    clusterId: string,
    groupId: string
  ): Promise<void> {
    const { admin } = this.getConnection(clusterId)
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
      rack: (b as any).rack ?? undefined,
      isController: b.nodeId === cluster.controller
    }))
  }

  async describeBrokerConfig(
    clusterId: string,
    brokerId: number
  ): Promise<Record<string, string>> {
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

  async getPartitions(
    clusterId: string,
    topic: string
  ): Promise<PartitionInfo[]> {
    const meta = await this.getTopicMetadata(clusterId, topic)
    return meta.partitions
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private getConnection(clusterId: string): KafkaConnection {
    const conn = this.connections.get(clusterId)
    if (!conn) {
      throw new Error(
        `No active connection for cluster "${clusterId}". Call connect() first.`
      )
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
      kafkaConfig.ssl = true
    } else if (config.authMethod === 'sasl-scram-256') {
      kafkaConfig.sasl = {
        mechanism: 'scram-sha-256',
        username: config.username ?? '',
        password: config.password ?? ''
      }
      kafkaConfig.ssl = true
    } else if (config.authMethod === 'sasl-scram-512') {
      kafkaConfig.sasl = {
        mechanism: 'scram-sha-512',
        username: config.username ?? '',
        password: config.password ?? ''
      }
      kafkaConfig.ssl = true
    } else if (config.authMethod === 'ssl') {
      kafkaConfig.ssl = config.sslCertPath
        ? { ca: [readFileSync(config.sslCertPath, 'utf-8')] }
        : true
    }

    return new Kafka(kafkaConfig)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

/**
 * Parse the Kafka consumer protocol MemberAssignment bytes.
 * Format: Version(2) [TopicName(string) Partitions(int32[])]
 */
function parseMemberAssignment(
  buf: Buffer
): Array<{ topic: string; partitions: number[] }> {
  const results: Array<{ topic: string; partitions: number[] }> = []
  let offset = 0

  if (buf.length < 4) return results

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
