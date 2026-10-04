import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateState } from '../../renderer/src/types'
export class UpdateService {
  private state: UpdateState = { status: app.isPackaged ? 'idle' : 'unsupported' }
  private initialized = false
  init(): void {
    if (this.initialized || !app.isPackaged) return
    this.initialized = true
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.on('checking-for-update', () => {
      this.state = { status: 'checking' }
    })
    autoUpdater.on('update-available', (info) => {
      this.state = { status: 'available', version: info.version }
    })
    autoUpdater.on('update-not-available', (info) => {
      this.state = { status: 'current', version: info.version }
    })
    autoUpdater.on('download-progress', (p) => {
      this.state = { ...this.state, status: 'downloading', percent: p.percent }
    })
    autoUpdater.on('update-downloaded', (info) => {
      this.state = { status: 'ready', version: info.version }
    })
    autoUpdater.on('error', () => {
      this.state = {
        status: 'error',
        error:
          'Could not update KafkaLens. Check your connection or download the release from GitHub.'
      }
    })
  }
  getState(): UpdateState {
    return { ...this.state }
  }
  async check(): Promise<UpdateState> {
    this.init()
    if (!app.isPackaged) return this.getState()
    if (['checking', 'downloading', 'ready'].includes(this.state.status)) return this.getState()
    try {
      await autoUpdater.checkForUpdates()
    } catch {
      this.state = {
        status: 'error',
        error: 'Could not check for updates. Check your connection or try again later.'
      }
    }
    return this.getState()
  }
  async download(): Promise<void> {
    if (this.state.status !== 'available')
      throw new Error('Check for an available update before downloading.')
    this.state = { ...this.state, status: 'downloading', percent: 0 }
    try {
      await autoUpdater.downloadUpdate()
    } catch {
      this.state = {
        status: 'error',
        error: 'Update download failed. Check your connection and try again.'
      }
      throw new Error(this.state.error)
    }
  }
  install(): void {
    if (this.state.status !== 'ready') throw new Error('Download an update before restarting.')
    // The explicit Restart button is the only action that installs an update.
    setImmediate(() => autoUpdater.quitAndInstall(false, true))
  }
}
export const updateService = new UpdateService()
