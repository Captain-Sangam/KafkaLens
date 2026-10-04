import { useState, useRef, useEffect } from 'react'
import {
  LayoutDashboard,
  FolderTree,
  MessageSquare,
  Users,
  FileCode2,
  AlertTriangle,
  Server,
  Settings,
  ChevronDown,
  Plug,
  Unplug,
  Loader2
} from 'lucide-react'
import { useDataStore } from '@/stores/dataStore'
import { useUIStore } from '@/stores/uiStore'
import { useClusterStore } from '@/stores/clusterStore'
import type { NavigationPage, EnvironmentLabel, ConnectionStatus } from '@/types'
import { ENV_COLORS } from '@/types'

interface NavItem {
  id: NavigationPage
  label: string
  icon: React.ElementType
  showWhen?: () => boolean
}

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  connected: 'Connected',
  disconnected: 'Disconnected',
  connecting: 'Connecting…',
  error: 'Error'
}

const STATUS_COLORS: Record<ConnectionStatus, string> = {
  connected: 'bg-success',
  disconnected: 'bg-text-muted',
  connecting: 'bg-warning',
  error: 'bg-danger'
}

export function Sidebar() {
  const { currentPage, setCurrentPage, selectedTopicName, sidebarCollapsed } = useUIStore()
  const {
    clusters,
    activeClusterId,
    connections,
    setActiveCluster,
    connectCluster,
    disconnectCluster
  } = useClusterStore()

  const [clusterDropdownOpen, setClusterDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const dlqCount = useDataStore((s) =>
    s.topics.filter((t) => t.isDLQ).reduce((n, t) => n + t.messageCount, 0)
  )
  const activeCluster = clusters.find((c) => c.id === activeClusterId)
  const activeConnection = activeClusterId ? connections[activeClusterId] : null
  const connectionStatus: ConnectionStatus = activeConnection?.status ?? 'disconnected'

  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'topics', label: 'Topics', icon: FolderTree },
    {
      id: 'messages',
      label: 'Messages',
      icon: MessageSquare,
      showWhen: () => selectedTopicName !== null
    },
    { id: 'partitions', label: 'Partitions', icon: FolderTree },
    { id: 'consumer-groups', label: 'Consumer Groups', icon: Users },
    { id: 'schema-registry', label: 'Schema Registry', icon: FileCode2 },
    { id: 'dlq', label: 'DLQ', icon: AlertTriangle },
    { id: 'brokers', label: 'Brokers', icon: Server }
  ]

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setClusterDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleClusterSelect(clusterId: string) {
    const conn = connections[clusterId]
    if (!conn || conn.status === 'disconnected' || conn.status === 'error') {
      void connectCluster(clusterId)
    } else if (conn.status === 'connected') {
      setActiveCluster(clusterId)
    }
    setClusterDropdownOpen(false)
  }

  function EnvironmentDot({ env }: { env: EnvironmentLabel }) {
    return (
      <span
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: ENV_COLORS[env] }}
      />
    )
  }

  return (
    <aside
      className={`flex h-full flex-col border-r border-border bg-surface-1 transition-[width] duration-200 ${
        sidebarCollapsed ? 'w-14' : 'w-[220px]'
      }`}
    >
      {/* Cluster selector */}
      <div className="relative px-2 pb-2 pt-2" ref={dropdownRef}>
        <button
          onClick={() => setClusterDropdownOpen((prev) => !prev)}
          className={`no-drag flex w-full items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-left transition-colors hover:border-border-bright hover:bg-surface-2 ${
            sidebarCollapsed ? 'justify-center' : ''
          }`}
        >
          {activeCluster && <EnvironmentDot env={activeCluster.environmentLabel} />}
          {!sidebarCollapsed && (
            <>
              <span className="min-w-0 flex-1 truncate text-xs text-text-primary">
                {activeCluster?.name ?? 'No cluster'}
              </span>
              <ChevronDown
                size={12}
                className={`shrink-0 text-text-muted transition-transform ${
                  clusterDropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </>
          )}
        </button>

        {clusterDropdownOpen && (
          <div className="animate-fade-in absolute left-2 right-2 z-50 mt-1 overflow-hidden rounded-md border border-border bg-surface-2 shadow-lg">
            {clusters.map((cluster) => {
              const conn = connections[cluster.id]
              const isActive = cluster.id === activeClusterId
              return (
                <button
                  key={cluster.id}
                  onClick={() => handleClusterSelect(cluster.id)}
                  className={`flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors hover:bg-surface-3 ${
                    isActive ? 'bg-surface-3' : ''
                  }`}
                >
                  <EnvironmentDot env={cluster.environmentLabel} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs text-text-primary">{cluster.name}</div>
                    <div className="truncate text-[10px] text-text-muted">
                      {cluster.environmentLabel} · {conn?.status ?? 'disconnected'}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Navigation items */}
      <nav className="flex-1 overflow-y-auto px-2 py-1">
        <ul className="space-y-0.5">
          {navItems
            .filter((item) => !item.showWhen || item.showWhen())
            .map((item) => {
              const Icon = item.icon
              const isActive = currentPage === item.id
              return (
                <li key={item.id}>
                  <button
                    aria-label={item.label}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => setCurrentPage(item.id)}
                    title={sidebarCollapsed ? item.label : undefined}
                    className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
                      isActive
                        ? 'bg-accent/15 text-accent-hover'
                        : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'
                    } ${sidebarCollapsed ? 'justify-center' : ''}`}
                  >
                    <Icon size={16} className="shrink-0" />
                    {!sidebarCollapsed && (
                      <span className="truncate">
                        {item.label}
                        {item.id === 'dlq' && dlqCount > 0 && (
                          <span
                            className="ml-2 rounded bg-danger/15 px-1.5 text-danger"
                            title="DLQ retained offset span"
                          >
                            {dlqCount.toLocaleString()}
                          </span>
                        )}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
        </ul>

        {/* Separator + Settings */}
        <div className="my-2 border-t border-border" />
        <button
          onClick={() => setCurrentPage('settings')}
          title={sidebarCollapsed ? 'Settings' : undefined}
          className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
            currentPage === 'settings'
              ? 'bg-accent/15 text-accent-hover'
              : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'
          } ${sidebarCollapsed ? 'justify-center' : ''}`}
        >
          <Settings size={16} className="shrink-0" />
          {!sidebarCollapsed && <span>Settings</span>}
        </button>
      </nav>

      {/* Connection status footer */}
      <div className="shrink-0 border-t border-border px-2 py-2">
        <div className={`flex items-center gap-2 ${sidebarCollapsed ? 'justify-center' : ''}`}>
          {connectionStatus === 'connecting' ? (
            <Loader2 size={12} className="shrink-0 animate-spin text-warning" />
          ) : (
            <span
              className={`inline-block h-2 w-2 shrink-0 rounded-full ${STATUS_COLORS[connectionStatus]}`}
            />
          )}
          {!sidebarCollapsed && (
            <div className="min-w-0 flex-1">
              <span className="truncate text-[11px] text-text-muted block">
                {STATUS_LABELS[connectionStatus]}
              </span>
              {connectionStatus === 'error' && activeConnection?.error && (
                <span
                  className="truncate text-[10px] text-danger block"
                  title={activeConnection.error}
                >
                  {activeConnection.error}
                </span>
              )}
            </div>
          )}
          {!sidebarCollapsed && activeClusterId && (
            <button
              onClick={() =>
                connectionStatus === 'connected'
                  ? disconnectCluster(activeClusterId)
                  : connectCluster(activeClusterId)
              }
              className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-3 hover:text-text-secondary"
              title={connectionStatus === 'connected' ? 'Disconnect' : 'Connect'}
            >
              {connectionStatus === 'connected' ? <Unplug size={12} /> : <Plug size={12} />}
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}
