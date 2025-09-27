export type TranscriptRecord = {
  id: number;
  text: string;
  lang: string;
  durationMs: number;
  createdAt: string;
  device: string | null;
};

export type TranscriptQuery = {
  page: number;
  pageSize: number;
  search?: string;
};

export type TranscriptPage = {
  data: TranscriptRecord[];
  total: number;
  page: number;
  pageSize: number;
};

export type AppSettings = {
  model: string;
  language: string;
  hotkey: string;
  autoPaste: boolean;
  deviceId: string | null;
  launchOnStartup: boolean;
};

export type TranscriptionRequest = {
  audioData: ArrayBuffer;
  durationMs: number;
  deviceLabel: string | null;
};

export type TranscriptionResponse = {
  text: string;
  lang: string;
};

export type ToastPayload = {
  id?: string;
  type: 'info' | 'success' | 'error';
  message: string;
};
