import { useState, useEffect, useRef, useCallback } from 'react'
import {
  LayoutDashboard,
  FolderTree,
  Users,
  FileCode2,
  AlertTriangle,
  Server,
  Settings,
  Search
} from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import type { NavigationPage } from '@/types'

interface Command {
  id: NavigationPage
  label: string
  icon: React.ElementType
  shortcut?: string
}

const COMMANDS: Command[] = [
  { id: 'dashboard', label: 'Go to Dashboard', icon: LayoutDashboard, shortcut: '⌘1' },
  { id: 'topics', label: 'Go to Topics', icon: FolderTree, shortcut: '⌘2' },
  { id: 'consumer-groups', label: 'Go to Consumer Groups', icon: Users, shortcut: '⌘3' },
  { id: 'schema-registry', label: 'Go to Schema Registry', icon: FileCode2, shortcut: '⌘4' },
  { id: 'dlq', label: 'Go to DLQ', icon: AlertTriangle, shortcut: '⌘5' },
  { id: 'brokers', label: 'Go to Brokers', icon: Server, shortcut: '⌘6' },
  { id: 'settings', label: 'Go to Settings', icon: Settings, shortcut: '⌘7' }
]

export function CommandPalette() {
  const { commandPaletteOpen, toggleCommandPalette, setCurrentPage } = useUIStore()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = COMMANDS.filter((cmd) =>
    cmd.label.toLowerCase().includes(query.toLowerCase())
  )

  const execute = useCallback(
    (cmd: Command) => {
      setCurrentPage(cmd.id)
      toggleCommandPalette()
      setQuery('')
      setActiveIndex(0)
    },
    [setCurrentPage, toggleCommandPalette]
  )

  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('')
      setActiveIndex(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [commandPaletteOpen])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => (i + 1) % filtered.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length)
      } else if (e.key === 'Enter' && filtered[activeIndex]) {
        e.preventDefault()
        execute(filtered[activeIndex])
      } else if (e.key === 'Escape') {
        e.preventDefault()
        toggleCommandPalette()
      }
    },
    [filtered, activeIndex, execute, toggleCommandPalette]
  )

  if (!commandPaletteOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-surface-0/70 backdrop-blur-sm"
        onClick={toggleCommandPalette}
      />

      {/* Palette */}
      <div
        className="animate-fade-in relative w-full max-w-md overflow-hidden rounded-xl border border-border bg-surface-2 shadow-2xl"
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <Search size={16} className="shrink-0 text-text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command…"
            className="flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] text-text-muted">
            ESC
          </kbd>
        </div>

        {/* Command list */}
        <ul className="max-h-72 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <li className="px-3 py-6 text-center text-xs text-text-muted">
              No commands found
            </li>
          )}
          {filtered.map((cmd, i) => {
            const Icon = cmd.icon
            const isActive = i === activeIndex
            return (
              <li key={cmd.id}>
                <button
                  onClick={() => execute(cmd)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
                    isActive
                      ? 'bg-accent/15 text-accent-hover'
                      : 'text-text-secondary hover:bg-surface-3'
                  }`}
                >
                  <Icon size={16} className="shrink-0" />
                  <span className="flex-1">{cmd.label}</span>
                  {cmd.shortcut && (
                    <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] text-text-muted">
                      {cmd.shortcut}
                    </kbd>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
