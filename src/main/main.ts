import 'dotenv/config';
import {
  app,
  BrowserWindow,
  Notification,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  shell,
  Tray,
  screen
} from 'electron';
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { settingsStore } from './settings';
import { TranscriptDatabase } from './database';
import { GroqTranscriber } from './transcriber';
import type { AppSettings, TranscriptPage, TranscriptQuery, TranscriptionRequest } from '../shared/types';

const rendererDevServer = process.env.ELECTRON_RENDERER_URL ?? null;
const isDev = Boolean(rendererDevServer);

let overlayWindow: BrowserWindow | null = null;
let historyWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isRecording = false;
let overlayReady = false;
let pendingOverlayStart: AppSettings | null = null;

const db = new TranscriptDatabase();
const initialSettings = settingsStore.get();
const transcriber = new GroqTranscriber({
  apiKey: initialSettings.groqApiKey,
  language: initialSettings.language,
  model: initialSettings.model
});

function resolveRendererPath(file: string): string {
  if (rendererDevServer) {
    return `${rendererDevServer.replace(/\/?$/, '/')}${file}`;
  }
  return path.join(__dirname, '../renderer', file);
}

function getAssetPath(...segments: string[]): string {
  if (isDev) {
    return path.join(process.cwd(), 'assets', ...segments);
  }
  return path.join(app.getAppPath(), 'assets', ...segments);
}

function createOverlayWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 280,
    height: 160,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: isDev
    }
  });

  window.setMenu(null);
  window.setIgnoreMouseEvents(true, { forward: true });
  loadWindowURL(window, 'overlay.html');

  window.once('ready-to-show', () => {
    positionOverlay(window);
  });

  window.on('closed', () => {
    overlayWindow = null;
    overlayReady = false;
    pendingOverlayStart = null;
    isRecording = false;
  });

  return window;
}

function positionOverlay(window: BrowserWindow): void {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight, x, y } = primaryDisplay.workArea;
  const [winWidth, winHeight] = window.getSize();
  const horizontal = x + Math.round((screenWidth - winWidth) / 2);
  const vertical = y + screenHeight - winHeight - 24;
  window.setPosition(horizontal, vertical);
}

function createHistoryWindow(): BrowserWindow {
  if (historyWindow) {
    return historyWindow;
  }

  historyWindow = new BrowserWindow({
    width: 920,
    height: 640,
    show: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    transparent: false,
    hasShadow: true,
    backgroundColor: '#0b0b0f',
    skipTaskbar: true,
    title: 'Dashboard de transcripciones',
    icon: getAssetPath('icon-256.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: isDev
    }
  });

  historyWindow.setMenu(null);
  historyWindow.setSkipTaskbar(true);
  historyWindow.setMinimumSize(920, 640);
  historyWindow.setMaximumSize(920, 640);
  loadWindowURL(historyWindow, 'history.html');
  historyWindow.on('closed', () => {
    historyWindow = null;
  });

  return historyWindow;
}

function createSettingsWindow(): BrowserWindow {
  if (settingsWindow) {
    return settingsWindow;
  }

  settingsWindow = new BrowserWindow({
    width: 520,
    height: 460,
    resizable: false,
    show: false,
    frame: false,
    transparent: false,
    hasShadow: true,
    backgroundColor: '#0b0b0f',
    skipTaskbar: true,
    title: 'Ajustes',
    icon: getAssetPath('icon-256.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: isDev
    }
  });

  settingsWindow.setMenu(null);
  settingsWindow.setSkipTaskbar(true);
  settingsWindow.setMinimumSize(520, 460);
  settingsWindow.setMaximumSize(520, 460);
  loadWindowURL(settingsWindow, 'settings.html');
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });

  return settingsWindow;
}

function loadWindowURL(window: BrowserWindow, file: string): void {
  const url = resolveRendererPath(file);
  if (isDev) {
    window.loadURL(url).catch(console.error);
  } else {
    window.loadFile(url).catch(console.error);
  }
}

function registerTray(): void {
  const trayIcon = nativeImage.createFromPath(getAssetPath('icon-tray.png'));
  tray = new Tray(trayIcon);
  tray.setToolTip('Voxneo — Dashboard y control');

  tray.on('double-click', () => {
    const window = createHistoryWindow();
    window.show();
    window.focus();
  });

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Abrir dashboard',
      click: () => {
        const window = createHistoryWindow();
        window.show();
        window.focus();
      }
    },
    {
      label: 'Ajustes',
      click: () => {
        const window = createSettingsWindow();
        window.show();
        window.focus();
      }
    },
    {
      label: 'Alternar grabación (Ctrl+Space)',
      click: () => toggleRecording()
    },
    { type: 'separator' },
    {
      label: 'Salir',
      role: 'quit'
    }
  ]);

  tray.setContextMenu(contextMenu);
}

function toggleRecording(): void {
  if (!overlayWindow) {
    overlayWindow = createOverlayWindow();
  }

  if (!isRecording) {
    isRecording = true;
    overlayWindow?.showInactive();
    positionOverlay(overlayWindow);
    const currentSettings = settingsStore.get();
    if (!overlayReady) {
      pendingOverlayStart = currentSettings;
      return;
    }
    overlayWindow?.webContents.send('overlay:start', currentSettings);
  } else {
    if (!overlayReady && pendingOverlayStart) {
      pendingOverlayStart = null;
      isRecording = false;
      overlayWindow?.hide();
      return;
    }
    overlayWindow?.webContents.send('overlay:stop');
  }
}

function updateGlobalShortcut(settings: AppSettings): void {
  globalShortcut.unregisterAll();
  const success = globalShortcut.register(settings.hotkey, () => {
    toggleRecording();
  });

  if (!success) {
    console.error(`No se pudo registrar el atajo ${settings.hotkey}`);
  }
}

function ensureStartupSetting(enabled: boolean): void {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    name: 'Voxneo'
  });
}

function handleTranscriptionResult(
  text: string,
  lang: string,
  durationMs: number,
  deviceLabel: string | null
): void {
  clipboard.writeText(text);

  const settings = settingsStore.get();
  if (settings.autoPaste) {
    import('@nut-tree/nut-js')
      .then(async (nut) => {
        const { keyboard, Key } = nut;
        await keyboard.pressKey(Key.LeftControl, Key.V);
        await keyboard.releaseKey(Key.LeftControl, Key.V);
      })
      .catch(async (error: unknown) => {
        const isModuleMissing = Boolean(
          error &&
            typeof error === 'object' &&
            'code' in error &&
            (error as { code?: string }).code === 'MODULE_NOT_FOUND'
        );

        if (isModuleMissing && process.platform === 'win32') {
          try {
            const { exec } = await import('node:child_process');
            await new Promise<void>((resolve, reject) => {
              exec("powershell -Command \"Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')\"", (cmdError) => {
                if (cmdError) {
                  reject(cmdError);
                } else {
                  resolve();
                }
              });
            });
            return;
          } catch (fallbackError) {
            console.error('Error al simular Ctrl+V con PowerShell', fallbackError);
            return;
          }
        }

        if (!isModuleMissing) {
          console.error('Error al simular Ctrl+V', error);
        }
      });
  }

  const id = db.insert({ text, lang, durationMs, device: deviceLabel ?? null });

  overlayWindow?.webContents.send('overlay:transcription-complete', { text, lang, id });
  historyWindow?.webContents.send('history:refresh');
}

app.whenReady().then(() => {
  const settings = settingsStore.get();
  updateGlobalShortcut(settings);
  ensureStartupSetting(settings.launchOnStartup);
  app.setAppUserModelId('com.voxneo.app');

  registerTray();

  screen.on('display-metrics-changed', () => {
    if (overlayWindow) {
      positionOverlay(overlayWindow);
    }
  });

  app.on('browser-window-focus', (_, window) => {
    if (window === overlayWindow) {
      overlayWindow?.setAlwaysOnTop(true);
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

ipcMain.on('overlay:ready', (event) => {
  if (event.sender === overlayWindow?.webContents) {
    overlayReady = true;
    event.sender.send('overlay:settings', settingsStore.get());
    if (isRecording && pendingOverlayStart) {
      overlayWindow?.webContents.send('overlay:start', pendingOverlayStart);
      pendingOverlayStart = null;
    }
  }
});

ipcMain.on('overlay:recording-state', (_, state: 'started' | 'stopped') => {
  if (state === 'stopped') {
    isRecording = false;
    pendingOverlayStart = null;
  }
});

ipcMain.on('overlay:hide', () => {
  overlayWindow?.hide();
});

ipcMain.handle('transcription:submit', async (_event, payload: TranscriptionRequest) => {
  try {
    const buffer = Buffer.from(payload.audioData);
    const result = await transcriber.transcribe(buffer);
    handleTranscriptionResult(result.text, result.language, payload.durationMs, payload.deviceLabel);
    return { success: true, text: result.text, lang: result.language } as const;
  } catch (error) {
    console.error('Transcription error', error);
    const message = error instanceof Error ? error.message : 'Error desconocido';
    if (Notification.isSupported()) {
      new Notification({ title: 'Voxneo', body: message }).show();
    }
    return { success: false, error: message } as const;
  } finally {
    isRecording = false;
  }
});

ipcMain.handle('settings:get', async () => {
  return settingsStore.get();
});

ipcMain.handle('settings:save', async (_event, partial: Partial<AppSettings>) => {
  const updated = settingsStore.update(partial);
  transcriber.update({
    apiKey: updated.groqApiKey,
    language: updated.language,
    model: updated.model
  });

  updateGlobalShortcut(updated);
  ensureStartupSetting(updated.launchOnStartup);

  overlayWindow?.webContents.send('overlay:settings', updated);
  settingsWindow?.webContents.send('settings:updated', updated);
  return updated;
});

ipcMain.handle('transcripts:list', async (_event, query: TranscriptQuery) => {
  const safeQuery: TranscriptQuery = {
    page: Math.max(1, query.page),
    pageSize: Math.min(100, Math.max(5, query.pageSize)),
    search: query.search?.trim() || undefined
  };

  const { data, total } = db.list(safeQuery);
  const page: TranscriptPage = {
    data,
    total,
    page: safeQuery.page,
    pageSize: safeQuery.pageSize
  };
  return page;
});

ipcMain.handle('transcripts:export', async (event) => {
  const rows = db.exportAll();
  if (!rows.length) {
    return { success: false, message: 'No hay registros para exportar' } as const;
  }

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Exportar CSV',
    defaultPath: 'transcripciones.csv',
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  });

  if (canceled || !filePath) {
    return { success: false, message: 'Exportación cancelada' } as const;
  }

  const header = 'id,text,lang,duration_ms,created_at,device\n';
  const csvBody = rows
    .map((row) =>
      [
        row.id,
        escapeCsv(row.text),
        escapeCsv(row.lang),
        row.durationMs,
        row.createdAt,
        escapeCsv(row.device ?? '')
      ].join(',')
    )
    .join('\n');

  writeFileSync(filePath, header + csvBody, 'utf-8');

  return { success: true, filePath } as const;
});

ipcMain.on('history:show', () => {
  const window = createHistoryWindow();
  window.show();
  window.focus();
});

ipcMain.on('history:minimize', () => {
  if (!historyWindow) {
    historyWindow = createHistoryWindow();
  }
  historyWindow?.minimize();
});

ipcMain.on('settings:open', () => {
  const window = createSettingsWindow();
  window.show();
  window.focus();
});

ipcMain.on('clipboard:copy', (_event, rawText: string) => {
  clipboard.writeText(String(rawText ?? ''));
});

ipcMain.on('open:privacy-policy', () => {
  shell.openExternal('https://groq.com/privacy');
});

function escapeCsv(value: string | number): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

// Ensure single instance
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const window = createHistoryWindow();
    window.show();
    window.focus();
  });
}
