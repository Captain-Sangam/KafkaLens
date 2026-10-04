import type {
  IpcResult,
  UpdateState,
  AIHistoryEntry,
  ClusterConfig,
  ConnectionResult,
  Topic,
  TopicPartition,
  KafkaMessage,
  MessagePage,
  ConsumerGroup,
  ConsumerGroupOffset,
  Broker,
  SchemaSubject,
  SchemaVersion,
  SchemaDefinition,
  AISettings,
  AIResponse,
  FetchOptions,
  CreateTopicOptions,
  ProduceOptions,
  OffsetSpec,
  GroupDetail,
  TopicMetrics,
  ClusterHealthContext,
  TopicMatch,
  ConfigSnapshot
} from '../renderer/src/types'
type Result<T = void> = Promise<IpcResult<T>>
export interface KafkaLensAPI {
  cluster: {
    testConnection(config: ClusterConfig): Result<ConnectionResult>
    connect(id: string, config: ClusterConfig): Result<ConnectionResult>
    disconnect(id: string): Result
    isConnected(id: string): Result<boolean>
    list(): Result<ClusterConfig[]>
    save(config: ClusterConfig): Result
    update(id: string, updates: Partial<ClusterConfig>): Result
    delete(id: string): Result
  }
  topics: {
    list(id: string): Result<Topic[]>
    metadata(id: string, topic: string): Result<{ name: string; partitions: TopicPartition[] }>
    config(id: string, topic: string): Result<Record<string, string>>
    create(id: string, opts: CreateTopicOptions): Result
    delete(id: string, topic: string): Result
    alterConfig(id: string, topic: string, configs: Record<string, string>): Result
    partitions(id: string, topic: string): Result<TopicPartition[]>
  }
  messages: {
    page(id: string, opts: FetchOptions): Result<MessagePage>
    fetch(id: string, opts: FetchOptions): Result<KafkaMessage[]>
    produce(id: string, opts: ProduceOptions): Result<{ partition: number; offset: string }>
    cancel(requestId: string): Result
  }
  consumerGroups: {
    list(id: string): Result<ConsumerGroup[]>
    describe(id: string, group: string): Result<GroupDetail>
    offsets(id: string, group: string): Result<ConsumerGroupOffset[]>
    resetOffsets(id: string, group: string, topic: string, spec: OffsetSpec): Result
    delete(id: string, group: string): Result
  }
  brokers: {
    list(id: string): Result<Broker[]>
    config(id: string, broker: number): Result<Record<string, string>>
    history(id: string, broker: number): Result<ConfigSnapshot[]>
    clusterConfig(id: string): Result<Record<string, string>>
    partitions(
      id: string,
      broker: number
    ): Result<{ topic: string; partition: TopicPartition; role: string }[]>
  }
  schema: {
    configure(id: string, config: { url: string; username?: string; password?: string }): Result
    subjects(id: string): Result<SchemaSubject[]>
    versions(id: string, subject: string): Result<number[]>
    get(id: string, subject: string, version: number | string): Result<SchemaVersion>
    getById(id: string, schema: number): Result<SchemaDefinition>
    compatibility(id: string, subject: string): Result<string>
    checkCompatibility(
      id: string,
      subject: string,
      schema: string,
      type: string
    ): Result<{ is_compatible: boolean }>
    register(id: string, subject: string, schema: string, type: string): Result<{ id: number }>
    deleteVersion(id: string, subject: string, version: number | string): Result
  }
  ai: {
    configure(settings: AISettings): Result
    isConfigured(): Result<boolean>
    explainMessage(payload: string, schema?: string): Result<AIResponse>
    analyzeDLQ(
      exceptionClass: string,
      exceptionMessage: string,
      payload: string
    ): Result<AIResponse>
    adviseTopicConfig(
      name: string,
      config: Record<string, string>,
      metrics: TopicMetrics
    ): Result<AIResponse>
    explainSchemaDiff(subject: string, before: string, after: string): Result<AIResponse>
    clusterHealth(data: ClusterHealthContext): Result<AIResponse>
    searchTopics(query: string, topics: string[]): Result<TopicMatch[]>
    lagAnomaly(group: string, samples: { at: number; lag: number }[]): Result<AIResponse>
    models(settings: AISettings): Result<string[]>
    cancel(): Result
    history(): Result<AIHistoryEntry[]>
    clearHistory(): Result
  }
  settings: {
    get(key: string): Result<string | undefined>
    set(key: string, value: string): Result
    getAI(): Result<AISettings | null>
    saveAI(settings: AISettings): Result
  }
  favorites: {
    list(id: string): Result<string[]>
    add(id: string, topic: string): Result
    remove(id: string, topic: string): Result
  }
  dlq: {
    markReviewed(id: string, topic: string, partition: number, offset: string): Result
    isReviewed(id: string, topic: string, partition: number, offset: string): Result<boolean>
  }
  app: {
    version(): Result<string>
    selectCertificate(): Result<string | undefined>
    checkUpdate(): Result<UpdateState>
    updateState(): Result<UpdateState>
    downloadUpdate(): Result
    installUpdate(): Result
  }
}
