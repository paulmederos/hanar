import { useState, useEffect, useCallback } from 'react'
import './App.css'
import { Sidebar, ViewType } from './components/Sidebar'
import { DownloadHistory } from './components/DownloadHistory'
import type { DownloadHistoryItem, VideoInfo, DownloadPhase } from './types'

function App() {
  // Navigation state
  const [activeView, setActiveView] = useState<ViewType>('download')
  
  // Core state
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState('Idle')
  const [isDownloading, setIsDownloading] = useState(false)
  const [isElectronAPIAvailable, setIsElectronAPIAvailable] = useState(false)
  
  // Settings state
  const [outputDir, setOutputDir] = useState<string | null>(null)
  const [archiveFile, setArchiveFile] = useState<string | null>(null)
  const [downloadPreset, setDownloadPreset] = useState<string>('1080p-fast')
  
  // Download progress state
  const [currentPhase, setCurrentPhase] = useState<DownloadPhase>('idle')
  const [progressPercent, setProgressPercent] = useState(0)
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null)
  const [phaseMessages, setPhaseMessages] = useState<Record<DownloadPhase, string>>({
    idle: 'Ready to download',
    preparing: 'Preparing download...',
    metadata: 'Getting video information...',
    thumbnail: 'Downloading thumbnail...',
    video: 'Downloading video stream...',
    audio: 'Downloading audio stream...',
    merging: 'Merging video and audio...',
    converting: 'Converting to HEVC (GPU)...',
    complete: 'Download complete!',
    error: 'Error occurred during download'
  })
  const [downloadSummary, setDownloadSummary] = useState('')
  
  // Download history state
  const [currentDownload, setCurrentDownload] = useState<DownloadHistoryItem | null>(null)
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0)

  // Function to parse YouTube video ID from URL
  const getYoutubeId = (url: string): string | null => {
    const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  // Function to parse yt-dlp output and update status information
  const parseOutput = useCallback((output: string) => {
    if (!isDownloading) setIsDownloading(true);
    
    const titleMatch = output.match(/\[info\] (.+): Downloading/i);
    if (titleMatch && titleMatch[1]) {
      const videoId = getYoutubeId(url);
      if (videoId) {
        const title = titleMatch[1];
        setVideoInfo(prev => ({
          ...prev,
          id: videoId,
          title: title,
          thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
          uploader: '',
        }));
        setCurrentPhase('metadata');
        setCurrentDownload(prev => {
          if (!prev) return null;
          const updated = { ...prev, title };
          if (window.electronAPI) {
            window.electronAPI.updateDownloadHistory(prev.id, { title });
          }
          return updated;
        });
      }
    }

    if (output.includes('Downloading thumbnail') || output.includes('Writing thumbnail')) {
      setCurrentPhase('thumbnail');
    }
    
    const videoDownloadMatch = output.match(/\[download\] Destination: .+?\.f\d+\.mp4/i);
    if (videoDownloadMatch || output.match(/\[download\]\s+[\d.]+%\s+of\s+~?[\d.]+MiB\s+at\s+[\d.]+/i)) {
      if (currentPhase !== 'video') {
        setPhaseMessages(prev => ({ ...prev, video: `Downloading video stream...` }));
      }
      setCurrentPhase('video');
      
      const percentMatch = output.match(/\[download\]\s+([\d.]+)%/i);
      if (percentMatch && percentMatch[1]) {
        const percent = parseFloat(percentMatch[1]);
        setProgressPercent(percent);
        setCurrentDownload(prev => prev ? { ...prev, progress: percent } : null);
      }
      
      const sizeMatch = output.match(/of\s+~?\s*([\d.]+(?:KiB|MiB|GiB))/i);
      if (sizeMatch && sizeMatch[1] && currentPhase === 'video') {
        setPhaseMessages(prev => ({ ...prev, video: `Downloading video stream (${sizeMatch[1]})...` }));
        setDownloadSummary(prev => prev ? prev : `Video: ${sizeMatch[1]}`);
        setCurrentDownload(prev => {
          if (!prev) return null;
          const updated = { ...prev, fileSize: sizeMatch[1] };
          if (window.electronAPI) {
            window.electronAPI.updateDownloadHistory(prev.id, { fileSize: sizeMatch[1] });
          }
          return updated;
        });
      }
      
      const speedMatch = output.match(/at\s+([\d.]+(?:KiB|MiB|GiB)\/s)/i);
      const etaMatch = output.match(/ETA\s+(\d{2}:\d{2}(?::\d{2})?)/i);
      if (speedMatch || etaMatch) {
        setCurrentDownload(prev => {
          if (!prev) return null;
          return {
            ...prev,
            speed: speedMatch ? speedMatch[1] : prev.speed,
            eta: etaMatch ? etaMatch[1] : prev.eta,
          };
        });
      }
    }
    
    if (output.includes('.f234.mp4') || 
        output.includes('download] 100% of') || 
        (currentPhase === 'video' && output.match(/100% of.+?in/i))) {
      setCurrentPhase('audio');
      setProgressPercent(0);
      
      const sizeMatch = output.match(/of\s+~?\s*([\d.]+(?:KiB|MiB|GiB))/i);
      if (sizeMatch && sizeMatch[1]) {
        setPhaseMessages(prev => ({ ...prev, audio: `Downloading audio stream (${sizeMatch[1]})...` }));
        setDownloadSummary(prev => `${prev}, Audio: ${sizeMatch[1]}`);
      }
    }
    
    if (output.includes('[Merger]') || output.includes('Merging formats')) {
      setCurrentPhase('merging');
      const destinationMatch = output.match(/Merging formats into "(.+?)"/i);
      if (destinationMatch && destinationMatch[1]) {
        const filename = destinationMatch[1].split('\\').pop() || '';
        const filePath = destinationMatch[1];
        setPhaseMessages(prev => ({ ...prev, merging: `Creating "${filename}"...` }));
        setCurrentDownload(prev => {
          if (!prev) return null;
          const updated = { ...prev, filePath };
          if (window.electronAPI) {
            window.electronAPI.updateDownloadHistory(prev.id, { filePath });
          }
          return updated;
        });
      }
    }
    
    if (output.includes('Download successful!')) {
      setCurrentPhase('complete');
      setCurrentDownload(prev => {
        if (!prev) return null;
        const completedAt = new Date().toISOString();
        const updated: DownloadHistoryItem = { 
          ...prev, 
          status: 'completed', 
          progress: 100,
          completedAt,
        };
        if (window.electronAPI) {
          window.electronAPI.updateDownloadHistory(prev.id, { 
            status: 'completed', 
            progress: 100,
            completedAt,
          });
        }
        return updated;
      });
      if (videoInfo?.title) {
        setPhaseMessages(prev => ({ ...prev, complete: `Successfully downloaded "${videoInfo.title}"!` }));
      }
      setTimeout(() => {
        setIsDownloading(false);
        setCurrentPhase('idle');
        setProgressPercent(0);
        setCurrentDownload(null);
        setUrl(''); // Clear URL after successful download
        setHistoryRefreshKey(k => k + 1);
      }, 2000);
    }
    
    if (output.includes('Starting HEVC conversion') || output.includes('Converting to HEVC')) {
      setCurrentPhase('converting');
      setCurrentDownload(prev => {
        if (!prev) return null;
        const updated = { ...prev, status: 'converting' as const };
        if (window.electronAPI) {
          window.electronAPI.updateDownloadHistory(prev.id, { status: 'converting' });
        }
        return updated;
      });
    }
    
    if (output.includes('ERROR:') && !output.includes('WARNING:')) {
      setCurrentPhase('error');
      const errorMatch = output.match(/ERROR:\s+(.+)/i);
      const errorMessage = errorMatch ? errorMatch[1] : 'Unknown error';
      setPhaseMessages(prev => ({ ...prev, error: `Error: ${errorMessage}` }));
      setCurrentDownload(prev => {
        if (!prev) return null;
        const updated = { ...prev, status: 'failed' as const, error: errorMessage };
        if (window.electronAPI) {
          window.electronAPI.updateDownloadHistory(prev.id, { status: 'failed', error: errorMessage });
        }
        return updated;
      });
      setTimeout(() => {
        setIsDownloading(false);
        setCurrentDownload(null);
        setHistoryRefreshKey(k => k + 1);
      }, 3000);
    }
  }, [isDownloading, url, currentPhase, videoInfo?.title]);

  // Check if electronAPI is available
  useEffect(() => {
    if ('electronAPI' in window && window.electronAPI) {
      setIsElectronAPIAvailable(true);
      loadSavedSettings();
    } else {
      setIsElectronAPIAvailable(false);
      setStatus('ERROR: Electron API not available');
    }
  }, []);
  
  const loadSavedSettings = async () => {
    if (!window.electronAPI) return;
    
    try {
      const settings: any = await window.electronAPI.getSettings();
      if (settings.outputDir) setOutputDir(settings.outputDir);
      if (settings.archiveFile) setArchiveFile(settings.archiveFile);
      if (settings.downloadPreset) setDownloadPreset(settings.downloadPreset);
    } catch (err) {
      console.error('Error loading saved settings:', err);
    }
  };

  // Set up status update listener
  useEffect(() => {
    if (!isElectronAPIAvailable || !window.electronAPI) return;

    const handleUpdate = (_event: unknown, message: string) => {
      setStatus((prevStatus) => prevStatus + '\n' + message);
      parseOutput(message);
    };

    const handleProgressUpdate = (_event: unknown, data: any) => {
      if (data.phase) {
        setCurrentPhase(data.phase);
        if (data.phase === 'converting') {
          setCurrentDownload(prev => {
            if (!prev) return null;
            const updated = { ...prev, status: 'converting' as const };
            if (window.electronAPI) {
              window.electronAPI.updateDownloadHistory(prev.id, { status: 'converting' });
            }
            return updated;
          });
        }
      }
      if (data.percent !== undefined) {
        setProgressPercent(data.percent);
        setCurrentDownload(prev => prev ? { ...prev, progress: data.percent } : null);
      }
      if (data.videoInfo) {
        setVideoInfo(data.videoInfo);
        setCurrentDownload(prev => {
          if (!prev) return null;
          const updated = { 
            ...prev, 
            title: data.videoInfo.title || prev.title,
            thumbnail: data.videoInfo.thumbnail || prev.thumbnail,
            uploader: data.videoInfo.uploader || prev.uploader,
          };
          if (window.electronAPI && data.videoInfo.title) {
            window.electronAPI.updateDownloadHistory(prev.id, { 
              title: data.videoInfo.title,
              thumbnail: data.videoInfo.thumbnail,
              uploader: data.videoInfo.uploader,
            });
          }
          return updated;
        });
      }
      if (data.message) {
        setPhaseMessages(prev => ({ ...prev, [data.phase]: data.message }));
      }
      if (data.summary) {
        setDownloadSummary(data.summary);
      }
    };

    const cleanup1 = window.electronAPI.onStatusUpdate(handleUpdate);
    const cleanup2 = (window.electronAPI as any).onProgressUpdate?.(handleProgressUpdate) || (() => {});
    
    return () => {
      cleanup1();
      cleanup2();
    };
  }, [isElectronAPIAvailable, parseOutput]);

  const selectOutputDir = async () => {
    if (!isElectronAPIAvailable || !window.electronAPI) return;
    
    try {
      const dir = await window.electronAPI.selectDirectory('Select Download Directory');
      if (dir) setOutputDir(dir);
    } catch (err) {
      console.error('Error selecting output directory:', err);
    }
  };

  const selectArchiveFile = async () => {
    if (!isElectronAPIAvailable || !window.electronAPI) return;
    
    try {
      const file = await window.electronAPI.selectFile('Select Archive File', [
        { name: 'Text Files', extensions: ['txt'] }
      ]);
      if (file) setArchiveFile(file);
    } catch (err) {
      console.error('Error selecting archive file:', err);
    }
  };

  const updateCurrentDownload = useCallback((updates: Partial<DownloadHistoryItem>) => {
    setCurrentDownload(prev => {
      if (!prev) return null;
      const updated = { ...prev, ...updates };
      if (window.electronAPI) {
        window.electronAPI.updateDownloadHistory(prev.id, updates);
      }
      return updated;
    });
  }, []);

  const handleDownload = async () => {
    if (!url || isDownloading) return;
    
    if (!isElectronAPIAvailable || !window.electronAPI) {
      setStatus('ERROR: Cannot download - Electron API not available');
      return;
    }

    setIsDownloading(true);
    setCurrentPhase('preparing');
    setProgressPercent(0);
    setVideoInfo(null);
    setDownloadSummary('');
    setStatus('Download requested...');

    const videoId = getYoutubeId(url);
    
    const downloadId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newDownload: DownloadHistoryItem = {
      id: downloadId,
      videoId: videoId || '',
      url: url,
      title: 'Loading...',
      thumbnail: videoId ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : '',
      uploader: '',
      status: 'downloading',
      progress: 0,
      preset: downloadPreset,
      startedAt: new Date().toISOString(),
    };
    
    setCurrentDownload(newDownload);
    await window.electronAPI.addDownloadHistory(newDownload);
    
    if (videoId) {
      setVideoInfo({
        id: videoId,
        title: 'Loading...',
        thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
        uploader: '',
      });
    }

    try {
      await window.electronAPI.downloadVideo(url, {
        outputDir: outputDir || undefined,
        archiveFile: archiveFile || undefined,
        downloadPreset: downloadPreset
      } as any);
    } catch (error) {
      console.error('Error invoking downloadVideo:', error);
      setStatus((prevStatus) => prevStatus + `\nERROR invoking download: ${error}`);
      setCurrentPhase('error');
      updateCurrentDownload({ status: 'failed', error: String(error) });
      setIsDownloading(false);
    }
  }

  // Clear logs
  const clearLogs = () => setStatus('Logs cleared.');

  // Render Home/Download View
  const renderDownloadView = () => (
    <div className="main-content">
      {/* URL Input Card */}
      <div className="card download-card">
        <div className="url-input-row">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste YouTube URL here..."
            disabled={isDownloading || !isElectronAPIAvailable}
            onKeyDown={(e) => e.key === 'Enter' && handleDownload()}
          />
          <button 
            onClick={handleDownload} 
            disabled={!url || isDownloading || !isElectronAPIAvailable}
            className="download-button"
          >
            {isDownloading ? 'Downloading...' : 'Download'}
          </button>
        </div>
        
        {/* Current preset indicator */}
        <div className="current-preset">
          {downloadPreset === '1080p-fast' ? (
            <span className="preset-indicator fast">1080p Fast</span>
          ) : (
            <span className="preset-indicator quality">Max Quality (4K)</span>
          )}
          <button className="settings-link" onClick={() => setActiveView('settings')}>
            Change in Settings
          </button>
        </div>
      </div>

      {/* Download History */}
      <DownloadHistory 
        currentDownload={currentDownload} 
        key={historyRefreshKey}
      />
    </div>
  );

  // Render Settings View
  const renderSettingsView = () => (
    <div className="main-content">
      <div className="settings-page">
        <h1 className="settings-title">Settings</h1>
        
        {/* Download Quality Preset */}
        <div className="settings-section">
          <h2>Download Quality</h2>
          <div className="settings-card">
            <div className="preset-selector">
              <label htmlFor="preset-select">Download Preset</label>
              <select 
                id="preset-select"
                value={downloadPreset}
                onChange={(e) => setDownloadPreset(e.target.value)}
                disabled={isDownloading || !isElectronAPIAvailable}
              >
                <option value="1080p-fast">1080p Fast (H.264, no conversion)</option>
                <option value="max-quality">Max Quality (4K, converts to HEVC)</option>
              </select>
              <div className="preset-info">
                {downloadPreset === '1080p-fast' ? (
                  <div className="preset-description">
                    <span className="preset-badge fast">Fast</span>
                    <span>Downloads H.264 directly from YouTube. Max 1080p. Direct play on Apple TV & iPad.</span>
                  </div>
                ) : (
                  <div className="preset-description">
                    <span className="preset-badge quality">Best</span>
                    <span>Downloads best quality (up to 4K), converts to HEVC using GPU. Direct play on Apple TV & iPad.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* File Paths */}
        <div className="settings-section">
          <h2>File Paths</h2>
          <div className="settings-card">
            <div className="path-selector">
              <div className="path-label">
                <span>Output Directory</span>
                <span className="path">{outputDir || 'E:\\Plex\\YouTube (default)'}</span>
              </div>
              <button 
                onClick={selectOutputDir}
                disabled={isDownloading || !isElectronAPIAvailable}
                className="path-button"
              >
                Browse
              </button>
            </div>
            
            <div className="path-selector">
              <div className="path-label">
                <span>Archive File</span>
                <span className="path">{archiveFile || 'E:\\Plex\\scripts\\archive.txt (default)'}</span>
              </div>
              <button 
                onClick={selectArchiveFile}
                disabled={isDownloading || !isElectronAPIAvailable}
                className="path-button"
              >
                Browse
              </button>
            </div>
            <p className="settings-hint">
              The archive file tracks downloaded videos to prevent re-downloading.
            </p>
          </div>
        </div>

        {/* About */}
        <div className="settings-section">
          <h2>About</h2>
          <div className="settings-card about-card">
            <p>YouTube video downloader optimized for Plex + Apple TV / iPad direct play.</p>
            <div className="requirements">
              <h4>Requirements:</h4>
              <ul>
                <li>yt-dlp in PATH</li>
                <li>FFmpeg in PATH (with NVENC for GPU conversion)</li>
                <li>NVIDIA GPU (for Max Quality preset)</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Render Logs View
  const renderLogsView = () => (
    <div className="main-content">
      <div className="logs-page">
        <div className="logs-header">
          <h1 className="logs-title">Status Logs</h1>
          <button className="clear-logs-btn" onClick={clearLogs}>
            Clear Logs
          </button>
        </div>
        <div className="logs-card">
          <pre className="logs-output">{status}</pre>
        </div>
      </div>
    </div>
  );

  // Render the active view
  const renderView = () => {
    switch (activeView) {
      case 'download':
        return renderDownloadView();
      case 'settings':
        return renderSettingsView();
      case 'logs':
        return renderLogsView();
      default:
        return renderDownloadView();
    }
  };

  return (
    <div className="app-layout">
      <Sidebar activeView={activeView} onNavigate={setActiveView} />
      {renderView()}
    </div>
  )
}

export default App
