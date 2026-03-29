import { useEffect, useState } from 'react'
import { Wifi, WifiOff, Keyboard } from 'lucide-react'
import { useClusterStore } from '@/stores/clusterStore'
import type { ConnectionStatus } from '@/types'

const STATUS_DOT: Record<ConnectionStatus, string> = {
  connected: 'bg-success',
  disconnected: 'bg-text-muted',
  connecting: 'bg-warning animate-pulse-glow',
  error: 'bg-danger'
}

export function StatusBar() {
  const { clusters, activeClusterId, connections } = useClusterStore()
  const [now, setNow] = useState(() => new Date())

  const activeCluster = clusters.find((c) => c.id === activeClusterId)
  const activeConnection = activeClusterId ? connections[activeClusterId] : null
  const status: ConnectionStatus = activeConnection?.status ?? 'disconnected'

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  const formattedTime = now.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })

  return (
    <footer className="flex h-6 shrink-0 items-center justify-between border-t border-border bg-surface-1 px-3 text-[11px] text-text-muted">
      {/* Left: connection status */}
      <div className="flex items-center gap-2">
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
        {status === 'connected' ? <Wifi size={11} /> : <WifiOff size={11} />}
        <span className="truncate">
          {activeCluster?.name ?? 'No cluster'}
          {activeConnection?.brokerCount != null && (
            <span className="text-text-muted"> · {activeConnection.brokerCount} broker{activeConnection.brokerCount !== 1 ? 's' : ''}</span>
          )}
        </span>
      </div>

      {/* Center: last refresh */}
      <span className="hidden sm:block">Last refresh {formattedTime}</span>

      {/* Right: kafka version + shortcut hint */}
      <div className="flex items-center gap-3">
        {activeConnection?.kafkaVersion && (
          <span>Kafka {activeConnection.kafkaVersion}</span>
        )}
        <span className="flex items-center gap-1 rounded border border-border px-1.5 py-px text-[10px] text-text-muted">
          <Keyboard size={10} />
          ⌘K
        </span>
      </div>
    </footer>
  )
}
