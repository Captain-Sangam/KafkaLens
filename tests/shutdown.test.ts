import { describe, it, expect, vi } from 'vitest'
import { beginShutdown } from '../apps/desktop/src/main/lib/shutdown'
describe('bounded app shutdown', () => {
  it('closes persistence and quits when pending broker reads never finish, once only', async () => {
    vi.useFakeTimers()
    try {
      let release!: () => void
      const disconnect = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            release = resolve
          })
      )
      const close = vi.fn(),
        quit = vi.fn()
      beginShutdown(disconnect, close, quit)
      await vi.advanceTimersByTimeAsync(5000)
      expect(close).toHaveBeenCalledOnce()
      expect(quit).toHaveBeenCalledOnce()
      release()
      await vi.advanceTimersByTimeAsync(0)
      expect(close).toHaveBeenCalledOnce()
      expect(quit).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })
  it('quits immediately after normal disconnection instead of waiting for the timeout', async () => {
    vi.useFakeTimers()
    try {
      const close = vi.fn(),
        quit = vi.fn()
      beginShutdown(async () => {}, close, quit)
      await vi.advanceTimersByTimeAsync(0)
      expect(quit).toHaveBeenCalledOnce()
      expect(close).toHaveBeenCalledOnce()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
