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
  leaderEpoch: number
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
}

export type SchemaCompatibility = 'BACKWARD' | 'FORWARD' | 'FULL' | 'NONE' | 'BACKWARD_TRANSITIVE' | 'FORWARD_TRANSITIVE' | 'FULL_TRANSITIVE'

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
