import { app, BrowserWindow, ipcMain, dialog, shell, WebContents } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import * as fs from 'node:fs'
import { spawn, ChildProcess } from 'node:child_process'
import { 
  loadSettings, 
  updateSetting, 
  loadDownloadHistory, 
  addDownloadToHistory, 
  updateDownloadInHistory, 
  clearDownloadHistory,
  loadWishlist,
  addWishlistItem,
  updateWishlistItem,
  removeWishlistItem,
  clearWishlist,
  DownloadHistoryItem,
  WishlistItem
} from './store'

// Track active download processes for cancellation
let activeYtDlpProcess: ChildProcess | null = null;
let activeFfmpegProcess: ChildProcess | null = null;
let isDownloadCancelled = false;
let isDownloadPipelineActive = false;

type DownloadOptions = {
  outputDir?: string;
  archiveFile?: string;
  downloadPreset?: string;
};

type QueueDownloadItem = {
  id: string;
  url: string;
  options: DownloadOptions;
  wishlistItemId?: string;
  queuedAt: string;
};

const downloadQueue: QueueDownloadItem[] = [];
let activeQueueItem: QueueDownloadItem | null = null;

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

const getYoutubeId = (url: string): string | null => {
  const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
};

const normalizeUrl = (url: string): string => url.trim();

const emitQueueUpdate = () => {
  win?.webContents.send('download-queue-updated', {
    activeItem: activeQueueItem,
    queue: downloadQueue,
    isActive: isDownloadPipelineActive,
  });
};

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

// Cancel active download
ipcMain.handle('cancel-download', async () => {
  console.log('Main: cancel-download called');
  
  isDownloadCancelled = true;

  // Kill ffmpeg first if it's running (it's the later stage)
  if (activeFfmpegProcess) {
    try {
      // On Windows, use taskkill to ensure the process tree is killed
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(activeFfmpegProcess.pid), '/f', '/t']);
      } else {
        activeFfmpegProcess.kill('SIGTERM');
      }
      console.log('Killed ffmpeg process');
    } catch (err) {
      console.error('Error killing ffmpeg process:', err);
    }
    activeFfmpegProcess = null;
  }

  // Kill yt-dlp process
  if (activeYtDlpProcess) {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(activeYtDlpProcess.pid), '/f', '/t']);
      } else {
        activeYtDlpProcess.kill('SIGTERM');
      }
      console.log('Killed yt-dlp process');
    } catch (err) {
      console.error('Error killing yt-dlp process:', err);
    }
    activeYtDlpProcess = null;
  }

  return { success: true, message: 'Download cancelled' };
});

const runDownload = (
  webContents: WebContents,
  rawUrl: string,
  options: DownloadOptions = {},
  wishlistItemId?: string
) => {
  const url = normalizeUrl(rawUrl);
  console.log(`Received download request for: ${url} with options:`, options);

  const DEFAULT_PLEX_DIR = 'E:\\Plex';
  const DEFAULT_OUTPUT_DIR = path.join(DEFAULT_PLEX_DIR, 'YouTube');
  const DEFAULT_ARCHIVE_FILE = path.join(DEFAULT_PLEX_DIR, 'scripts', 'archive.txt');

  const OUTPUT_DIR = options.outputDir || DEFAULT_OUTPUT_DIR;
  const ARCHIVE_FILE = options.archiveFile || DEFAULT_ARCHIVE_FILE;
  const DOWNLOAD_PRESET = options.downloadPreset || '1080p-fast';

  if (options.outputDir) updateSetting('outputDir', options.outputDir);
  if (options.archiveFile) updateSetting('archiveFile', options.archiveFile);
  if (options.downloadPreset) updateSetting('downloadPreset', options.downloadPreset);

  const presetDescriptions: Record<string, string> = {
    '1080p-fast': '1080p Fast (H.264, no conversion) - Direct play on Apple TV/iPad',
    'max-quality': 'Max Quality (4K, converts to HEVC via GPU) - Direct play on Apple TV/iPad'
  };

  isDownloadPipelineActive = true;
  emitQueueUpdate();
  if (wishlistItemId) {
    updateWishlistItem(wishlistItemId, { status: 'downloading', lastError: undefined });
  }

  webContents.send('download-status', `Using output directory: ${OUTPUT_DIR}`);
  webContents.send('download-status', `Using archive file: ${ARCHIVE_FILE}`);
  webContents.send('download-status', `Preset: ${presetDescriptions[DOWNLOAD_PRESET] || DOWNLOAD_PRESET}`);

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
      message: 'Preparing download...',
      videoPercent: 0,
      audioPercent: 0
    });
  }

  let formatString: string;
  let needsConversion = false;

  if (DOWNLOAD_PRESET === '1080p-fast') {
    formatString = 'bestvideo[vcodec^=avc1][height<=1080]+bestaudio[acodec^=mp4a]/' +
                   'bestvideo[vcodec^=avc1][height<=1080]+bestaudio/' +
                   'best[height<=1080]/best';
    webContents.send('download-status', 'Format: H.264 + AAC (max 1080p, no conversion needed)');
  } else if (DOWNLOAD_PRESET === 'max-quality') {
    formatString = 'bestvideo+bestaudio/best';
    needsConversion = true;
    webContents.send('download-status', 'Format: Best quality (VP9/AV1), will convert to HEVC using GPU');
  } else {
    formatString = 'bestvideo[vcodec^=avc1][height<=1080]+bestaudio[acodec^=mp4a]/best[height<=1080]/best';
  }

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
    url
  ];

  webContents.send('download-status', 'Starting yt-dlp process...');
  isDownloadCancelled = false;

  let currentPhase: 'preparing' | 'metadata' | 'thumbnail' | 'video' | 'audio' | 'merging' | 'converting' | 'complete' | 'error' = 'preparing';
  let videoTitle = '';
  let videoFileSize = '';
  let audioFileSize = '';
  let downloadSummary = '';
  let downloadedFilePath = '';
  let videoPercent = 0;
  let audioPercent = 0;
  let finalized = false;

  const finalizeDownload = (result: 'completed' | 'failed' | 'cancelled', lastError?: string) => {
    if (finalized) return;
    finalized = true;
    isDownloadPipelineActive = false;
    activeQueueItem = null;
    emitQueueUpdate();
    if (wishlistItemId) {
      updateWishlistItem(wishlistItemId, {
        status: result === 'completed' ? 'completed' : result === 'cancelled' ? 'wishlist' : 'failed',
        lastError
      });
    }

    if (downloadQueue.length > 0 && win) {
      const nextItem = downloadQueue.shift()!;
      activeQueueItem = nextItem;
      emitQueueUpdate();
      runDownload(win.webContents, nextItem.url, nextItem.options, nextItem.wishlistItemId);
    }
  };

  try {
    const child = spawn('yt-dlp', args);
    activeYtDlpProcess = child;
    webContents.send('download-status', `Executing: yt-dlp ${args.join(' ')}`);

    child.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('yt-dlp stdout:', output);
      webContents.send('download-status', output);

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
            message: `Getting information for "${videoTitle}"...`,
            videoPercent,
            audioPercent
          });
        }
        currentPhase = 'metadata';
      }

      if (output.includes('Downloading thumbnail') || output.includes('Writing thumbnail')) {
        currentPhase = 'thumbnail';
        webContents.send('download-progress', {
          phase: 'thumbnail',
          message: 'Downloading video thumbnail...',
          videoPercent,
          audioPercent
        });
      }

      const videoDestMatch = output.match(/\[download\] Destination: .+?\.f\d+\.mp4/i);
      if (videoDestMatch && currentPhase !== 'video') {
        currentPhase = 'video';
        videoPercent = 0;
        webContents.send('download-progress', {
          phase: 'video',
          message: 'Downloading video stream...',
          percent: 0,
          videoPercent,
          audioPercent
        });
      }

      const percentMatch = output.match(/\[download\]\s+([\d.]+)%/i);
      if (percentMatch && percentMatch[1] && currentPhase === 'video') {
        videoPercent = parseFloat(percentMatch[1]);
        webContents.send('download-progress', {
          phase: 'video',
          percent: videoPercent,
          videoPercent,
          audioPercent
        });

        const sizeMatch = output.match(/of\s+~?\s*([\d.]+(?:KiB|MiB|GiB))/i);
        if (sizeMatch && sizeMatch[1] && !videoFileSize) {
          videoFileSize = sizeMatch[1];
          downloadSummary = `Video: ${videoFileSize}`;
          webContents.send('download-progress', {
            phase: 'video',
            message: `Downloading video stream (${videoFileSize})...`,
            summary: downloadSummary,
            videoPercent,
            audioPercent
          });
        }
      }

      if ((currentPhase === 'video' && output.match(/100%/i) && output.match(/ETA 00:00/i)) ||
          output.includes('download] 100% of') ||
          output.match(/download] 100% of .+ in /i)) {
        if (currentPhase === 'video') {
          currentPhase = 'audio';
          audioPercent = 0;
          webContents.send('download-progress', {
            phase: 'audio',
            message: 'Downloading audio stream...',
            percent: 0,
            videoPercent,
            audioPercent
          });
        }
      }

      if (percentMatch && percentMatch[1] && currentPhase === 'audio') {
        audioPercent = parseFloat(percentMatch[1]);
        webContents.send('download-progress', {
          phase: 'audio',
          percent: audioPercent,
          videoPercent,
          audioPercent
        });

        const sizeMatch = output.match(/of\s+~?\s*([\d.]+(?:KiB|MiB|GiB))/i);
        if (sizeMatch && sizeMatch[1] && !audioFileSize) {
          audioFileSize = sizeMatch[1];
          downloadSummary = `${downloadSummary}, Audio: ${audioFileSize}`;
          webContents.send('download-progress', {
            phase: 'audio',
            message: `Downloading audio stream (${audioFileSize})...`,
            summary: downloadSummary,
            videoPercent,
            audioPercent
          });
        }
      }

      if (output.includes('[Merger]') || output.includes('Merging formats')) {
        currentPhase = 'merging';
        const destinationMatch = output.match(/Merging formats into "(.+?)"/i);
        if (destinationMatch && destinationMatch[1]) {
          downloadedFilePath = destinationMatch[1];
          const filename = path.basename(destinationMatch[1]);
          webContents.send('download-progress', {
            phase: 'merging',
            message: `Creating "${filename}"...`,
            videoPercent,
            audioPercent
          });
        } else {
          webContents.send('download-progress', {
            phase: 'merging',
            message: 'Merging video and audio...',
            videoPercent,
            audioPercent
          });
        }
      }

      const alreadyDownloadedMatch = output.match(/\[download\] (.+?) has already been downloaded/i);
      if (alreadyDownloadedMatch && alreadyDownloadedMatch[1]) {
        downloadedFilePath = alreadyDownloadedMatch[1];
      }
    });

    child.stderr.on('data', (data) => {
      const errorOutput = data.toString();
      console.error('yt-dlp stderr:', errorOutput);
      webContents.send('download-status', `ERROR: ${errorOutput}`);

      if (!errorOutput.includes('WARNING')) {
        currentPhase = 'error';
        webContents.send('download-progress', {
          phase: 'error',
          message: `Error: ${errorOutput}`,
          videoPercent,
          audioPercent
        });
      }
    });

    child.on('close', async (code) => {
      console.log(`yt-dlp process exited with code ${code}`);
      activeYtDlpProcess = null;

      if (isDownloadCancelled) {
        webContents.send('download-status', '\nDownload cancelled by user.');
        currentPhase = 'error';
        webContents.send('download-progress', {
          phase: 'error',
          message: 'Download cancelled',
          videoPercent,
          audioPercent
        });
        finalizeDownload('cancelled');
        return;
      }

      if (code === 0) {
        webContents.send('download-status', '\nDownload successful!');

        if (needsConversion && downloadedFilePath) {
          webContents.send('download-status', '\nStarting HEVC conversion using GPU (NVENC)...');
          webContents.send('download-progress', {
            phase: 'converting',
            message: 'Converting to HEVC using GPU...',
            videoPercent: 100,
            audioPercent: 100
          });

          const inputPath = downloadedFilePath;
          const outputPath = inputPath.replace(/\.mp4$/i, '_hevc.mp4');

          const ffmpegArgs = [
            '-i', inputPath,
            '-map', '0',
            '-c:v', 'hevc_nvenc',
            '-cq', '23',
            '-preset', 'p4',
            '-tag:v', 'hvc1',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-movflags', '+faststart',
            '-y',
            outputPath
          ];

          webContents.send('download-status', `Converting: ${path.basename(inputPath)}`);
          const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
          activeFfmpegProcess = ffmpegProcess;

          ffmpegProcess.stderr.on('data', (data) => {
            const output = data.toString();
            const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2})/);
            const speedMatch = output.match(/speed=([\d.]+)x/);
            if (timeMatch && speedMatch) {
              webContents.send('download-progress', {
                phase: 'converting',
                message: `Converting to HEVC... ${timeMatch[0]} @ ${speedMatch[1]}x speed`,
                videoPercent: 100,
                audioPercent: 100
              });
            }
          });

          ffmpegProcess.on('close', (ffmpegCode) => {
            activeFfmpegProcess = null;
            if (isDownloadCancelled) {
              try {
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
              } catch (cleanupErr) {
                console.error('Error cleaning up partial conversion file:', cleanupErr);
              }
              webContents.send('download-status', '\nConversion cancelled by user.');
              currentPhase = 'error';
              webContents.send('download-progress', {
                phase: 'error',
                message: 'Download cancelled',
                videoPercent,
                audioPercent
              });
              finalizeDownload('cancelled');
              return;
            }

            if (ffmpegCode === 0) {
              try {
                fs.unlinkSync(inputPath);
                fs.renameSync(outputPath, inputPath);
                webContents.send('download-status', '\n✅ HEVC conversion complete!');
                currentPhase = 'complete';
                webContents.send('download-progress', {
                  phase: 'complete',
                  message: videoTitle ? `Successfully downloaded and converted "${videoTitle}"!` : 'Download and conversion complete!',
                  videoPercent: 100,
                  audioPercent: 100
                });
              } catch (fsError) {
                console.error('Error replacing file:', fsError);
                webContents.send('download-status', `\n⚠️ Conversion done but file rename failed. HEVC file saved as: ${path.basename(outputPath)}`);
                currentPhase = 'complete';
                webContents.send('download-progress', {
                  phase: 'complete',
                  message: 'Download complete (HEVC file saved with _hevc suffix)',
                  videoPercent: 100,
                  audioPercent: 100
                });
              }
            } else {
              webContents.send('download-status', `\n⚠️ HEVC conversion failed (code ${ffmpegCode}). Original file kept.`);
              currentPhase = 'complete';
              webContents.send('download-progress', {
                phase: 'complete',
                message: 'Download complete (conversion failed, original VP9/AV1 kept)',
                videoPercent: 100,
                audioPercent: 100
              });
            }
            finalizeDownload('completed');
          });

          ffmpegProcess.on('error', (err) => {
            console.error('FFmpeg error:', err);
            webContents.send('download-status', `\n⚠️ FFmpeg error: ${err.message}. Original file kept.`);
            currentPhase = 'complete';
            webContents.send('download-progress', {
              phase: 'complete',
              message: 'Download complete (conversion failed, original kept)',
              videoPercent: 100,
              audioPercent: 100
            });
            finalizeDownload('completed');
          });
        } else {
          currentPhase = 'complete';
          webContents.send('download-progress', {
            phase: 'complete',
            message: videoTitle ? `Successfully downloaded "${videoTitle}"!` : 'Download complete!',
            videoPercent: 100,
            audioPercent: 100
          });
          finalizeDownload('completed');
        }
      } else {
        webContents.send('download-status', `\nDownload failed. Error code: ${code}`);
        currentPhase = 'error';
        webContents.send('download-progress', {
          phase: 'error',
          message: `Download failed with error code: ${code}`,
          videoPercent,
          audioPercent
        });
        finalizeDownload('failed', `Download failed with error code: ${code}`);
      }
    });

    child.on('error', (err) => {
      console.error('Failed to start yt-dlp process:', err);
      webContents.send('download-status', `ERROR: Failed to start yt-dlp process. Is yt-dlp installed and in your PATH? Details: ${err.message}`);
      currentPhase = 'error';
      webContents.send('download-progress', {
        phase: 'error',
        message: `Failed to start yt-dlp process: ${err.message}`,
        videoPercent,
        audioPercent
      });
      finalizeDownload('failed', err.message);
    });

  } catch (error) {
    console.error('Error executing yt-dlp:', error);
    webContents.send('download-status', `ERROR: Could not execute download. ${error}`);
    webContents.send('download-progress', {
      phase: 'error',
      message: `Could not execute download: ${error}`,
      videoPercent,
      audioPercent
    });
    finalizeDownload('failed', String(error));
  }
};

// Direct (manual) download from Download view. No queueing from this path.
ipcMain.handle('download-video', async (event, rawUrl: string, options: DownloadOptions = {}) => {
  const url = normalizeUrl(rawUrl);
  if (isDownloadPipelineActive) {
    return { started: false, reason: 'busy', message: 'Another download is already active.' };
  }
  runDownload(event.sender, url, options);
  return { started: true };
});

// Wishlist APIs
ipcMain.handle('get-wishlist', async () => {
  return loadWishlist();
});

ipcMain.handle('add-wishlist-item', async (_event, item: WishlistItem) => {
  addWishlistItem({
    ...item,
    status: item.status || 'wishlist',
    addedAt: item.addedAt || new Date().toISOString(),
  });
  return loadWishlist();
});

ipcMain.handle('update-wishlist-item', async (_event, id: string, updates: Partial<WishlistItem>) => {
  updateWishlistItem(id, updates);
  return loadWishlist();
});

ipcMain.handle('remove-wishlist-item', async (_event, id: string) => {
  removeWishlistItem(id);
  return loadWishlist();
});

ipcMain.handle('clear-wishlist', async () => {
  clearWishlist();
  return [];
});

ipcMain.handle('get-download-queue', async () => {
  return {
    activeItem: activeQueueItem,
    queue: downloadQueue,
    isActive: isDownloadPipelineActive,
  };
});

ipcMain.handle('remove-queue-item', async (_event, queueItemId: string) => {
  const index = downloadQueue.findIndex(q => q.id === queueItemId);
  if (index === -1) {
    return {
      removed: false,
      reason: 'missing',
      activeItem: activeQueueItem,
      queue: downloadQueue,
      isActive: isDownloadPipelineActive,
    };
  }

  const [removedItem] = downloadQueue.splice(index, 1);
  if (removedItem?.wishlistItemId) {
    updateWishlistItem(removedItem.wishlistItemId, { status: 'wishlist' });
  }

  emitQueueUpdate();
  return {
    removed: true,
    activeItem: activeQueueItem,
    queue: downloadQueue,
    isActive: isDownloadPipelineActive,
  };
});

ipcMain.handle('queue-download', async (_event, wishlistItemId: string, options: DownloadOptions = {}) => {
  const wishlist = loadWishlist();
  const item = wishlist.find(w => w.id === wishlistItemId);
  if (!item) {
    return { queued: false, reason: 'missing', message: 'Wishlist item not found.' };
  }

  const duplicateInQueue = downloadQueue.some(q => q.wishlistItemId === wishlistItemId || q.url === item.url);
  const duplicateActive = !!activeQueueItem && (
    activeQueueItem.wishlistItemId === wishlistItemId || activeQueueItem.url === item.url
  );
  if (duplicateInQueue || duplicateActive) {
    return { queued: false, reason: 'duplicate', message: 'Item is already queued.' };
  }

  const queueItem: QueueDownloadItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    url: item.url,
    options,
    wishlistItemId,
    queuedAt: new Date().toISOString(),
  };

  downloadQueue.push(queueItem);
  updateWishlistItem(wishlistItemId, { status: 'queued', lastError: undefined });
  emitQueueUpdate();

  if (!isDownloadPipelineActive && win) {
    const nextItem = downloadQueue.shift()!;
    activeQueueItem = nextItem;
    emitQueueUpdate();
    runDownload(win.webContents, nextItem.url, nextItem.options, nextItem.wishlistItemId);
  }

  return {
    queued: true,
    activeItem: activeQueueItem,
    queue: downloadQueue,
    isActive: isDownloadPipelineActive,
  };
});

// Clean up any active download processes on app quit
app.on('before-quit', () => {
  if (activeYtDlpProcess) {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(activeYtDlpProcess.pid), '/f', '/t']);
      } else {
        activeYtDlpProcess.kill('SIGTERM');
      }
    } catch (err) {
      console.error('Error killing yt-dlp on quit:', err);
    }
    activeYtDlpProcess = null;
  }
  if (activeFfmpegProcess) {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(activeFfmpegProcess.pid), '/f', '/t']);
      } else {
        activeFfmpegProcess.kill('SIGTERM');
      }
    } catch (err) {
      console.error('Error killing ffmpeg on quit:', err);
    }
    activeFfmpegProcess = null;
  }
});

app.whenReady().then(createWindow)