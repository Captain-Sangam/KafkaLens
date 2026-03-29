import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { registerAllIpcHandlers } from './ipc-handlers'
import { storeService } from './services/store-service'
import { aiService } from './services/ai-service'

const isDev = !app.isPackaged

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
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
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

  const aiSettings = storeService.getAISettings()
  if (aiSettings?.enabled && aiSettings.apiKey) {
    aiService.configure({
      provider: aiSettings.provider as 'openai' | 'anthropic' | 'google',
      apiKey: aiSettings.apiKey,
      model: aiSettings.model,
      redactedFields: aiSettings.redactedFields.split(',').map((s) => s.trim()).filter(Boolean)
    })
  }

  registerAllIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

