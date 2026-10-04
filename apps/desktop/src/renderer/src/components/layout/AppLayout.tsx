import { useEffect, useState, type ReactNode } from 'react'
import { PanelLeft, PanelLeftClose } from 'lucide-react'
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
  const { sidebarCollapsed, detailPanelOpen, toggleCommandPalette, setCurrentPage, toggleSidebar } =
    useUIStore()

  const [isFullScreen, setIsFullScreen] = useState(false)

  useEffect(() => {
    const onResize = () => {
      setIsFullScreen(window.innerHeight === screen.height && window.innerWidth === screen.width)
    }
    window.addEventListener('resize', onResize)
    onResize()
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isMeta = e.metaKey || e.ctrlKey

      if (isMeta && e.key === 'k') {
        e.preventDefault()
        toggleCommandPalette()
        return
      }

      if (isMeta && e.key === ',') {
        e.preventDefault()
        setCurrentPage('settings')
        return
      }
      if (isMeta && e.key === 'r') {
        e.preventDefault()
        window.dispatchEvent(new Event('kafkalens:refresh'))
        return
      }
      if (isMeta && e.key === 't') {
        e.preventDefault()
        setCurrentPage('topics')
        setTimeout(
          () => document.querySelector<HTMLInputElement>('[data-topic-search]')?.focus(),
          0
        )
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
      {/* ── Top navbar — full width, above everything ── */}
      <header
        className="drag-region relative flex shrink-0 items-center border-b border-border bg-surface-1"
        style={{ height: 44 }}
      >
        {/* Left zone — collapse toggle, aligned with traffic lights (or left corner in full screen) */}
        <div
          className="no-drag absolute flex items-center transition-[left] duration-200"
          style={{ left: isFullScreen ? 14 : 78, top: 14 }}
        >
          <button
            onClick={toggleSidebar}
            className="flex h-5 w-5 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-3 hover:text-text-secondary"
          >
            {sidebarCollapsed ? <PanelLeft size={13} /> : <PanelLeftClose size={13} />}
          </button>
        </div>

        {/* Center — app name */}
        <div className="flex flex-1 items-center justify-center">
          <span className="text-[11px] font-semibold tracking-widest text-text-muted uppercase">
            KafkaLens
          </span>
        </div>

        {/* Right zone — balance the left padding so the name stays centered */}
        <div style={{ width: 110 }} />
      </header>

      {/* ── Body — sidebar + content, below the navbar ── */}
      <div className="flex min-h-0 flex-1">
        <Sidebar />

        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-surface-0">
          {children}
        </main>

        {detailPanelOpen && detailPanel && (
          <aside className="animate-slide-in w-[380px] shrink-0 overflow-y-auto border-l border-border bg-surface-1">
            {detailPanel}
          </aside>
        )}
      </div>

      {/* ── Status bar ── */}
      <StatusBar />

      {/* ── Command palette overlay ── */}
      <CommandPalette />
    </div>
  )
}
