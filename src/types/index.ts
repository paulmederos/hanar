// Download History Types
export interface DownloadHistoryItem {
  id: string;
  videoId: string;
  url: string;
  title: string;
  thumbnail: string;
  uploader: string;
  status: 'downloading' | 'converting' | 'completed' | 'failed' | 'cancelled';
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

export interface WishlistItem {
  id: string;
  url: string;
  videoId: string;
  title: string;
  thumbnail: string;
  uploader: string;
  status: 'wishlist' | 'queued' | 'downloading' | 'completed' | 'failed';
  addedAt: string;
  updatedAt?: string;
  lastError?: string;
}

export interface QueueDownloadItem {
  id: string;
  url: string;
  options: {
    outputDir?: string;
    archiveFile?: string;
    downloadPreset?: string;
  };
  wishlistItemId?: string;
  queuedAt: string;
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
  downloadVideo: (url: string, options?: { outputDir?: string; archiveFile?: string; downloadPreset?: string }) => Promise<{ started: boolean; reason?: string; message?: string }>;
  cancelDownload: () => Promise<{ success: boolean; message: string }>;
  onStatusUpdate: (callback: (event: unknown, message: string) => void) => () => void;
  onProgressUpdate: (callback: (event: unknown, data: Record<string, unknown>) => void) => () => void;
  onQueueUpdate: (callback: (event: unknown, data: { activeItem: QueueDownloadItem | null; queue: QueueDownloadItem[]; isActive: boolean }) => void) => () => void;
  selectDirectory: (title?: string) => Promise<string | null>;
  selectFile: (title?: string, filters?: Array<{ name: string; extensions: string[] }>) => Promise<string | null>;
  getSettings: () => Promise<AppSettings>;
  getDownloadHistory: () => Promise<DownloadHistoryItem[]>;
  addDownloadHistory: (item: DownloadHistoryItem) => Promise<void>;
  updateDownloadHistory: (id: string, updates: Partial<DownloadHistoryItem>) => Promise<void>;
  clearDownloadHistory: () => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  getWishlist: () => Promise<WishlistItem[]>;
  addWishlistItem: (item: WishlistItem) => Promise<WishlistItem[]>;
  updateWishlistItem: (id: string, updates: Partial<WishlistItem>) => Promise<WishlistItem[]>;
  removeWishlistItem: (id: string) => Promise<WishlistItem[]>;
  clearWishlist: () => Promise<WishlistItem[]>;
  getDownloadQueue: () => Promise<{ activeItem: QueueDownloadItem | null; queue: QueueDownloadItem[]; isActive: boolean }>;
  queueDownload: (wishlistItemId: string, options?: { outputDir?: string; archiveFile?: string; downloadPreset?: string }) => Promise<{ queued: boolean; reason?: string; message?: string }>;
  removeQueueItem: (queueItemId: string) => Promise<{ removed: boolean; reason?: string; activeItem: QueueDownloadItem | null; queue: QueueDownloadItem[]; isActive: boolean }>;
  ping: () => string;
}

