import { describe, it, expect, vi } from 'vitest'
import type { Admin } from 'kafkajs'
vi.mock('../apps/desktop/src/main/services/store-service', () => ({
  storeService: { getSetting: () => undefined }
}))
vi.mock('../apps/desktop/src/main/lib/bulk-offsets', () => ({ createBulkAdmin: vi.fn() }))
import { createBulkAdmin } from '../apps/desktop/src/main/lib/bulk-offsets'
import { KafkaService } from '../apps/desktop/src/main/services/kafka-service'

function fixture(size: number) {
  const groups = Array.from({ length: size }, (_, i) => ({
    groupId: `g-${i}`,
    state: 'Empty',
    protocolType: 'consumer',
    members: []
  }))
  const admin = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    describeCluster: vi.fn().mockResolvedValue({ brokers: [{ nodeId: 0 }] }),
    listGroups: vi.fn().mockResolvedValue({ groups }),
    describeGroups: vi.fn().mockResolvedValue({ groups }),
    fetchOffsets: vi.fn(),
    fetchTopicOffsets: vi.fn()
  }
  return { admin, groups, service: new KafkaService() }
}
describe('consumer group dashboard reads', () => {
  it('overlaps coordinator reads and shares one topic snapshot across twenty groups', async () => {
    const { admin, service } = fixture(20)
    let active = 0,
      maximum = 0
    admin.fetchOffsets.mockImplementation(async ({ groupId }: { groupId: string }) => {
      active++
      maximum = Math.max(maximum, active)
      await new Promise((resolve) => setTimeout(resolve, 2))
      active--
      return [{ topic: 'shared', partitions: [{ partition: 0, offset: groupId.slice(2) }] }]
    })
    const highOffsets = vi.fn().mockResolvedValue(new Map([['shared', new Map([[0, 100]])]]))
    vi.mocked(createBulkAdmin).mockReturnValue({ admin: admin as unknown as Admin, highOffsets })
    await service.connect('remote', { bootstrapServers: 'localhost:19092', authMethod: 'none' })
    const groups = await service.listConsumerGroups('remote')
    expect(groups.map((g) => g.totalLag)).toEqual(Array.from({ length: 20 }, (_, i) => 100 - i))
    expect(maximum).toBeGreaterThan(1)
    expect(maximum).toBeLessThanOrEqual(8)
    expect(highOffsets).toHaveBeenCalledOnce()
    expect(highOffsets).toHaveBeenCalledWith([{ name: 'shared', partitions: [{ partitionId: 0 }] }])
    expect(admin.fetchTopicOffsets).not.toHaveBeenCalled()
    await service.disconnectAll()
  })
  it('preserves unrelated groups when a coordinator or a deleted topic cannot be read', async () => {
    const { admin, service } = fixture(4)
    admin.fetchOffsets.mockImplementation(async ({ groupId }: { groupId: string }) => {
      if (groupId === 'g-3') throw new Error('Coordinator access denied')
      return [
        {
          topic: groupId === 'g-2' ? 'deleted' : 'shared',
          partitions: [{ partition: 0, offset: '5' }]
        }
      ]
    })
    admin.fetchTopicOffsets.mockImplementation(async (topic: string) => {
      if (topic === 'deleted') throw new Error('Unknown topic')
      return [{ partition: 0, high: '20' }]
    })
    vi.mocked(createBulkAdmin).mockReturnValue({
      admin: admin as unknown as Admin,
      highOffsets: vi.fn().mockRejectedValue(new Error('Unknown topic'))
    })
    await service.connect('partial', { bootstrapServers: 'localhost:19092', authMethod: 'none' })
    const groups = await service.listConsumerGroups('partial')
    expect(groups).toHaveLength(4)
    expect(groups.slice(0, 2).map((g) => g.totalLag)).toEqual([15, 15])
    expect(groups.slice(0, 2).every((g) => !g.lagError)).toBe(true)
    expect(groups.slice(2).every((g) => Boolean(g.lagError))).toBe(true)
    expect(admin.fetchTopicOffsets).toHaveBeenCalledTimes(2)
    await expect(service.getConsumerGroupOffsets('partial', 'g-2')).rejects.toThrow(
      'Could not read end offsets'
    )
    await service.disconnectAll()
  })
})
