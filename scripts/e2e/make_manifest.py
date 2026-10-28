#!/usr/bin/env python3
"""Build a browser-style video analysis manifest from e2e assets.

Mimics exactly what the browser WebAudio pipeline sends:
  frames: evenly-spaced JPEG data URLs (<=700KB each)
  audio:  16 kHz mono WAV chunks (<=4MB base64 each)
"""
import base64
import io
import json
import subprocess
import sys
import wave

PNG = "/home/z/my-project/scripts/e2e/scene_strong.png"
WAV = "/home/z/my-project/scripts/e2e/speech_strong.wav"
OUT = "/home/z/my-project/scripts/e2e/manifest_grace.json"
DURATION = 28.0  # pretend the interview clip is 28s long

def jpeg_frame(t: float) -> str:
    """Extract a JPEG frame from the scene image (scaled 720p-ish)."""
    p = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", PNG, "-vf", "scale=720:-2",
         "-frames:v", "1", "-q:v", "5", "-f", "image2", "-"],
        capture_output=True, check=True)
    b64 = base64.b64encode(p.stdout).decode()
    return f"data:image/jpeg;base64,{b64}"

def wav_chunks():
    """Read the wav, re-encode to 16k mono via ffmpeg, emit base64 chunks."""
    p = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", WAV, "-ar", "16000", "-ac", "1",
         "-f", "wav", "-"],
        capture_output=True, check=True)
    raw = p.stdout
    # single chunk if it fits (28s @16k mono 16-bit ≈ 0.9MB → fine)
    return [{"startSec": 0.0, "wavBase64": base64.b64encode(raw).decode()}]

def main():
    frames = []
    for t in (1.0, 8.0, 15.0, 22.0):
        frames.append({"t": t, "dataUrl": jpeg_frame(t)})
    manifest = {
        "durationSec": DURATION,
        "frames": frames,
        "audio": wav_chunks(),
    }
    with open(OUT, "w") as f:
        json.dump({"candidateId": sys.argv[1] if len(sys.argv) > 1 else "CAND",
                   "manifest": manifest}, f)
    size = len(json.dumps(manifest))
    print(f"manifest written: {OUT} ({size/1024:.0f} KB, {len(frames)} frames)")

if __name__ == "__main__":
    main()
