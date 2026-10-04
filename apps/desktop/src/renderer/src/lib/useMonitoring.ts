import { lagGrowthPerMinute } from './lag-growth'
import { useEffect } from 'react'
import { useClusterStore } from '@/stores/clusterStore'
import { useDataStore } from '@/stores/dataStore'
import { useUIStore } from '@/stores/uiStore'
import type { AISettings, DisplayPreferences } from '@/types'
export function useMonitoring() {
  const id = useClusterStore((s) => s.activeClusterId)
  useEffect(() => {
    void window.api.settings.get('display').then((r) => {
      if (r.data) {
        try {
          const p: DisplayPreferences = JSON.parse(r.data)
          document.documentElement.style.setProperty(
            '--app-font-size',
            p.fontSize === 'small' ? '12px' : p.fontSize === 'large' ? '16px' : '14px'
          )
        } catch {}
      }
    })
  }, [])
  useEffect(() => {
    if (!id) return
    const clusterId = id
    let alive = true
    let running = false
    let failures = 0
    const alerted = new Map<string, number>()
    let settings: AISettings | null = null
    void window.api.settings.getAI().then((r) => {
      settings = r.data ?? null
    })
    async function sample() {
      if (running || !alive) return
      running = true
      try {
        const connected = await window.api.cluster.isConnected(clusterId)
        if (!alive) return
        if (!connected.success || !connected.data) {
          failures++
          if (failures === 1)
            useUIStore
              .getState()
              .addNotification('warning', 'Connection lost. Retrying the cluster connection…')
          if (failures >= 2) await useClusterStore.getState().connectCluster(clusterId)
          return
        }
        if (failures) {
          useUIStore.getState().addNotification('success', 'Cluster connection restored')
          failures = 0
        }
        await useDataStore.getState().fetchConsumerGroups(clusterId)
        if (
          !alive ||
          !settings?.enabled ||
          !settings.consent ||
          settings.features?.anomalies !== true
        )
          return
        const { consumerGroups, lagHistory } = useDataStore.getState()
        for (const g of consumerGroups) {
          if (g.lagError) continue
          const history = lagHistory[g.groupId] ?? []
          if (
            lagGrowthPerMinute(history) < (settings.anomalyThreshold ?? 1000) ||
            lagGrowthPerMinute(history) <= 0 ||
            (alerted.get(g.groupId) ?? 0) > Date.now() - 300000
          )
            continue
          alerted.set(g.groupId, Date.now())
          const r = await window.api.ai.lagAnomaly(
            g.groupId,
            history.filter((s) => s.at >= Date.now() - 60000)
          )
          if (alive && r.success && r.data)
            useUIStore.getState().addNotification('warning', `${g.groupId}: ${r.data.content}`)
        }
      } finally {
        running = false
      }
    }
    // The active page loads its data immediately. Start monitoring at the
    // regular interval so activation does not duplicate that initial request.
    const timer = setInterval(() => {
      void window.api.settings.getAI().then((r) => {
        settings = r.data ?? null
      })
      void sample()
    }, 15000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [id])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!['Tab', 'Escape'].includes(event.key)) return
      const dialog = Array.from(document.querySelectorAll<HTMLElement>('[aria-modal="true"]')).at(
        -1
      )
      if (!dialog || dialog.getAttribute('role') === 'alertdialog') return
      if (event.key === 'Escape') {
        const close = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
          /^(close|cancel)$/i.test(b.getAttribute('aria-label') ?? b.textContent?.trim() ?? '')
        )
        if (close) {
          event.preventDefault()
          close.click()
        }
        return
      }
      const items = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),textarea,select,[tabindex="0"]'
        )
      )
      if (!items.length) return
      const i = items.indexOf(document.activeElement as HTMLElement)
      if (i < 0 || (!event.shiftKey && i === items.length - 1) || (event.shiftKey && i === 0)) {
        event.preventDefault()
        items[event.shiftKey ? items.length - 1 : 0].focus()
      }
    }
    let current: HTMLElement | undefined
    let previous: HTMLElement | null = null
    const focusDialog = () => {
      const next = Array.from(document.querySelectorAll<HTMLElement>('[aria-modal="true"]')).at(-1)
      if (next === current) return
      if (!next) {
        previous?.focus()
        current = undefined
        return
      }
      current = next
      if (next.getAttribute('role') === 'alertdialog') return
      previous = document.activeElement as HTMLElement
      next
        .querySelector<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea,select')
        ?.focus()
    }
    const observer = new MutationObserver(focusDialog)
    observer.observe(document.body, { childList: true, subtree: true })
    document.addEventListener('keydown', key)
    return () => {
      observer.disconnect()
      document.removeEventListener('keydown', key)
    }
  }, [])
}
