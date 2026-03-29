import { useEffect, type ReactNode } from 'react'
import { useUIStore } from '@/stores/uiStore'
import { Sidebar } from './Sidebar'
import { StatusBar } from './StatusBar'
import { CommandPalette } from './CommandPalette'
import type { NavigationPage } from '@/types'

const PAGE_SHORTCUTS: Record<string, NavigationPage> = {
  '1': 'dashboard',
  '2': 'topics',
  '3': 'consumer-groups',
  '4': 'schema-registry',
  '5': 'dlq',
  '6': 'brokers',
  '7': 'settings'
}

interface AppLayoutProps {
  children: ReactNode
  detailPanel?: ReactNode
}

export function AppLayout({ children, detailPanel }: AppLayoutProps) {
  const { sidebarCollapsed, detailPanelOpen, toggleCommandPalette, setCurrentPage } = useUIStore()

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isMeta = e.metaKey || e.ctrlKey

      if (isMeta && e.key === 'k') {
        e.preventDefault()
        toggleCommandPalette()
        return
      }

      if (isMeta && PAGE_SHORTCUTS[e.key]) {
        e.preventDefault()
        setCurrentPage(PAGE_SHORTCUTS[e.key])
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleCommandPalette, setCurrentPage])

  return (
    <div className="flex h-screen flex-col bg-surface-0">
      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <Sidebar />

        {/* Main content */}
        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-surface-0">
          {children}
        </main>

        {/* Detail / AI panel */}
        {detailPanelOpen && detailPanel && (
          <aside className="animate-slide-in w-[380px] shrink-0 overflow-y-auto border-l border-border bg-surface-1">
            {detailPanel}
          </aside>
        )}
      </div>

      {/* Status bar */}
      <StatusBar />

      {/* Command palette overlay */}
      <CommandPalette />
    </div>
  )
}
