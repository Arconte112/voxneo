import { contextBridge, ipcRenderer } from 'electron';
import type { AppSettings, TranscriptPage, TranscriptQuery, TranscriptionRequest } from '../shared/types';

type Unsubscribe = () => void;

type TranscriptionResult =
  | { success: true; text: string; lang: string }
  | { success: false; error: string };

const electronAPI = {
  onOverlayStart(callback: (settings: AppSettings) => void): Unsubscribe {
    const listener = (_: unknown, payload: AppSettings) => callback(payload);
    ipcRenderer.on('overlay:start', listener);
    return () => ipcRenderer.removeListener('overlay:start', listener);
  },
  onOverlayStop(callback: () => void): Unsubscribe {
    const listener = () => callback();
    ipcRenderer.on('overlay:stop', listener);
    return () => ipcRenderer.removeListener('overlay:stop', listener);
  },
  onOverlaySettings(callback: (settings: AppSettings) => void): Unsubscribe {
    const listener = (_: unknown, payload: AppSettings) => callback(payload);
    ipcRenderer.on('overlay:settings', listener);
    return () => ipcRenderer.removeListener('overlay:settings', listener);
  },
  onOverlayComplete(
    callback: (payload: { text: string; lang: string; id: number }) => void
  ): Unsubscribe {
    const listener = (_: unknown, payload: { text: string; lang: string; id: number }) => callback(payload);
    ipcRenderer.on('overlay:transcription-complete', listener);
    return () => ipcRenderer.removeListener('overlay:transcription-complete', listener);
  },
  markOverlayReady(): void {
    ipcRenderer.send('overlay:ready');
  },
  updateRecordingState(state: 'started' | 'stopped'): void {
    ipcRenderer.send('overlay:recording-state', state);
  },
  requestOverlayHide(): void {
    ipcRenderer.send('overlay:hide');
  },
  submitTranscription(payload: TranscriptionRequest): Promise<TranscriptionResult> {
    const buffer = Buffer.from(payload.audioData);
    return ipcRenderer.invoke('transcription:submit', {
      audioData: buffer,
      durationMs: payload.durationMs,
      deviceLabel: payload.deviceLabel
    });
  },
  getSettings(): Promise<AppSettings> {
    return ipcRenderer.invoke('settings:get');
  },
  saveSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
    return ipcRenderer.invoke('settings:save', partial);
  },
  onSettingsUpdated(callback: (settings: AppSettings) => void): Unsubscribe {
    const listener = (_: unknown, payload: AppSettings) => callback(payload);
    ipcRenderer.on('settings:updated', listener);
    return () => ipcRenderer.removeListener('settings:updated', listener);
  },
  listTranscripts(query: TranscriptQuery): Promise<TranscriptPage> {
    return ipcRenderer.invoke('transcripts:list', query);
  },
  exportTranscripts(): Promise<{ success: boolean; message?: string; filePath?: string }> {
    return ipcRenderer.invoke('transcripts:export');
  },
  onHistoryRefresh(callback: () => void): Unsubscribe {
    const listener = () => callback();
    ipcRenderer.on('history:refresh', listener);
    return () => ipcRenderer.removeListener('history:refresh', listener);
  },
  copyToClipboard(text: string): void {
    ipcRenderer.send('clipboard:copy', text);
  },
  showHistory(): void {
    ipcRenderer.send('history:show');
  },
  minimizeDashboard(): void {
    ipcRenderer.send('history:minimize');
  },
  openSettings(): void {
    ipcRenderer.send('settings:open');
  },
  openPrivacyPolicy(): void {
    ipcRenderer.send('open:privacy-policy');
  }
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}
