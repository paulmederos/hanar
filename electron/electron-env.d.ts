/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string
    /** /dist/ or /public/ */
    VITE_PUBLIC: string
  }
}

// Download history item interface
interface DownloadHistoryItem {
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

// App settings interface
interface AppSettings {
  outputDir?: string;
  archiveFile?: string;
  downloadPreset?: string;
}

// Used in Renderer process, expose in `preload.ts`
interface Window {
  electronAPI: {
    downloadVideo: (url: string, options?: { outputDir?: string; archiveFile?: string; downloadPreset?: string }) => Promise<unknown>;
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
}
