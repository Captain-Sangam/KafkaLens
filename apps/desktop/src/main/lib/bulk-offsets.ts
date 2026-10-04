import type { Kafka, Admin } from 'kafkajs'
interface BulkTopic {
  topic: string
  fromBeginning: boolean
  partitions: { partition: number }[]
}
interface Offsets {
  topic: string
  partitions: { partition: number; offset: string }[]
}
interface BulkCluster {
  addMultipleTargetTopics(topics: string[]): Promise<void>
  fetchTopicsOffset(topics: BulkTopic[]): Promise<Offsets[]>
}
export interface BulkAdmin {
  admin: Admin
  highOffsets?: (
    topics: { name: string; partitions: { partitionId: number }[] }[]
  ) => Promise<Map<string, Map<number, number>>>
  counts?: (
    topics: { name: string; partitions: { partitionId: number }[] }[]
  ) => Promise<Map<string, number>>
}
// KafkaJS 2.2.4's public fetchTopicOffsets repeats metadata and ListOffsets per topic.
// Capture the admin's own cluster during its synchronous construction, then restore
// the factory immediately. This adapter is pinned to 2.2.4 and falls back to the
// public API if the extension is unavailable; it creates no additional connection.
export function createBulkAdmin(kafka: Kafka): BulkAdmin {
  const symbol = Object.getOwnPropertySymbols(kafka).find(
    (key) => key.description === 'private:Kafka:createCluster'
  )
  if (!symbol) return { admin: kafka.admin() }
  const factory = Reflect.get(kafka, symbol) as unknown
  if (typeof factory !== 'function') return { admin: kafka.admin() }
  let cluster: BulkCluster | undefined
  Reflect.set(kafka, symbol, (options: unknown) => {
    const value: unknown = Reflect.apply(factory, kafka, [options])
    if (
      value &&
      typeof value === 'object' &&
      'addMultipleTargetTopics' in value &&
      'fetchTopicsOffset' in value
    )
      cluster = value as BulkCluster
    return value
  })
  let admin: Admin
  try {
    admin = kafka.admin()
  } finally {
    Reflect.set(kafka, symbol, factory)
  }
  if (!cluster) return { admin }
  const connection = cluster
  return {
    admin,
    highOffsets: async (metadata) => {
      if (!metadata.length) return new Map()
      await connection.addMultipleTargetTopics(metadata.map((t) => t.name))
      const high = await connection.fetchTopicsOffset(
        metadata.map((t) => ({
          topic: t.name,
          fromBeginning: false,
          partitions: t.partitions.map((p) => ({ partition: p.partitionId }))
        }))
      )
      return new Map(
        high.map((t) => [
          t.topic,
          new Map(t.partitions.map((p) => [p.partition, Number(p.offset)]))
        ])
      )
    },
    counts: async (metadata) => {
      await connection.addMultipleTargetTopics(metadata.map((t) => t.name))
      const topics = metadata.map((t) => ({
        topic: t.name,
        partitions: t.partitions.map((p) => ({ partition: p.partitionId }))
      }))
      const [high, low] = await Promise.all([
        connection.fetchTopicsOffset(topics.map((t) => ({ ...t, fromBeginning: false }))),
        connection.fetchTopicsOffset(topics.map((t) => ({ ...t, fromBeginning: true })))
      ])
      const lower = new Map(
        low.map((t) => [t.topic, new Map(t.partitions.map((p) => [p.partition, BigInt(p.offset)]))])
      )
      return new Map(
        high.map((t) => [
          t.topic,
          t.partitions.reduce((sum, p) => {
            const lowOffset = lower.get(t.topic)?.get(p.partition)
            if (lowOffset === undefined) throw new Error('Incomplete offset snapshot')
            return sum + Math.max(0, Number(BigInt(p.offset) - lowOffset))
          }, 0)
        ])
      )
    }
  }
}
