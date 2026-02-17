import { useState, useEffect } from 'react'
import type { DownloadHistoryItem, QueueDownloadItem } from '../types'
import './DownloadHistory.css'

type FilterType = 'all' | 'completed' | 'failed';

interface DownloadHistoryProps {
  currentDownload: DownloadHistoryItem | null;
  onCancelDownload?: () => void;
  queueItems?: QueueDownloadItem[];
  activeQueueItem?: QueueDownloadItem | null;
  onRemoveQueueItem?: (queueItemId: string) => void;
}

export const DownloadHistory: React.FC<DownloadHistoryProps> = ({
  currentDownload,
  onCancelDownload,
  queueItems = [],
  activeQueueItem = null,
  onRemoveQueueItem
}) => {
  const [history, setHistory] = useState<DownloadHistoryItem[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [isLoading, setIsLoading] = useState(true);

  // Load history on mount
  useEffect(() => {
    loadHistory();
  }, []);

  // Refresh history when current download changes
  useEffect(() => {
    if (currentDownload?.status === 'completed' || currentDownload?.status === 'failed' || currentDownload?.status === 'cancelled') {
      loadHistory();
    }
  }, [currentDownload?.status]);

  const loadHistory = async () => {
    if (!window.electronAPI) return;
    
    try {
      const items = await window.electronAPI.getDownloadHistory();
      setHistory(items);
    } catch (err) {
      console.error('Error loading download history:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const clearHistory = async () => {
    if (!window.electronAPI) return;
    
    if (confirm('Are you sure you want to clear all download history?')) {
      await window.electronAPI.clearDownloadHistory();
      setHistory([]);
    }
  };

  // Filter history based on selected filter
  const filteredHistory = history.filter(item => {
    if (filter === 'all') return true;
    if (filter === 'completed') return item.status === 'completed';
    if (filter === 'failed') return item.status === 'failed';
    return true;
  });

  // Combine current download with history for display
  const displayItems: DownloadHistoryItem[] = [];
  
  // Add current download at the top if it's active or just cancelled
  if (currentDownload && (currentDownload.status === 'downloading' || currentDownload.status === 'converting' || currentDownload.status === 'cancelled')) {
    displayItems.push(currentDownload);
  }
  
  // Add filtered history (excluding current download if it's in there)
  filteredHistory.forEach(item => {
    if (!currentDownload || item.id !== currentDownload.id) {
      displayItems.push(item);
    }
  });

  const getStatusIcon = (status: DownloadHistoryItem['status']) => {
    switch (status) {
      case 'downloading':
      case 'converting':
        return '🔄';
      case 'completed':
        return '✅';
      case 'failed':
        return '❌';
      case 'cancelled':
        return '🚫';
      default:
        return '⏳';
    }
  };

  const getStatusClass = (status: DownloadHistoryItem['status']) => {
    switch (status) {
      case 'downloading':
      case 'converting':
        return 'status-active';
      case 'completed':
        return 'status-completed';
      case 'failed':
        return 'status-failed';
      case 'cancelled':
        return 'status-cancelled';
      default:
        return '';
    }
  };

  // Open YouTube video in default browser
  const openVideoUrl = (item: DownloadHistoryItem) => {
    // Use stored URL, or construct from videoId as fallback
    const videoUrl = item.url || (item.videoId ? `https://www.youtube.com/watch?v=${item.videoId}` : null);
    if (videoUrl && window.electronAPI) {
      window.electronAPI.openExternal(videoUrl);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  };

  const counts = {
    all: history.length,
    completed: history.filter(h => h.status === 'completed').length,
    failed: history.filter(h => h.status === 'failed').length,
  };

  if (isLoading) {
    return (
      <div className="download-history">
        <div className="history-loading">Loading history...</div>
      </div>
    );
  }

  return (
    <div className="download-history">
      <div className="history-header">
        <h3>Download History</h3>
        <div className="history-filters">
          <button 
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({counts.all})
          </button>
          <button 
            className={`filter-btn ${filter === 'completed' ? 'active' : ''}`}
            onClick={() => setFilter('completed')}
          >
            ✅ ({counts.completed})
          </button>
          <button 
            className={`filter-btn ${filter === 'failed' ? 'active' : ''}`}
            onClick={() => setFilter('failed')}
          >
            ❌ ({counts.failed})
          </button>
        </div>
        {history.length > 0 && (
          <button className="clear-btn" onClick={clearHistory}>
            Clear
          </button>
        )}
      </div>

      <div className="history-list">
        {activeQueueItem && (
          <div className="history-item queue-item active">
            <div className="history-details">
              <div className="history-title" title={activeQueueItem.url}>
                🔄 Now downloading (queued): {activeQueueItem.url}
              </div>
              <div className="history-meta">
                <span className="history-time">Single active download mode</span>
              </div>
            </div>
          </div>
        )}

        {queueItems.map((queuedItem, idx) => (
          <div key={queuedItem.id} className="history-item queue-item">
            <div className="history-details">
              <div className="history-title" title={queuedItem.url}>
                ⏳ Queue #{idx + 1}: {queuedItem.url}
              </div>
              <div className="history-meta">
                <span className="history-time">Waiting for active download to finish</span>
              </div>
            </div>
            {onRemoveQueueItem && (
              <div className="queue-actions">
                <button
                  className="history-cancel-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveQueueItem(queuedItem.id);
                  }}
                  title="Remove from queue"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        ))}

        {displayItems.length === 0 && !activeQueueItem && queueItems.length === 0 ? (
          <div className="history-empty">
            {filter === 'all' 
              ? 'No downloads yet. Paste a YouTube URL above to get started!'
              : `No ${filter} downloads.`
            }
          </div>
        ) : (
          displayItems.map(item => (
            <div 
              key={item.id} 
              className={`history-item ${getStatusClass(item.status)} clickable`}
              onClick={() => openVideoUrl(item)}
              title="Click to open on YouTube"
            >
              <div className="history-thumbnail">
                <img 
                  src={item.thumbnail} 
                  alt={item.title}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/hanar-logo.png';
                  }}
                />
                <span className="history-status-icon">{getStatusIcon(item.status)}</span>
              </div>
              
              <div className="history-details">
                <div className="history-title" title={item.title}>
                  {item.title || 'Unknown Title'}
                </div>
                <div className="history-meta">
                  {item.uploader && <span className="history-uploader">{item.uploader}</span>}
                  <span className="history-time">{formatDate(item.startedAt)}</span>
                  {item.fileSize && <span className="history-size">{item.fileSize}</span>}
                </div>
                
                {/* Progress bar for active downloads */}
                {(item.status === 'downloading' || item.status === 'converting') && (
                  <div className="history-progress-container">
                    <div className="history-progress-row">
                      <div className="history-progress-bar">
                        <div 
                          className="history-progress-fill" 
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                      {onCancelDownload && (
                        <button
                          className="history-cancel-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            onCancelDownload();
                          }}
                          title="Cancel download"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <div className="history-progress-text">
                      {item.progress.toFixed(0)}%
                      {item.eta && <span className="history-eta"> • ETA: {item.eta}</span>}
                      {item.speed && <span className="history-speed"> • {item.speed}</span>}
                    </div>
                  </div>
                )}
                
                {/* Error message for failed downloads */}
                {item.status === 'failed' && item.error && (
                  <div className="history-error">{item.error}</div>
                )}

                {/* Cancelled message */}
                {item.status === 'cancelled' && (
                  <div className="history-cancelled">Download cancelled</div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
