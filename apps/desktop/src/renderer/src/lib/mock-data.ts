import type {
  ClusterConfig,
  Topic,
  KafkaMessage,
  ConsumerGroup,
  ConsumerGroupOffset,
  SchemaSubject,
  SchemaVersion,
  Broker,
  DLQMessage,
  TopicPartition
} from '@/types'

export const MOCK_CLUSTERS: ClusterConfig[] = [
  {
    id: 'cluster-local',
    name: 'Local Development',
    bootstrapServers: 'localhost:9092',
    authMethod: 'none',
    environmentLabel: 'local',
    colorTag: '#6366f1',
    createdAt: Date.now() - 86400000 * 30,
    updatedAt: Date.now() - 86400000
  },
  {
    id: 'cluster-staging',
    name: 'Staging Cluster',
    bootstrapServers: 'kafka-staging-1:9092,kafka-staging-2:9092,kafka-staging-3:9092',
    authMethod: 'sasl-scram-256',
    username: 'staging-admin',
    schemaRegistryUrl: 'https://schema-registry-staging.internal:8081',
    environmentLabel: 'staging',
    colorTag: '#f59e0b',
    createdAt: Date.now() - 86400000 * 60,
    updatedAt: Date.now() - 3600000
  },
  {
    id: 'cluster-prod',
    name: 'Production US-East',
    bootstrapServers: 'kafka-prod-1.us-east.internal:9092,kafka-prod-2.us-east.internal:9092,kafka-prod-3.us-east.internal:9092',
    authMethod: 'sasl-scram-512',
    username: 'prod-readonly',
    schemaRegistryUrl: 'https://schema-registry.prod.internal:8081',
    environmentLabel: 'prod',
    colorTag: '#ef4444',
    createdAt: Date.now() - 86400000 * 90,
    updatedAt: Date.now() - 7200000
  }
]

export const MOCK_TOPICS: Topic[] = [
  {
    name: 'orders.created',
    partitions: 12,
    replicationFactor: 3,
    messageCount: 1_234_567,
    retentionMs: 604800000,
    retentionBytes: -1,
    cleanupPolicy: 'delete',
    isInternal: false,
    isDLQ: false,
    configs: { 'min.insync.replicas': '2', 'compression.type': 'lz4', 'max.message.bytes': '1048576' },
    underReplicatedPartitions: 0,
    createdAt: Date.now() - 86400000 * 90
  },
  {
    name: 'orders.updated',
    partitions: 12,
    replicationFactor: 3,
    messageCount: 892_341,
    retentionMs: 604800000,
    retentionBytes: -1,
    cleanupPolicy: 'delete',
    isInternal: false,
    isDLQ: false,
    configs: { 'min.insync.replicas': '2', 'compression.type': 'lz4' },
    underReplicatedPartitions: 0
  },
  {
    name: 'payments.processed',
    partitions: 8,
    replicationFactor: 3,
    messageCount: 567_890,
    retentionMs: 2592000000,
    retentionBytes: -1,
    cleanupPolicy: 'delete',
    isInternal: false,
    isDLQ: false,
    configs: { 'min.insync.replicas': '2', 'compression.type': 'snappy' },
    underReplicatedPartitions: 0
  },
  {
    name: 'payments.failed-dlq',
    partitions: 4,
    replicationFactor: 3,
    messageCount: 1_247,
    retentionMs: 2592000000,
    retentionBytes: -1,
    cleanupPolicy: 'delete',
    isInternal: false,
    isDLQ: true,
    configs: { 'min.insync.replicas': '2' },
    underReplicatedPartitions: 0
  },
  {
    name: 'users.registered',
    partitions: 6,
    replicationFactor: 3,
    messageCount: 234_567,
    retentionMs: 604800000,
    retentionBytes: -1,
    cleanupPolicy: 'delete',
    isInternal: false,
    isDLQ: false,
    configs: { 'min.insync.replicas': '2' },
    underReplicatedPartitions: 0
  },
  {
    name: 'users.profile-updated',
    partitions: 6,
    replicationFactor: 3,
    messageCount: 456_789,
    retentionMs: 604800000,
    retentionBytes: -1,
    cleanupPolicy: 'compact',
    isInternal: false,
    isDLQ: false,
    configs: { 'min.insync.replicas': '2', 'cleanup.policy': 'compact' },
    underReplicatedPartitions: 0
  },
  {
    name: 'inventory.stock-changed',
    partitions: 16,
    replicationFactor: 3,
    messageCount: 3_456_789,
    retentionMs: 259200000,
    retentionBytes: 10737418240,
    cleanupPolicy: 'delete',
    isInternal: false,
    isDLQ: false,
    configs: { 'min.insync.replicas': '2', 'compression.type': 'zstd' },
    underReplicatedPartitions: 2
  },
  {
    name: 'notifications.email',
    partitions: 4,
    replicationFactor: 3,
    messageCount: 789_012,
    retentionMs: 172800000,
    retentionBytes: -1,
    cleanupPolicy: 'delete',
    isInternal: false,
    isDLQ: false,
    configs: {},
    underReplicatedPartitions: 0
  },
  {
    name: 'notifications.email-dlt',
    partitions: 2,
    replicationFactor: 3,
    messageCount: 342,
    retentionMs: 604800000,
    retentionBytes: -1,
    cleanupPolicy: 'delete',
    isInternal: false,
    isDLQ: true,
    configs: {},
    underReplicatedPartitions: 0
  },
  {
    name: 'analytics.page-views',
    partitions: 24,
    replicationFactor: 3,
    messageCount: 45_678_901,
    retentionMs: 86400000,
    retentionBytes: 53687091200,
    cleanupPolicy: 'delete',
    isInternal: false,
    isDLQ: false,
    configs: { 'compression.type': 'zstd', 'max.message.bytes': '2097152' },
    underReplicatedPartitions: 0
  },
  {
    name: 'analytics.click-events',
    partitions: 24,
    replicationFactor: 3,
    messageCount: 23_456_789,
    retentionMs: 86400000,
    retentionBytes: 53687091200,
    cleanupPolicy: 'delete',
    isInternal: false,
    isDLQ: false,
    configs: { 'compression.type': 'zstd' },
    underReplicatedPartitions: 0
  },
  {
    name: 'shipping.dispatched',
    partitions: 8,
    replicationFactor: 3,
    messageCount: 345_678,
    retentionMs: 604800000,
    retentionBytes: -1,
    cleanupPolicy: 'delete',
    isInternal: false,
    isDLQ: false,
    configs: { 'min.insync.replicas': '2' },
    underReplicatedPartitions: 0
  },
  {
    name: 'shipping.delivered',
    partitions: 8,
    replicationFactor: 3,
    messageCount: 312_456,
    retentionMs: 604800000,
    retentionBytes: -1,
    cleanupPolicy: 'delete',
    isInternal: false,
    isDLQ: false,
    configs: { 'min.insync.replicas': '2' },
    underReplicatedPartitions: 0
  },
  {
    name: '__consumer_offsets',
    partitions: 50,
    replicationFactor: 3,
    messageCount: 0,
    retentionMs: -1,
    retentionBytes: -1,
    cleanupPolicy: 'compact',
    isInternal: true,
    isDLQ: false,
    configs: {},
    underReplicatedPartitions: 0
  },
  {
    name: 'orders.fulfillment-retry',
    partitions: 4,
    replicationFactor: 3,
    messageCount: 89,
    retentionMs: 604800000,
    retentionBytes: -1,
    cleanupPolicy: 'delete',
    isInternal: false,
    isDLQ: true,
    configs: {},
    underReplicatedPartitions: 0
  }
]

export function generateMockMessages(topic: string, count: number): KafkaMessage[] {
  const messages: KafkaMessage[] = []
  const now = Date.now()

  for (let i = 0; i < count; i++) {
    const offset = 1000000 + i
    const partition = i % 4
    const timestamp = new Date(now - (count - i) * 1000).toISOString()

    let key: string | null = null
    let value: string

    if (topic.startsWith('orders')) {
      key = `order-${10000 + Math.floor(Math.random() * 90000)}`
      value = JSON.stringify({
        orderId: key,
        customerId: `cust-${Math.floor(Math.random() * 10000)}`,
        items: [
          { sku: `SKU-${Math.floor(Math.random() * 1000)}`, quantity: Math.ceil(Math.random() * 5), price: +(Math.random() * 200).toFixed(2) },
          { sku: `SKU-${Math.floor(Math.random() * 1000)}`, quantity: Math.ceil(Math.random() * 3), price: +(Math.random() * 150).toFixed(2) }
        ],
        totalAmount: +(Math.random() * 500 + 20).toFixed(2),
        currency: 'USD',
        status: ['pending', 'confirmed', 'processing', 'shipped'][Math.floor(Math.random() * 4)],
        createdAt: timestamp,
        shippingAddress: {
          street: '123 Main St',
          city: 'San Francisco',
          state: 'CA',
          zipCode: '94102',
          country: 'US'
        }
      }, null, 2)
    } else if (topic.startsWith('payments')) {
      key = `pay-${10000 + Math.floor(Math.random() * 90000)}`
      value = JSON.stringify({
        paymentId: key,
        orderId: `order-${Math.floor(Math.random() * 90000)}`,
        amount: +(Math.random() * 500 + 10).toFixed(2),
        currency: 'USD',
        method: ['credit_card', 'debit_card', 'paypal', 'apple_pay'][Math.floor(Math.random() * 4)],
        status: ['authorized', 'captured', 'settled', 'refunded'][Math.floor(Math.random() * 4)],
        processedAt: timestamp
      }, null, 2)
    } else if (topic.startsWith('users')) {
      key = `user-${Math.floor(Math.random() * 50000)}`
      value = JSON.stringify({
        userId: key,
        email: `user${Math.floor(Math.random() * 10000)}@example.com`,
        name: `User ${Math.floor(Math.random() * 10000)}`,
        action: 'registered',
        metadata: { source: ['web', 'mobile', 'api'][Math.floor(Math.random() * 3)], ip: '192.168.1.1' },
        timestamp
      }, null, 2)
    } else {
      key = `key-${i}`
      value = JSON.stringify({ id: i, data: `Sample message ${i}`, timestamp }, null, 2)
    }

    messages.push({
      topic,
      partition,
      offset: String(offset),
      timestamp,
      key,
      value,
      headers: { 'content-type': 'application/json', 'correlation-id': crypto.randomUUID() },
      keyFormat: 'string',
      valueFormat: 'json'
    })
  }
  return messages
}

export function generateDLQMessages(topic: string): DLQMessage[] {
  const exceptions = [
    { cls: 'com.example.DeserializationException', msg: 'Failed to deserialize Avro record: unknown schema id 42' },
    { cls: 'org.springframework.kafka.listener.ListenerExecutionFailedException', msg: 'Handler method threw exception: NullPointerException at OrderService.java:142' },
    { cls: 'java.lang.IllegalArgumentException', msg: "Invalid order status transition: 'shipped' -> 'pending'" },
    { cls: 'com.example.PaymentDeclinedException', msg: 'Payment declined: insufficient funds for amount $542.99' },
    { cls: 'java.net.SocketTimeoutException', msg: 'Connect timed out after 30000ms to inventory-service:8080' },
    { cls: 'org.hibernate.StaleObjectStateException', msg: 'Row was updated or deleted by another transaction (optimistic locking)' }
  ]

  return Array.from({ length: 15 }, (_, i) => {
    const exc = exceptions[i % exceptions.length]
    const origTopic = topic.replace(/-dl[tq]$/, '').replace(/-error$/, '').replace(/-retry$/, '')
    return {
      topic,
      partition: i % 2,
      offset: String(500 + i),
      timestamp: new Date(Date.now() - (15 - i) * 3600000).toISOString(),
      key: `order-${20000 + i}`,
      value: JSON.stringify({
        orderId: `order-${20000 + i}`,
        customerId: `cust-${1000 + i}`,
        amount: +(Math.random() * 400 + 20).toFixed(2),
        status: 'failed'
      }, null, 2),
      headers: {
        'kafka_dlt-exception-fqcn': exc.cls,
        'kafka_dlt-exception-message': exc.msg,
        'kafka_dlt-original-topic': origTopic,
        'kafka_dlt-original-partition': String(i % 4),
        'kafka_dlt-original-offset': String(900000 + i),
        'x-retry-count': String(Math.floor(Math.random() * 4) + 1)
      },
      keyFormat: 'string' as const,
      valueFormat: 'json' as const,
      exceptionClass: exc.cls,
      exceptionMessage: exc.msg,
      originalTopic: origTopic,
      originalPartition: i % 4,
      originalOffset: String(900000 + i),
      retryCount: Math.floor(Math.random() * 4) + 1,
      isReviewed: i < 3
    }
  })
}

export const MOCK_CONSUMER_GROUPS: ConsumerGroup[] = [
  { groupId: 'order-service', state: 'Stable', members: 3, protocolType: 'consumer', totalLag: 45, topics: ['orders.created', 'orders.updated'] },
  { groupId: 'payment-processor', state: 'Stable', members: 2, protocolType: 'consumer', totalLag: 12, topics: ['payments.processed'] },
  { groupId: 'notification-service', state: 'Stable', members: 2, protocolType: 'consumer', totalLag: 1_834, topics: ['notifications.email'] },
  { groupId: 'analytics-pipeline', state: 'Stable', members: 6, protocolType: 'consumer', totalLag: 23_456, topics: ['analytics.page-views', 'analytics.click-events'] },
  { groupId: 'inventory-updater', state: 'Rebalancing', members: 4, protocolType: 'consumer', totalLag: 5_678, topics: ['inventory.stock-changed'] },
  { groupId: 'shipping-tracker', state: 'Stable', members: 2, protocolType: 'consumer', totalLag: 123, topics: ['shipping.dispatched', 'shipping.delivered'] },
  { groupId: 'user-event-consumer', state: 'Stable', members: 1, protocolType: 'consumer', totalLag: 0, topics: ['users.registered', 'users.profile-updated'] },
  { groupId: 'dead-letter-processor', state: 'Empty', members: 0, protocolType: 'consumer', totalLag: 0, topics: [] },
  { groupId: 'audit-logger', state: 'Stable', members: 1, protocolType: 'consumer', totalLag: 234, topics: ['orders.created', 'payments.processed', 'users.registered'] }
]

export function generateConsumerGroupOffsets(groupId: string): ConsumerGroupOffset[] {
  const group = MOCK_CONSUMER_GROUPS.find((g) => g.groupId === groupId)
  if (!group) return []

  const offsets: ConsumerGroupOffset[] = []
  for (const topic of group.topics) {
    const t = MOCK_TOPICS.find((mt) => mt.name === topic)
    const partitions = t?.partitions ?? 4
    for (let p = 0; p < Math.min(partitions, 8); p++) {
      const logEnd = 100000 + Math.floor(Math.random() * 900000)
      const lag = Math.floor(Math.random() * (group.totalLag / (group.topics.length * partitions) * 3))
      offsets.push({
        topic,
        partition: p,
        currentOffset: logEnd - lag,
        logEndOffset: logEnd,
        lag,
        lastCommittedAt: new Date(Date.now() - Math.random() * 60000).toISOString()
      })
    }
  }
  return offsets
}

export const MOCK_SCHEMA_SUBJECTS: SchemaSubject[] = [
  { subject: 'orders.created-value', versions: [1, 2, 3], latestVersion: 3, compatibility: 'BACKWARD', schemaType: 'AVRO' },
  { subject: 'orders.created-key', versions: [1], latestVersion: 1, compatibility: 'BACKWARD', schemaType: 'AVRO' },
  { subject: 'orders.updated-value', versions: [1, 2], latestVersion: 2, compatibility: 'BACKWARD', schemaType: 'AVRO' },
  { subject: 'payments.processed-value', versions: [1, 2, 3, 4], latestVersion: 4, compatibility: 'FULL', schemaType: 'AVRO' },
  { subject: 'users.registered-value', versions: [1], latestVersion: 1, compatibility: 'BACKWARD', schemaType: 'JSON' },
  { subject: 'inventory.stock-changed-value', versions: [1, 2], latestVersion: 2, compatibility: 'FORWARD', schemaType: 'PROTOBUF' },
  { subject: 'shipping.dispatched-value', versions: [1], latestVersion: 1, compatibility: 'BACKWARD', schemaType: 'AVRO' },
  { subject: 'analytics.page-views-value', versions: [1, 2, 3], latestVersion: 3, compatibility: 'NONE', schemaType: 'JSON' }
]

export function getMockSchemaVersion(subject: string, version: number): SchemaVersion {
  const sub = MOCK_SCHEMA_SUBJECTS.find((s) => s.subject === subject)
  const schemaType = sub?.schemaType ?? 'AVRO'

  if (schemaType === 'AVRO') {
    const baseFields = [
      { name: 'id', type: 'string', doc: 'Unique identifier' },
      { name: 'timestamp', type: { type: 'long', logicalType: 'timestamp-millis' }, doc: 'Event timestamp' }
    ]
    const extraFields = version >= 2
      ? [{ name: 'metadata', type: ['null', { type: 'map', values: 'string' }], default: null, doc: 'Additional metadata' }]
      : []
    const v3Fields = version >= 3
      ? [{ name: 'version', type: 'int', default: 1, doc: 'Schema version indicator' }]
      : []

    return {
      subject,
      version,
      id: 1000 + version,
      schemaType: 'AVRO',
      schema: JSON.stringify({
        type: 'record',
        name: subject.split('-')[0].replace(/\./g, '_'),
        namespace: 'com.kafkalens.events',
        doc: `Schema for ${subject} v${version}`,
        fields: [...baseFields, ...extraFields, ...v3Fields]
      }, null, 2)
    }
  }

  return {
    subject,
    version,
    id: 2000 + version,
    schemaType,
    schema: JSON.stringify({
      type: 'object',
      properties: { id: { type: 'string' }, data: { type: 'object' }, timestamp: { type: 'integer' } },
      required: ['id', 'timestamp']
    }, null, 2)
  }
}

export const MOCK_BROKERS: Broker[] = [
  {
    id: 1, host: 'kafka-broker-1.internal', port: 9092, rack: 'us-east-1a', isController: true,
    configs: { 'log.retention.hours': '168', 'num.partitions': '12', 'default.replication.factor': '3', 'min.insync.replicas': '2', 'log.segment.bytes': '1073741824', 'log.retention.check.interval.ms': '300000', 'compression.type': 'producer', 'message.max.bytes': '1048576', 'num.io.threads': '8', 'num.network.threads': '3' }
  },
  {
    id: 2, host: 'kafka-broker-2.internal', port: 9092, rack: 'us-east-1b', isController: false,
    configs: { 'log.retention.hours': '168', 'num.partitions': '12', 'default.replication.factor': '3', 'min.insync.replicas': '2', 'log.segment.bytes': '1073741824', 'log.retention.check.interval.ms': '300000', 'compression.type': 'producer', 'message.max.bytes': '1048576', 'num.io.threads': '8', 'num.network.threads': '3' }
  },
  {
    id: 3, host: 'kafka-broker-3.internal', port: 9092, rack: 'us-east-1c', isController: false,
    configs: { 'log.retention.hours': '168', 'num.partitions': '12', 'default.replication.factor': '3', 'min.insync.replicas': '2', 'log.segment.bytes': '1073741824', 'log.retention.check.interval.ms': '300000', 'compression.type': 'producer', 'message.max.bytes': '2097152', 'num.io.threads': '8', 'num.network.threads': '3' }
  }
]

export function generatePartitions(topic: string): TopicPartition[] {
  const t = MOCK_TOPICS.find((mt) => mt.name === topic)
  const count = t?.partitions ?? 4

  return Array.from({ length: count }, (_, i) => {
    const leader = (i % 3) + 1
    const replicas = [1, 2, 3]
    const isr = t?.underReplicatedPartitions && i < (t?.underReplicatedPartitions ?? 0) ? replicas.slice(0, 2) : [...replicas]
    return {
      partitionId: i,
      leader,
      leaderHost: `kafka-broker-${leader}.internal`,
      replicas,
      isr,
      logStartOffset: 0,
      logEndOffset: Math.floor((t?.messageCount ?? 10000) / count) + Math.floor(Math.random() * 1000),
      leaderEpoch: 15,
      isUnderReplicated: isr.length < replicas.length
    }
  })
}
