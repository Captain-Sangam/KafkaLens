import { describe, it, expect, vi } from 'vitest'
import { Kafka, logLevel } from 'kafkajs'
import avro from 'avsc'
import { schemaService } from '../apps/desktop/src/main/services/schema-service'
import { PayloadService } from '../apps/desktop/src/main/services/payload-service'
import { writeFileSync, mkdirSync } from 'node:fs'
vi.mock('../apps/desktop/src/main/services/store-service', () => ({
  storeService: { getSetting: () => undefined }
}))
import { KafkaService } from '../apps/desktop/src/main/services/kafka-service'
const suite = process.env.KAFKALENS_BENCHMARK === '1' ? describe : describe.skip
suite('v1 performance acceptance', () => {
  it('measures 1,000 topics, 100 groups and a 50-message page', async () => {
    const prefix = `lens-bench-${Date.now()}`
    const topics = Array.from({ length: 1000 }, (_, i) => `${prefix}-${i}`)
    const subject = prefix + '-value'
    const groups = Array.from({ length: 100 }, (_, i) => `${prefix}-group-${i}`)
    const kafka = new Kafka({ brokers: ['127.0.0.1:19092'], logLevel: logLevel.NOTHING })
    const admin = kafka.admin()
    const producer = kafka.producer()
    const service = new KafkaService()
    await admin.connect()
    await producer.connect()
    const measurements: Record<string, number> = {}
    try {
      await admin.createTopics({
        timeout: 120000,
        topics: topics.map((topic) => ({ topic, numPartitions: 1, replicationFactor: 1 }))
      })
      await producer.send({
        topic: topics[0],
        messages: Array.from({ length: 50 }, (_, i) => ({ value: JSON.stringify({ i }) }))
      })
      for (let i = 0; i < groups.length; i += 10)
        await Promise.all(
          groups.slice(i, i + 10).map((groupId) =>
            admin.setOffsets({
              groupId,
              topic: topics[0],
              partitions: [{ partition: 0, offset: '0' }]
            })
          )
        )
      await service.connect('bench', { bootstrapServers: '127.0.0.1:19092', authMethod: 'none' })
      let start = performance.now()
      const listed = await service.listTopics('bench')
      measurements.topicsMs = performance.now() - start
      expect(listed.filter((t) => t.name.startsWith(prefix))).toHaveLength(1000)
      start = performance.now()
      const listedGroups = await service.listConsumerGroups('bench')
      measurements.groupsMs = performance.now() - start
      expect(listedGroups.filter((g) => g.groupId.startsWith(prefix))).toHaveLength(100)
      start = performance.now()
      const page = await service.fetchMessages('bench', {
        topic: topics[0],
        offset: 'earliest',
        limit: 50
      })
      measurements.messagesMs = performance.now() - start
      expect(page).toHaveLength(50)
      schemaService.configure('bench', { url: 'http://127.0.0.1:18081' })
      const definition = {
        type: 'record',
        name: 'BenchmarkMessage',
        fields: [{ name: 'id', type: 'int' }]
      }
      const schema = await schemaService.registerSchema(
        'bench',
        subject,
        JSON.stringify(definition),
        'AVRO'
      )
      const header = Buffer.alloc(5)
      header.writeUInt32BE(schema.id, 1)
      const encoded = Buffer.concat([header, avro.Type.forSchema(definition).toBuffer({ id: 42 })])
      const decoder = new PayloadService()
      start = performance.now()
      const decoded = await decoder.decode('bench', encoded)
      measurements.avroColdMs = performance.now() - start
      expect(JSON.parse(decoded.value)).toEqual({ id: 42 })
      start = performance.now()
      for (let i = 0; i < 100; i++) await decoder.decode('bench', encoded)
      measurements.avroCachedMs = (performance.now() - start) / 100
      mkdirSync('output', { recursive: true })
      writeFileSync('output/performance.json', JSON.stringify(measurements, null, 2))
      console.log(JSON.stringify(measurements))
      expect(measurements.topicsMs).toBeLessThan(2000)
      expect(measurements.groupsMs).toBeLessThan(3000)
      expect(measurements.messagesMs).toBeLessThan(1000)
      expect(measurements.avroColdMs).toBeLessThan(200)
      expect(measurements.avroCachedMs).toBeLessThan(200)
    } finally {
      await service.disconnectAll()
      await producer.disconnect()
      await admin.deleteGroups(groups).catch(() => {})
      await admin.deleteTopics({ topics, timeout: 120000 }).catch(() => {})
      await fetch(`http://127.0.0.1:18081/subjects/${subject}`, { method: 'DELETE' }).catch(
        () => {}
      )
      await admin.disconnect()
    }
  }, 300000)
})
