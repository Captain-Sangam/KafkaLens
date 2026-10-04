import { useEffect, useRef, useState } from 'react'
interface Request {
  title: string
  message: string
  resource?: string
  production?: boolean
  resolve: (value: boolean) => void
}
export function useConfirmation() {
  const [request, setRequest] = useState<Request | null>(null)
  const [typed, setTyped] = useState('')
  const panel = useRef<HTMLDivElement>(null)
  const pending = useRef<Request | null>(null)
  const finish = (ok: boolean) => {
    pending.current?.resolve(ok)
    pending.current = null
    setRequest(null)
  }
  useEffect(() => () => pending.current?.resolve(false), [])
  useEffect(() => {
    if (!request) return
    const previous = document.activeElement as HTMLElement | null
    const controls = () =>
      Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input') ?? [])
    controls()[0]?.focus()
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        finish(false)
      }
      if (event.key === 'Tab') {
        const items = controls()
        const index = items.indexOf(document.activeElement as HTMLElement)
        event.preventDefault()
        items[(index + (event.shiftKey ? -1 : 1) + items.length) % items.length]?.focus()
      }
    }
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('keydown', key)
      previous?.focus()
    }
  }, [request])
  const confirm = (details: Omit<Request, 'resolve'>): Promise<boolean> =>
    new Promise((resolve) => {
      pending.current?.resolve(false)
      const next = { ...details, resolve }
      pending.current = next
      setTyped('')
      setRequest(next)
    })
  const dialog = request && (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70">
      <div
        ref={panel}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        className="w-full max-w-md rounded-xl border border-border bg-surface-1 p-6 space-y-4"
      >
        <h2 id="confirm-title" className="font-semibold">
          {request.title}
        </h2>
        <p id="confirm-message" className="text-sm text-text-secondary">
          {request.message}
        </p>
        {request.production && (
          <label className="block text-sm text-danger">
            Production cluster: type {request.resource}
            <input
              aria-label="Resource name confirmation"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="mt-2 w-full rounded border border-border bg-surface-2 p-2 text-text-primary"
            />
          </label>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={() => finish(false)} className="rounded bg-surface-3 px-4 py-2">
            Cancel
          </button>
          <button
            disabled={request.production && typed !== request.resource}
            onClick={() => finish(true)}
            className="rounded bg-danger px-4 py-2 text-white disabled:opacity-40"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
  return { confirm, dialog }
}
