import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { 
  loadSettings, 
  updateSetting, 
  loadDownloadHistory, 
  addDownloadToHistory, 
  updateDownloadInHistory, 
  clearDownloadHistory,
  DownloadHistoryItem
} from './store'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

// Set application icon - needed for taskbar icons when pinned
if (process.platform === 'win32') {
  app.setAppUserModelId(app.name);
  // Clear tasks
  app.setUserTasks([]);
}

let win: BrowserWindow | null

function createWindow() {
  console.log('Creating Electron window...');
  console.log('Preload path:', path.join(__dirname, 'preload.mjs'));
  
  win = new BrowserWindow({
    title: 'Hanar -- YouTube Video Downloader for Plex',
    width: 1024,
    height: 900,
    minWidth: 600,
    minHeight: 500,
    backgroundColor: '#1e1a33', // Hanar dark purple background
    icon: path.join(process.env.VITE_PUBLIC, 'Hanar- Violet.jpg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      sandbox: true
    },
    // Remove default menu bar in production
    autoHideMenuBar: !VITE_DEV_SERVER_URL,
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    console.log('Window did finish load - sending test message');
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    console.log('Loading dev server URL:', VITE_DEV_SERVER_URL);
    win.loadURL(VITE_DEV_SERVER_URL)
    // Comment out or remove the line that opens dev tools automatically
    // win.webContents.openDevTools();
  } else {
    console.log('Loading production build');
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
    // Optionally open dev tools in production too, or remove this line
    // win.webContents.openDevTools();
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// Directory selection
ipcMain.handle('select-directory', async (event, title) => {
  console.log('Main: select-directory called with title:', title);
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) {
    console.error('No window found for dialog');
    return null;
  }

  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: title || 'Select Directory',
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Select'
  });

  if (canceled || filePaths.length === 0) {
    return null;
  }

  // Save the selected directory to settings
  updateSetting('outputDir', filePaths[0]);
  return filePaths[0];
});

// File selection
ipcMain.handle('select-file', async (event, title, filters) => {
  console.log('Main: select-file called with title:', title);
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) {
    console.error('No window found for dialog');
    return null;
  }

  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: title || 'Select File',
    properties: ['openFile', 'createDirectory'],
    filters: filters || [{ name: 'Text Files', extensions: ['txt'] }],
    buttonLabel: 'Select'
  });

  if (canceled || filePaths.length === 0) {
    return null;
  }

  // Save the selected file to settings
  updateSetting('archiveFile', filePaths[0]);
  return filePaths[0];
});

// Add handler to get saved settings
ipcMain.handle('get-settings', async () => {
  console.log('Main: get-settings called');
  return loadSettings();
});

// ============ Download History Handlers ============

// Get download history
ipcMain.handle('get-download-history', async () => {
  console.log('Main: get-download-history called');
  return loadDownloadHistory();
});

// Add download to history
ipcMain.handle('add-download-history', async (_event, item: DownloadHistoryItem) => {
  console.log('Main: add-download-history called');
  addDownloadToHistory(item);
});

// Update download in history
ipcMain.handle('update-download-history', async (_event, id: string, updates: Partial<DownloadHistoryItem>) => {
  console.log('Main: update-download-history called');
  updateDownloadInHistory(id, updates);
});

// Clear download history
ipcMain.handle('clear-download-history', async () => {
  console.log('Main: clear-download-history called');
  clearDownloadHistory();
});

// Open external URL in default browser
ipcMain.handle('open-external', async (_event, url: string) => {
  console.log('Main: open-external called with URL:', url);
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    await shell.openExternal(url);
  }
});

// Modify the download-video handler to accept directory options
ipcMain.handle('download-video', async (event, url: string, options: { outputDir?: string, archiveFile?: string, downloadPreset?: string } = {}) => {
  console.log(`Received download request for: ${url} with options:`, options);
  const webContents = event.sender;

  // --- Configuration (from your .bat script or provided options) ---
  const DEFAULT_PLEX_DIR = 'E:\\Plex';
  const DEFAULT_OUTPUT_DIR = path.join(DEFAULT_PLEX_DIR, 'YouTube');
  const DEFAULT_ARCHIVE_FILE = path.join(DEFAULT_PLEX_DIR, 'scripts', 'archive.txt');
  
  // Use provided options if available, otherwise use defaults
  const OUTPUT_DIR = options.outputDir || DEFAULT_OUTPUT_DIR;
  const ARCHIVE_FILE = options.archiveFile || DEFAULT_ARCHIVE_FILE;
  // Download presets: '1080p-fast' (H.264, no conversion) or 'max-quality' (best quality, convert to HEVC)
  const DOWNLOAD_PRESET = options.downloadPreset || '1080p-fast';
  // --- End Configuration ---

  // Save the current settings if they're provided
  if (options.outputDir) {
    updateSetting('outputDir', options.outputDir);
  }
  if (options.archiveFile) {
    updateSetting('archiveFile', options.archiveFile);
  }
  if (options.downloadPreset) {
    updateSetting('downloadPreset', options.downloadPreset);
  }

  const presetDescriptions: Record<string, string> = {
    '1080p-fast': '1080p Fast (H.264, no conversion) - Direct play on Apple TV/iPad',
    'max-quality': 'Max Quality (4K, converts to HEVC via GPU) - Direct play on Apple TV/iPad'
  };

  webContents.send('download-status', `Using output directory: ${OUTPUT_DIR}`);
  webContents.send('download-status', `Using archive file: ${ARCHIVE_FILE}`);
  webContents.send('download-status', `Preset: ${presetDescriptions[DOWNLOAD_PRESET] || DOWNLOAD_PRESET}`);

  // Function to extract YouTube video ID
  const getYoutubeId = (url: string): string | null => {
    const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  // Try to extract the video ID immediately
  const videoId = getYoutubeId(url);
  if (videoId) {
    webContents.send('download-progress', {
      phase: 'preparing',
      videoInfo: {
        id: videoId,
        title: 'Loading...',
        thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
        uploader: ''
      },
      message: 'Preparing download...'
    });
  }

  // Build format string based on preset
  // '1080p-fast': H.264 video + AAC audio, max 1080p, no conversion needed
  // 'max-quality': Best quality (VP9/AV1), will convert to HEVC after download
  let formatString: string;
  let needsConversion = false;
  
  if (DOWNLOAD_PRESET === '1080p-fast') {
    // Get H.264 + AAC directly from YouTube (max 1080p)
    formatString = 'bestvideo[vcodec^=avc1][height<=1080]+bestaudio[acodec^=mp4a]/' +
                   'bestvideo[vcodec^=avc1][height<=1080]+bestaudio/' +
                   'best[height<=1080]/best';
    needsConversion = false;
    webContents.send('download-status', `Format: H.264 + AAC (max 1080p, no conversion needed)`);
  } else if (DOWNLOAD_PRESET === 'max-quality') {
    // Get best quality (VP9/AV1), will convert to HEVC
    formatString = 'bestvideo+bestaudio/best';
    needsConversion = true;
    webContents.send('download-status', `Format: Best quality (VP9/AV1), will convert to HEVC using GPU`);
  } else {
    // Fallback to 1080p-fast
    formatString = 'bestvideo[vcodec^=avc1][height<=1080]+bestaudio[acodec^=mp4a]/best[height<=1080]/best';
    needsConversion = false;
  }

  // --- yt-dlp Arguments ---
  const args = [
    '--download-archive', ARCHIVE_FILE,
    '-f', formatString,
    '--merge-output-format', 'mp4',
    '-o', path.join(OUTPUT_DIR, '%(uploader)s # %(title)s.%(ext)s'),
    '--write-thumbnail',
    '--convert-thumbnails', 'jpg',
    '--parse-metadata', 'upload_date:%(upload_date)s',
    '--limit-rate', '1024M',
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    '--no-mtime',
    '--progress',
    url // The URL to download
  ];
  // --- End yt-dlp Arguments ---

  webContents.send('download-status', 'Starting yt-dlp process...')

  // Variables to track download state
  let currentPhase: 'preparing' | 'metadata' | 'thumbnail' | 'video' | 'audio' | 'merging' | 'converting' | 'complete' | 'error' = 'preparing';
  let videoTitle = '';
  let videoFileSize = '';
  let audioFileSize = '';
  let downloadSummary = '';
  let currentProgress = 0;
  let downloadedFilePath = '';  // Track the final downloaded file for potential HEVC conversion

  try {
    const ytDlpPath = 'yt-dlp' // Assume yt-dlp is in PATH
    const child = spawn(ytDlpPath, args);

    webContents.send('download-status', `Executing: ${ytDlpPath} ${args.join(' ')}`);

    child.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('yt-dlp stdout:', output);
      webContents.send('download-status', output);
      
      // --- PROGRESS PARSING LOGIC ---
      
      // Extract video title
      const titleMatch = output.match(/\[info\] (.+): Downloading/i);
      if (titleMatch && titleMatch[1]) {
        videoTitle = titleMatch[1];
        if (videoId) {
          webContents.send('download-progress', {
            phase: 'metadata',
            videoInfo: {
              id: videoId,
              title: videoTitle,
              thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
              uploader: ''
            },
            message: `Getting information for "${videoTitle}"...`
          });
        }
        currentPhase = 'metadata';
      }
      
      // Detect thumbnail download
      if (output.includes('Downloading thumbnail') || output.includes('Writing thumbnail')) {
        currentPhase = 'thumbnail';
        webContents.send('download-progress', {
          phase: 'thumbnail',
          message: 'Downloading video thumbnail...'
        });
      }
      
      // Detect video download start
      const videoDestMatch = output.match(/\[download\] Destination: .+?\.f\d+\.mp4/i);
      if (videoDestMatch && currentPhase !== 'video') {
        currentPhase = 'video';
        webContents.send('download-progress', {
          phase: 'video',
          message: 'Downloading video stream...',
          percent: 0
        });
      }
      
      // Parse video progress percentage
      const percentMatch = output.match(/\[download\]\s+([\d.]+)%/i);
      if (percentMatch && percentMatch[1] && currentPhase === 'video') {
        currentProgress = parseFloat(percentMatch[1]);
        webContents.send('download-progress', {
          phase: 'video',
          percent: currentProgress
        });
        
        // Extract video size
        const sizeMatch = output.match(/of\s+~?\s*([\d.]+(?:KiB|MiB|GiB))/i);
        if (sizeMatch && sizeMatch[1] && !videoFileSize) {
          videoFileSize = sizeMatch[1];
          downloadSummary = `Video: ${videoFileSize}`;
          webContents.send('download-progress', {
            phase: 'video',
            message: `Downloading video stream (${videoFileSize})...`,
            summary: downloadSummary
          });
        }
      }
      
      // Detect audio download start 
      if ((currentPhase === 'video' && output.match(/100%/i) && output.match(/ETA 00:00/i)) || 
          output.includes('download] 100% of') || 
          output.match(/download] 100% of .+ in /i)) {
        // Only transition to audio if we were in video phase
        if (currentPhase === 'video') {
          currentPhase = 'audio';
          currentProgress = 0;
          webContents.send('download-progress', {
            phase: 'audio',
            message: 'Downloading audio stream...',
            percent: 0
          });
        }
      }
      
      // Parse audio progress percentage
      if (percentMatch && percentMatch[1] && currentPhase === 'audio') {
        currentProgress = parseFloat(percentMatch[1]);
        webContents.send('download-progress', {
          phase: 'audio',
          percent: currentProgress
        });
        
        // Extract audio size
        const sizeMatch = output.match(/of\s+~?\s*([\d.]+(?:KiB|MiB|GiB))/i);
        if (sizeMatch && sizeMatch[1] && !audioFileSize) {
          audioFileSize = sizeMatch[1];
          downloadSummary = `${downloadSummary}, Audio: ${audioFileSize}`;
          webContents.send('download-progress', {
            phase: 'audio',
            message: `Downloading audio stream (${audioFileSize})...`,
            summary: downloadSummary
          });
        }
      }
      
      // Detect merging phase and capture final file path
      if (output.includes('[Merger]') || output.includes('Merging formats')) {
        currentPhase = 'merging';
        const destinationMatch = output.match(/Merging formats into "(.+?)"/i);
        if (destinationMatch && destinationMatch[1]) {
          downloadedFilePath = destinationMatch[1];  // Capture full path for conversion
          const filename = path.basename(destinationMatch[1]);
          webContents.send('download-progress', {
            phase: 'merging',
            message: `Creating "${filename}"...`
          });
        } else {
          webContents.send('download-progress', {
            phase: 'merging',
            message: 'Merging video and audio...'
          });
        }
      }
      
      // Also capture file path from "has already been downloaded" message (for archive skips)
      const alreadyDownloadedMatch = output.match(/\[download\] (.+?) has already been downloaded/i);
      if (alreadyDownloadedMatch && alreadyDownloadedMatch[1]) {
        downloadedFilePath = alreadyDownloadedMatch[1];
      }
    });

    child.stderr.on('data', (data) => {
      const errorOutput = data.toString();
      console.error('yt-dlp stderr:', errorOutput);
      // Send stderr also as status, prefixing with ERROR:
      webContents.send('download-status', `ERROR: ${errorOutput}`);
      
      // Only set error phase for actual errors, not warnings
      if (!errorOutput.includes('WARNING')) {
        currentPhase = 'error';
        webContents.send('download-progress', {
          phase: 'error',
          message: `Error: ${errorOutput}`
        });
      }
    });

    child.on('close', async (code) => {
      console.log(`yt-dlp process exited with code ${code}`);
      if (code === 0) {
        webContents.send('download-status', '\nDownload successful!');
        
        // Check if we need to convert to HEVC (max-quality preset)
        if (needsConversion && downloadedFilePath) {
          webContents.send('download-status', '\nStarting HEVC conversion using GPU (NVENC)...');
          webContents.send('download-progress', {
            phase: 'converting',
            message: 'Converting to HEVC using GPU...'
          });
          
          // Build output path for converted file
          const inputPath = downloadedFilePath;
          const outputPath = inputPath.replace(/\.mp4$/i, '_hevc.mp4');
          
          // Run ffmpeg with NVENC for hardware-accelerated HEVC encoding
          const ffmpegArgs = [
            '-i', inputPath,
            '-map', '0',
            '-c:v', 'hevc_nvenc',      // NVIDIA NVENC hardware encoder
            '-cq', '23',                // Constant quality (similar to CRF)
            '-preset', 'p4',            // Balanced preset
            '-tag:v', 'hvc1',           // Required for Apple TV compatibility
            '-c:a', 'aac',              // Convert audio to AAC
            '-b:a', '192k',
            '-movflags', '+faststart',
            '-y',                       // Overwrite
            outputPath
          ];
          
          webContents.send('download-status', `Converting: ${path.basename(inputPath)}`);
          
          const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
          
          ffmpegProcess.stderr.on('data', (data) => {
            const output = data.toString();
            // Parse ffmpeg progress
            const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2})/);
            const speedMatch = output.match(/speed=([\d.]+)x/);
            if (timeMatch && speedMatch) {
              webContents.send('download-progress', {
                phase: 'converting',
                message: `Converting to HEVC... ${timeMatch[0]} @ ${speedMatch[1]}x speed`
              });
            }
          });
          
          ffmpegProcess.on('close', (ffmpegCode) => {
            if (ffmpegCode === 0) {
              // Conversion successful - replace original with converted file
              try {
                const fs = require('fs');
                fs.unlinkSync(inputPath);  // Delete original VP9/AV1 file
                fs.renameSync(outputPath, inputPath);  // Rename HEVC file to original name
                
                webContents.send('download-status', '\n✅ HEVC conversion complete!');
                currentPhase = 'complete';
                webContents.send('download-progress', {
                  phase: 'complete',
                  message: videoTitle ? `Successfully downloaded and converted "${videoTitle}"!` : 'Download and conversion complete!'
                });
              } catch (fsError) {
                console.error('Error replacing file:', fsError);
                webContents.send('download-status', `\n⚠️ Conversion done but file rename failed. HEVC file saved as: ${path.basename(outputPath)}`);
                currentPhase = 'complete';
                webContents.send('download-progress', {
                  phase: 'complete',
                  message: 'Download complete (HEVC file saved with _hevc suffix)'
                });
              }
            } else {
              webContents.send('download-status', `\n⚠️ HEVC conversion failed (code ${ffmpegCode}). Original file kept.`);
              currentPhase = 'complete';
              webContents.send('download-progress', {
                phase: 'complete',
                message: 'Download complete (conversion failed, original VP9/AV1 kept)'
              });
            }
          });
          
          ffmpegProcess.on('error', (err) => {
            console.error('FFmpeg error:', err);
            webContents.send('download-status', `\n⚠️ FFmpeg error: ${err.message}. Original file kept.`);
            currentPhase = 'complete';
            webContents.send('download-progress', {
              phase: 'complete',
              message: 'Download complete (conversion failed, original kept)'
            });
          });
        } else {
          // No conversion needed
          currentPhase = 'complete';
          webContents.send('download-progress', {
            phase: 'complete',
            message: videoTitle ? `Successfully downloaded "${videoTitle}"!` : 'Download complete!'
          });
        }
      } else {
        webContents.send('download-status', `\nDownload failed. Error code: ${code}`);
        currentPhase = 'error';
        webContents.send('download-progress', {
          phase: 'error',
          message: `Download failed with error code: ${code}`
        });
      }
    });

    child.on('error', (err) => {
      console.error('Failed to start yt-dlp process:', err);
      webContents.send('download-status', `ERROR: Failed to start yt-dlp process. Is yt-dlp installed and in your PATH? Details: ${err.message}`);
      currentPhase = 'error';
      webContents.send('download-progress', {
        phase: 'error',
        message: `Failed to start yt-dlp process: ${err.message}`
      });
    });

  } catch (error) {
    console.error('Error executing yt-dlp:', error);
    webContents.send('download-status', `ERROR: Could not execute download. ${error}`);
    webContents.send('download-progress', {
      phase: 'error',
      message: `Could not execute download: ${error}`
    });
  }
});

app.whenReady().then(createWindow)