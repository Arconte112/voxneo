import Store from 'electron-store';
import type { AppSettings } from '../shared/types';

type StoreAdapter = {
  get<Key extends keyof AppSettings>(key: Key): AppSettings[Key] | undefined;
  set(value: Partial<AppSettings>): void;
};

const DEFAULT_SETTINGS: AppSettings = {
  model: 'whisper-large-v3-turbo',
  language: 'es',
  hotkey: 'Ctrl+Space',
  autoPaste: true,
  deviceId: null,
  launchOnStartup: false
};

class SettingsStore {
  private store: StoreAdapter;

  constructor() {
    this.store = new Store<AppSettings>({
      name: 'settings',
      defaults: DEFAULT_SETTINGS
    }) as unknown as StoreAdapter;
  }

  get(): AppSettings {
    return {
      model: this.store.get('model') ?? DEFAULT_SETTINGS.model,
      language: this.store.get('language') ?? DEFAULT_SETTINGS.language,
      hotkey: this.store.get('hotkey') ?? DEFAULT_SETTINGS.hotkey,
      autoPaste: this.store.get('autoPaste') ?? DEFAULT_SETTINGS.autoPaste,
      deviceId: this.store.get('deviceId') ?? DEFAULT_SETTINGS.deviceId,
      launchOnStartup: this.store.get('launchOnStartup') ?? DEFAULT_SETTINGS.launchOnStartup
    };
  }

  set(settings: AppSettings): void {
    this.store.set(settings);
  }

  update(partial: Partial<AppSettings>): AppSettings {
    const merged = { ...this.get(), ...partial };
    this.set(merged);
    return merged;
  }
}

export const settingsStore = new SettingsStore();
export const DEFAULT_APP_SETTINGS = DEFAULT_SETTINGS;
