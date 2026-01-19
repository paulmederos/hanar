import './Sidebar.css'

export type ViewType = 'download' | 'settings' | 'logs';

interface SidebarProps {
  activeView: ViewType;
  onNavigate: (view: ViewType) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeView, onNavigate }) => {
  return (
    <nav className="sidebar">
      <div className="sidebar-logo">
        <img src="/hanar-logo-transparent.png" alt="Hanar" />
      </div>
      
      <div className="sidebar-nav">
        <button 
          className={`sidebar-btn ${activeView === 'download' ? 'active' : ''}`}
          onClick={() => onNavigate('download')}
        >
          <span className="sidebar-icon">📥</span>
          <span className="sidebar-label">Download</span>
        </button>
        
        <button 
          className={`sidebar-btn ${activeView === 'logs' ? 'active' : ''}`}
          onClick={() => onNavigate('logs')}
        >
          <span className="sidebar-icon">📋</span>
          <span className="sidebar-label">Logs</span>
        </button>
        
        <button 
          className={`sidebar-btn ${activeView === 'settings' ? 'active' : ''}`}
          onClick={() => onNavigate('settings')}
        >
          <span className="sidebar-icon">⚙️</span>
          <span className="sidebar-label">Settings</span>
        </button>
      </div>
      
      <div className="sidebar-footer">
        <span className="version">v1.0.0</span>
      </div>
    </nav>
  );
};
