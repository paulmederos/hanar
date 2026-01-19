import type { DownloadHistoryItem, AppSettings } from './types';

interface ElectronAPI {
  downloadVideo: (url: string, options?: { outputDir?: string; archiveFile?: string; downloadPreset?: string }) => Promise<unknown>;
  onStatusUpdate: (callback: (event: any, message: string) => void) => () => void;
  onProgressUpdate: (callback: (event: any, data: any) => void) => () => void;
  selectDirectory: (title?: string) => Promise<string | null>;
  selectFile: (title?: string, filters?: Array<{ name: string; extensions: string[] }>) => Promise<string | null>;
  getSettings: () => Promise<AppSettings>;
  getDownloadHistory: () => Promise<DownloadHistoryItem[]>;
  addDownloadHistory: (item: DownloadHistoryItem) => Promise<void>;
  updateDownloadHistory: (id: string, updates: Partial<DownloadHistoryItem>) => Promise<void>;
  clearDownloadHistory: () => Promise<void>;
  ping: () => string;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
