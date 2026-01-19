# Hanar v2 Implementation Plan

## Overview

Add navigation and a new "Convert for Apple" view to Hanar, enabling users to batch convert existing video libraries to Apple TV/iOS compatible formats.

---

## New Features

### 1. Navigation System
- **Sidebar navigation** (recommended for desktop apps)
- Two main views:
  - 📥 **Download** - Current YouTube download functionality
  - 🔄 **Convert** - New batch conversion view

### 2. Convert for Apple View

#### Core Features
| Feature | Description |
|---------|-------------|
| **Folder Selection** | Browse and select a folder containing videos |
| **Scan & Analyze** | Scan folder, identify videos needing conversion (VP9/AV1 → HEVC) |
| **Queue Management** | Show list of videos to convert with status indicators |
| **Progress Display** | Real-time progress for active conversion |
| **Pause/Resume** | Pause current conversion, resume later |
| **Stop All** | Cancel entire conversion queue |
| **Auto-Cleanup** | Remove original file after successful conversion |
| **Duplicate Cleanup** | Find and remove old format duplicates (keep Apple-compatible) |

---

## UI Design

### Navigation Sidebar
```
┌─────────────────────────────────────────────────┐
│  [Hanar Logo]                                   │
├─────────────┬───────────────────────────────────┤
│             │                                   │
│  📥 Download│   [Active View Content]           │
│             │                                   │
│  🔄 Convert │                                   │
│             │                                   │
│             │                                   │
│─────────────│                                   │
│  ⚙️ Settings│                                   │
│             │                                   │
└─────────────┴───────────────────────────────────┘
```

### Convert View Layout
```
┌─────────────────────────────────────────────────┐
│  Convert for Apple TV / iOS                     │
├─────────────────────────────────────────────────┤
│  📁 Source Folder: [E:\Plex\YouTube    ] [Browse]│
│                                                 │
│  [Scan Folder]  [Start All]  [Pause]  [Stop]    │
├─────────────────────────────────────────────────┤
│  ┌─ Queue (12 videos) ────────────────────────┐ │
│  │ ✅ Video1.mp4          HEVC    Complete    │ │
│  │ 🔄 Video2.mp4          VP9→HEVC  45%  2.1x │ │
│  │ ⏳ Video3.mp4          AV1     Pending     │ │
│  │ ⏳ Video4.mp4          VP9     Pending     │ │
│  └────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────┤
│  [🧹 Cleanup Duplicates]                        │
│  Found 3 duplicate pairs (old formats to remove)│
└─────────────────────────────────────────────────┘
```

---

## Technical Implementation

### Phase 1: Project Restructuring

#### 1.1 Create Component Structure
```
src/
├── App.tsx                 # Main app with router/navigation
├── App.css                 # Global styles
├── components/
│   ├── Sidebar.tsx         # Navigation sidebar
│   ├── Sidebar.css
│   └── common/
│       ├── Button.tsx
│       ├── ProgressBar.tsx
│       └── StatusBadge.tsx
├── views/
│   ├── DownloadView.tsx    # Existing download functionality (extracted)
│   ├── DownloadView.css
│   ├── ConvertView.tsx     # New conversion view
│   └── ConvertView.css
├── hooks/
│   ├── useConversion.ts    # Conversion state management
│   └── useVideoScanner.ts  # Folder scanning logic
└── types/
    └── index.ts            # Shared TypeScript interfaces
```

#### 1.2 Update Electron Main Process
```
electron/
├── main.ts                 # Add IPC handlers for conversion
├── preload.ts              # Expose conversion APIs
├── store.ts                # Add conversion settings
└── services/
    ├── scanner.ts          # Video scanning service
    ├── converter.ts        # FFmpeg conversion service
    └── cleanup.ts          # Duplicate cleanup service
```

### Phase 2: Navigation Implementation

#### 2.1 App.tsx Changes
```tsx
// Simple state-based navigation (no router needed for 2 views)
const [activeView, setActiveView] = useState<'download' | 'convert'>('download');

return (
  <div className="app-container">
    <Sidebar activeView={activeView} onNavigate={setActiveView} />
    <main className="main-content">
      {activeView === 'download' && <DownloadView />}
      {activeView === 'convert' && <ConvertView />}
    </main>
  </div>
);
```

#### 2.2 Sidebar Component
```tsx
interface SidebarProps {
  activeView: 'download' | 'convert';
  onNavigate: (view: 'download' | 'convert') => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeView, onNavigate }) => {
  return (
    <nav className="sidebar">
      <div className="sidebar-logo">
        <img src="/hanar-logo.png" alt="Hanar" />
      </div>
      <div className="sidebar-nav">
        <button 
          className={activeView === 'download' ? 'active' : ''} 
          onClick={() => onNavigate('download')}
        >
          📥 Download
        </button>
        <button 
          className={activeView === 'convert' ? 'active' : ''} 
          onClick={() => onNavigate('convert')}
        >
          🔄 Convert
        </button>
      </div>
    </nav>
  );
};
```

### Phase 3: Convert View Implementation

#### 3.1 Video Scanner (Electron Service)
```typescript
// electron/services/scanner.ts
interface VideoFile {
  path: string;
  name: string;
  size: number;
  videoCodec: string;      // 'h264', 'hevc', 'vp9', 'av1'
  audioCodec: string;      // 'aac', 'opus', 'ac3'
  resolution: string;      // '1920x1080', '3840x2160'
  needsConversion: boolean;
  isAppleCompatible: boolean;
}

async function scanFolder(folderPath: string): Promise<VideoFile[]> {
  // 1. Get all video files (mp4, mkv, webm, avi)
  // 2. Run ffprobe on each to get codec info
  // 3. Determine if conversion needed (VP9/AV1 → needs conversion)
  // 4. Return array of VideoFile objects
}
```

#### 3.2 Conversion Queue Manager
```typescript
// electron/services/converter.ts
interface ConversionJob {
  id: string;
  inputPath: string;
  outputPath: string;
  status: 'pending' | 'converting' | 'paused' | 'completed' | 'failed';
  progress: number;        // 0-100
  speed: string;           // '2.1x'
  eta: string;             // '00:05:32'
  error?: string;
}

class ConversionQueue {
  private queue: ConversionJob[] = [];
  private currentJob: ConversionJob | null = null;
  private isPaused: boolean = false;
  private ffmpegProcess: ChildProcess | null = null;

  async addToQueue(files: VideoFile[]): Promise<void>;
  async start(): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): void;
  removeFromQueue(jobId: string): void;
  getStatus(): { queue: ConversionJob[], current: ConversionJob | null };
}
```

#### 3.3 IPC Handlers (Main Process)
```typescript
// electron/main.ts - New IPC handlers

// Scan folder for videos
ipcMain.handle('scan-folder', async (event, folderPath: string) => {
  return await scanFolder(folderPath);
});

// Start conversion queue
ipcMain.handle('start-conversion', async (event, files: VideoFile[]) => {
  conversionQueue.addToQueue(files);
  conversionQueue.start();
});

// Pause conversion
ipcMain.handle('pause-conversion', () => {
  conversionQueue.pause();
});

// Resume conversion
ipcMain.handle('resume-conversion', () => {
  conversionQueue.resume();
});

// Stop all conversions
ipcMain.handle('stop-conversion', () => {
  conversionQueue.stop();
});

// Get conversion status (called on interval from renderer)
ipcMain.handle('get-conversion-status', () => {
  return conversionQueue.getStatus();
});

// Cleanup duplicates
ipcMain.handle('cleanup-duplicates', async (event, folderPath: string) => {
  return await findAndRemoveDuplicates(folderPath);
});

// Real-time progress updates via IPC send
// conversionQueue emits 'conversion-progress' events
```

#### 3.4 Preload Script Updates
```typescript
// electron/preload.ts - Add new APIs
contextBridge.exposeInMainWorld('electronAPI', {
  // Existing APIs...
  
  // New conversion APIs
  scanFolder: (path: string) => ipcRenderer.invoke('scan-folder', path),
  startConversion: (files: VideoFile[]) => ipcRenderer.invoke('start-conversion', files),
  pauseConversion: () => ipcRenderer.invoke('pause-conversion'),
  resumeConversion: () => ipcRenderer.invoke('resume-conversion'),
  stopConversion: () => ipcRenderer.invoke('stop-conversion'),
  getConversionStatus: () => ipcRenderer.invoke('get-conversion-status'),
  cleanupDuplicates: (path: string) => ipcRenderer.invoke('cleanup-duplicates', path),
  onConversionProgress: (callback) => {
    ipcRenderer.on('conversion-progress', callback);
    return () => ipcRenderer.removeListener('conversion-progress', callback);
  },
});
```

#### 3.5 ConvertView Component
```tsx
// src/views/ConvertView.tsx
const ConvertView: React.FC = () => {
  const [folderPath, setFolderPath] = useState<string>('');
  const [videos, setVideos] = useState<VideoFile[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [conversionStatus, setConversionStatus] = useState<ConversionStatus | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  // Scan folder
  const handleScan = async () => {
    setIsScanning(true);
    const results = await window.electronAPI.scanFolder(folderPath);
    setVideos(results);
    setIsScanning(false);
  };

  // Start conversion
  const handleStart = async () => {
    const needsConversion = videos.filter(v => v.needsConversion);
    await window.electronAPI.startConversion(needsConversion);
  };

  // Pause/Resume
  const handlePauseResume = () => {
    if (isPaused) {
      window.electronAPI.resumeConversion();
    } else {
      window.electronAPI.pauseConversion();
    }
    setIsPaused(!isPaused);
  };

  // Stop all
  const handleStop = () => {
    window.electronAPI.stopConversion();
  };

  // Poll for status updates
  useEffect(() => {
    const interval = setInterval(async () => {
      const status = await window.electronAPI.getConversionStatus();
      setConversionStatus(status);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="convert-view">
      {/* Folder selection */}
      {/* Control buttons */}
      {/* Video queue list */}
      {/* Cleanup section */}
    </div>
  );
};
```

### Phase 4: Cleanup Feature

#### 4.1 Duplicate Detection Logic
```typescript
// electron/services/cleanup.ts
interface DuplicatePair {
  keep: string;      // Apple-compatible file (HEVC/H.264)
  remove: string;    // Old format file (VP9/AV1)
  sizeSaved: number; // Bytes that would be freed
}

async function findDuplicates(folderPath: string): Promise<DuplicatePair[]> {
  // 1. Group files by base name (ignoring _hevc suffix, codec indicators)
  // 2. For each group with multiple files:
  //    - Identify which is Apple-compatible
  //    - Mark the non-compatible one for removal
  // 3. Return list of pairs
}

async function removeDuplicates(pairs: DuplicatePair[]): Promise<void> {
  // Delete the 'remove' files from each pair
}
```

---

## State Management

### Conversion State Interface
```typescript
interface ConversionState {
  // Folder
  folderPath: string;
  
  // Scanning
  isScanning: boolean;
  scannedVideos: VideoFile[];
  
  // Conversion queue
  queue: ConversionJob[];
  currentJob: ConversionJob | null;
  
  // Controls
  isRunning: boolean;
  isPaused: boolean;
  
  // Stats
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  
  // Cleanup
  duplicates: DuplicatePair[];
}
```

---

## Implementation Order

### Sprint 1: Foundation (2-3 hours)
- [ ] Create component folder structure
- [ ] Extract current download UI to `DownloadView.tsx`
- [ ] Create `Sidebar.tsx` with navigation
- [ ] Update `App.tsx` with navigation state
- [ ] Style sidebar to match Hanar theme

### Sprint 2: Scanner Service (2-3 hours)
- [ ] Create `electron/services/scanner.ts`
- [ ] Implement `scanFolder()` with ffprobe
- [ ] Add IPC handler for scanning
- [ ] Update preload script
- [ ] Create basic `ConvertView.tsx` with folder selection + scan

### Sprint 3: Conversion Queue (3-4 hours)
- [ ] Create `electron/services/converter.ts`
- [ ] Implement `ConversionQueue` class
- [ ] Add pause/resume logic (SIGSTOP/SIGCONT or process management)
- [ ] Add progress parsing from ffmpeg stderr
- [ ] Wire up IPC handlers
- [ ] Implement real-time progress updates

### Sprint 4: Convert View UI (2-3 hours)
- [ ] Build queue list component with status indicators
- [ ] Add progress bar for active conversion
- [ ] Implement control buttons (Start, Pause, Stop)
- [ ] Add auto-cleanup toggle
- [ ] Style to match Hanar theme

### Sprint 5: Cleanup Feature (1-2 hours)
- [ ] Create `electron/services/cleanup.ts`
- [ ] Implement duplicate detection
- [ ] Add cleanup UI section
- [ ] Add confirmation dialog before deletion

### Sprint 6: Polish & Testing (1-2 hours)
- [ ] Error handling throughout
- [ ] Loading states and skeletons
- [ ] Test with various video formats
- [ ] Test pause/resume functionality
- [ ] Test cleanup feature

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `src/App.tsx` | Modify | Add navigation state, render sidebar + views |
| `src/App.css` | Modify | Add layout styles for sidebar |
| `src/components/Sidebar.tsx` | Create | Navigation sidebar component |
| `src/components/Sidebar.css` | Create | Sidebar styles |
| `src/views/DownloadView.tsx` | Create | Extract current download UI |
| `src/views/DownloadView.css` | Create | Download view styles |
| `src/views/ConvertView.tsx` | Create | New conversion view |
| `src/views/ConvertView.css` | Create | Conversion view styles |
| `electron/main.ts` | Modify | Add conversion IPC handlers |
| `electron/preload.ts` | Modify | Expose conversion APIs |
| `electron/services/scanner.ts` | Create | Video scanning service |
| `electron/services/converter.ts` | Create | Conversion queue service |
| `electron/services/cleanup.ts` | Create | Duplicate cleanup service |

---

## Notes

### Pause/Resume Implementation
FFmpeg doesn't have native pause. Options:
1. **Process suspension** (Windows): Use `NtSuspendProcess`/`NtResumeProcess`
2. **Kill & resume from timestamp**: Track progress, restart with `-ss` flag
3. **Simple approach**: Just implement Stop, skip Pause for v1

**Recommendation**: Start with Stop only, add Pause in future iteration if needed.

### Auto-Cleanup Safety
- Always verify new file exists and is valid before deleting original
- Check file size > 1KB
- Optionally run ffprobe on new file to verify it's playable
- Move to recycle bin instead of permanent delete (safer)

### Performance Considerations
- Scan large folders in chunks to keep UI responsive
- Use worker threads for ffprobe calls
- Throttle progress updates to ~2-4 per second (not every ffmpeg output line)
