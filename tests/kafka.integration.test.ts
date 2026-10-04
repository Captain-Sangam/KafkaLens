import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest'
import { Kafka, logLevel } from 'kafkajs'
vi.mock('../apps/desktop/src/main/services/store-service', () => ({
  storeService: { getSetting: () => undefined }
}))
import { KafkaService } from '../apps/desktop/src/main/services/kafka-service'
import { schemaService } from '../apps/desktop/src/main/services/schema-service'
import { payloadService } from '../apps/desktop/src/main/services/payload-service'
const enabled = process.env.KAFKALENS_INTEGRATION === '1'
const suite = enabled ? describe : describe.skip
suite('Kafka and Registry integration', () => {
  const service = new KafkaService()
  const id = 'integration'
  const timestamp = Date.now() - 20000
  const prefix = `lens-test-${Date.now()}`
  const topic = prefix
  const group = prefix + '-group'
  const subject = prefix + '-value'
  const refSubject = prefix + '-referenced'
  const client = new Kafka({ brokers: ['127.0.0.1:19092'], logLevel: logLevel.NOTHING })
  const admin = client.admin()
  const producer = client.producer()
  beforeAll(async () => {
    await admin.connect()
    await producer.connect()
    expect(
      (await service.connect(id, { bootstrapServers: '127.0.0.1:19092', authMethod: 'none' }))
        .success
    ).toBe(true)
    schemaService.configure(id, { url: 'http://127.0.0.1:18081' })
    await service.createTopic(id, { name: topic, partitions: 2, replicationFactor: 1 })
    await producer.send({
      topic,
      messages: Array.from({ length: 12 }, (_, i) => ({
        partition: i % 2,
        key: `key-${i}`,
        value: JSON.stringify({ i, order: { id: i } }),
        timestamp: String(timestamp + i * 1000)
      }))
    })
    await admin.setOffsets({
      groupId: group,
      topic,
      partitions: [
        { partition: 0, offset: '1' },
        { partition: 1, offset: '2' }
      ]
    })
  })
  afterAll(async () => {
    await service.disconnectAll()
    await producer.disconnect()
    await admin.deleteGroups([group]).catch(() => {})
    await admin.deleteTopics({ topics: [topic] }).catch(() => {})
    await fetch(`http://127.0.0.1:18081/subjects/${refSubject}`, { method: 'DELETE' }).catch(
      () => {}
    )
    await fetch(`http://127.0.0.1:18081/subjects/${subject}`, { method: 'DELETE' }).catch(() => {})
    await admin.disconnect()
  })
  it('creates canonical topic options and reports partition offsets', async () => {
    const parts = await service.getPartitions(id, topic)
    expect(parts).toHaveLength(2)
    expect(parts.map((p) => p.logEndOffset)).toEqual([6, 6])
    const topics = await service.listTopics(id)
    expect(topics.find((t) => t.name === topic)?.messageCount).toBe(12)
    expect(Object.keys(await service.describeClusterConfig(id)).length).toBeGreaterThan(0)
  })
  it('reads exact offsets without committing or leaving temporary groups', async () => {
    const rows = await service.fetchMessages(id, { topic, partition: 0, offset: '1', limit: 2 })
    expect(rows.map((m) => m.offset)).toEqual(['1', '2'])
    expect(rows.map((m) => JSON.parse(m.value).i)).toEqual([2, 4])
    expect((await admin.listGroups()).groups.some((g) => g.groupId.startsWith('kafkalens-'))).toBe(
      false
    )
  })
  it('seeks timestamps and applies decoded key and JSONPath filters', async () => {
    const rows = await service.fetchMessages(id, {
      topic,
      timestamp: timestamp + 5000,
      limit: 10,
      keyFilter: 'key-[68]$',
      keyFilterType: 'regex',
      valueFilter: '$.order.id',
      valueFilterType: 'jsonpath'
    })
    expect(rows.map((m) => JSON.parse(m.value).i)).toEqual([6, 8])
  })
  it('advances filtered pages with no matches and preserves omitted partition cursors', async () => {
    const empty = await service.fetchMessagePage(id, {
      topic,
      offset: 'earliest',
      keyFilter: 'missing',
      limit: 2
    })
    expect(empty.messages).toEqual([])
    expect(empty.nextOffsets).toEqual({ 0: '6', 1: '6' })
    const first = await service.fetchMessagePage(id, { topic, offset: 'earliest', limit: 2 })
    const second = await service.fetchMessagePage(id, {
      topic,
      offsets: first.nextOffsets,
      limit: 2
    })
    expect(first.messages.map((m) => JSON.parse(m.value).i)).toEqual([0, 1])
    expect(second.messages.map((m) => JSON.parse(m.value).i)).toEqual([2, 3])
  })
  it('reads backward pages', async () => {
    const rows = await service.fetchMessages(id, {
      topic,
      partition: 0,
      offset: '4',
      direction: 'backward',
      limit: 2
    })
    expect(rows.map((m) => m.offset)).toEqual(['2', '3'])
  })
  it('includes inactive group topics, calculates lag, and resets explicit/timestamp offsets', async () => {
    const groups = await service.listConsumerGroups(id)
    const found = groups.find((g) => g.groupId === group)
    expect(found?.topics).toEqual([topic])
    expect(found?.totalLag).toBe(9)
    await service.resetConsumerGroupOffsets(id, group, topic, { type: 'to-offset', value: '3' })
    expect((await service.getConsumerGroupOffsets(id, group)).map((o) => o.currentOffset)).toEqual([
      3, 3
    ])
    await service.resetConsumerGroupOffsets(id, group, topic, {
      type: 'to-timestamp',
      value: 1900000000000
    })
    expect((await service.getConsumerGroupOffsets(id, group)).map((o) => o.currentOffset)).toEqual([
      6, 6
    ])
    await expect(
      service.resetConsumerGroupOffsets(id, group, topic, { type: 'to-offset', value: '999' })
    ).rejects.toThrow('retained range')
  })
  it('loads actual schema metadata and round-trips Avro with cache', async () => {
    const schema = JSON.stringify({
      type: 'record',
      name: 'Order',
      fields: [{ name: 'id', type: 'int' }]
    })
    const result = await schemaService.registerSchema(id, subject, schema, 'AVRO')
    const encoded = await payloadService.encode(id, '{"id":42}', 'avro', result.id)
    await service.produceMessage(id, {
      topic,
      partition: 0,
      key: 'avro',
      value: '{"id":42}',
      valueFormat: 'avro',
      schemaId: result.id
    })
    const decoded = await payloadService.decode(id, encoded)
    expect(decoded.format).toBe('avro')
    expect(JSON.parse(decoded.value)).toEqual({ id: 42 })
    const subjects = await schemaService.listSubjects(id)
    const metadata = subjects.find((s) => s.subject === subject)
    expect(metadata?.versions).toEqual([1])
    expect(metadata?.latestVersion).toBe(1)
    expect(metadata?.compatibility).toBe('BACKWARD')
    expect(
      (
        await schemaService.checkCompatibility(
          id,
          subject,
          JSON.stringify({
            type: 'record',
            name: 'Order',
            fields: [{ name: 'changed', type: 'int' }]
          }),
          'AVRO'
        )
      ).is_compatible
    ).toBe(false)
  })

  it('blocks deleting referenced versions and allows unreferenced deletion', async () => {
    const schema = 'syntax="proto3"; package ref; message Base { string value=1; }'
    const base = await schemaService.registerSchema(id, refSubject, schema, 'PROTOBUF')
    const parent = await fetch(`http://127.0.0.1:18081/subjects/${refSubject}-parent/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/vnd.schemaregistry.v1+json' },
      body: JSON.stringify({
        schema:
          'syntax="proto3"; package ref; import "base.proto"; message Parent { Base base=1; }',
        schemaType: 'PROTOBUF',
        references: [{ name: 'base.proto', subject: refSubject, version: 1 }]
      })
    })
    expect(parent.ok).toBe(true)
    try {
      await expect(schemaService.deleteSchemaVersion(id, refSubject, 1)).rejects.toThrow(
        'referenced'
      )
    } finally {
      await fetch(`http://127.0.0.1:18081/subjects/${refSubject}-parent`, { method: 'DELETE' })
    }
    await schemaService.deleteSchemaVersion(id, refSubject, 1)
    expect(base.id).toBeGreaterThan(0)
  })
  it('preserves binary payload, key and headers in replay', async () => {
    const header = Buffer.alloc(4)
    header.writeInt32BE(1)
    await producer.send({
      topic,
      messages: [
        {
          partition: 1,
          key: Buffer.from([255, 1]),
          value: Buffer.from([1, 2, 3]),
          headers: { 'kafka_dlt-original-partition': header, 'x-opaque': Buffer.from([0, 255]) }
        }
      ]
    })
    const rows = await service.fetchMessages(id, { topic, partition: 1, offset: '6', limit: 1 })
    expect(rows[0].headers['kafka_dlt-original-partition']).toBe('1')
    expect(rows[0].rawHeaders?.['x-opaque']).toEqual(['AP8='])
    await service.produceMessage(id, {
      topic,
      partition: 1,
      key: rows[0].key,
      value: rows[0].value,
      rawKey: rows[0].rawKey,
      rawValue: rows[0].rawValue,
      rawHeaders: rows[0].rawHeaders
    })
    const copy = (
      await service.fetchMessages(id, { topic, partition: 1, offset: '7', limit: 1 })
    )[0]
    expect(copy.rawKey).toBe(rows[0].rawKey)
    expect(copy.rawValue).toBe(rows[0].rawValue)
    expect(copy.rawHeaders).toEqual(rows[0].rawHeaders)
  })
  it('preserves tombstones on replay', async () => {
    const before = await admin.fetchTopicOffsets(topic)
    const offset = before.find((p) => p.partition === 0)!.high
    await producer.send({ topic, messages: [{ partition: 0, key: 'deleted', value: null }] })
    const original = (await service.fetchMessages(id, { topic, partition: 0, offset, limit: 1 }))[0]
    expect(original.isTombstone).toBe(true)
    await service.produceMessage(id, {
      topic,
      partition: 0,
      key: original.key,
      value: original.value,
      tombstone: original.isTombstone
    })
    const copied = (
      await service.fetchMessages(id, {
        topic,
        partition: 0,
        offset: (BigInt(offset) + 1n).toString(),
        limit: 1
      })
    )[0]
    expect(copied.isTombstone).toBe(true)
  })
  it('changes one topic config without resetting other overrides', async () => {
    await service.alterTopicConfig(id, topic, {
      'retention.ms': '86400000',
      'max.message.bytes': '1048576'
    })
    await service.alterTopicConfig(id, topic, { 'retention.ms': '172800000' })
    const configs = await service.getTopicConfig(id, topic)
    expect(configs['retention.ms']).toBe('172800000')
    expect(configs['max.message.bytes']).toBe('1048576')
  })
})
