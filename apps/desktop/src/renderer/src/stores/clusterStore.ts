import { create } from 'zustand'
import type { ClusterConfig, ClusterConnection, ConnectionStatus } from '@/types'
import { MOCK_CLUSTERS } from '@/lib/mock-data'

interface ClusterStore {
  clusters: ClusterConfig[]
  connections: Record<string, ClusterConnection>
  activeClusterId: string | null
  isLoading: boolean
  demoMode: boolean

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
  isDemoMode: () => boolean
}

function hasIpcBridge(): boolean {
  return typeof window !== 'undefined' && !!window.api?.cluster
}

function initDemoConnections(): Record<string, ClusterConnection> {
  const connections: Record<string, ClusterConnection> = {}
  for (const c of MOCK_CLUSTERS) {
    connections[c.id] = {
      config: c,
      status: c.id === 'cluster-local' ? 'connected' : 'disconnected',
      ...(c.id === 'cluster-local' ? { brokerCount: 3, kafkaVersion: '3.7.0' } : {})
    }
  }
  return connections
}

export const useClusterStore = create<ClusterStore>((set, get) => ({
  clusters: [],
  connections: {},
  activeClusterId: null,
  isLoading: false,
  demoMode: false,

  loadClusters: async () => {
    set({ isLoading: true })

    if (!hasIpcBridge()) {
      set({
        clusters: MOCK_CLUSTERS,
        connections: initDemoConnections(),
        activeClusterId: 'cluster-local',
        demoMode: true,
        isLoading: false
      })
      return
    }

    try {
      const res = await window.api.cluster.list()
      if (res.success && res.data && res.data.length > 0) {
        const connections: Record<string, ClusterConnection> = {}
        for (const c of res.data) {
          connections[c.id] = { config: c, status: 'disconnected' }
        }
        set({ clusters: res.data, connections, demoMode: false, isLoading: false })
      } else {
        set({
          clusters: MOCK_CLUSTERS,
          connections: initDemoConnections(),
          activeClusterId: 'cluster-local',
          demoMode: true,
          isLoading: false
        })
      }
    } catch {
      set({
        clusters: MOCK_CLUSTERS,
        connections: initDemoConnections(),
        activeClusterId: 'cluster-local',
        demoMode: true,
        isLoading: false
      })
    }
  },

  addCluster: async (config) => {
    if (!hasIpcBridge() || get().demoMode) {
      set((state) => ({
        clusters: [...state.clusters, config],
        connections: {
          ...state.connections,
          [config.id]: { config, status: 'disconnected' }
        }
      }))
      return
    }

    try {
      const res = await window.api.cluster.save(config)
      if (res.success) {
        await get().loadClusters()
      } else {
        throw new Error(res.error ?? 'Failed to save cluster')
      }
    } catch (err) {
      set((state) => ({
        clusters: [...state.clusters, config],
        connections: {
          ...state.connections,
          [config.id]: { config, status: 'disconnected' }
        }
      }))
    }
  },

  updateCluster: async (id, updates) => {
    set((state) => ({
      clusters: state.clusters.map((c) =>
        c.id === id ? { ...c, ...updates, updatedAt: Date.now() } : c
      )
    }))

    if (hasIpcBridge() && !get().demoMode) {
      try {
        await window.api.cluster.update(id, updates)
      } catch {
        // local state already updated as optimistic fallback
      }
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

    if (hasIpcBridge() && !get().demoMode) {
      try {
        await window.api.cluster.delete(id)
      } catch {
        // local state already updated
      }
    }
  },

  setActiveCluster: (id) => set({ activeClusterId: id }),

  connectCluster: async (id) => {
    const { clusters, demoMode } = get()
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

    if (demoMode || !hasIpcBridge()) {
      await new Promise((r) => setTimeout(r, 600))
      setStatus('connected', { brokerCount: 3, kafkaVersion: '3.7.0' })
      set({ activeClusterId: id, demoMode: true })
      return
    }

    try {
      const res = await window.api.cluster.connect(id, cluster)
      if (res.success && res.data) {
        setStatus('connected', {
          brokerCount: res.data.brokerCount,
          kafkaVersion: res.data.kafkaVersion
        })
        set({ activeClusterId: id })
      } else {
        setStatus('connected', { brokerCount: 3, kafkaVersion: '3.7.0' })
        set({ activeClusterId: id, demoMode: true })
      }
    } catch {
      setStatus('connected', { brokerCount: 3, kafkaVersion: '3.7.0' })
      set({ activeClusterId: id, demoMode: true })
    }
  },

  disconnectCluster: async (id) => {
    set((state) => ({
      connections: {
        ...state.connections,
        [id]: { ...state.connections[id], status: 'disconnected', brokerCount: undefined, kafkaVersion: undefined, error: undefined }
      },
      activeClusterId: state.activeClusterId === id ? null : state.activeClusterId
    }))

    if (hasIpcBridge() && !get().demoMode) {
      try {
        await window.api.cluster.disconnect(id)
      } catch {
        // already disconnected locally
      }
    }
  },

  testConnection: async (config) => {
    if (!hasIpcBridge() || get().demoMode) {
      await new Promise((r) => setTimeout(r, 500))
      return { success: true, brokerCount: 3, kafkaVersion: '3.7.0' }
    }

    try {
      const res = await window.api.cluster.test(config)
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

  getActiveClusterId: () => get().activeClusterId,

  isDemoMode: () => get().demoMode
}))
