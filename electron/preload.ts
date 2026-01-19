import { contextBridge, ipcRenderer } from 'electron'

// Electron API exposed to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Download video function
  downloadVideo: (url: string, options: { outputDir?: string, archiveFile?: string, downloadPreset?: string }) => {
    console.log('Preload: downloadVideo called with URL:', url, 'options:', options)
    return ipcRenderer.invoke('download-video', url, options)
  },
  
  // Status update registration
  onStatusUpdate: (callback: (event: any, message: string) => void) => {
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
  onProgressUpdate: (callback: (event: any, data: any) => void) => {
    console.log('Preload: onProgressUpdate listener being registered')
    
    // Add the listener
    ipcRenderer.on('download-progress', callback)
    
    // Return cleanup function
    return () => {
      console.log('Preload: cleaning up onProgressUpdate listener')
      ipcRenderer.removeListener('download-progress', callback)
    }
  },

  // Directory selection
  selectDirectory: (title: string = 'Select Directory') => {
    console.log('Preload: selectDirectory called')
    return ipcRenderer.invoke('select-directory', title)
  },

  // File selection
  selectFile: (title: string = 'Select File', filters: any[] = []) => {
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
  addDownloadHistory: (item: any) => {
    console.log('Preload: addDownloadHistory called')
    return ipcRenderer.invoke('add-download-history', item)
  },

  // Update download in history
  updateDownloadHistory: (id: string, updates: any) => {
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
  
  // Simple ping method for testing
  ping: () => {
    console.log('Preload: ping called')
    return 'pong'
  }
})
