import { create } from 'zustand'
import { useUIStore } from './uiStore'
import type {
  Topic,
  ConsumerGroup,
  Broker,
  SchemaSubject,
  KafkaMessage,
  ConsumerGroupOffset,
  FetchOptions,
  ProduceOptions,
  CreateTopicOptions,
  OffsetSpec,
  IpcResult,
  LagSample
} from '@/types'
interface DataStore {
  clusterId: string | null
  topics: Topic[]
  consumerGroups: ConsumerGroup[]
  brokers: Broker[]
  schemaSubjects: SchemaSubject[]
  messageNextOffsets: Record<string, Record<number, string>>
  messages: Record<string, KafkaMessage[]>
  consumerGroupOffsets: Record<string, ConsumerGroupOffset[]>
  favorites: Set<string>
  lagHistory: Record<string, LagSample[]>
  lastRefresh: number | null
  topicsLoading: boolean
  consumerGroupsLoading: boolean
  brokersLoading: boolean
  topicsLoaded: boolean
  consumerGroupsLoaded: boolean
  brokersLoaded: boolean
  topicsError: string | null
  consumerGroupsError: string | null
  brokersError: string | null
  schemasLoading: boolean
  messagesLoading: boolean
  activateCluster(id: string | null): void
  cancelMessages(topic: string): void
  fetchTopics(id: string): Promise<void>
  fetchConsumerGroups(id: string): Promise<void>
  fetchBrokers(id: string): Promise<void>
  fetchSchemaSubjects(id: string): Promise<void>
  fetchMessages(
    id: string,
    topic: string,
    opts: Omit<FetchOptions, 'topic'> & { append?: boolean }
  ): Promise<KafkaMessage[]>
  fetchConsumerGroupOffsets(id: string, group: string): Promise<void>
  createTopic(id: string, opts: CreateTopicOptions): Promise<boolean>
  deleteTopic(id: string, topic: string): Promise<boolean>
  produceMessage(id: string, opts: ProduceOptions): Promise<boolean>
  resetOffsets(id: string, group: string, topic: string, spec: OffsetSpec): Promise<boolean>
  deleteConsumerGroup(id: string, group: string): Promise<boolean>
  loadFavorites(id: string): Promise<void>
  toggleFavorite(id: string, topic: string): Promise<void>
  clearAll(): void
}
const empty = {
  topics: [],
  consumerGroups: [],
  brokers: [],
  schemaSubjects: [],
  messages: {},
  messageNextOffsets: {},
  consumerGroupOffsets: {},
  favorites: new Set<string>(),
  lagHistory: {},
  lastRefresh: null,
  topicsLoading: false,
  consumerGroupsLoading: false,
  brokersLoading: false,
  topicsLoaded: false,
  consumerGroupsLoaded: false,
  brokersLoaded: false,
  topicsError: null,
  consumerGroupsError: null,
  brokersError: null,
  schemasLoading: false,
  messagesLoading: false
}
let generation = 0
const pending = new Map<string, string>()
const sharedReads = new Map<string, Promise<void>>()
function shareRead(id: string, resource: string, read: () => Promise<void>): Promise<void> {
  if (useDataStore.getState().clusterId !== id) return Promise.resolve()
  const key = `${generation}:${id}:${resource}`
  const existing = sharedReads.get(key)
  if (existing) return existing
  const request = read().finally(() => {
    if (sharedReads.get(key) === request) sharedReads.delete(key)
  })
  sharedReads.set(key, request)
  return request
}
function unwrap<T>(response: IpcResult<T>): T {
  if (!response.success) throw new Error(response.error ?? 'Could not load data. Try refreshing.')
  return response.data as T
}
function report(error: unknown): void {
  if (error instanceof Error && /cancelled/.test(error.message)) return
  useUIStore
    .getState()
    .addNotification(
      'error',
      error instanceof Error ? error.message : 'Operation failed. Try again.'
    )
}
export const useDataStore = create<DataStore>((set, get) => ({
  ...empty,
  clusterId: null,
  activateCluster: (id) => {
    generation++
    for (const request of pending.values()) void window.api.messages.cancel(request)
    pending.clear()
    sharedReads.clear()
    set({ ...empty, favorites: new Set(), clusterId: id })
  },
  cancelMessages: (topic) => {
    const request = pending.get(topic)
    if (request) void window.api.messages.cancel(request)
    pending.delete(topic)
    set({ messagesLoading: pending.size > 0 })
  },
  fetchTopics: (id) =>
    shareRead(id, 'topics', async () => {
      const version = generation
      set({ topicsLoading: true, topicsError: null })
      try {
        const data = unwrap(await window.api.topics.list(id))
        if (get().clusterId === id && generation === version)
          set({ topics: data, topicsLoaded: true, lastRefresh: Date.now() })
      } catch (e) {
        if (generation === version) {
          set({ topicsError: e instanceof Error ? e.message : 'Could not load topics.' })
          report(e)
        }
      } finally {
        if (generation === version) set({ topicsLoading: false })
      }
    }),
  fetchConsumerGroups: (id) =>
    shareRead(id, 'consumer-groups', async () => {
      const version = generation
      set({ consumerGroupsLoading: true, consumerGroupsError: null })
      try {
        const data = unwrap(await window.api.consumerGroups.list(id))
        if (get().clusterId === id && generation === version) {
          const history = { ...get().lagHistory }
          for (const group of data.filter((g) => !g.lagError))
            history[group.groupId] = [
              ...(history[group.groupId] ?? []),
              { at: Date.now(), lag: group.totalLag }
            ].slice(-360)
          set({
            consumerGroups: data,
            consumerGroupsLoaded: true,
            lagHistory: history,
            lastRefresh: Date.now()
          })
        }
      } catch (e) {
        if (generation === version) {
          set({
            consumerGroupsError: e instanceof Error ? e.message : 'Could not load consumer groups.'
          })
          report(e)
        }
      } finally {
        if (generation === version) set({ consumerGroupsLoading: false })
      }
    }),
  fetchBrokers: (id) =>
    shareRead(id, 'brokers', async () => {
      const version = generation
      set({ brokersLoading: true, brokersError: null })
      try {
        const data = unwrap(await window.api.brokers.list(id))
        if (get().clusterId === id && generation === version)
          set({ brokers: data, brokersLoaded: true, lastRefresh: Date.now() })
      } catch (e) {
        if (generation === version) {
          set({ brokersError: e instanceof Error ? e.message : 'Could not load brokers.' })
          report(e)
        }
      } finally {
        if (generation === version) set({ brokersLoading: false })
      }
    }),
  fetchSchemaSubjects: (id) =>
    shareRead(id, 'schemas', async () => {
      const version = generation
      set({ schemasLoading: true })
      try {
        const data = unwrap(await window.api.schema.subjects(id))
        if (get().clusterId === id && generation === version)
          set({ schemaSubjects: data, lastRefresh: Date.now() })
      } catch (e) {
        if (generation === version) report(e)
      } finally {
        if (generation === version) set({ schemasLoading: false })
      }
    }),
  fetchMessages: async (id, topic, opts) => {
    const version = generation
    const { append, ...options } = opts
    const requestId = crypto.randomUUID()
    const old = pending.get(topic)
    if (old) void window.api.messages.cancel(old)
    pending.set(topic, requestId)
    set({ messagesLoading: true })
    try {
      const page = unwrap(await window.api.messages.page(id, { topic, ...options, requestId }))
      const data = page.messages
      if (get().clusterId === id && version === generation && pending.get(topic) === requestId) {
        let messages = data
        if (append) {
          const unique = new Map(
            [...(get().messages[topic] ?? []), ...data].map((m) => [
              `${m.partition}:${m.offset}`,
              m
            ])
          )
          messages = [...unique.values()]
            .sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
            .slice(-2000)
        }
        set((s) => ({
          messages: { ...s.messages, [topic]: messages },
          messageNextOffsets: { ...s.messageNextOffsets, [topic]: page.nextOffsets },
          lastRefresh: Date.now()
        }))
        return data
      }
      return []
    } catch (e) {
      if (generation === version && pending.get(topic) === requestId) report(e)
      return []
    } finally {
      if (pending.get(topic) === requestId) {
        pending.delete(topic)
        set({ messagesLoading: pending.size > 0 })
      }
    }
  },
  fetchConsumerGroupOffsets: async (id, group) => {
    const version = generation
    try {
      const data = unwrap(await window.api.consumerGroups.offsets(id, group))
      if (get().clusterId === id && version === generation)
        set((s) => ({
          consumerGroupOffsets: { ...s.consumerGroupOffsets, [group]: data },
          lastRefresh: Date.now()
        }))
    } catch (e) {
      if (version === generation) report(e)
    }
  },
  createTopic: async (id, opts) => {
    try {
      unwrap(await window.api.topics.create(id, opts))
      await get().fetchTopics(id)
      return true
    } catch (e) {
      report(e)
      return false
    }
  },
  deleteTopic: async (id, topic) => {
    try {
      unwrap(await window.api.topics.delete(id, topic))
      await get().fetchTopics(id)
      return true
    } catch (e) {
      report(e)
      return false
    }
  },
  produceMessage: async (id, opts) => {
    try {
      unwrap(await window.api.messages.produce(id, opts))
      return true
    } catch (e) {
      report(e)
      return false
    }
  },
  resetOffsets: async (id, group, topic, spec) => {
    try {
      unwrap(await window.api.consumerGroups.resetOffsets(id, group, topic, spec))
      await get().fetchConsumerGroupOffsets(id, group)
      await get().fetchConsumerGroups(id)
      return true
    } catch (e) {
      report(e)
      return false
    }
  },
  deleteConsumerGroup: async (id, group) => {
    try {
      unwrap(await window.api.consumerGroups.delete(id, group))
      await get().fetchConsumerGroups(id)
      return true
    } catch (e) {
      report(e)
      return false
    }
  },
  loadFavorites: async (id) => {
    const version = generation
    try {
      const data = unwrap(await window.api.favorites.list(id))
      if (get().clusterId === id && generation === version) set({ favorites: new Set(data) })
    } catch (e) {
      report(e)
    }
  },
  toggleFavorite: async (id, topic) => {
    const original = get().favorites
    const next = new Set(original)
    const had = next.has(topic)
    if (had) next.delete(topic)
    else next.add(topic)
    set({ favorites: next })
    try {
      unwrap(
        await (had ? window.api.favorites.remove(id, topic) : window.api.favorites.add(id, topic))
      )
    } catch (e) {
      if (get().clusterId === id) set({ favorites: original })
      report(e)
    }
  },
  clearAll: () => get().activateCluster(null)
}))
