import type { LanguageCode, WsServerMessage } from '../types/khata';
import { requestVoiceTtsApi } from './api';
import { getSpeechLang } from './i18n';

export interface VoiceClientCallbacks {
  onStatusChange: (connected: boolean) => void;
  onVolume: (level01: number) => void;
  onMessage: (msg: WsServerMessage) => void;
  onError: (errMsg: string) => void;
}

export interface RecordedAudioResult {
  audioBase64: string;
  mimeType: string;
  sizeBytes: number;
  durationMs: number;
  hadSpeech: boolean;
}

export function isSecureMicContext(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.isSecureContext) return true;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

/**
 * Checks whether the current browser supports genuine microphone audio recording.
 */
export function isMicrophoneSupported(): boolean {
  return Boolean(
    typeof window !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function' &&
      (typeof window.AudioContext !== 'undefined' ||
        typeof (window as unknown as { webkitAudioContext?: unknown })
          .webkitAudioContext !== 'undefined' ||
        typeof MediaRecorder !== 'undefined')
  );
}

/**
 * Resolves the built-in same-origin Voice WebSocket URL unless a custom URL is configured.
 */
export function resolveVoiceWsUrl(customUrl?: string): string {
  const trimmed = (customUrl || '').trim();
  if (trimmed) return trimmed;
  if (typeof window === 'undefined') return '';
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws/voice`;
}

/**
 * Downsamples a Float32Array audio buffer to 16kHz signed 16-bit PCM.
 */
export function downsampleTo16kInt16(
  input: Float32Array,
  sourceSampleRate: number
): Int16Array {
  const targetRate = 16000;
  if (sourceSampleRate === targetRate) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const clamped = Math.max(-1, Math.min(1, input[i]));
      out[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    }
    return out;
  }

  const ratio = sourceSampleRate / targetRate;
  const newLength = Math.floor(input.length / ratio);
  const result = new Int16Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      sum += input[j];
      count++;
    }
    const sample = count > 0 ? sum / count : 0;
    const clamped = Math.max(-1, Math.min(1, sample));
    result[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return result;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...sub);
  }
  return btoa(binary);
}

/**
 * Encodes captured 16kHz Int16Array chunks into a standard RIFF WAV base64 string.
 */
export function encodePcm16ToWavBase64(
  chunks: Int16Array[],
  sampleRate = 16000
): { base64: string; sizeBytes: number } {
  const totalSamples = chunks.reduce((acc, c) => acc + c.length, 0);
  const dataByteLength = totalSamples * 2;
  const wavBytes = new Uint8Array(44 + dataByteLength);
  const view = new DataView(wavBytes.buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataByteLength, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataByteLength, true);

  let offset = 44;
  for (const chunk of chunks) {
    const chunkBytes = new Uint8Array(
      chunk.buffer,
      chunk.byteOffset,
      chunk.byteLength
    );
    wavBytes.set(chunkBytes, offset);
    offset += chunkBytes.byteLength;
  }

  return {
    base64: uint8ToBase64(wavBytes),
    sizeBytes: wavBytes.byteLength,
  };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to encode audio recording.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Manages genuine browser microphone capture via navigator.mediaDevices.getUserMedia(),
 * Web Audio AnalyserNode (live frequency waveform), 16kHz PCM16 streaming chunks,
 * energy-based Voice Activity Detection (silence endpointing), and WAV encoding.
 * Never fabricates audio or waveform bars when no mic audio is captured.
 */
export class AudioRecorderSession {
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private muteGain: GainNode | null = null;
  private rafId: number | null = null;
  private pcmChunks: Int16Array[] = [];
  private mediaChunks: BlobPart[] = [];
  private startedAt = 0;
  private speechDetectedAt = 0;
  private lastSpeechAt = 0;
  private endpointFired = false;
  private mimeType = 'audio/wav';
  private active = false;

  isActive(): boolean {
    return this.active;
  }

  async start(callbacks: {
    onWaveform: (bars: number[], volume: number) => void;
    onPcmChunk?: (pcmBuffer: ArrayBuffer) => void;
    onSilenceEndpoint?: () => void;
    onError: (msg: string) => void;
  }): Promise<boolean> {
    if (this.active) {
      return false;
    }

    if (!isSecureMicContext()) {
      callbacks.onError(
        'Microphone capture requires HTTPS (or localhost). Please open Voice Khata over HTTPS.'
      );
      return false;
    }

    if (!isMicrophoneSupported()) {
      callbacks.onError(
        'Microphone recording is not supported in this browser. Please type your entry below.'
      );
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      this.mediaStream = stream;
      this.pcmChunks = [];
      this.mediaChunks = [];
      this.startedAt = Date.now();
      this.speechDetectedAt = 0;
      this.lastSpeechAt = 0;
      this.endpointFired = false;
      this.active = true;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;

      if (AudioCtx) {
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') {
          await ctx.resume().catch(() => {});
        }
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.65;

        const processor = ctx.createScriptProcessor(2048, 1, 1);
        const muteGain = ctx.createGain();
        muteGain.gain.value = 0;

        processor.onaudioprocess = (ev) => {
          if (!this.active) return;
          const channel = ev.inputBuffer.getChannelData(0);
          const pcm16 = downsampleTo16kInt16(channel, ctx.sampleRate || 16000);
          if (pcm16.length > 0) {
            this.pcmChunks.push(pcm16);
            if (callbacks.onPcmChunk) {
              // Emit 1024-byte (512-sample) PCM16 frames for live streaming
              const FRAME_SAMPLES = 512;
              for (let i = 0; i < pcm16.length; i += FRAME_SAMPLES) {
                const slice = pcm16.subarray(
                  i,
                  Math.min(i + FRAME_SAMPLES, pcm16.length)
                );
                const copy = new ArrayBuffer(slice.byteLength);
                new Int16Array(copy).set(slice);
                callbacks.onPcmChunk(copy);
              }
            }
          }

          // Compute real RMS for Voice Activity Detection & auto-endpointing
          let sumSq = 0;
          for (let i = 0; i < channel.length; i++) {
            sumSq += channel[i] * channel[i];
          }
          const rms = Math.sqrt(sumSq / channel.length);
          const now = Date.now();

          if (rms > 0.022) {
            if (!this.speechDetectedAt) {
              this.speechDetectedAt = now;
            }
            this.lastSpeechAt = now;
          } else if (
            callbacks.onSilenceEndpoint &&
            !this.endpointFired &&
            this.speechDetectedAt > 0 &&
            now - this.startedAt >= 900 &&
            now - this.lastSpeechAt >= 1650
          ) {
            this.endpointFired = true;
            callbacks.onSilenceEndpoint();
          }
        };

        source.connect(analyser);
        source.connect(processor);
        processor.connect(muteGain);
        muteGain.connect(ctx.destination);

        this.audioCtx = ctx;
        this.sourceNode = source;
        this.analyser = analyser;
        this.processorNode = processor;
        this.muteGain = muteGain;
        this.mimeType = 'audio/wav';

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          if (!this.active || !this.analyser) return;
          this.analyser.getByteFrequencyData(dataArray);
          const bars: number[] = [];
          const binCount = 12;
          const step = Math.max(1, Math.floor(dataArray.length / binCount));
          let sum = 0;
          for (let i = 0; i < binCount; i++) {
            const rawVal = (dataArray[i * step] ?? 0) / 255;
            bars.push(Math.max(0.08, Math.min(1, rawVal * 1.45)));
            sum += rawVal;
          }
          const avgVol = Math.min(1, (sum / binCount) * 2.2);
          callbacks.onWaveform(bars, avgVol);
          this.rafId = window.requestAnimationFrame(tick);
        };
        this.rafId = window.requestAnimationFrame(tick);
      } else if (typeof MediaRecorder !== 'undefined') {
        const preferredTypes = [
          'audio/webm;codecs=opus',
          'audio/webm',
          'audio/ogg;codecs=opus',
          'audio/mp4',
        ];
        const chosenType = preferredTypes.find((type) =>
          typeof MediaRecorder.isTypeSupported === 'function'
            ? MediaRecorder.isTypeSupported(type)
            : false
        );
        this.mimeType = chosenType || 'audio/webm';
        const recorder = chosenType
          ? new MediaRecorder(stream, { mimeType: chosenType })
          : new MediaRecorder(stream);
        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) {
            this.mediaChunks.push(ev.data);
          }
        };
        this.mediaRecorder = recorder;
        recorder.start(200);
      }

      return true;
    } catch (err) {
      this.releaseResources();
      const name = (err as { name?: string })?.name || '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        callbacks.onError(
          'Microphone permission was denied. Please allow mic access in browser settings or type below.'
        );
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        callbacks.onError(
          'No microphone was detected on this device. Please connect a mic or type below.'
        );
      } else {
        callbacks.onError(
          'Could not access microphone. Please check permissions or type below.'
        );
      }
      return false;
    }
  }

  async stop(): Promise<RecordedAudioResult | null> {
    if (!this.active) return null;
    this.active = false;

    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    const durationMs = Math.max(0, Date.now() - this.startedAt);
    const hadSpeech = this.speechDetectedAt > 0;
    const capturedPcm = this.pcmChunks;
    const recorder = this.mediaRecorder;

    if (capturedPcm.length > 0) {
      this.releaseResources();
      const wav = encodePcm16ToWavBase64(capturedPcm, 16000);
      return {
        audioBase64: wav.base64,
        mimeType: 'audio/wav',
        sizeBytes: wav.sizeBytes,
        durationMs,
        hadSpeech,
      };
    }

    if (recorder) {
      const blob = await new Promise<Blob>((resolve) => {
        if (recorder.state === 'inactive') {
          resolve(new Blob(this.mediaChunks, { type: this.mimeType }));
          return;
        }
        recorder.onstop = () => {
          resolve(
            new Blob(this.mediaChunks, {
              type: recorder.mimeType || this.mimeType,
            })
          );
        };
        try {
          recorder.stop();
        } catch {
          resolve(new Blob(this.mediaChunks, { type: this.mimeType }));
        }
      });

      this.releaseResources();
      const audioBase64 = await blobToBase64(blob);
      return {
        audioBase64,
        mimeType: blob.type || this.mimeType,
        sizeBytes: blob.size,
        durationMs,
        hadSpeech: true,
      };
    }

    this.releaseResources();
    return null;
  }

  cancel(): void {
    this.active = false;
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {
        // ignore
      }
    }
    this.releaseResources();
  }

  private releaseResources(): void {
    this.mediaRecorder = null;
    this.analyser = null;
    if (this.processorNode) {
      try {
        this.processorNode.disconnect();
        this.processorNode.onaudioprocess = null;
      } catch {
        // ignore
      }
      this.processorNode = null;
    }
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        // ignore
      }
      this.sourceNode = null;
    }
    if (this.muteGain) {
      try {
        this.muteGain.disconnect();
      } catch {
        // ignore
      }
      this.muteGain = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      this.mediaStream = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    this.pcmChunks = [];
    this.mediaChunks = [];
  }
}

let activeAudioEl: HTMLAudioElement | null = null;
let lastSpokenKey = '';
let lastSpokenAt = 0;
const activeStreamingPlayers = new Set<StreamingAudioPlayer>();

/**
 * Decodes a base64-encoded signed 16-bit little-endian mono PCM chunk into Float32 samples [-1, 1].
 * Works in both browser and Node.js runtimes.
 */
export function pcm16Base64ToFloat32(base64: string): Float32Array<ArrayBuffer> {
  const clean = base64.trim();
  if (!clean) return new Float32Array(new ArrayBuffer(0));

  let bytes: Uint8Array;
  if (typeof atob === 'function') {
    const binary = atob(clean);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
  } else {
    const buf = Buffer.from(clean, 'base64');
    bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  const sampleCount = Math.floor(bytes.byteLength / 2);
  if (sampleCount === 0) return new Float32Array(new ArrayBuffer(0));

  const view = new DataView(bytes.buffer, bytes.byteOffset, sampleCount * 2);
  const float32 = new Float32Array(new ArrayBuffer(sampleCount * 4));
  for (let i = 0; i < sampleCount; i++) {
    float32[i] = view.getInt16(i * 2, true) / 32768;
  }
  return float32;
}

/**
 * Plays streamed raw 16-bit LE mono PCM audio chunks (Gnani Timbre v3.0 @ 24kHz)
 * progressively via Web Audio API starting on chunk #1, with instant barge-in stop().
 */
export class StreamingAudioPlayer {
  private audioCtx: AudioContext | null = null;
  private activeRequestId: string | null = null;
  private nextStartTime = 0;
  private activeSources = new Set<AudioBufferSourceNode>();
  private streamEnded = false;
  private startedPlayback = false;
  private onStartCb?: () => void;
  private onEndCb?: () => void;

  constructor() {
    activeStreamingPlayers.add(this);
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return null;

    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      this.audioCtx = new AudioCtx();
    }
    if (this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  isPlaying(): boolean {
    return this.activeRequestId !== null;
  }

  getActiveRequestId(): string | null {
    return this.activeRequestId;
  }

  beginStream(
    requestId: string,
    callbacks?: { onStart?: () => void; onEnd?: () => void }
  ): void {
    this.stop();
    this.activeRequestId = requestId;
    this.streamEnded = false;
    this.startedPlayback = false;
    this.nextStartTime = 0;
    this.onStartCb = callbacks?.onStart;
    this.onEndCb = callbacks?.onEnd;
    this.ensureContext();
  }

  enqueueChunk(
    requestId: string,
    audioBase64: string,
    sampleRate = 24000
  ): boolean {
    if (this.activeRequestId !== requestId) return false;
    const ctx = this.ensureContext();
    if (!ctx) return false;

    const samples = pcm16Base64ToFloat32(audioBase64);
    if (samples.length === 0) return false;

    try {
      const audioBuffer = ctx.createBuffer(1, samples.length, sampleRate);
      audioBuffer.copyToChannel(samples, 0);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      const now = ctx.currentTime;
      const startAt =
        this.nextStartTime > now + 0.005 ? this.nextStartTime : now + 0.015;
      this.nextStartTime = startAt + audioBuffer.duration;

      this.activeSources.add(source);
      source.onended = () => {
        this.activeSources.delete(source);
        if (
          this.activeRequestId === requestId &&
          this.streamEnded &&
          this.activeSources.size === 0
        ) {
          const endCb = this.onEndCb;
          this.activeRequestId = null;
          this.streamEnded = false;
          this.startedPlayback = false;
          this.nextStartTime = 0;
          this.onStartCb = undefined;
          this.onEndCb = undefined;
          endCb?.();
        }
      };

      if (!this.startedPlayback) {
        this.startedPlayback = true;
        this.onStartCb?.();
      }

      source.start(startAt);
      return true;
    } catch {
      return false;
    }
  }

  endStream(requestId: string): void {
    if (this.activeRequestId !== requestId) return;
    this.streamEnded = true;
    if (this.activeSources.size === 0) {
      const endCb = this.onEndCb;
      this.activeRequestId = null;
      this.streamEnded = false;
      this.startedPlayback = false;
      this.nextStartTime = 0;
      this.onStartCb = undefined;
      this.onEndCb = undefined;
      endCb?.();
    }
  }

  stop(): void {
    this.activeRequestId = null;
    this.streamEnded = false;
    this.startedPlayback = false;
    this.nextStartTime = 0;
    this.onStartCb = undefined;
    this.onEndCb = undefined;
    for (const source of this.activeSources) {
      try {
        source.onended = null;
        source.stop();
        source.disconnect();
      } catch {
        // ignore already-stopped sources
      }
    }
    this.activeSources.clear();
  }

  dispose(): void {
    this.stop();
    activeStreamingPlayers.delete(this);
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
  }
}

/**
 * Speaks confirmation text via Gnani Timbre v3.0 REST TTS when called as fallback
 * (when /ws/voice streaming is unavailable), falling back cleanly to browser SpeechSynthesis
 * if Gnani TTS is not configured. Prevents duplicate back-to-back utterances and supports barge-in.
 */
export async function speakConfirmation(
  text: string,
  lang: LanguageCode,
  onStart?: () => void,
  onEnd?: () => void
): Promise<void> {
  const clean = text.trim();
  if (!clean) {
    onEnd?.();
    return;
  }

  const now = Date.now();
  const dedupeKey = `${lang}:${clean}`;
  if (dedupeKey === lastSpokenKey && now - lastSpokenAt < 2000) {
    onEnd?.();
    return;
  }
  lastSpokenKey = dedupeKey;
  lastSpokenAt = now;

  stopSpeaking();

  try {
    const res = await requestVoiceTtsApi({ text: clean, language: lang });
    if (res.provider === 'gnani-timbre-v3' && res.audioBase64) {
      const audio = new Audio(
        `data:${res.mimeType || 'audio/wav'};base64,${res.audioBase64}`
      );
      activeAudioEl = audio;
      audio.onplay = () => onStart?.();
      audio.onended = () => {
        if (activeAudioEl === audio) activeAudioEl = null;
        onEnd?.();
      };
      audio.onerror = () => {
        if (activeAudioEl === audio) activeAudioEl = null;
        onEnd?.();
      };
      await audio.play();
      return;
    }
  } catch {
    // Fall back to browser speech synthesis if available
  }

  speakText(clean, lang, onStart, onEnd);
}

/**
 * Speaks a short response aloud using browser Web Speech synthesis when available.
 */
export function speakText(
  text: string,
  lang: LanguageCode,
  onStart?: () => void,
  onEnd?: () => void
): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    onEnd?.();
    return;
  }
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = getSpeechLang(lang);
    utterance.rate = 0.98;
    utterance.onstart = () => onStart?.();
    utterance.onend = () => onEnd?.();
    utterance.onerror = () => onEnd?.();
    window.speechSynthesis.speak(utterance);
  } catch {
    onEnd?.();
  }
}

export function stopSpeaking(): void {
  for (const player of activeStreamingPlayers) {
    player.stop();
  }
  if (activeAudioEl) {
    try {
      activeAudioEl.pause();
      activeAudioEl.src = '';
    } catch {
      // ignore
    }
    activeAudioEl = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
}

/**
 * Manages authenticated WebSocket streaming of 16kHz PCM16 STT audio frames and
 * 24kHz PCM16 Timbre v3.0 TTS audio streams over `/ws/voice` with 25s keepalive
 * and resilient reconnection across mobile backgrounding/network drops.
 */
export class VoiceWsClient {
  private ws: WebSocket | null = null;
  private url = '';
  private language: LanguageCode = 'en';
  private intentionallyClosed = false;
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;
  private ttsSeq = 0;
  private callbacks: VoiceClientCallbacks;
  private listenersAttached = false;

  constructor(callbacks: VoiceClientCallbacks) {
    this.callbacks = callbacks;
  }

  private handleOnline = () => {
    if (!this.intentionallyClosed && !this.isConnected()) {
      this.reconnectAttempts = 0;
      this.reconnect();
    }
  };

  private handleVisibilityChange = () => {
    if (
      typeof document !== 'undefined' &&
      document.visibilityState === 'visible' &&
      !this.intentionallyClosed &&
      !this.isConnected()
    ) {
      this.reconnectAttempts = 0;
      this.reconnect();
    }
  };

  private attachNetworkListeners(): void {
    if (this.listenersAttached || typeof window === 'undefined') return;
    window.addEventListener('online', this.handleOnline);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
    this.listenersAttached = true;
  }

  private detachNetworkListeners(): void {
    if (!this.listenersAttached || typeof window === 'undefined') return;
    window.removeEventListener('online', this.handleOnline);
    if (typeof document !== 'undefined') {
      document.removeEventListener(
        'visibilitychange',
        this.handleVisibilityChange
      );
    }
    this.listenersAttached = false;
  }

  private stopPing(): void {
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private startPing(): void {
    this.stopPing();
    if (typeof window === 'undefined') return;
    this.pingTimer = window.setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
        } catch {
          // ignore
        }
      }
    }, 25_000);
  }

  isConnected(): boolean {
    return Boolean(this.ws && this.ws.readyState === WebSocket.OPEN);
  }

  connect(url: string, language: LanguageCode): void {
    this.disconnect();
    this.url = url;
    this.language = language;
    this.intentionallyClosed = false;
    this.reconnectAttempts = 0;
    this.attachNetworkListeners();
    this.openSocket();
  }

  reconnect(): void {
    if (!this.url || this.intentionallyClosed) return;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    this.openSocket();
  }

  updateLanguage(language: LanguageCode): void {
    this.language = language;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'update_language', language }));
    }
  }

  private openSocket(): void {
    if (!this.url || this.intentionallyClosed) return;
    try {
      const ws = new WebSocket(this.url);
      ws.binaryType = 'arraybuffer';
      this.ws = ws;

      ws.onopen = () => {
        if (this.ws !== ws) return;
        this.reconnectAttempts = 0;
        this.startPing();
        // Sync current language immediately on open so server matches UI language
        try {
          ws.send(
            JSON.stringify({ type: 'update_language', language: this.language })
          );
        } catch {
          // ignore
        }
        this.callbacks.onStatusChange(true);
      };

      ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          try {
            const msg = JSON.parse(event.data) as WsServerMessage;
            if (msg.type === 'pong') return;
            this.callbacks.onMessage(msg);
          } catch {
            // Ignore malformed JSON frames
          }
        }
      };

      ws.onerror = () => {
        if (this.ws !== ws) return;
        this.callbacks.onStatusChange(false);
      };

      ws.onclose = () => {
        if (this.ws !== ws) return;
        this.stopPing();
        this.callbacks.onStatusChange(false);
        this.ws = null;
        if (!this.intentionallyClosed && this.reconnectAttempts < 12) {
          const delay = Math.min(
            10_000,
            Math.round(1000 * Math.pow(1.6, this.reconnectAttempts))
          );
          this.reconnectAttempts += 1;
          this.reconnectTimer = window.setTimeout(() => {
            this.openSocket();
          }, delay);
        }
      };
    } catch {
      this.callbacks.onError('Invalid Voice WebSocket URL.');
    }
  }

  startAudioStream(options: {
    language: LanguageCode;
    hasPendingConfirmation: boolean;
  }): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.ws.send(
      JSON.stringify({
        type: 'audio_start',
        sampleRate: 16000,
        encoding: 'linear_pcm',
        language: options.language,
        hasPendingConfirmation: options.hasPendingConfirmation,
      })
    );
    return true;
  }

  sendPcmChunk(pcmBuffer: ArrayBuffer): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(pcmBuffer);
    }
  }

  endAudioStream(hasPendingConfirmation: boolean): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'audio_end',
          hasPendingConfirmation,
        })
      );
    }
  }

  cancelAudioStream(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'audio_cancel' }));
    }
  }

  requestTts(text: string, language?: LanguageCode): string | null {
    const clean = text.trim();
    if (!clean || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return null;
    }
    const requestId = `tts-${Date.now()}-${++this.ttsSeq}`;
    this.ws.send(
      JSON.stringify({
        type: 'tts_request',
        requestId,
        text: clean,
        language: language || this.language,
      })
    );
    return requestId;
  }

  cancelTts(requestId?: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'tts_cancel',
          ...(requestId ? { requestId } : {}),
        })
      );
    }
  }

  sendTextTurn(text: string, hasPendingConfirmation = false): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'text_input',
          text,
          hasPendingConfirmation,
        })
      );
      return true;
    }
    return false;
  }

  disconnect(): void {
    this.intentionallyClosed = true;
    this.stopPing();
    this.detachNetworkListeners();
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }
}
