import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

// Define the settings interface
export interface AppSettings {
  outputDir?: string;
  archiveFile?: string;
  downloadPreset?: string;  // '1080p-fast' or 'max-quality'
}

// Download history item interface
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

// Wishlist item interface
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

// Get the path to the settings file in the app's user data directory
const getSettingsPath = (): string => {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'settings.json');
};

// Get the path to the download history file
const getHistoryPath = (): string => {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'download-history.json');
};

// Get the path to the wishlist file
const getWishlistPath = (): string => {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'wishlist.json');
};

// Load settings from file
export const loadSettings = (): AppSettings => {
  try {
    const settingsPath = getSettingsPath();
    
    // If settings file doesn't exist, return empty settings
    if (!fs.existsSync(settingsPath)) {
      return {};
    }
    
    // Read and parse the settings file
    const data = fs.readFileSync(settingsPath, 'utf8');
    const settings = JSON.parse(data) as AppSettings;
    
    console.log('Settings loaded:', settings);
    return settings;
  } catch (error) {
    console.error('Error loading settings:', error);
    return {};
  }
};

// Save settings to file
export const saveSettings = (settings: AppSettings): void => {
  try {
    const settingsPath = getSettingsPath();
    
    // Create directory if it doesn't exist
    const settingsDir = path.dirname(settingsPath);
    if (!fs.existsSync(settingsDir)) {
      fs.mkdirSync(settingsDir, { recursive: true });
    }
    
    // Write settings to file
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    console.log('Settings saved:', settings);
  } catch (error) {
    console.error('Error saving settings:', error);
  }
};

// Update a single setting
export const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K] | null): void => {
  const settings = loadSettings();
  if (value === null || value === undefined) {
    delete settings[key];
  } else {
    settings[key] = value;
  }
  saveSettings(settings);
};

// ============ Download History Functions ============

// Load download history from file
export const loadDownloadHistory = (): DownloadHistoryItem[] => {
  try {
    const historyPath = getHistoryPath();
    
    // If history file doesn't exist, return empty array
    if (!fs.existsSync(historyPath)) {
      return [];
    }
    
    // Read and parse the history file
    const data = fs.readFileSync(historyPath, 'utf8');
    const history = JSON.parse(data) as DownloadHistoryItem[];
    
    console.log(`Download history loaded: ${history.length} items`);
    return history;
  } catch (error) {
    console.error('Error loading download history:', error);
    return [];
  }
};

// Save download history to file
export const saveDownloadHistory = (history: DownloadHistoryItem[]): void => {
  try {
    const historyPath = getHistoryPath();
    
    // Create directory if it doesn't exist
    const historyDir = path.dirname(historyPath);
    if (!fs.existsSync(historyDir)) {
      fs.mkdirSync(historyDir, { recursive: true });
    }
    
    // Write history to file
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
    console.log(`Download history saved: ${history.length} items`);
  } catch (error) {
    console.error('Error saving download history:', error);
  }
};

// Add a download to history
export const addDownloadToHistory = (item: DownloadHistoryItem): void => {
  const history = loadDownloadHistory();
  
  // Check if item already exists (by id)
  const existingIndex = history.findIndex(h => h.id === item.id);
  if (existingIndex >= 0) {
    // Update existing item
    history[existingIndex] = item;
  } else {
    // Add new item at the beginning
    history.unshift(item);
  }
  
  // Keep only last 100 items to prevent file from growing too large
  const trimmedHistory = history.slice(0, 100);
  saveDownloadHistory(trimmedHistory);
};

// Update a download in history
export const updateDownloadInHistory = (id: string, updates: Partial<DownloadHistoryItem>): void => {
  const history = loadDownloadHistory();
  const index = history.findIndex(h => h.id === id);
  
  if (index >= 0) {
    history[index] = { ...history[index], ...updates };
    saveDownloadHistory(history);
  }
};

// Clear download history
export const clearDownloadHistory = (): void => {
  saveDownloadHistory([]);
};

// ============ Wishlist Functions ============

// Load wishlist from file
export const loadWishlist = (): WishlistItem[] => {
  try {
    const wishlistPath = getWishlistPath();

    if (!fs.existsSync(wishlistPath)) {
      return [];
    }

    const data = fs.readFileSync(wishlistPath, 'utf8');
    const wishlist = JSON.parse(data) as WishlistItem[];

    console.log(`Wishlist loaded: ${wishlist.length} items`);
    return wishlist;
  } catch (error) {
    console.error('Error loading wishlist:', error);
    return [];
  }
};

// Save wishlist to file
export const saveWishlist = (wishlist: WishlistItem[]): void => {
  try {
    const wishlistPath = getWishlistPath();

    const wishlistDir = path.dirname(wishlistPath);
    if (!fs.existsSync(wishlistDir)) {
      fs.mkdirSync(wishlistDir, { recursive: true });
    }

    fs.writeFileSync(wishlistPath, JSON.stringify(wishlist, null, 2));
    console.log(`Wishlist saved: ${wishlist.length} items`);
  } catch (error) {
    console.error('Error saving wishlist:', error);
  }
};

export const addWishlistItem = (item: WishlistItem): void => {
  const wishlist = loadWishlist();
  const existingIndex = wishlist.findIndex(w => w.videoId && w.videoId === item.videoId);
  const existingByUrlIndex = wishlist.findIndex(w => w.url === item.url);
  const targetIndex = existingIndex >= 0 ? existingIndex : existingByUrlIndex;

  if (targetIndex >= 0) {
    wishlist[targetIndex] = {
      ...wishlist[targetIndex],
      ...item,
      id: wishlist[targetIndex].id,
      addedAt: wishlist[targetIndex].addedAt,
      updatedAt: new Date().toISOString(),
    };
  } else {
    wishlist.unshift(item);
  }

  saveWishlist(wishlist.slice(0, 500));
};

export const updateWishlistItem = (id: string, updates: Partial<WishlistItem>): void => {
  const wishlist = loadWishlist();
  const index = wishlist.findIndex(w => w.id === id);

  if (index >= 0) {
    wishlist[index] = {
      ...wishlist[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    saveWishlist(wishlist);
  }
};

export const removeWishlistItem = (id: string): void => {
  const wishlist = loadWishlist();
  const filtered = wishlist.filter(w => w.id !== id);
  saveWishlist(filtered);
};

export const clearWishlist = (): void => {
  saveWishlist([]);
};
