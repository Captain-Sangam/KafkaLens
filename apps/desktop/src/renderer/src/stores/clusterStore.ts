import { create } from 'zustand'
import { useDataStore } from './dataStore'
import { useUIStore } from './uiStore'
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
    if (get().isLoading) return
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

        if (clusters.length > 0) {
          get().connectCluster(clusters[0].id)
        }
      } else {
        set({ clusters: [], connections: {}, isLoading: false })
      }
    } catch (error) {
      useUIStore
        .getState()
        .addNotification(
          'error',
          error instanceof Error ? error.message : 'Could not load clusters'
        )
      set({ clusters: [], connections: {}, isLoading: false })
    }
  },

  addCluster: async (config) => {
    const res = await window.api.cluster.save(config)
    if (!res.success) {
      throw new Error(res.error ?? 'Failed to save cluster')
    }

    set((state) => ({
      clusters: [...state.clusters, config],
      connections: {
        ...state.connections,
        [config.id]: { config, status: 'disconnected' }
      }
    }))
  },

  updateCluster: async (id, updates) => {
    const res = await window.api.cluster.update(id, updates)
    if (!res.success) {
      throw new Error(res.error ?? 'Failed to update cluster')
    }

    set((state) => ({
      clusters: state.clusters.map((c) =>
        c.id === id ? { ...c, ...updates, updatedAt: Date.now() } : c
      ),
      connections: {
        ...state.connections,
        [id]: { ...state.connections[id], config: { ...state.connections[id].config, ...updates } }
      }
    }))
  },

  removeCluster: async (id) => {
    const res = await window.api.cluster.delete(id)
    if (!res.success) {
      throw new Error(res.error ?? 'Failed to delete cluster')
    }

    if (get().activeClusterId === id) get().setActiveCluster(null)
    set((state) => ({
      clusters: state.clusters.filter((c) => c.id !== id),
      connections: Object.fromEntries(Object.entries(state.connections).filter(([k]) => k !== id)),
      activeClusterId: state.activeClusterId === id ? null : state.activeClusterId
    }))
  },

  setActiveCluster: (id) => {
    if (get().activeClusterId !== id) {
      useDataStore.getState().activateCluster(id)
      useUIStore.getState().setSelectedTopic(null)
      useUIStore.getState().setSelectedBroker(null)
      set({ activeClusterId: id })
    }
  },

  connectCluster: async (id) => {
    if (get().connections[id]?.status === 'connecting') return
    const { clusters } = get()
    const cluster = clusters.find((c) => c.id === id)
    if (!cluster) return

    const setStatus = (status: ConnectionStatus, meta?: Partial<ClusterConnection>) => {
      set((state) => ({
        connections: {
          ...state.connections,
          [id]: { ...state.connections[id], config: cluster, status, error: undefined, ...meta }
        }
      }))
    }

    setStatus('connecting')

    try {
      const res = await window.api.cluster.connect(id, cluster)
      const inner = res.data as
        | { success?: boolean; brokerCount?: number; kafkaVersion?: string; error?: string }
        | undefined
      if (res.success && inner?.success) {
        setStatus('connected', {
          brokerCount: inner.brokerCount,
          kafkaVersion: inner.kafkaVersion
        })
        get().setActiveCluster(id)
      } else {
        const errorMsg = inner?.error ?? res.error ?? 'Connection failed'
        setStatus('error', { error: errorMsg })
      }
    } catch (err) {
      setStatus('error', { error: err instanceof Error ? err.message : 'Connection failed' })
    }
  },

  disconnectCluster: async (id) => {
    if (get().activeClusterId === id) get().setActiveCluster(null)
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
      const inner = res.data as
        | { success?: boolean; brokerCount?: number; kafkaVersion?: string; error?: string }
        | undefined
      if (res.success && inner?.success) {
        return {
          success: true,
          brokerCount: inner.brokerCount,
          kafkaVersion: inner.kafkaVersion
        }
      }
      return { success: false, error: inner?.error ?? res.error ?? 'Connection test failed' }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Connection test failed'
      }
    }
  },

  getActiveClusterId: () => get().activeClusterId
}))
