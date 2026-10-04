import { create } from 'zustand'
import type { NavigationPage } from '@/types'

interface Notification {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
  timestamp: number
}

interface UIStore {
  currentPage: NavigationPage
  sidebarCollapsed: boolean
  detailPanelOpen: boolean
  commandPaletteOpen: boolean
  selectedTopicName: string | null
  selectedConsumerGroupId: string | null
  selectedBrokerId: number | null
  selectedSchemaSubject: string | null

  globalError: string | null
  globalLoading: boolean
  notifications: Notification[]

  setCurrentPage: (page: NavigationPage) => void
  toggleSidebar: () => void
  setDetailPanel: (open: boolean) => void
  toggleCommandPalette: () => void
  setSelectedTopic: (name: string | null) => void
  setSelectedConsumerGroup: (id: string | null) => void
  setSelectedBroker: (id: number | null) => void
  setSelectedSchemaSubject: (subject: string | null) => void
  navigateToTopic: (name: string) => void
  setGlobalError: (error: string | null) => void
  setGlobalLoading: (loading: boolean) => void
  addNotification: (type: Notification['type'], message: string) => void
  dismissNotification: (id: string) => void
}

let notifCounter = 0

export const useUIStore = create<UIStore>((set, get) => ({
  currentPage: 'dashboard',
  sidebarCollapsed: false,
  detailPanelOpen: false,
  commandPaletteOpen: false,
  selectedTopicName: null,
  selectedConsumerGroupId: null,
  selectedSchemaSubject: null,
  selectedBrokerId: null,

  globalError: null,
  globalLoading: false,
  notifications: [],

  setCurrentPage: (page) => set({ currentPage: page }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setDetailPanel: (open) => set({ detailPanelOpen: open }),
  toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
  setSelectedTopic: (name) => set({ selectedTopicName: name }),
  setSelectedConsumerGroup: (id) => set({ selectedConsumerGroupId: id }),
  setSelectedBroker: (id) => set({ selectedBrokerId: id }),
  setSelectedSchemaSubject: (subject) => set({ selectedSchemaSubject: subject }),

  navigateToTopic: (name) =>
    set({ currentPage: 'messages', selectedTopicName: name, detailPanelOpen: false }),

  setGlobalError: (error) => set({ globalError: error }),
  setGlobalLoading: (loading) => set({ globalLoading: loading }),

  addNotification: (type, message) => {
    const id = `notif-${Date.now()}-${++notifCounter}`
    const notification: Notification = { id, type, message, timestamp: Date.now() }

    set((s) => ({ notifications: [...s.notifications, notification].slice(-50) }))

    if (type === 'success' || type === 'info') {
      setTimeout(() => {
        get().dismissNotification(id)
      }, 5000)
    }
  },

  dismissNotification: (id) =>
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) }))
}))
