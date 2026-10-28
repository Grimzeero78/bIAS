#!/bin/bash
# Mux scene image + speech into interview MP4s (~30-40s each, 720p, h264+aac)
set -e
cd /home/z/my-project/scripts/e2e

make_video () {
  local img=$1; local wav=$2; local out=$3
  local dur
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$wav")
  ffmpeg -y -loop 1 -i "$img" -i "$wav" \
    -t "$dur" \
    -vf "scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2,format=yuv420p,fps=24" \
    -c:v libx264 -preset veryfast -crf 27 \
    -c:a aac -b:a 96k -ar 16000 -ac 1 \
    -shortest "$out" 2>/dev/null
  echo "made $out ($(ffprobe -v error -show_entries format=duration -of csv=p=0 "$out")s)"
}

make_video scene_strong.png speech_strong.wav video_grace.mp4
make_video scene_weak.png   speech_weak.wav   video_brian.mp4
