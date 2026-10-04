import { beforeEach, describe, expect, it, vi } from 'vitest'
const updater = vi.hoisted(() => ({
  handlers: new Map<string, (value: { version?: string; percent?: number }) => void>(),
  on: vi.fn(),
  checkForUpdates: vi.fn(),
  downloadUpdate: vi.fn(),
  quitAndInstall: vi.fn(),
  autoDownload: true,
  autoInstallOnAppQuit: true
}))
vi.mock('electron', () => ({ app: { isPackaged: true } }))
vi.mock('electron-updater', () => ({ autoUpdater: updater }))
import { UpdateService } from '../apps/desktop/src/main/services/update-service'
beforeEach(() => {
  vi.clearAllMocks()
  updater.handlers.clear()
  updater.on.mockImplementation((event: string, fn) => updater.handlers.set(event, fn))
  updater.checkForUpdates.mockImplementation(async () =>
    updater.handlers.get('update-available')?.({ version: '2.0.0' })
  )
  updater.downloadUpdate.mockImplementation(async () =>
    updater.handlers.get('update-downloaded')?.({ version: '2.0.0' })
  )
})
describe('explicit update actions', () => {
  it('requires availability, downloads only on request, and requires readiness to install', async () => {
    const service = new UpdateService()
    await expect(service.download()).rejects.toThrow('Check for')
    expect(() => service.install()).toThrow('Download')
    expect((await service.check()).status).toBe('available')
    expect(updater.downloadUpdate).not.toHaveBeenCalled()
    expect(updater.autoDownload).toBe(false)
    expect(updater.autoInstallOnAppQuit).toBe(false)
    await service.download()
    expect(service.getState()).toEqual({ status: 'ready', version: '2.0.0' })
    service.install()
    await new Promise((resolve) => setImmediate(resolve))
    expect(updater.quitAndInstall).toHaveBeenCalledOnce()
  })
  it('preserves a downloaded update when another check is requested', async () => {
    const service = new UpdateService()
    await service.check()
    await service.download()
    await service.check()
    expect(updater.checkForUpdates).toHaveBeenCalledOnce()
    expect(service.getState().status).toBe('ready')
  })
  it('returns an actionable error without exposing updater internals', async () => {
    updater.checkForUpdates.mockRejectedValue(new Error('private-token'))
    const service = new UpdateService()
    const state = await service.check()
    expect(state.status).toBe('error')
    expect(state.error).toContain('connection')
    expect(state.error).not.toContain('private-token')
  })
})
