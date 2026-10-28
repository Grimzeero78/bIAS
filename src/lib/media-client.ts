"use client";

/**
 * BROWSER-SIDE VIDEO PREPROCESSING
 *
 * Prepares an interview video for AI analysis without any server-side media
 * tooling: the browser extracts evenly-spaced frames (canvas) and mono 16 kHz
 * audio chunks (WebAudio → WAV). The upload API stores this manifest and the
 * analysis pipeline consumes it directly — which is what lets the platform run
 * on edge runtimes (e.g. Cloudflare Workers) where ffmpeg does not exist.
 *
 * The server still supports the ffmpeg path for API clients that upload
 * without a manifest (sandbox deployments, curl-based e2e tests).
 */

export interface ClientFrame {
  t: number; // seconds
  dataUrl: string; // image/jpeg data URL
}

export interface ClientAudioChunk {
  startSec: number;
  wavBase64: string; // 16 kHz mono 16-bit PCM WAV
}

export interface VideoManifest {
  durationSec: number;
  frames: ClientFrame[];
  audio: ClientAudioChunk[];
}

export interface PreprocessProgress {
  stage: "metadata" | "frames" | "audio" | "encode" | "done";
  pct: number; // 0-100 overall
  note?: string;
}

const FRAME_COUNT = 12;
const MAX_FRAME_WIDTH = 768;
const CHUNK_SEC = 28;
const MAX_CHUNKS = 16; // ≈ first 7.5 minutes of speech (mirrors server limit)
const ASR_SR = 16000;

/** Hard limits to keep browser memory sane; beyond these we degrade gracefully (frames only). */
const AUDIO_MAX_DURATION_SEC = 15 * 60;
const AUDIO_MAX_FILE_BYTES = 220 * 1024 * 1024;

export async function preprocessVideo(
  file: File,
  onProgress?: (p: PreprocessProgress) => void
): Promise<{ manifest: VideoManifest | null; warning?: string }> {
  const report = (stage: PreprocessProgress["stage"], pct: number, note?: string) => onProgress?.({ stage, pct, note });

  // ── metadata ──────────────────────────────────────────────
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  let duration = 0;
  let videoW = 0;
  let videoH = 0;
  try {
    await new Promise<void>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error("Timed out reading video metadata")), 30000);
      video.onloadedmetadata = () => {
        clearTimeout(to);
        resolve();
      };
      video.onerror = () => {
        clearTimeout(to);
        reject(new Error("This video format cannot be previewed in your browser"));
      };
    });
    duration = Number.isFinite(video.duration) ? video.duration : 0;
    videoW = video.videoWidth;
    videoH = video.videoHeight;
  } catch (e) {
    URL.revokeObjectURL(url);
    return { manifest: null, warning: e instanceof Error ? e.message : "Could not read the video" };
  }
  report("metadata", 4, `Duration ${Math.round(duration)}s`);

  // ── frames ────────────────────────────────────────────────
  const frames: ClientFrame[] = [];
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    const scale = videoW > MAX_FRAME_WIDTH ? MAX_FRAME_WIDTH / videoW : 1;
    canvas.width = Math.max(2, Math.round(videoW * scale));
    canvas.height = Math.max(2, Math.round(videoH * scale));

    const span = Math.min(duration || 600, 600); // mirror server analysis window
    const interval = Math.max(span / FRAME_COUNT, 5);
    for (let i = 0; i < FRAME_COUNT; i++) {
      const t = Math.min(i * interval + Math.min(0.6, interval / 4), Math.max(0, (duration || span) - 0.1));
      await seekTo(video, t);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
      frames.push({ t: Math.round(t * 10) / 10, dataUrl });
      report("frames", 8 + (i / FRAME_COUNT) * 42, `Extracted frame ${i + 1}/${FRAME_COUNT}`);
    }
  } catch {
    // fall through — a video without frames still gets transcript-based analysis
  }

  // ── audio (mono 16 kHz WAV chunks) ────────────────────────
  const audio: ClientAudioChunk[] = [];
  let warning: string | undefined;
  if (duration > AUDIO_MAX_DURATION_SEC || file.size > AUDIO_MAX_FILE_BYTES) {
    warning = "Interview is long — speech will be analysed from the first ~7 minutes only.";
  }
  if (frames.length === 0) {
    warning = warning || "Browser could not render this format for frames — the server will try.";
  }

  try {
    report("audio", 52, "Decoding audio…");
    const arrayBuffer = await file.arrayBuffer();
    const decoded = await decodeTo16kMono(arrayBuffer, duration);
    if (decoded) {
      const total = decoded.length;
      const chunkLen = CHUNK_SEC * ASR_SR;
      const maxLen = Math.min(total, MAX_CHUNKS * chunkLen);
      for (let start = 0; start < maxLen; start += chunkLen) {
        const slice = decoded.subarray(start, Math.min(start + chunkLen, maxLen));
        if (slice.length < ASR_SR) break; // <1s tail — skip
        const wav = encodeWav16k(slice);
        audio.push({ startSec: Math.round(start / ASR_SR), wavBase64: arrayBufferToBase64(wav) });
        report("audio", 52 + (start / Math.max(1, maxLen)) * 34, `Prepared speech chunk ${audio.length}`);
      }
    }
  } catch {
    warning = warning || "Audio could not be decoded in this browser — verbal criteria will rely on the transcript if the server can extract it.";
  }

  report("encode", 92, "Packaging analysis manifest…");
  const manifest: VideoManifest | null = frames.length > 0 || audio.length > 0 ? { durationSec: Math.round(duration * 10) / 10, frames, audio } : null;
  URL.revokeObjectURL(url);
  report("done", 100);
  return { manifest, warning };
}

function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error("seek timeout")), 15000);
    const onSeeked = () => {
      clearTimeout(to);
      video.removeEventListener("seeked", onSeeked);
      // give the compositor a beat to paint the frame
      requestAnimationFrame(() => resolve());
    };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = t;
  });
}

/** Decode compressed audio to a 16 kHz mono Float32Array via OfflineAudioContext. */
async function decodeTo16kMono(buffer: ArrayBuffer, duration: number): Promise<Float32Array | null> {
  const OfflineCtx: typeof OfflineAudioContext | undefined =
    (window as unknown as { OfflineAudioContext?: typeof OfflineAudioContext; webkitOfflineAudioContext?: typeof OfflineAudioContext })
      .OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!OfflineCtx) return null;
  const frames = Math.max(1, Math.ceil((Number.isFinite(duration) ? duration : 600) * ASR_SR) + 1);
  try {
    const ctx = new OfflineCtx(1, frames, ASR_SR);
    const decoded = await ctx.decodeAudioData(buffer.slice(0));
    // mix down all channels to mono
    const chs: Float32Array[] = [];
    for (let c = 0; c < decoded.numberOfChannels; c++) chs.push(decoded.getChannelData(c));
    const out = new Float32Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) {
      let s = 0;
      for (const ch of chs) s += ch[i];
      out[i] = s / chs.length;
    }
    return out;
  } catch {
    // fallback: regular AudioContext (resamples on decode in most browsers)
    try {
      const AC: typeof AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      const decoded = await ctx.decodeAudioData(buffer.slice(0));
      const ratio = decoded.sampleRate / ASR_SR;
      const monoLen = Math.floor(decoded.length / ratio);
      const chs: Float32Array[] = [];
      for (let c = 0; c < decoded.numberOfChannels; c++) chs.push(decoded.getChannelData(c));
      const out = new Float32Array(monoLen);
      for (let i = 0; i < monoLen; i++) {
        let s = 0;
        const idx = Math.floor(i * ratio);
        for (const ch of chs) s += ch[idx];
        out[i] = s / chs.length;
      }
      void ctx.close();
      return out;
    } catch {
      return null;
    }
  }
}

/** Encode Float32 samples as a 16 kHz mono 16-bit PCM WAV. */
function encodeWav16k(samples: Float32Array): ArrayBuffer {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buf);
  const w = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  w(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, ASR_SR, true);
  view.setUint32(28, ASR_SR * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  w(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CH)) as unknown as number[]);
  }
  return btoa(binary);
}
