# Hanar

YouTube video downloader optimized for Plex + Apple TV / iPad direct play.

## Quick Start

```bash
npm install
npm run dev
```

## Features

- Downloads YouTube videos via yt-dlp
- Two presets optimized for Apple TV 4K / iPad direct play
- GPU-accelerated HEVC conversion (NVIDIA NVENC)
- Archive file support to avoid re-downloading
- Thumbnail downloads for Plex

## Download Presets

| Preset | Format | Max Resolution | Conversion | Speed |
|--------|--------|----------------|------------|-------|
| **1080p Fast** | H.264 + AAC | 1080p | None needed | ⚡ Fast |
| **Max Quality** | VP9/AV1 → HEVC | 4K | GPU (NVENC) | 🎬 +30s-2min |

Both presets produce files that **direct play** on:
- ✅ Apple TV 4K
- ✅ iPad (via Plex)
- ✅ iPhone (via Plex)

### Why Two Presets?

**YouTube's codec availability:**
- H.264: Available up to 1080p only
- VP9/AV1: Available up to 4K/8K

**Apple TV 4K supports:**
- ✅ H.264 (up to 4K)
- ✅ HEVC/H.265 (up to 4K HDR)
- ❌ VP9 (not supported)
- ❌ AV1 (not supported natively)

So for 4K content, we download VP9/AV1 and convert to HEVC.

## Requirements

- [Node.js](https://nodejs.org/) 18+
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) in PATH
- [FFmpeg](https://ffmpeg.org/) in PATH (with NVENC support for GPU conversion)
- NVIDIA GPU (for Max Quality preset's HEVC conversion)

## Configuration

Default paths (configured in `electron/main.ts`):
- **Output Directory:** `E:\Plex\YouTube`
- **Archive File:** `E:\Plex\scripts\archive.txt`

These can be changed in the app UI.

## Batch Conversion Script

For converting existing VP9/AV1 videos to HEVC:

```powershell
# Dry run (see what would be converted)
.\E:\Plex\scripts\convert-for-appletv.ps1 -DryRun

# Run conversion with GPU
.\E:\Plex\scripts\convert-for-appletv.ps1 -Force -UseGPU

# Options
-SourceDir "E:\Plex\YouTube"  # Source folder
-VideoCodec "hevc"            # hevc or h264
-Quality 23                   # 18-28, lower = better
-Preset "p4"                  # p1 (fast) to p7 (quality)
-DeleteOriginals              # Remove originals after conversion
-UseGPU                       # Use NVIDIA NVENC (default: true)
```

## Tech Stack

- **Frontend:** React + TypeScript + Vite
- **Backend:** Electron
- **Download:** yt-dlp
- **Conversion:** FFmpeg with NVENC

## Project Structure

```
hanar/
├── electron/
│   ├── main.ts       # Electron main process, download logic
│   ├── preload.ts    # IPC bridge
│   └── store.ts      # Settings persistence
├── src/
│   ├── App.tsx       # React UI
│   └── App.css       # Styles
└── E:\Plex\scripts\
    └── convert-for-appletv.ps1  # Batch conversion script
```

## Codec Reference

| Source | Video Codec | Audio Codec | Apple TV Direct Play? |
|--------|-------------|-------------|----------------------|
| YouTube 1080p | H.264 | AAC | ✅ Yes |
| YouTube 4K | VP9/AV1 | Opus | ❌ No (transcode) |
| Converted | HEVC | AAC | ✅ Yes |

## License

MIT
