import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import type { AppSettings } from '@shared/types';

type OverlayPhase = 'idle' | 'listening' | 'processing' | 'result' | 'error';

const BAR_COUNT = 14;
const TARGET_SAMPLE_RATE = 16_000;
const ZERO_BARS = new Array(BAR_COUNT).fill(0);
const EXIT_ANIMATION_MS = 260;

function OverlayApp(): JSX.Element {
  const [phase, setPhase] = useState<OverlayPhase>('idle');
  const [volumes, setVolumes] = useState<number[]>(() => [...ZERO_BARS]);
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const animationFrame = useRef<number>();
  const deviceLabelRef = useRef<string | null>(null);
  const isListeningRef = useRef(false);
  const hideTimeoutRef = useRef<number>();
  const exitTimeoutRef = useRef<number>();

  const clearTimers = () => {
    window.clearTimeout(hideTimeoutRef.current);
    window.clearTimeout(exitTimeoutRef.current);
  };

  const resetVolumes = () => {
    setVolumes(() => [...ZERO_BARS]);
  };

  const scheduleHide = (delay = 360) => {
    clearTimers();
    hideTimeoutRef.current = window.setTimeout(() => {
      setIsClosing(true);
      exitTimeoutRef.current = window.setTimeout(() => {
        setIsVisible(false);
        setIsClosing(false);
        setPhase('idle');
        resetVolumes();
        window.electronAPI.requestOverlayHide();
      }, EXIT_ANIMATION_MS);
    }, delay);
  };

  const resetAudioState = () => {
    mediaRecorderRef.current = null;
    analyserRef.current?.disconnect();
    audioContextRef.current?.close().catch(() => undefined);
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());

    analyserRef.current = null;
    audioContextRef.current = null;
    mediaStreamRef.current = null;
    mediaChunksRef.current = [];
    isListeningRef.current = false;
    deviceLabelRef.current = null;

    if (animationFrame.current) {
      cancelAnimationFrame(animationFrame.current);
      animationFrame.current = undefined;
    }
  };

  const updateVolumeBars = () => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const frequencyData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(frequencyData);

    const bucketSize = Math.max(1, Math.floor(frequencyData.length / BAR_COUNT));
    const nextVolumes: number[] = new Array(BAR_COUNT).fill(0);

    for (let index = 0; index < BAR_COUNT; index += 1) {
      let bucketSum = 0;
      for (let inner = 0; inner < bucketSize; inner += 1) {
        const dataIndex = index * bucketSize + inner;
        bucketSum += frequencyData[Math.min(dataIndex, frequencyData.length - 1)];
      }
      const average = bucketSum / bucketSize;
      const normalized = Math.max(0.12, Math.min(1, average / 160));
      nextVolumes[index] = normalized;
    }

    setVolumes(nextVolumes);
    animationFrame.current = requestAnimationFrame(updateVolumeBars);
  };

  const startRecording = async (activeSettings: AppSettings) => {
    try {
      clearTimers();
      setIsClosing(false);
      setIsVisible(true);
      setPhase('listening');
      resetVolumes();

      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: activeSettings.deviceId ? { exact: activeSettings.deviceId } : undefined,
          noiseSuppression: true,
          echoCancellation: true
        },
        video: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;
      const track = stream.getAudioTracks()[0];
      deviceLabelRef.current = track?.label ?? null;

      const audioContext = new AudioContext();
      await audioContext.resume();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.6;
      analyser.minDecibels = -90;
      analyser.maxDecibels = -10;
      analyserRef.current = analyser;
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;
      source.connect(analyser);
      analyser.connect(silentGain);
      silentGain.connect(audioContext.destination);

      mediaChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) {
          mediaChunksRef.current.push(event.data);
        }
      });
      recorder.start();
      mediaRecorderRef.current = recorder;

      animationFrame.current = requestAnimationFrame(updateVolumeBars);
      isListeningRef.current = true;
      window.electronAPI.updateRecordingState('started');
    } catch (error) {
      console.error('No se pudo iniciar la grabación', error);
      resetAudioState();
      setPhase('error');
      resetVolumes();
      window.electronAPI.updateRecordingState('stopped');
      scheduleHide(640);
    }
  };

  const downsampleBuffer = (buffer: Float32Array, fromRate: number, toRate: number) => {
    if (fromRate === toRate) {
      return buffer;
    }

    const ratio = fromRate / toRate;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;

    while (offsetResult < newLength) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
      let accum = 0;
      let count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i += 1) {
        accum += buffer[i];
        count += 1;
      }
      result[offsetResult] = accum / (count || 1);
      offsetResult += 1;
      offsetBuffer = nextOffsetBuffer;
    }

    return result;
  };

  const encodeWav = (samples: Float32Array, sampleRate: number): ArrayBuffer => {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i += 1) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    const floatTo16BitPCM = (offset: number, input: Float32Array) => {
      for (let i = 0; i < input.length; i += 1, offset += 2) {
        let s = Math.max(-1, Math.min(1, input[i]));
        s = s < 0 ? s * 0x8000 : s * 0x7fff;
        view.setInt16(offset, s, true);
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, samples.length * 2, true);

    floatTo16BitPCM(44, samples);
    return buffer;
  };

  const stopRecorder = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      return Promise.reject(new Error('Recorder no disponible'));
    }

    return new Promise<Blob>((resolve, reject) => {
      const cleanup = () => {
        recorder.removeEventListener('stop', handleStop);
        recorder.removeEventListener('error', handleError as EventListener);
      };

      const handleStop = async () => {
        cleanup();
        try {
          const blob = new Blob(mediaChunksRef.current, {
            type: recorder.mimeType || 'audio/webm'
          });
          resolve(blob);
        } catch (error) {
          reject(error);
        }
      };

      const handleError = (event: Event) => {
        cleanup();
        reject(event instanceof ErrorEvent ? event.error : event);
      };

      recorder.addEventListener('stop', handleStop, { once: true });
      recorder.addEventListener('error', handleError, { once: true });
      recorder.stop();
    });
  };

  const collectMonoBuffer = async (blob: Blob) => {
    const context = new AudioContext();
    const arrayBuffer = await blob.arrayBuffer();
    const decoded = await context.decodeAudioData(arrayBuffer.slice(0));
    await context.close();

    const channelCount = decoded.numberOfChannels;
    const frameCount = decoded.length;
    const mono = new Float32Array(frameCount);

    for (let channel = 0; channel < channelCount; channel += 1) {
      const data = decoded.getChannelData(channel);
      for (let i = 0; i < frameCount; i += 1) {
        mono[i] += data[i] / channelCount;
      }
    }

    return { mono, sampleRate: decoded.sampleRate };
  };

  const stopRecording = async () => {
    if (!isListeningRef.current) {
      scheduleHide(220);
      return;
    }

    setPhase('processing');
    setIsVisible(true);
    setIsClosing(false);
    window.electronAPI.updateRecordingState('stopped');

    let audioBlob: Blob;
    try {
      audioBlob = await stopRecorder();
    } catch (error) {
      console.error('No se pudo detener el recorder', error);
      resetAudioState();
      setPhase('error');
      scheduleHide(520);
      return;
    }

    resetAudioState();

    if (!audioBlob.size) {
      setPhase('error');
      scheduleHide(520);
      return;
    }

    const { mono, sampleRate } = await collectMonoBuffer(audioBlob);
    const downsampled = downsampleBuffer(mono, sampleRate, TARGET_SAMPLE_RATE);
    const wavBuffer = encodeWav(downsampled, TARGET_SAMPLE_RATE);
    const durationMs = Math.round((downsampled.length / TARGET_SAMPLE_RATE) * 1000);

    const response = await window.electronAPI.submitTranscription({
      audioData: wavBuffer,
      durationMs,
      deviceLabel: deviceLabelRef.current
    });

    if (!response.success) {
      setPhase('error');
      resetVolumes();
      scheduleHide(720);
      return;
    }

    setPhase('result');
    resetVolumes();
    scheduleHide(440);
  };

  useEffect(() => {
    const unsubscribeStart = window.electronAPI.onOverlayStart((activeSettings) => {
      startRecording(activeSettings).catch((error) => {
        console.error('Error al iniciar la grabación', error);
      });
    });

    const unsubscribeStop = window.electronAPI.onOverlayStop(() => {
      stopRecording().catch((error) => {
        console.error('Error al detener la grabación', error);
      });
    });

    const unsubscribeComplete = window.electronAPI.onOverlayComplete(() => {
      setPhase('result');
      setIsVisible(true);
      setIsClosing(false);
      scheduleHide(360);
    });

    window.electronAPI.markOverlayReady();

    return () => {
      unsubscribeStart();
      unsubscribeStop();
      unsubscribeComplete();
      clearTimers();
      resetAudioState();
    };
  }, []);

  useEffect(() => {
    if (phase !== 'listening') {
      resetVolumes();
    }
  }, [phase]);

  const bars = useMemo(
    () =>
      volumes.map((value, index) => (
        <div
          key={index}
          className="wave-bar"
          style={{ transform: `scaleY(${Math.max(0.18, value)})` }}
        />
      )),
    [volumes]
  );

  let content: JSX.Element | null = null;
  if (phase === 'listening') {
    content = <div className="waveform">{bars}</div>;
  } else if (phase === 'processing') {
    content = <div className="loader" aria-hidden />;
  } else if (phase === 'result') {
    content = <div className="checkmark" aria-hidden />;
  } else if (phase === 'error') {
    content = <div className="error-indicator" aria-hidden />;
  }

  const containerClassName = [
    'overlay-container',
    `overlay--${phase}`,
    isVisible ? 'overlay--visible' : '',
    isClosing ? 'overlay--closing' : ''
  ]
    .filter(Boolean)
    .join(' ');

  return <div className={containerClassName}>{content}</div>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <OverlayApp />
  </React.StrictMode>
);
