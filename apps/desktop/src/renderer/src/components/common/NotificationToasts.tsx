import { useUIStore } from '@/stores/uiStore'
import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react'

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info
}

const STYLES = {
  success: 'border-success/30 bg-success/10 text-success',
  error: 'border-danger/30 bg-danger/10 text-danger',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  info: 'border-info/30 bg-info/10 text-info'
}

export function NotificationToasts() {
  const notifications = useUIStore((s) => s.notifications)
  const dismiss = useUIStore((s) => s.dismissNotification)

  if (notifications.length === 0) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-12 right-4 z-50 flex flex-col gap-2"
    >
      {notifications.map((n) => {
        const Icon = ICONS[n.type]
        return (
          <div
            key={n.id}
            className={`animate-slide-in flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg backdrop-blur-sm ${STYLES[n.type]}`}
            style={{ minWidth: 320, maxWidth: 480 }}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1 text-sm leading-relaxed">{n.message}</span>
            <button
              aria-label="Dismiss notification"
              onClick={() => dismiss(n.id)}
              className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
