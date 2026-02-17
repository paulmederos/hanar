import { contextBridge, ipcRenderer } from 'electron'

type QueueStatePayload = {
  activeItem: {
    id: string;
    url: string;
    options: { outputDir?: string; archiveFile?: string; downloadPreset?: string };
    wishlistItemId?: string;
    queuedAt: string;
  } | null;
  queue: Array<{
    id: string;
    url: string;
    options: { outputDir?: string; archiveFile?: string; downloadPreset?: string };
    wishlistItemId?: string;
    queuedAt: string;
  }>;
  isActive: boolean;
}

// Electron API exposed to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Download video function
  downloadVideo: (url: string, options: { outputDir?: string, archiveFile?: string, downloadPreset?: string }) => {
    console.log('Preload: downloadVideo called with URL:', url, 'options:', options)
    return ipcRenderer.invoke('download-video', url, options)
  },
  
  // Cancel active download
  cancelDownload: () => {
    console.log('Preload: cancelDownload called')
    return ipcRenderer.invoke('cancel-download')
  },

  // Status update registration
  onStatusUpdate: (callback: (event: unknown, message: string) => void) => {
    console.log('Preload: onStatusUpdate listener being registered')
    
    // Add the listener
    ipcRenderer.on('download-status', callback)
    
    // Return cleanup function
    return () => {
      console.log('Preload: cleaning up onStatusUpdate listener')
      ipcRenderer.removeListener('download-status', callback)
    }
  },

  // Progress update registration
  onProgressUpdate: (callback: (event: unknown, data: Record<string, unknown>) => void) => {
    console.log('Preload: onProgressUpdate listener being registered')
    
    // Add the listener
    ipcRenderer.on('download-progress', callback)
    
    // Return cleanup function
    return () => {
      console.log('Preload: cleaning up onProgressUpdate listener')
      ipcRenderer.removeListener('download-progress', callback)
    }
  },

  // Queue update registration
  onQueueUpdate: (callback: (event: unknown, data: QueueStatePayload) => void) => {
    console.log('Preload: onQueueUpdate listener being registered')
    ipcRenderer.on('download-queue-updated', callback)
    return () => {
      console.log('Preload: cleaning up onQueueUpdate listener')
      ipcRenderer.removeListener('download-queue-updated', callback)
    }
  },

  // Directory selection
  selectDirectory: (title: string = 'Select Directory') => {
    console.log('Preload: selectDirectory called')
    return ipcRenderer.invoke('select-directory', title)
  },

  // File selection
  selectFile: (title: string = 'Select File', filters: Array<{ name: string; extensions: string[] }> = []) => {
    console.log('Preload: selectFile called')
    return ipcRenderer.invoke('select-file', title, filters)
  },
  
  // Get saved settings
  getSettings: () => {
    console.log('Preload: getSettings called')
    return ipcRenderer.invoke('get-settings')
  },

  // ============ Download History APIs ============
  
  // Get download history
  getDownloadHistory: () => {
    console.log('Preload: getDownloadHistory called')
    return ipcRenderer.invoke('get-download-history')
  },

  // Add download to history
  addDownloadHistory: (item: unknown) => {
    console.log('Preload: addDownloadHistory called')
    return ipcRenderer.invoke('add-download-history', item)
  },

  // Update download in history
  updateDownloadHistory: (id: string, updates: unknown) => {
    console.log('Preload: updateDownloadHistory called')
    return ipcRenderer.invoke('update-download-history', id, updates)
  },

  // Clear download history
  clearDownloadHistory: () => {
    console.log('Preload: clearDownloadHistory called')
    return ipcRenderer.invoke('clear-download-history')
  },

  // Open external URL in default browser
  openExternal: (url: string) => {
    console.log('Preload: openExternal called with URL:', url)
    return ipcRenderer.invoke('open-external', url)
  },

  // ============ Wishlist APIs ============
  getWishlist: () => {
    console.log('Preload: getWishlist called')
    return ipcRenderer.invoke('get-wishlist')
  },
  addWishlistItem: (item: unknown) => {
    console.log('Preload: addWishlistItem called')
    return ipcRenderer.invoke('add-wishlist-item', item)
  },
  updateWishlistItem: (id: string, updates: unknown) => {
    console.log('Preload: updateWishlistItem called')
    return ipcRenderer.invoke('update-wishlist-item', id, updates)
  },
  removeWishlistItem: (id: string) => {
    console.log('Preload: removeWishlistItem called')
    return ipcRenderer.invoke('remove-wishlist-item', id)
  },
  clearWishlist: () => {
    console.log('Preload: clearWishlist called')
    return ipcRenderer.invoke('clear-wishlist')
  },

  // ============ Queue APIs ============
  getDownloadQueue: () => {
    console.log('Preload: getDownloadQueue called')
    return ipcRenderer.invoke('get-download-queue')
  },
  queueDownload: (wishlistItemId: string, options: { outputDir?: string, archiveFile?: string, downloadPreset?: string } = {}) => {
    console.log('Preload: queueDownload called')
    return ipcRenderer.invoke('queue-download', wishlistItemId, options)
  },
  removeQueueItem: (queueItemId: string) => {
    console.log('Preload: removeQueueItem called')
    return ipcRenderer.invoke('remove-queue-item', queueItemId)
  },
  
  // Simple ping method for testing
  ping: () => {
    console.log('Preload: ping called')
    return 'pong'
  }
})
