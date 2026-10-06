/**
 * Electron main process: one window around the Vite build (or the dev server). No Steam yet;
 * see docs/steam.md for what remains. Game rules never live here.
 */
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { registerShellHandlers } from './ipcHandlers.cjs'

// No heap or stack switches (app.commandLine.appendSwitch, js-flags): measured headroom ~88x,
// see docs/perf/runtime-flags.md (#102).

// electron:dev sets this to the Vite server; a packaged build loads dist/index.html instead.
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

function openGameWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 720,
    backgroundColor: '#1b1613',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })
  refuseNavigationAwayFromTheGame(window)
  loadGame(window)
  return window
}

function loadGame(window: BrowserWindow): void {
  if (DEV_SERVER_URL) void window.loadURL(DEV_SERVER_URL)
  else void window.loadFile(join(__dirname, '..', 'dist', 'index.html'))
}

/** The game is one page: no pop-ups, no navigating the window to another site. */
function refuseNavigationAwayFromTheGame(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
}

function startApp(): void {
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }
  void app.whenReady().then(() => {
    registerShellHandlers()
    openGameWindow()
  })
  app.on('window-all-closed', () => app.quit())
}

startApp()
