import { create } from 'zustand'
import type { ClusterConfig, ClusterConnection, ConnectionStatus } from '@/types'

interface ClusterStore {
  clusters: ClusterConfig[]
  connections: Record<string, ClusterConnection>
  activeClusterId: string | null
  isLoading: boolean

  loadClusters: () => Promise<void>
  addCluster: (config: ClusterConfig) => Promise<void>
  updateCluster: (id: string, updates: Partial<ClusterConfig>) => Promise<void>
  removeCluster: (id: string) => Promise<void>
  setActiveCluster: (id: string | null) => void
  connectCluster: (id: string) => Promise<void>
  disconnectCluster: (id: string) => Promise<void>
  testConnection: (config: ClusterConfig) => Promise<{
    success: boolean
    error?: string
    brokerCount?: number
    kafkaVersion?: string
  }>
  getActiveClusterId: () => string | null
}

export const useClusterStore = create<ClusterStore>((set, get) => ({
  clusters: [],
  connections: {},
  activeClusterId: null,
  isLoading: false,

  loadClusters: async () => {
    set({ isLoading: true })
    try {
      const res = await window.api.cluster.list()
      if (res.success && Array.isArray(res.data)) {
        const clusters = res.data as ClusterConfig[]
        const connections: Record<string, ClusterConnection> = {}
        for (const c of clusters) {
          connections[c.id] = { config: c, status: 'disconnected' }
        }
        set({ clusters, connections, isLoading: false })
      } else {
        set({ clusters: [], connections: {}, isLoading: false })
      }
    } catch {
      set({ clusters: [], connections: {}, isLoading: false })
    }
  },

  addCluster: async (config) => {
    set((state) => ({
      clusters: [...state.clusters, config],
      connections: {
        ...state.connections,
        [config.id]: { config, status: 'disconnected' }
      }
    }))

    try {
      await window.api.cluster.save(config)
    } catch {
      // optimistic update already applied
    }
  },

  updateCluster: async (id, updates) => {
    set((state) => ({
      clusters: state.clusters.map((c) =>
        c.id === id ? { ...c, ...updates, updatedAt: Date.now() } : c
      )
    }))

    try {
      await window.api.cluster.update(id, updates)
    } catch {
      // optimistic update already applied
    }
  },

  removeCluster: async (id) => {
    set((state) => ({
      clusters: state.clusters.filter((c) => c.id !== id),
      connections: Object.fromEntries(
        Object.entries(state.connections).filter(([k]) => k !== id)
      ),
      activeClusterId: state.activeClusterId === id ? null : state.activeClusterId
    }))

    try {
      await window.api.cluster.delete(id)
    } catch {
      // optimistic update already applied
    }
  },

  setActiveCluster: (id) => set({ activeClusterId: id }),

  connectCluster: async (id) => {
    const { clusters } = get()
    const cluster = clusters.find((c) => c.id === id)
    if (!cluster) return

    const setStatus = (status: ConnectionStatus, meta?: Partial<ClusterConnection>) => {
      set((state) => ({
        connections: {
          ...state.connections,
          [id]: { ...state.connections[id], config: cluster, status, ...meta }
        }
      }))
    }

    setStatus('connecting')

    try {
      const res = await window.api.cluster.connect(id, cluster)
      if (res.success && res.data) {
        setStatus('connected', {
          brokerCount: res.data.brokerCount,
          kafkaVersion: res.data.kafkaVersion
        })
        set({ activeClusterId: id })
      } else {
        setStatus('error', { error: res.error ?? 'Connection failed' })
      }
    } catch (err) {
      setStatus('error', { error: err instanceof Error ? err.message : 'Connection failed' })
    }
  },

  disconnectCluster: async (id) => {
    set((state) => ({
      connections: {
        ...state.connections,
        [id]: {
          ...state.connections[id],
          status: 'disconnected',
          brokerCount: undefined,
          kafkaVersion: undefined,
          error: undefined
        }
      },
      activeClusterId: state.activeClusterId === id ? null : state.activeClusterId
    }))

    try {
      await window.api.cluster.disconnect(id)
    } catch {
      // already disconnected locally
    }
  },

  testConnection: async (config) => {
    try {
      const res = await window.api.cluster.testConnection(config)
      if (res.success && res.data) {
        return {
          success: true,
          brokerCount: res.data.brokerCount,
          kafkaVersion: res.data.kafkaVersion
        }
      }
      return { success: false, error: res.error ?? 'Connection test failed' }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Connection test failed'
      }
    }
  },

  getActiveClusterId: () => get().activeClusterId
}))
