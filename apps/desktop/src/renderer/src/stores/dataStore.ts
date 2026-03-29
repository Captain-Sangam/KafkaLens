import { create } from 'zustand'
import type {
  Topic,
  ConsumerGroup,
  Broker,
  SchemaSubject,
  KafkaMessage,
  ConsumerGroupOffset,
  PayloadFormat
} from '@/types'

interface FetchOpts {
  partition?: number
  offset?: string
  limit?: number
  keyFilter?: string
  keyFilterType?: 'exact' | 'regex'
  valueFilter?: string
  valueFilterType?: 'substring' | 'jsonpath'
  timestampStart?: string
  timestampEnd?: string
}

interface CreateTopicOpts {
  name: string
  partitions: number
  replicationFactor: number
  configs?: Record<string, string>
}

interface ProduceOpts {
  topic: string
  key?: string | null
  value: string
  partition?: number
  headers?: Record<string, string>
  keyFormat?: PayloadFormat
  valueFormat?: PayloadFormat
}

interface OffsetSpec {
  type: 'earliest' | 'latest' | 'to-offset' | 'by-duration' | 'to-timestamp'
  value?: string | number
}

interface DataStore {
  topics: Topic[]
  consumerGroups: ConsumerGroup[]
  brokers: Broker[]
  schemaSubjects: SchemaSubject[]
  messages: Record<string, KafkaMessage[]>
  consumerGroupOffsets: Record<string, ConsumerGroupOffset[]>
  favorites: Set<string>

  topicsLoading: boolean
  consumerGroupsLoading: boolean
  brokersLoading: boolean
  schemasLoading: boolean
  messagesLoading: boolean

  fetchTopics: (clusterId: string) => Promise<void>
  fetchConsumerGroups: (clusterId: string) => Promise<void>
  fetchBrokers: (clusterId: string) => Promise<void>
  fetchSchemaSubjects: (clusterId: string) => Promise<void>
  fetchMessages: (clusterId: string, topic: string, opts: FetchOpts) => Promise<void>
  fetchConsumerGroupOffsets: (clusterId: string, groupId: string) => Promise<void>

  createTopic: (clusterId: string, opts: CreateTopicOpts) => Promise<boolean>
  deleteTopic: (clusterId: string, topic: string) => Promise<boolean>
  produceMessage: (clusterId: string, opts: ProduceOpts) => Promise<boolean>
  resetOffsets: (clusterId: string, groupId: string, topic: string, spec: OffsetSpec) => Promise<boolean>
  deleteConsumerGroup: (clusterId: string, groupId: string) => Promise<boolean>

  loadFavorites: (clusterId: string) => Promise<void>
  toggleFavorite: (clusterId: string, topicName: string) => Promise<void>

  clearAll: () => void
}

export const useDataStore = create<DataStore>((set, get) => ({
  topics: [],
  consumerGroups: [],
  brokers: [],
  schemaSubjects: [],
  messages: {},
  consumerGroupOffsets: {},
  favorites: new Set<string>(),

  topicsLoading: false,
  consumerGroupsLoading: false,
  brokersLoading: false,
  schemasLoading: false,
  messagesLoading: false,

  fetchTopics: async (clusterId) => {
    set({ topicsLoading: true })
    try {
      const res = await window.api.topics.list(clusterId)
      if (res.success && res.data) {
        set({ topics: res.data })
      }
    } catch {
      // keep existing state
    } finally {
      set({ topicsLoading: false })
    }
  },

  fetchConsumerGroups: async (clusterId) => {
    set({ consumerGroupsLoading: true })
    try {
      const res = await window.api.consumerGroups.list(clusterId)
      if (res.success && res.data) {
        set({ consumerGroups: res.data })
      }
    } catch {
      // keep existing state
    } finally {
      set({ consumerGroupsLoading: false })
    }
  },

  fetchBrokers: async (clusterId) => {
    set({ brokersLoading: true })
    try {
      const res = await window.api.brokers.list(clusterId)
      if (res.success && res.data) {
        set({ brokers: res.data })
      }
    } catch {
      // keep existing state
    } finally {
      set({ brokersLoading: false })
    }
  },

  fetchSchemaSubjects: async (clusterId) => {
    set({ schemasLoading: true })
    try {
      const res = await window.api.schema.subjects(clusterId)
      if (res.success && res.data) {
        const names: string[] = res.data as unknown as string[]
        const subjects: SchemaSubject[] = names.map((name) => ({
          subject: typeof name === 'string' ? name : (name as unknown as SchemaSubject).subject,
          versions: (name as unknown as SchemaSubject).versions ?? [],
          latestVersion: (name as unknown as SchemaSubject).latestVersion ?? 0,
          compatibility: (name as unknown as SchemaSubject).compatibility ?? 'BACKWARD',
          schemaType: (name as unknown as SchemaSubject).schemaType ?? 'AVRO'
        }))
        set({ schemaSubjects: subjects })
      }
    } catch {
      // keep existing state
    } finally {
      set({ schemasLoading: false })
    }
  },

  fetchMessages: async (clusterId, topic, opts) => {
    set({ messagesLoading: true })
    try {
      const res = await window.api.messages.fetch(clusterId, { topic, ...opts })
      if (res.success && res.data) {
        set((s) => ({ messages: { ...s.messages, [topic]: res.data! } }))
      }
    } catch {
      // keep existing state
    } finally {
      set({ messagesLoading: false })
    }
  },

  fetchConsumerGroupOffsets: async (clusterId, groupId) => {
    try {
      const res = await window.api.consumerGroups.offsets(clusterId, groupId)
      if (res.success && res.data) {
        set((s) => ({ consumerGroupOffsets: { ...s.consumerGroupOffsets, [groupId]: res.data! } }))
      }
    } catch {
      // keep existing state
    }
  },

  createTopic: async (clusterId, opts) => {
    try {
      const res = await window.api.topics.create(clusterId, opts)
      if (res.success) {
        await get().fetchTopics(clusterId)
        return true
      }
      return false
    } catch {
      return false
    }
  },

  deleteTopic: async (clusterId, topic) => {
    try {
      const res = await window.api.topics.delete(clusterId, topic)
      if (res.success) {
        await get().fetchTopics(clusterId)
        return true
      }
      return false
    } catch {
      return false
    }
  },

  produceMessage: async (clusterId, opts) => {
    try {
      const res = await window.api.messages.produce(clusterId, opts)
      return res.success
    } catch {
      return false
    }
  },

  resetOffsets: async (clusterId, groupId, topic, spec) => {
    try {
      const res = await window.api.consumerGroups.resetOffsets(clusterId, groupId, topic, spec)
      if (res.success) {
        await get().fetchConsumerGroupOffsets(clusterId, groupId)
        return true
      }
      return false
    } catch {
      return false
    }
  },

  deleteConsumerGroup: async (clusterId, groupId) => {
    try {
      const res = await window.api.consumerGroups.delete(clusterId, groupId)
      if (res.success) {
        await get().fetchConsumerGroups(clusterId)
        return true
      }
      return false
    } catch {
      return false
    }
  },

  loadFavorites: async (clusterId) => {
    try {
      const res = await window.api.favorites.list(clusterId)
      if (res.success && res.data) {
        set({ favorites: new Set(res.data) })
      }
    } catch {
      // favorites unavailable
    }
  },

  toggleFavorite: async (clusterId, topicName) => {
    const { favorites } = get()
    const next = new Set(favorites)
    const wasFavorite = next.has(topicName)

    if (wasFavorite) {
      next.delete(topicName)
    } else {
      next.add(topicName)
    }
    set({ favorites: next })

    try {
      if (wasFavorite) {
        await window.api.favorites.remove(clusterId, topicName)
      } else {
        await window.api.favorites.add(clusterId, topicName)
      }
    } catch {
      set({ favorites })
    }
  },

  clearAll: () =>
    set({
      topics: [],
      consumerGroups: [],
      brokers: [],
      schemaSubjects: [],
      messages: {},
      consumerGroupOffsets: {},
      favorites: new Set<string>()
    })
}))
