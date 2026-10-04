import { describe, it, expect, vi } from 'vitest'
import type { Kafka, Admin } from 'kafkajs'
import { createBulkAdmin } from '../apps/desktop/src/main/lib/bulk-offsets'
describe('batched offset adapter', () => {
  it('uses the existing admin cluster, restores the factory, and calculates retained spans', async () => {
    const symbol = Symbol('private:Kafka:createCluster')
    const cluster = {
      addMultipleTargetTopics: vi.fn().mockResolvedValue(undefined),
      fetchTopicsOffset: vi
        .fn()
        .mockImplementation(async (topics: { topic: string; fromBeginning: boolean }[]) =>
          topics.map((t) => ({
            topic: t.topic,
            partitions: [{ partition: 0, offset: t.fromBeginning ? '4' : '9' }]
          }))
        )
    }
    const factory = vi.fn(() => cluster),
      admin = {} as Admin
    const client = {
      [symbol]: factory,
      admin: () => {
        Reflect.get(client, symbol)({})
        return admin
      }
    }
    const bulk = createBulkAdmin(client as unknown as Kafka)
    expect(client[symbol]).toBe(factory)
    expect(bulk.admin).toBe(admin)
    expect(factory).toHaveBeenCalledOnce()
    expect(
      await bulk.counts!([
        { name: 'a', partitions: [{ partitionId: 0 }] },
        { name: 'b', partitions: [{ partitionId: 0 }] }
      ])
    ).toEqual(
      new Map([
        ['a', 5],
        ['b', 5]
      ])
    )
    expect(cluster.fetchTopicsOffset).toHaveBeenCalledTimes(2)
    expect(cluster.addMultipleTargetTopics).toHaveBeenCalledWith(['a', 'b'])
    expect(await bulk.highOffsets!([{ name: 'a', partitions: [{ partitionId: 0 }] }])).toEqual(
      new Map([['a', new Map([[0, 9]])]])
    )
    expect(cluster.fetchTopicsOffset).toHaveBeenCalledTimes(3)
  })
  it('falls back cleanly when a newer client omits the private factory', () => {
    const admin = {} as Admin
    const client = { admin: vi.fn(() => admin) }
    expect(createBulkAdmin(client as unknown as Kafka)).toEqual({ admin })
    expect(client.admin).toHaveBeenCalledOnce()
  })
  it('restores the client factory even if admin construction fails', () => {
    const symbol = Symbol('private:Kafka:createCluster'),
      factory = () => ({})
    const client = {
      [symbol]: factory,
      admin: () => {
        throw new Error('construction failed')
      }
    }
    expect(() => createBulkAdmin(client as unknown as Kafka)).toThrow('construction failed')
    expect(client[symbol]).toBe(factory)
  })
})
