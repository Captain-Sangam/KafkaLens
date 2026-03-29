export interface KafkaClientConfig {
  bootstrapServers: string
  sasl?: {
    mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512'
    username: string
    password: string
  }
  ssl?: boolean | { ca?: string; cert?: string; key?: string }
}

export interface KafkaClient {
  connect(): Promise<void>
  disconnect(): Promise<void>
  listTopics(): Promise<string[]>
  getTopicMetadata(topic: string): Promise<unknown>
  fetchMessages(topic: string, partition: number, offset: number, limit: number): Promise<unknown[]>
}
