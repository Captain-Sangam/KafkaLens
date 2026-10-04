export type EnvironmentLabel = 'local' | 'dev' | 'staging' | 'prod'
export type AuthMethod = 'none' | 'sasl-plain' | 'sasl-scram-256' | 'sasl-scram-512' | 'ssl'

export interface ClusterConfig {
  id: string
  name: string
  bootstrapServers: string
  authMethod: AuthMethod
  ssl?: boolean
  sslRejectUnauthorized?: boolean
  username?: string
  password?: string
  sslCertPath?: string
  sslClientCertPath?: string
  sslKeyPath?: string
  schemaRegistryUrl?: string
  schemaRegistryAuth?: { username: string; password: string }
  environmentLabel: EnvironmentLabel
  colorTag: string
  createdAt: number
  updatedAt: number
}

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error'

export interface ClusterConnection {
  config: ClusterConfig
  status: ConnectionStatus
  brokerCount?: number
  kafkaVersion?: string
  error?: string
}

export interface Topic {
  name: string
  partitions: number
  replicationFactor: number
  messageCount: number
  retentionMs: number
  retentionBytes: number
  cleanupPolicy: 'delete' | 'compact' | 'delete,compact'
  isInternal: boolean
  isDLQ: boolean
  configs: Record<string, string>
  underReplicatedPartitions: number
  offlinePartitions?: number
  messageCountError?: string
  createdAt?: number
}

export interface TopicPartition {
  partitionId: number
  leader: number
  leaderHost: string
  replicas: number[]
  isr: number[]
  logStartOffset: number
  logEndOffset: number
  leaderEpoch?: number
  isUnderReplicated: boolean
}

export interface KafkaMessage {
  topic: string
  partition: number
  offset: string
  timestamp: string
  key: string | null
  value: string
  headers: Record<string, string>
  keyFormat: PayloadFormat
  valueFormat: PayloadFormat
  schemaId?: number
  keySchemaId?: number
  isTombstone?: boolean
  rawValue?: string
  rawKey?: string
  rawHeaders?: Record<string, string[]>
  decodeError?: string
}

export type PayloadFormat = 'json' | 'avro' | 'protobuf' | 'string' | 'binary'

export interface DLQMessage extends KafkaMessage {
  exceptionClass?: string
  exceptionMessage?: string
  originalTopic?: string
  originalPartition?: number
  originalOffset?: string
  retryCount?: number
  isReviewed: boolean
}

export type ConsumerGroupState = 'Stable' | 'Rebalancing' | 'Empty' | 'Dead' | 'PreparingRebalance'

export interface ConsumerGroup {
  groupId: string
  state: ConsumerGroupState
  members: number
  protocolType: string
  totalLag: number
  lagError?: string
  topics: string[]
}

export interface ConsumerGroupMember {
  memberId: string
  clientId: string
  host: string
  assignments: { topic: string; partitions: number[] }[]
}

export interface ConsumerGroupOffset {
  topic: string
  partition: number
  currentOffset: number
  logEndOffset: number
  lag: number
  lastCommittedAt?: string
}

export interface SchemaSubject {
  subject: string
  versions: number[]
  latestVersion: number
  compatibility: SchemaCompatibility
  schemaType: 'AVRO' | 'PROTOBUF' | 'JSON'
  schema?: string
  error?: string
}

export type SchemaCompatibility =
  | 'BACKWARD'
  | 'FORWARD'
  | 'FULL'
  | 'NONE'
  | 'BACKWARD_TRANSITIVE'
  | 'FORWARD_TRANSITIVE'
  | 'FULL_TRANSITIVE'

export interface SchemaVersion {
  subject: string
  version: number
  id: number
  schema: string
  schemaType: 'AVRO' | 'PROTOBUF' | 'JSON'
}

export interface Broker {
  id: number
  host: string
  port: number
  rack?: string
  isController: boolean
  configs: Record<string, string>
}

export type AIProvider = 'openai' | 'anthropic' | 'google'

export interface AISettings {
  enabled: boolean
  provider: AIProvider
  apiKey: string
  model: string
  redactedFields: string[]
  consent?: boolean
  features?: Partial<Record<AIFeature, boolean>>
  anomalyThreshold?: number
  historyEnabled?: boolean
}

export type NavigationPage =
  | 'dashboard'
  | 'topics'
  | 'messages'
  | 'consumer-groups'
  | 'schema-registry'
  | 'dlq'
  | 'brokers'
  | 'settings'
  | 'partitions'

export interface MessageFilter {
  partition?: number
  keyFilter?: string
  keyFilterType: 'exact' | 'regex'
  timestampStart?: string
  timestampEnd?: string
  valueFilter?: string
  valueFilterType: 'substring' | 'jsonpath'
}

export const ENV_COLORS: Record<EnvironmentLabel, string> = {
  local: '#6366f1',
  dev: '#22c55e',
  staging: '#f59e0b',
  prod: '#ef4444'
}

export type AIFeature =
  'messages' | 'dlq' | 'topics' | 'schemas' | 'health' | 'search' | 'anomalies'
export interface IpcResult<T = void> {
  success: boolean
  data?: T
  error?: string
}
export interface ConnectionResult {
  success: boolean
  brokerCount?: number
  kafkaVersion?: string
  error?: string
}
export interface AIResponse {
  content: string
  usage?: { promptTokens: number; completionTokens: number }
}
export interface FetchOptions extends Partial<MessageFilter> {
  topic: string
  offset?: string
  offsets?: Record<number, string>
  timestamp?: number
  limit?: number
  requestId?: string
  direction?: 'forward' | 'backward'
}
export interface CreateTopicOptions {
  name: string
  partitions: number
  replicationFactor: number
  configs?: Record<string, string>
}
export interface ProduceOptions {
  topic: string
  key?: string | null
  value: string
  partition?: number
  headers?: Record<string, string>
  valueFormat?: PayloadFormat
  schemaId?: number
  tombstone?: boolean
  rawValue?: string
  rawKey?: string
  rawHeaders?: Record<string, string[]>
}
export interface OffsetSpec {
  type: 'earliest' | 'latest' | 'to-offset' | 'to-timestamp'
  value?: string | number
}
export interface GroupDetail {
  groupId: string
  state: string
  members: ConsumerGroupMember[]
}
export interface SchemaDefinition {
  schema: string
  schemaType?: 'AVRO' | 'PROTOBUF' | 'JSON'
  references?: SchemaReference[]
}
export interface SchemaReference {
  name: string
  subject: string
  version: number
}
export interface ConfigSnapshot {
  at: number
  configs: Record<string, string>
}
export interface LagSample {
  at: number
  lag: number
}
export interface TopicMatch {
  name: string
  reason: string
}
export interface ClusterHealthContext {
  topics: number
  consumerGroups: number
  brokers: number
  underReplicatedPartitions: number
  totalLag: number
  lagUnavailableGroups?: number
  dlqMessages: number
  offlinePartitions?: number
  topicConfigs?: unknown
  lagTrends?: unknown
  schemaIssues?: unknown
  schemaSubjects?: {
    subject: string
    compatibility: string
    latestVersion: number
    schemaType: string
  }[]
}
export interface TopicMetrics {
  messageCount: number
  partitions: number
  consumerLag: number
  partitionCounts?: Record<number, number>
}
export interface DisplayPreferences {
  fontSize: 'small' | 'medium' | 'large'
  dlqPatterns: string[]
}

export interface MessagePage {
  messages: KafkaMessage[]
  nextOffsets: Record<number, string>
  hasMore: boolean
}

export interface AIHistoryEntry {
  id: number
  at: number
  feature: AIFeature
  provider: AIProvider
  model: string
  response: AIResponse
}
export interface UpdateState {
  status:
    | 'unsupported'
    | 'idle'
    | 'checking'
    | 'available'
    | 'current'
    | 'downloading'
    | 'ready'
    | 'error'
  version?: string
  percent?: number
  error?: string
}
