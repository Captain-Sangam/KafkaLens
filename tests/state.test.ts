import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useDataStore } from '../apps/desktop/src/renderer/src/stores/dataStore'
import type { IpcResult, ConsumerGroup } from '../apps/desktop/src/renderer/src/types'
vi.stubGlobal('window', {
  api: {
    messages: { cancel: vi.fn() },
    topics: { list: vi.fn() },
    consumerGroups: { list: vi.fn() },
    brokers: { list: vi.fn() },
    favorites: { add: vi.fn(), remove: vi.fn() }
  }
})
describe('cluster state isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useDataStore.getState().activateCluster(null)
  })
  it('discards a slow response from the previous cluster', async () => {
    let finish!: (value: unknown) => void
    vi.mocked(window.api.topics.list).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }) as ReturnType<typeof window.api.topics.list>
    )
    useDataStore.getState().activateCluster('first')
    const read = useDataStore.getState().fetchTopics('first')
    useDataStore.getState().activateCluster('second')
    finish({ success: true, data: [{ name: 'wrong-cluster' }] })
    await read
    expect(useDataStore.getState().topics).toEqual([])
    expect(useDataStore.getState().clusterId).toBe('second')
  })
  it('rolls back optimistic favorites on persistence failure', async () => {
    useDataStore.getState().activateCluster('fav')
    vi.mocked(window.api.favorites.add).mockResolvedValue({ success: false, error: 'Store locked' })
    await useDataStore.getState().toggleFavorite('fav', 't')
    expect(useDataStore.getState().favorites.has('t')).toBe(false)
  })
  it('shares pending reads across the dashboard, monitoring, and repeated refreshes', async () => {
    let finish!: (value: IpcResult<ConsumerGroup[]>) => void
    vi.mocked(window.api.consumerGroups.list).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    useDataStore.getState().activateCluster('shared')
    const first = useDataStore.getState().fetchConsumerGroups('shared')
    const second = useDataStore.getState().fetchConsumerGroups('shared')
    expect(first).toBe(second)
    expect(window.api.consumerGroups.list).toHaveBeenCalledTimes(1)
    finish({ success: true, data: [] })
    await Promise.all([first, second])
    expect(useDataStore.getState().consumerGroupsLoaded).toBe(true)
    vi.mocked(window.api.consumerGroups.list).mockResolvedValue({ success: true, data: [] })
    await useDataStore.getState().fetchConsumerGroups('shared')
    expect(window.api.consumerGroups.list).toHaveBeenCalledTimes(2)
  })
  it('retains a successfully loaded empty snapshot during refresh and failure', async () => {
    useDataStore.getState().activateCluster('cached')
    vi.mocked(window.api.consumerGroups.list).mockResolvedValue({ success: true, data: [] })
    await useDataStore.getState().fetchConsumerGroups('cached')
    let finish!: (value: IpcResult<ConsumerGroup[]>) => void
    vi.mocked(window.api.consumerGroups.list).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    const refresh = useDataStore.getState().fetchConsumerGroups('cached')
    expect(useDataStore.getState().consumerGroupsLoaded).toBe(true)
    expect(useDataStore.getState().consumerGroupsLoading).toBe(true)
    finish({ success: false, error: 'Broker unavailable' })
    await refresh
    expect(useDataStore.getState().consumerGroupsLoaded).toBe(true)
    expect(useDataStore.getState().consumerGroupsError).toBe('Broker unavailable')
    expect(useDataStore.getState().consumerGroupsLoading).toBe(false)
  })
  it('does not sample unavailable lag as zero', async () => {
    useDataStore.getState().activateCluster('lag')
    vi.mocked(window.api.consumerGroups.list).mockResolvedValue({
      success: true,
      data: [
        {
          groupId: 'denied',
          state: 'Empty',
          members: 0,
          protocolType: 'consumer',
          topics: ['t'],
          totalLag: 0,
          lagError: 'Access denied'
        }
      ]
    })
    await useDataStore.getState().fetchConsumerGroups('lag')
    expect(useDataStore.getState().lagHistory).toEqual({})
    expect(useDataStore.getState().consumerGroups).toHaveLength(1)
  })
})
