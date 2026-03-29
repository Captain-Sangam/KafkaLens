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
import { useClusterStore } from './clusterStore'
import {
  MOCK_TOPICS,
  MOCK_CONSUMER_GROUPS,
  MOCK_BROKERS,
  MOCK_SCHEMA_SUBJECTS,
  generateMockMessages,
  generateConsumerGroupOffsets
} from '@/lib/mock-data'

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

function isDemoMode(): boolean {
  return useClusterStore.getState().demoMode
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
      if (isDemoMode()) {
        await new Promise((r) => setTimeout(r, 300))
        set({ topics: MOCK_TOPICS })
        return
      }
      const res = await window.api.topics.list(clusterId)
      if (res.success && res.data) {
        set({ topics: res.data })
      }
    } catch {
      if (isDemoMode()) set({ topics: MOCK_TOPICS })
    } finally {
      set({ topicsLoading: false })
    }
  },

  fetchConsumerGroups: async (clusterId) => {
    set({ consumerGroupsLoading: true })
    try {
      if (isDemoMode()) {
        await new Promise((r) => setTimeout(r, 250))
        set({ consumerGroups: MOCK_CONSUMER_GROUPS })
        return
      }
      const res = await window.api.consumerGroups.list(clusterId)
      if (res.success && res.data) {
        set({ consumerGroups: res.data })
      }
    } catch {
      if (isDemoMode()) set({ consumerGroups: MOCK_CONSUMER_GROUPS })
    } finally {
      set({ consumerGroupsLoading: false })
    }
  },

  fetchBrokers: async (clusterId) => {
    set({ brokersLoading: true })
    try {
      if (isDemoMode()) {
        await new Promise((r) => setTimeout(r, 200))
        set({ brokers: MOCK_BROKERS })
        return
      }
      const res = await window.api.brokers.list(clusterId)
      if (res.success && res.data) {
        set({ brokers: res.data })
      }
    } catch {
      if (isDemoMode()) set({ brokers: MOCK_BROKERS })
    } finally {
      set({ brokersLoading: false })
    }
  },

  fetchSchemaSubjects: async (clusterId) => {
    set({ schemasLoading: true })
    try {
      if (isDemoMode()) {
        await new Promise((r) => setTimeout(r, 250))
        set({ schemaSubjects: MOCK_SCHEMA_SUBJECTS })
        return
      }
      const res = await window.api.schema.subjects(clusterId)
      if (res.success && res.data) {
        set({ schemaSubjects: res.data })
      }
    } catch {
      if (isDemoMode()) set({ schemaSubjects: MOCK_SCHEMA_SUBJECTS })
    } finally {
      set({ schemasLoading: false })
    }
  },

  fetchMessages: async (clusterId, topic, opts) => {
    set({ messagesLoading: true })
    try {
      if (isDemoMode()) {
        await new Promise((r) => setTimeout(r, 400))
        const mockMessages = generateMockMessages(topic, opts.limit ?? 50)
        set((s) => ({ messages: { ...s.messages, [topic]: mockMessages } }))
        return
      }
      const res = await window.api.messages.fetch(clusterId, topic, opts)
      if (res.success && res.data) {
        set((s) => ({ messages: { ...s.messages, [topic]: res.data! } }))
      }
    } catch {
      if (isDemoMode()) {
        const mockMessages = generateMockMessages(topic, opts.limit ?? 50)
        set((s) => ({ messages: { ...s.messages, [topic]: mockMessages } }))
      }
    } finally {
      set({ messagesLoading: false })
    }
  },

  fetchConsumerGroupOffsets: async (clusterId, groupId) => {
    try {
      if (isDemoMode()) {
        const offsets = generateConsumerGroupOffsets(groupId)
        set((s) => ({ consumerGroupOffsets: { ...s.consumerGroupOffsets, [groupId]: offsets } }))
        return
      }
      const res = await window.api.consumerGroups.offsets(clusterId, groupId)
      if (res.success && res.data) {
        set((s) => ({ consumerGroupOffsets: { ...s.consumerGroupOffsets, [groupId]: res.data! } }))
      }
    } catch {
      if (isDemoMode()) {
        const offsets = generateConsumerGroupOffsets(groupId)
        set((s) => ({ consumerGroupOffsets: { ...s.consumerGroupOffsets, [groupId]: offsets } }))
      }
    }
  },

  createTopic: async (clusterId, opts) => {
    if (isDemoMode()) {
      const newTopic: Topic = {
        name: opts.name,
        partitions: opts.partitions,
        replicationFactor: opts.replicationFactor,
        messageCount: 0,
        retentionMs: 604800000,
        retentionBytes: -1,
        cleanupPolicy: 'delete',
        isInternal: false,
        isDLQ: false,
        configs: opts.configs ?? {},
        underReplicatedPartitions: 0,
        createdAt: Date.now()
      }
      set((s) => ({ topics: [...s.topics, newTopic] }))
      return true
    }

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
    if (isDemoMode()) {
      set((s) => ({ topics: s.topics.filter((t) => t.name !== topic) }))
      return true
    }

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
    if (isDemoMode()) return true

    try {
      const res = await window.api.messages.produce(clusterId, opts)
      return res.success
    } catch {
      return false
    }
  },

  resetOffsets: async (clusterId, groupId, topic, spec) => {
    if (isDemoMode()) return true

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
    if (isDemoMode()) {
      set((s) => ({
        consumerGroups: s.consumerGroups.filter((g) => g.groupId !== groupId)
      }))
      return true
    }

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
    if (isDemoMode()) return

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

    if (isDemoMode()) return

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
