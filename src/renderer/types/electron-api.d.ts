import type { AppSettings, TranscriptPage, TranscriptQuery, TranscriptionRequest } from '@shared/types';

type Unsubscribe = () => void;

type TranscriptionResult =
  | { success: true; text: string; lang: string }
  | { success: false; error: string };

declare global {
  interface Window {
    electronAPI: {
      onOverlayStart(callback: (settings: AppSettings) => void): Unsubscribe;
      onOverlayStop(callback: () => void): Unsubscribe;
      onOverlaySettings(callback: (settings: AppSettings) => void): Unsubscribe;
      onOverlayComplete(callback: (payload: { text: string; lang: string; id: number }) => void): Unsubscribe;
      markOverlayReady(): void;
      updateRecordingState(state: 'started' | 'stopped'): void;
      requestOverlayHide(): void;
      submitTranscription(payload: TranscriptionRequest): Promise<TranscriptionResult>;
      getSettings(): Promise<AppSettings>;
      saveSettings(partial: Partial<AppSettings>): Promise<AppSettings>;
      onSettingsUpdated(callback: (settings: AppSettings) => void): Unsubscribe;
      listTranscripts(query: TranscriptQuery): Promise<TranscriptPage>;
      exportTranscripts(): Promise<{ success: boolean; message?: string; filePath?: string }>;
      onHistoryRefresh(callback: () => void): Unsubscribe;
      copyToClipboard(text: string): void;
      showHistory(): void;
      openSettings(): void;
      openPrivacyPolicy(): void;
    };
  }
}

export {};
