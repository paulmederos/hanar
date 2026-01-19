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
