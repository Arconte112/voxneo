import { setTimeout as delay } from 'node:timers/promises';

const API_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

export type TranscriptionOptions = {
  apiKey: string;
  language: string;
  model: string;
  timeoutMs?: number;
  maxRetries?: number;
};

export class GroqTranscriber {
  private apiKey: string;
  private language: string;
  private model: string;
  private timeoutMs: number;
  private maxRetries: number;

  constructor(options: TranscriptionOptions) {
    this.apiKey = options.apiKey;
    this.language = options.language;
    this.model = options.model;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.maxRetries = options.maxRetries ?? 3;
  }

  update(options: Partial<Omit<TranscriptionOptions, 'apiKey'>> & { apiKey?: string }): void {
    if (options.apiKey) this.apiKey = options.apiKey;
    if (options.language) this.language = options.language;
    if (options.model) this.model = options.model;
    if (options.timeoutMs) this.timeoutMs = options.timeoutMs;
    if (options.maxRetries) this.maxRetries = options.maxRetries;
  }

  async transcribe(audioBuffer: Buffer): Promise<{ text: string; language: string }> {
    if (!this.apiKey) {
      throw new Error('GROQ_API_KEY is missing');
    }

    let attempt = 0;
    let lastError: unknown;

    while (attempt < this.maxRetries) {
      attempt += 1;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const form = new FormData();
        const uint8 = new Uint8Array(audioBuffer);
        const blob = new Blob([uint8], { type: 'audio/wav' });
        form.append('file', blob, 'audio.wav');
        form.append('model', this.model);
        form.append('response_format', 'json');
        form.append('temperature', '0');
        form.append('language', this.language);

        const response = await fetch(API_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`
          },
          body: form,
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const detail = await response.text();
          throw new Error(`Groq API error (${response.status}): ${detail}`);
        }

        const data = (await response.json()) as { text?: string; language?: string };
        if (!data.text) {
          throw new Error('Groq API returned empty response');
        }

        return {
          text: data.text,
          language: data.language ?? this.language
        };
      } catch (error) {
        lastError = error;
        if (attempt >= this.maxRetries) {
          break;
        }
        const backoff = Math.min(2000 * 2 ** (attempt - 1), 8000);
        await delay(backoff);
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Unknown transcription error');
  }
}
