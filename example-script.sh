#!/bin/bash
#
# A script to download YouTube subtitles as a clean text file.
#
# Usage: ./yt-subs.sh <YouTube_URL>
# Dependencies: yt-dlp, ffmpeg

set -e # Exit immediately if a command exits with a non-zero status.

# --- Prerequisite Checks ---
if ! command -v yt-dlp &> /dev/null; then
  echo "Error: yt-dlp is not installed." >&2
  exit 1
fi
if ! command -v ffmpeg &> /dev/null; then
  echo "Error: ffmpeg is not installed." >&2
  exit 1
fi

# --- Argument Validation ---
if [ -z "$1" ]; then
  echo "Usage: $(basename "$0") <YouTube_URL>" >&2
  exit 1
fi

# --- Main Logic ---
URL="$1"
# Get a unique filename from the video ID. Suppress yt-dlp's other output.
video_id=$(yt-dlp --cookies-from-browser chrome --print id "$URL" 2>/dev/null)

if [ -z "$video_id" ]; then
  echo "Error: Could not extract video ID from URL." >&2
  exit 1
fi

# Ensure Downloads directory exists
downloads_dir="$HOME/Downloads/yts"
mkdir -p "$downloads_dir"

# Define file paths in Downloads directory
vtt_file="${downloads_dir}/${video_id}.en.vtt"
txt_file="${downloads_dir}/${video_id}.txt"

echo "Downloading subtitle for video ID: ${video_id}..."

# Download the VTT subtitle file to Downloads directory.
yt-dlp --cookies-from-browser chrome --write-subs --skip-download --sub-langs "en" --sub-format vtt --write-auto-subs \
  -o "${downloads_dir}/${video_id}.%(ext)s" "$URL"

# Verify the subtitle file was created before proceeding.
if [ ! -f "$vtt_file" ]; then
  echo "Error: Failed to download subtitle. (Does the video have English subs?)" >&2
  exit 1
fi

echo "Converting to plain text..."

# Convert the VTT file to SRT format first.
srt_file="${downloads_dir}/${video_id}.srt"
ffmpeg -y -i "$vtt_file" -f srt "$srt_file" >/dev/null 2>&1

# Extract only the text lines (skip numbers and timestamps) and deduplicate consecutive lines.
grep -v "^[0-9]*$" "$srt_file" | grep -v " --> " | grep -v "^$" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | awk '!seen[$0]++' > "$txt_file"

# Clean up all VTT and SRT files.
rm -f "${downloads_dir}/${video_id}".*.vtt "$srt_file"

# Copy the transcript to clipboard.
cat "$txt_file" | pbcopy

echo "Success! Transcript saved to: ${txt_file}"
echo "Transcript copied to clipboard."
