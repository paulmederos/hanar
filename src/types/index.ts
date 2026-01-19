// Download History Types
export interface DownloadHistoryItem {
  id: string;
  videoId: string;
  url: string;
  title: string;
  thumbnail: string;
  uploader: string;
  status: 'downloading' | 'converting' | 'completed' | 'failed';
  progress: number;
  eta?: string;
  speed?: string;
  error?: string;
  preset: string;
  startedAt: string;
  completedAt?: string;
  filePath?: string;
  fileSize?: string;
}

// Video Info (during download)
export interface VideoInfo {
  id: string;
  title: string;
  thumbnail: string;
  uploader: string;
}

// Download Phase
export type DownloadPhase = 'idle' | 'preparing' | 'metadata' | 'thumbnail' | 'video' | 'audio' | 'merging' | 'converting' | 'complete' | 'error';

// App Settings
export interface AppSettings {
  outputDir?: string;
  archiveFile?: string;
  downloadPreset?: string;
}

// Electron API interface
export interface ElectronAPI {
  downloadVideo: (url: string, options?: { outputDir?: string; archiveFile?: string; downloadPreset?: string }) => Promise<void>;
  onStatusUpdate: (callback: (event: any, message: string) => void) => () => void;
  onProgressUpdate: (callback: (event: any, data: any) => void) => () => void;
  selectDirectory: (title?: string) => Promise<string | null>;
  selectFile: (title?: string, filters?: any[]) => Promise<string | null>;
  getSettings: () => Promise<AppSettings>;
  getDownloadHistory: () => Promise<DownloadHistoryItem[]>;
  addDownloadHistory: (item: DownloadHistoryItem) => Promise<void>;
  updateDownloadHistory: (id: string, updates: Partial<DownloadHistoryItem>) => Promise<void>;
  clearDownloadHistory: () => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  ping: () => string;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
