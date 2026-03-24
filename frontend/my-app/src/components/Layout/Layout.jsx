import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, LogOut, Users, FileText, Sun, Moon, Menu, X, Receipt, ArrowLeftRight, Layers, ShieldCheck, ClipboardList } from 'lucide-react';
import './Layout.css';

const Layout = ({ children }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const [isDarkMode, setIsDarkMode] = useState(() => {
        const saved = localStorage.getItem('ema-theme');
        return saved ? saved === 'dark' : true;
    });
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
        const saved = localStorage.getItem('sidebar-open');
        return saved ? saved === 'true' : true;
    });

    useEffect(() => {
        localStorage.setItem('ema-theme', isDarkMode ? 'dark' : 'light');
        document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    }, [isDarkMode]);

    useEffect(() => {
        localStorage.setItem('sidebar-open', isSidebarOpen);
    }, [isSidebarOpen]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
    };

    // Derive page title from route
    const getPageTitle = () => {
        const path = location.pathname;
        if (path.includes('/jobs') || path === '/' || path.includes('/dashboard')) return 'Job Monitor';
        if (path.includes('/expenses')) return 'LZ vs Receipts';
        if (path.includes('/reconciliation')) return 'Concur File vs Landing Zone';
        if (path.includes('/qdera')) return 'Qdera vs Landing Zone';
        if (path.includes('/flagcheck')) return 'LZ Flag Validation';
        if (path.includes('/receipt-categorization')) return 'Receipt Categorization';
        if (path.includes('/clients')) return 'Clients';
        return 'Job Monitor';
    };

    return (
        <div className={`layout ${isDarkMode ? 'dark-theme' : 'light-theme'} ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
            <aside className={`sidebar ${isSidebarOpen ? 'open' : 'closed'}`}>
                <div className="sidebar-header">
                    <span className="sidebar-logo">⚡</span>
                    {isSidebarOpen && <h2>EMA Central Job Monitoring</h2>}
                </div>

                <nav className="sidebar-nav">
                    <NavLink to="/jobs" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <LayoutDashboard size={20} />
                        {isSidebarOpen && <span>Job Monitor</span>}
                    </NavLink>
                    <NavLink to="/reconciliation" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <ArrowLeftRight size={20} />
                        {isSidebarOpen && <span>Concur File vs LZ</span>}
                    </NavLink>
                    <NavLink to="/qdera" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <Layers size={20} />
                        {isSidebarOpen && <span>Qdera vs LZ</span>}
                    </NavLink>
                    <NavLink to="/expenses" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <Receipt size={20} />
                        {isSidebarOpen && <span>LZ vs Receipts</span>}
                    </NavLink>
                    <NavLink to="/flagcheck" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <ShieldCheck size={20} />
                        {isSidebarOpen && <span>LZ Flag Check</span>}
                    </NavLink>
                    <NavLink to="/receipt-categorization" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
                        <ClipboardList size={20} />
                        {isSidebarOpen && <span>Receipt Categorization</span>}
                    </NavLink>
                </nav>

                <div className="sidebar-footer">
                    {isSidebarOpen && (
                        <div className="user-info">
                            <div className="user-avatar">{user.email?.[0]?.toUpperCase() || 'U'}</div>
                            <div className="user-details">
                                <p className="user-name">{user.email || 'User'}</p>
                            </div>
                        </div>
                    )}
                    <button onClick={handleLogout} className="logout-btn">
                        <LogOut size={18} />
                        {isSidebarOpen && <span>Logout</span>}
                    </button>
                </div>
            </aside>

            <main className={`main-content ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
                <header className="top-header">
                    <div className="header-left">
                        <button
                            className="sidebar-toggle"
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                            title={isSidebarOpen ? 'Close Sidebar' : 'Open Sidebar'}
                        >
                            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
                        </button>
                        <h1>{getPageTitle()}</h1>
                    </div>
                    <div className="header-actions">
                        <span className="time">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                        <button
                            className="theme-toggle-btn"
                            onClick={() => setIsDarkMode(!isDarkMode)}
                            title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                        >
                            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
                        </button>
                    </div>
                </header>
                <div className="content-wrapper">
                    {children}
                </div>
            </main>
        </div>
    );
};

export default Layout;
