import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import type { AppSettings } from '@shared/types';

type AudioDevice = {
  id: string;
  label: string;
};

const MODEL_OPTIONS = ['whisper-large-v3-turbo', 'whisper-large-v3', 'whisper-large-v2'];
const LANGUAGE_OPTIONS = ['es', 'en', 'pt', 'fr'];

function SettingsApp(): JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selectedDeviceLabel = useMemo(() => {
    if (!settings?.deviceId) return 'Predeterminado del sistema';
    return devices.find((device) => device.id === settings.deviceId)?.label ?? 'Predeterminado del sistema';
  }, [settings, devices]);

  useEffect(() => {
    window.electronAPI.getSettings().then(setSettings);
  }, []);

  useEffect(() => {
    const loadDevices = async () => {
      try {
        const available = await navigator.mediaDevices.enumerateDevices();
        const audio = available
          .filter((device) => device.kind === 'audioinput')
          .map((device) => ({ id: device.deviceId, label: device.label || 'Entrada sin nombre' }));
        setDevices(audio);
      } catch (error) {
        console.error('No se pudieron enumerar los dispositivos de audio', error);
      }
    };

    loadDevices().catch(console.error);
    navigator.mediaDevices.addEventListener('devicechange', loadDevices);
    return () => navigator.mediaDevices.removeEventListener('devicechange', loadDevices);
  }, []);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onSettingsUpdated(setSettings);
    return () => unsubscribe();
  }, []);

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleHotkeyCapture: React.KeyboardEventHandler<HTMLInputElement> = (event) => {
    event.preventDefault();
    const keys: string[] = [];
    if (event.ctrlKey) keys.push('Ctrl');
    if (event.shiftKey) keys.push('Shift');
    if (event.altKey) keys.push('Alt');
    if (event.metaKey) keys.push('Super');

    const key = event.key;
    if (!['Control', 'Shift', 'Alt', 'Meta'].includes(key)) {
      const normalized = key.length === 1 ? key.toUpperCase() : key;
      keys.push(normalized);
    }

    if (!keys.length) {
      return;
    }

    const combo = keys.join('+');
    updateSetting('hotkey', combo);
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setMessage(null);
    try {
      const updated = await window.electronAPI.saveSettings(settings);
      setSettings(updated);
      setMessage('Ajustes guardados');
    } catch (error) {
      console.error('No se pudieron guardar los ajustes', error);
      setMessage('Error al guardar');
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 2500);
    }
  };

  if (!settings) {
    return <div className="table-container">Cargando ajustes…</div>;
  }

  return (
    <div className="table-container">
      <h1 className="section-title">Ajustes de Voxneo</h1>
      {message ? <div style={{ marginBottom: 12, color: '#f5f5f5', opacity: 0.7 }}>{message}</div> : null}
      <div className="form-grid">
        <label>
          Modelo
          <select value={settings.model} onChange={(event) => updateSetting('model', event.target.value)}>
            {MODEL_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
            {!MODEL_OPTIONS.includes(settings.model) ? (
              <option value={settings.model}>{settings.model}</option>
            ) : null}
          </select>
        </label>
        <label>
          Idioma fuente
          <select value={settings.language} onChange={(event) => updateSetting('language', event.target.value)}>
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
            {!LANGUAGE_OPTIONS.includes(settings.language) ? (
              <option value={settings.language}>{settings.language}</option>
            ) : null}
          </select>
        </label>
        <label>
          Atajo global
          <input
            value={settings.hotkey}
            onKeyDown={handleHotkeyCapture}
            readOnly
            placeholder="Ctrl+Space"
          />
          <small style={{ opacity: 0.6 }}>Pulsa la combinación deseada con la ventana activa.</small>
        </label>
        <label className="switch">
          <input
            type="checkbox"
            checked={settings.autoPaste}
            onChange={(event) => updateSetting('autoPaste', event.target.checked)}
          />
          Auto pegar en campos editables
        </label>
        <label>
          Dispositivo de entrada
          <select
            value={settings.deviceId ?? ''}
            onChange={(event) => updateSetting('deviceId', event.target.value || null)}
          >
            <option value="">Predeterminado del sistema</option>
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.label || 'Entrada sin nombre'}
              </option>
            ))}
          </select>
          <small style={{ opacity: 0.6 }}>Actual: {selectedDeviceLabel}</small>
        </label>
        <label className="switch">
          <input
            type="checkbox"
            checked={settings.launchOnStartup}
            onChange={(event) => updateSetting('launchOnStartup', event.target.checked)}
          />
          Abrir al iniciar Windows
        </label>
      </div>

      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ margin: 0, fontSize: 13, opacity: 0.75 }}>
            Privacidad: Voxneo procesa audio localmente y solo envía el archivo a Groq para transcripción.
          </p>
          <button style={{ marginTop: 8 }} onClick={() => window.electronAPI.openPrivacyPolicy()}>
            Ver política de datos
          </button>
        </div>
        <button onClick={handleSave} disabled={saving} style={{ minWidth: 140 }}>
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SettingsApp />
  </React.StrictMode>
);
