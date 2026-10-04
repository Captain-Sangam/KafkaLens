import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { registerAllIpcHandlers } from './ipc-handlers'
import { storeService } from './services/store-service'
import { aiService } from './services/ai-service'
import { kafkaService } from './services/kafka-service'
import { updateService } from './services/update-service'
import { beginShutdown } from './lib/shutdown'

const isDev = !app.isPackaged
if (process.env.KAFKALENS_TEST_DATA) app.setPath('userData', process.env.KAFKALENS_TEST_DATA)

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0a0a0f',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (['https:', 'http:'].includes(new URL(details.url).protocol)) shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) event.preventDefault()
  })
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

app.whenReady().then(() => {
  app.on('browser-window-created', (_, window) => {
    window.removeMenu()
  })

  storeService.init()
  aiService.setHistoryRecorder((feature, settings, response) =>
    storeService.recordAI(feature, settings, response)
  )

  const aiSettings = storeService.getAISettings()
  if (aiSettings?.enabled && aiSettings.apiKey) {
    aiService.configure(aiSettings)
  }

  registerAllIpcHandlers()
  createWindow()
  if (!isDev && !process.env.KAFKALENS_TEST_DATA) void updateService.check()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

let quitting = false
app.on('before-quit', (event) => {
  if (quitting) return
  event.preventDefault()
  quitting = true
  aiService.cancel()
  beginShutdown(
    () => kafkaService.disconnectAll(),
    () => storeService.close(),
    () => app.quit()
  )
})
