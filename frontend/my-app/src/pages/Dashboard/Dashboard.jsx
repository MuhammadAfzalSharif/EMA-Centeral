import { useState, Fragment, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchDashboardStats, fetchRunningJobs, fetchScheduledJobs } from '../../api/queries';
import { useToast } from '../../components/Toast/ToastContext';
import api from '../../api/axios';
import { 
    LayoutDashboard, 
    TrendingUp, 
    TrendingDown,
    CheckCircle, 
    XCircle,
    Users,
    Ban,
    ChevronDown,
    ChevronRight,
    Clock,
    User,
    UserX,
    AlertTriangle,
    Activity,
    Calendar,
    PlusCircle,
    Play,
    Timer,
    CalendarClock,
    Loader2,
    Zap,
    RefreshCw,
    Server,
    Repeat
} from 'lucide-react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import DateFilter from '../../components/DateFilter/DateFilter';
import './Dashboard.css';

// Helper: parse SQL HHMMSS integer → { h, m, s } total seconds
const hhmmssToSecs = (t) => {
    const s = String(Math.abs(t || 0)).padStart(6, '0');
    return parseInt(s.slice(0,2))*3600 + parseInt(s.slice(2,4))*60 + parseInt(s.slice(4,6));
};

// Helper: format SQL run_time int (HHMMSS, stored in UTC) → PKT (UTC+5) display
const PKT_OFFSET_SECS = 5 * 3600; // Pakistan Standard Time = UTC+5
const formatRunTime = (t) => {
    if (!t && t !== 0) return '—';
    const totalSecs = (hhmmssToSecs(t) + PKT_OFFSET_SECS) % 86400; // wrap at midnight
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    const pad = n => String(n).padStart(2, '0');
    const ampm = h < 12 ? 'AM' : 'PM';
    const h12 = h % 12 || 12;
    return `${pad(h12)}:${pad(m)}:${pad(s)} ${ampm}`;
};

// Helper: format SQL run_duration int (HHMMSS) → human readable
const formatDuration = (d) => {
    if (!d && d !== 0) return '—';
    const s = String(d).padStart(6, '0');
    const h = parseInt(s.slice(0,2));
    const m = parseInt(s.slice(2,4));
    const sec = parseInt(s.slice(4,6));
    if (h > 0) return `${h}h ${m}m ${sec}s`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
};

// Helper: Build step pipeline from step lists and IDs
const buildStepPipeline = (run) => {
    const pipeline = [];
    
    // Parse step IDs and names
    const successIds = run.successStepIds ? run.successStepIds.split(', ').filter(Boolean) : [];
    const successNames = run.successSteps ? run.successSteps.split(', ').filter(Boolean) : [];
    const failedIds = run.failedStepIds ? run.failedStepIds.split(', ').filter(Boolean) : [];
    const failedNames = run.failedSteps ? run.failedSteps.split(', ').filter(Boolean) : [];
    const cancelledIds = run.cancelledStepIds ? run.cancelledStepIds.split(', ').filter(Boolean) : [];
    const cancelledNames = run.cancelledSteps ? run.cancelledSteps.split(', ').filter(Boolean) : [];
    
    // Create a map of all steps with their statuses
    const stepMap = {};
    
    successIds.forEach((id, idx) => {
        if (!stepMap[id]) stepMap[id] = { id, name: successNames[idx] || `Step ${id}`, statuses: [] };
        stepMap[id].statuses.push('success');
    });
    
    failedIds.forEach((id, idx) => {
        if (!stepMap[id]) stepMap[id] = { id, name: failedNames[idx] || `Step ${id}`, statuses: [] };
        stepMap[id].statuses.push('failed');
    });
    
    cancelledIds.forEach((id, idx) => {
        if (!stepMap[id]) stepMap[id] = { id, name: cancelledNames[idx] || `Step ${id}`, statuses: [] };
        stepMap[id].statuses.push('cancelled');
    });
    
    // Convert to sorted array by step ID
    const steps = Object.values(stepMap).sort((a, b) => parseInt(a.id) - parseInt(b.id));
    
    return steps;
};

// Custom Tooltip component with theme awareness
const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="custom-tooltip">
                <p className="tooltip-label">{label}</p>
                <p className="tooltip-value">{payload[0].value}</p>
            </div>
        );
    }
    return null;
};

const Dashboard = () => {
    // Helper to get today's date in YYYY-MM-DD format, always in PKT (UTC+5)
    const getTodayDate = () => {
        return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
    };

    // Helper to get current year in PKT
    const getPKTYear = () => getTodayDate().split('-')[0];

    const [activeTab, setActiveTab] = useState('done'); // 'done' | 'running' | 'scheduled'
    const [appliedFilters, setAppliedFilters] = useState({ type: 'day', client: '', date: getTodayDate() });
    const [expandedJobs, setExpandedJobs] = useState({});
    const [expandedRuns, setExpandedRuns] = useState({});
    const [isInserting, setIsInserting] = useState(false);
    const [viewMode, setViewMode] = useState('all'); // 'all' or 'clients'
    const [searchTerm, setSearchTerm] = useState('');
    const { showSuccess, showError } = useToast();

    // ── Lifted filter state (owned by Dashboard, passed down to DateFilter) ──
    const [filterType, setFilterType] = useState('day');
    const [selectedClient, setSelectedClient] = useState('');
    const [selectedDate, setSelectedDate] = useState(getTodayDate());
    const [selectedMonth, setSelectedMonth] = useState('');
    const [selectedYear, setSelectedYear] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' }).split('-')[0]);
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');

    // Helper: build the filter payload from current values
    const buildFilterPayload = useCallback((type, client, date, month, year, from, to) => {
        let f = { type, client };
        if (type === 'day' && date) f.date = date;
        else if (type === 'month' && month) { f.month = month; f.year = year; }
        else if (type === 'year') f.year = year;
        else if (type === 'range' && from && to) { f.fromDate = from; f.toDate = to; }
        return f;
    }, []);

    // ── Filter change handlers (update local state + appliedFilters) ──
    const handleFilterClientChange = useCallback((client) => {
        setSelectedClient(client);
        setAppliedFilters(prev => {
            let f = { ...prev, client };
            return f;
        });
    }, []);

    const handleFilterTypeChange = useCallback((type) => {
        setFilterType(type);
        setSelectedDate('');
        setSelectedMonth('');
        setFromDate('');
        setToDate('');
        // Apply immediately for 'all' and 'year' (no further input needed)
        if (type === 'all' || type === 'year') {
            setAppliedFilters(prev => buildFilterPayload(type, prev.client, '', '', selectedYear, '', ''));
        }
    }, [selectedYear, buildFilterPayload]);

    const handleFilterDateChange = useCallback((date) => {
        setSelectedDate(date);
        if (date) {
            setAppliedFilters(prev => buildFilterPayload('day', prev.client, date, '', '', '', ''));
        }
    }, [buildFilterPayload]);

    const handleFilterMonthChange = useCallback((month) => {
        setSelectedMonth(month);
        if (month) {
            setAppliedFilters(prev => buildFilterPayload('month', prev.client, '', month, selectedYear, '', ''));
        }
    }, [selectedYear, buildFilterPayload]);

    const handleFilterYearChange = useCallback((year) => {
        setSelectedYear(year);
        if (filterType === 'year') {
            setAppliedFilters(prev => buildFilterPayload('year', prev.client, '', '', year, '', ''));
        } else if (filterType === 'month' && selectedMonth) {
            setAppliedFilters(prev => buildFilterPayload('month', prev.client, '', selectedMonth, year, '', ''));
        }
    }, [filterType, selectedMonth, buildFilterPayload]);

    const handleFilterFromDateChange = useCallback((date) => {
        setFromDate(date);
        if (date && toDate) {
            setAppliedFilters(prev => buildFilterPayload('range', prev.client, '', '', '', date, toDate));
        }
    }, [toDate, buildFilterPayload]);

    const handleFilterToDateChange = useCallback((date) => {
        setToDate(date);
        if (fromDate && date) {
            setAppliedFilters(prev => buildFilterPayload('range', prev.client, '', '', '', fromDate, date));
        }
    }, [fromDate, buildFilterPayload]);

    const handleFilterReset = useCallback(() => {
        setFilterType('all');
        setSelectedDate('');
        setSelectedMonth('');
        setSelectedYear(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' }).split('-')[0]);
        setSelectedClient('');
        setFromDate('');
        setToDate('');
        setAppliedFilters({ type: 'all', client: '' });
    }, []);

    // ── Job Done (existing) ──
    const { data: stats, isLoading: statsLoading, error: statsError, isFetching, refetch } = useQuery({
        queryKey: ['stats', appliedFilters],
        queryFn: () => fetchDashboardStats(appliedFilters),
        keepPreviousData: true,
        staleTime: 30000,
    });

    // ── Running Jobs ──
    const { data: runningData, isLoading: runningLoading, error: runningError, isFetching: runningFetching, refetch: refetchRunning } = useQuery({
        queryKey: ['runningJobs', appliedFilters],
        queryFn: () => fetchRunningJobs(appliedFilters),
        refetchInterval: activeTab === 'running' ? 15000 : false,
        staleTime: 10000,
    });

    // ── Scheduled Jobs ──
    const { data: scheduledData, isLoading: scheduledLoading, error: scheduledError, isFetching: scheduledFetching, refetch: refetchScheduled } = useQuery({
        queryKey: ['scheduledJobs', appliedFilters],
        queryFn: () => fetchScheduledJobs(appliedFilters),
        staleTime: 60000,
    });

    const toggleJob = (key) => {
        setExpandedJobs(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const toggleRun = (key) => {
        setExpandedRuns(prev => ({ ...prev, [key]: !prev[key] }));
    };

    // Call SP and then refetch all data
    const handleRefreshData = useCallback(async (showToast = true) => {
        setIsInserting(true);
        try {
            await api.post('/dashboard/insert-new-jobs');
            // Refetch all dashboard data to show updated records
            await Promise.all([
                refetch(),
                refetchRunning(),
                refetchScheduled()
            ]);
            if (showToast) showSuccess('Data refreshed successfully!');
        } catch (err) {
            console.error('Error refreshing data:', err);
            if (showToast) showError(err.response?.data?.error || 'Failed to refresh data');
        } finally {
            setIsInserting(false);
        }
    }, [refetch, refetchRunning, refetchScheduled, showSuccess, showError]);

    // Call SP on initial page load to insert latest data
    useEffect(() => {
        handleRefreshData(false);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Stats from API
    const totalExecutions = stats?.totalExecutions || 0;
    const successCount = stats?.successCount || 0;
    const failedCount = stats?.failedCount || 0;
    const cancelledCount = stats?.cancelledCount || 0;
    const successRate = stats?.successRate || 0;
    const failedRate = stats?.failedRate || 0;
    const cancelledRate = stats?.cancelledRate || 0;
    const activeClients = stats?.activeClients || 0;
    const clientStatistics = stats?.clientStatistics || [];
    const jobsByClient = (stats?.jobsByClient || []).map(item => ({
        name: item.client_name,
        value: item.job_count
    }));
    const jobsByStatus = stats?.jobsByStatus || [];
    const jobGroups = stats?.jobGroups || [];

    const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#14b8a6'];
    const STATUS_COLORS = { Success: '#10b981', Failed: '#ef4444', Cancelled: '#f59e0b' };

    // Create a stable color map for clients
    const clientColorMap = {};
    jobsByClient.forEach((client, index) => {
        clientColorMap[client.name] = COLORS[index % COLORS.length];
    });

    // ── Filter running/scheduled by search ──
    const filteredRunning = (runningData?.jobs || []).filter(j =>
        !searchTerm || j.jobName.toLowerCase().includes(searchTerm.toLowerCase()) || j.clientName.toLowerCase().includes(searchTerm.toLowerCase())
    );
    const filteredScheduled = (scheduledData?.jobs || []).filter(j =>
        !searchTerm || j.jobName.toLowerCase().includes(searchTerm.toLowerCase()) || j.clientName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="dashboard">
            {/* ───── Main Tab Buttons ───── */}
            <div className="dashboard-main-tabs">
                <button
                    className={`main-tab ${activeTab === 'done' ? 'active done' : ''}`}
                    onClick={() => setActiveTab('done')}
                >
                    <CheckCircle size={20} />
                    <span>Job Done</span>
                    {stats && <span className="tab-count">{stats.totalExecutions || 0}</span>}
                </button>
                <button
                    className={`main-tab ${activeTab === 'running' ? 'active running' : ''}`}
                    onClick={() => setActiveTab('running')}
                >
                    <Play size={20} />
                    <span>Running</span>
                    {runningData && <span className="tab-count live">{runningData.count || 0}</span>}
                </button>
                <button
                    className={`main-tab ${activeTab === 'scheduled' ? 'active scheduled' : ''}`}
                    onClick={() => setActiveTab('scheduled')}
                >
                    <CalendarClock size={20} />
                    <span>Scheduled</span>
                    {scheduledData && <span className="tab-count">{scheduledData.count || 0}</span>}
                </button>
            </div>

            {/* ═══════════════════════════════════════════════════ */}
            {/* ─── TAB 1: JOB DONE (existing implementation) ─── */}
            {/* ═══════════════════════════════════════════════════ */}
            <div style={{ display: activeTab === 'done' ? 'block' : 'none' }}>
            <DateFilter 
                filterType={filterType}
                selectedClient={selectedClient}
                selectedDate={selectedDate}
                selectedMonth={selectedMonth}
                selectedYear={selectedYear}
                fromDate={fromDate}
                toDate={toDate}
                onFilterTypeChange={handleFilterTypeChange}
                onClientChange={handleFilterClientChange}
                onDateChange={handleFilterDateChange}
                onMonthChange={handleFilterMonthChange}
                onYearChange={handleFilterYearChange}
                onFromDateChange={handleFilterFromDateChange}
                onToDateChange={handleFilterToDateChange}
                onReset={handleFilterReset}
                newJobsButton={
                    <button 
                        className="new-jobs-btn" 
                        onClick={() => handleRefreshData(true)}
                        disabled={isInserting}
                    >
                        {isInserting ? <Loader2 size={15} className="spinning" /> : <RefreshCw size={15} />}
                        <span>{isInserting ? 'Refreshing...' : 'Refresh'}</span>
                    </button>
                }
            />

            {/* Loading / Error / Fetching states */}
            {statsLoading && !stats ? (
                <div className="loading-overlay">
                    <div className="loading-spinner"></div>
                    <p>Loading dashboard data...</p>
                </div>
            ) : statsError ? (
                <div className="error">Error loading data: {statsError?.message}</div>
            ) : (
            <>
            {isFetching && (
                <div className="fetching-indicator">
                    <div className="loading-spinner-small"></div>
                    <span>Updating...</span>
                </div>
            )}

            {/* ───── Stats Cards ───── */}
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon blue">
                        <LayoutDashboard size={24} />
                    </div>
                    <div className="stat-content">
                        <h3>{totalExecutions}</h3>
                        <p>Total Job Executions</p>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon green">
                        <CheckCircle size={24} />
                    </div>
                    <div className="stat-content">
                        <h3>{successCount}</h3>
                        <p>Successfully Executed</p>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon red">
                        <XCircle size={24} />
                    </div>
                    <div className="stat-content">
                        <h3>{failedCount}</h3>
                        <p>Failed to Execute</p>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon orange">
                        <Ban size={24} />
                    </div>
                    <div className="stat-content">
                        <h3>{cancelledCount}</h3>
                        <p>Cancelled</p>
                    </div>
                </div>

                <div className="stat-card accent-green">
                    <div className="stat-icon green">
                        <TrendingUp size={24} />
                    </div>
                    <div className="stat-content">
                        <h3>{successRate}%</h3>
                        <p>Success Rate</p>
                    </div>
                </div>

                <div className="stat-card accent-red">
                    <div className="stat-icon red">
                        <TrendingDown size={24} />
                    </div>
                    <div className="stat-content">
                        <h3>{failedRate}%</h3>
                        <p>Failed Rate</p>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon orange">
                        <Ban size={24} />
                    </div>
                    <div className="stat-content">
                        <h3>{cancelledRate}%</h3>
                        <p>Cancelled Rate</p>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-icon cyan">
                        <Users size={24} />
                    </div>
                    <div className="stat-content">
                        <h3>{activeClients}</h3>
                        <p>Active Clients</p>
                    </div>
                </div>
            </div>

            {/* ───── View Mode Toggle ───── */}
            <div className="view-mode-toggle">
                <button 
                    className={viewMode === 'all' ? 'active' : ''} 
                    onClick={() => setViewMode('all')}
                >
                    <LayoutDashboard size={18} />
                    All Clients Overview
                </button>
                <button 
                    className={viewMode === 'clients' ? 'active' : ''} 
                    onClick={() => setViewMode('clients')}
                >
                    <Users size={18} />
                    By Client
                </button>
            </div>

            {/* ───── Client Statistics Tiles (shown when viewMode is 'clients') ───── */}
            {viewMode === 'clients' && (
                <div className="client-tiles-section">
                    <h2 className="section-title">Client Statistics</h2>
                    <div className="client-tiles-grid">
                        {clientStatistics.map((client, index) => (
                            <div key={client.clientName} className="client-tile">
                                <div className="client-tile-header" style={{ 
                                    borderLeftColor: clientColorMap[client.clientName] || COLORS[index % COLORS.length]
                                }}>
                                    <h3>{client.clientName}</h3>
                                    <div className="client-total">
                                        <Activity size={18} />
                                        <span>{client.totalExecutions} runs</span>
                                    </div>
                                </div>
                                <div className="client-tile-stats">
                                    <div className="client-stat success">
                                        <div className="stat-label">
                                            <CheckCircle size={16} />
                                            <span>Success</span>
                                        </div>
                                        <div className="stat-values">
                                            <span className="count">{client.successCount}</span>
                                            <span className="percentage">{client.successRate}%</span>
                                        </div>
                                    </div>
                                    <div className="client-stat failed">
                                        <div className="stat-label">
                                            <XCircle size={16} />
                                            <span>Failed</span>
                                        </div>
                                        <div className="stat-values">
                                            <span className="count">{client.failedCount}</span>
                                            <span className="percentage">{client.failedRate}%</span>
                                        </div>
                                    </div>
                                    <div className="client-stat cancelled">
                                        <div className="stat-label">
                                            <Ban size={16} />
                                            <span>Cancelled</span>
                                        </div>
                                        <div className="stat-values">
                                            <span className="count">{client.cancelledCount}</span>
                                            <span className="percentage">{client.cancelledRate}%</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ───── Charts Section ───── */}
            <div className="charts-grid">
                <div className="chart-card">
                    <div className="chart-header">
                        <h3>Executions by Client</h3>
                        <p>Distribution of job runs</p>
                    </div>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={jobsByClient}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={100}
                                fill="#8884d8"
                                dataKey="value"
                                label={({ name, value }) => `${name} (${value})`}
                            >
                                {jobsByClient.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip content={<CustomTooltip />} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                <div className="chart-card">
                    <div className="chart-header">
                        <h3>Executions by Status</h3>
                        <p>Success vs Failed vs Cancelled</p>
                    </div>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={jobsByStatus}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                            <XAxis dataKey="status" stroke="var(--text-muted)" />
                            <YAxis stroke="var(--text-muted)" />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                                {jobsByStatus.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.status] || '#3b82f6'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* ───── Job Execution Tree ───── */}
            <div className="job-tree-section">
                <div className="section-header">
                    <Activity size={20} />
                    <h2>Job Execution History</h2>
                    <span className="badge">{jobGroups.length} groups</span>
                </div>

                {jobGroups.length === 0 && (
                    <div className="empty-state">
                        <AlertTriangle size={40} />
                        <p>No job executions found for the selected filters.</p>
                    </div>
                )}

                <div className="job-tree">
                    {jobGroups.map((group, gi) => {
                        const groupKey = `${group.jobName}__${group.date}`;
                        const isExpanded = expandedJobs[groupKey];
                        const groupStatusCounts = {
                            Success: group.runs.filter(r => r.status === 'Success').length,
                            Failed: group.runs.filter(r => r.status === 'Failed').length,
                            Cancelled: group.runs.filter(r => r.status === 'Cancelled').length,
                        };

                        return (
                            <div key={gi} className="tree-group">
                                {/* Group Header */}
                                <div 
                                    className={`tree-group-header ${isExpanded ? 'expanded' : ''}`}
                                    onClick={() => toggleJob(groupKey)}
                                >
                                    <div className="tree-toggle">
                                        {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                    </div>
                                    <div className="tree-group-info">
                                        <span className="tree-client-tag" style={{ background: clientColorMap[group.clientName] + '22', color: clientColorMap[group.clientName] }}>
                                            {group.clientName}
                                        </span>
                                        <span className="tree-job-name">{group.jobName}</span>
                                    </div>
                                    <div className="tree-group-meta">
                                        <span className="tree-date">
                                            <Calendar size={14} />
                                            {group.date}
                                        </span>
                                        <span className="tree-run-count">{group.runs.length} run{group.runs.length > 1 ? 's' : ''}</span>
                                        <div className="tree-status-pills">
                                            {groupStatusCounts.Success > 0 && <span className="pill success">{groupStatusCounts.Success} ✓</span>}
                                            {groupStatusCounts.Failed > 0 && <span className="pill failed">{groupStatusCounts.Failed} ✗</span>}
                                            {groupStatusCounts.Cancelled > 0 && <span className="pill cancelled">{groupStatusCounts.Cancelled} ⊘</span>}
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded: individual runs */}
                                {isExpanded && (
                                    <div className="tree-runs">
                                        {group.runs.map((run, ri) => {
                                            const runKey = `${groupKey}__${ri}`;
                                            const isRunExpanded = expandedRuns[runKey];
                                            const statusClass = run.status === 'Success' ? 'success' : run.status === 'Failed' ? 'failed' : 'cancelled';

                                            return (
                                                <div key={ri} className={`tree-run ${statusClass}`}>
                                                    <div 
                                                        className="tree-run-header"
                                                        onClick={() => toggleRun(runKey)}
                                                    >
                                                        <div className="tree-connector"></div>
                                                        <div className="tree-toggle-sm">
                                                            {isRunExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                        </div>
                                                        <span className={`status-dot ${statusClass}`}></span>
                                                        <span className="run-status-label">{run.status}</span>
                                                        <span className="run-time">
                                                            <Clock size={13} />
                                                            {formatRunTime(run.runTimeStart)} → {formatRunTime(run.runTimeEnd)}
                                                        </span>
                                                        {run.totalDuration != null && (
                                                            <span className="run-duration" title="Total duration">
                                                                ⏱ {formatDuration(run.totalDuration)}
                                                            </span>
                                                        )}
                                                        {run.invokedBy && (
                                                            <span className="run-user">
                                                                <User size={13} />
                                                                {run.invokedBy}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {isRunExpanded && (
                                                        <div className="tree-run-details">
                                                            <div className="detail-grid">
                                                                <div className="detail-item">
                                                                    <label>Run Group ID</label>
                                                                    <span>{run.runGroupId}</span>
                                                                </div>
                                                                <div className="detail-item">
                                                                    <label>Instance Range</label>
                                                                    <span>{run.instanceStart} — {run.instanceEnd}</span>
                                                                </div>
                                                                {run.totalDuration != null && (
                                                                    <div className="detail-item">
                                                                        <label>Total Duration</label>
                                                                        <span>{formatDuration(run.totalDuration)}</span>
                                                                    </div>
                                                                )}
                                                                <div className="detail-item">
                                                                    <label>Invoked By</label>
                                                                    <span className="detail-user">
                                                                        <User size={13} />
                                                                        {run.invokedBy || 'System'}
                                                                    </span>
                                                                </div>
                                                                {run.stoppedBy && (
                                                                    <div className="detail-item warn">
                                                                        <label>Stopped By</label>
                                                                        <span className="detail-user danger">
                                                                            <UserX size={13} />
                                                                            {run.stoppedBy}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {run.failedSteps && (
                                                                <div className="detail-steps failed">
                                                                    <AlertTriangle size={14} />
                                                                    <label>Failed Steps:</label>
                                                                    <span>{[...new Set(run.failedSteps.split(', ').filter(Boolean))].join(', ')}</span>
                                                                </div>
                                                            )}
                                                            {run.cancelledSteps && (
                                                                <div className="detail-steps cancelled">
                                                                    <Ban size={14} />
                                                                    <label>Cancelled Steps:</label>
                                                                    <span>{[...new Set(run.cancelledSteps.split(', ').filter(Boolean))].join(', ')}</span>
                                                                </div>
                                                            )}

                                                            {/* Step Pipeline Visualization */}
                                                            <div className="step-pipeline">
                                                                <h4 className="pipeline-title">
                                                                    <Activity size={16} />
                                                                    Execution Pipeline
                                                                </h4>
                                                                <div className="pipeline-flow">
                                                                    {/* START node */}
                                                                    <div className="pipeline-node start">
                                                                        <div className="node-content">START</div>
                                                                    </div>
                                                                    <div className="pipeline-connector"></div>
                                                                    
                                                                    {/* Step nodes */}
                                                                    {buildStepPipeline(run).map((step, stepIdx, arr) => (
                                                                        <Fragment key={stepIdx}>
                                                                            <div className={`pipeline-node step ${step.statuses.join(' ')}`}>
                                                                                <div className="node-header">
                                                                                    <span className="step-id">Step {step.id}</span>
                                                                                    <div className="status-indicators">
                                                                                        {step.statuses.includes('success') && <div className="status-badge success" title="Success">✓</div>}
                                                                                        {step.statuses.includes('failed') && <div className="status-badge failed" title="Failed">✕</div>}
                                                                                        {step.statuses.includes('cancelled') && <div className="status-badge cancelled" title="Cancelled">⊘</div>}
                                                                                    </div>
                                                                                </div>
                                                                                <div className="node-name">{step.name}</div>
                                                                            </div>
                                                                            <div className="pipeline-connector"></div>
                                                                        </Fragment>
                                                                    ))}
                                                                    
                                                                    {/* END node */}
                                                                    <div className="pipeline-node end">
                                                                        <div className="node-content">END</div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
            </>
            )}
            </div>

            {/* ═══════════════════════════════════════════════════ */}
            {/* ─── TAB 2: RUNNING JOBS ─────────────────────────── */}
            {/* ═══════════════════════════════════════════════════ */}
            {activeTab === 'running' && (
                <div className="running-tab">
                    {/* Filter Panel */}
                    <DateFilter 
                        filterType={filterType}
                        selectedClient={selectedClient}
                        selectedDate={selectedDate}
                        selectedMonth={selectedMonth}
                        selectedYear={selectedYear}
                        fromDate={fromDate}
                        toDate={toDate}
                        onFilterTypeChange={handleFilterTypeChange}
                        onClientChange={handleFilterClientChange}
                        onDateChange={handleFilterDateChange}
                        onMonthChange={handleFilterMonthChange}
                        onYearChange={handleFilterYearChange}
                        onFromDateChange={handleFilterFromDateChange}
                        onToDateChange={handleFilterToDateChange}
                        onReset={handleFilterReset}
                    />

                    {/* Toolbar */}
                    <div className="tab-toolbar">
                        <div className="toolbar-left">
                            <div className="live-indicator">
                                <span className="live-dot"></span>
                                <span>Live</span>
                            </div>
                            <span className="toolbar-info">Auto-refreshes every 15s</span>
                        </div>
                        <div className="toolbar-right">
                            <input
                                type="text"
                                className="search-input"
                                placeholder="Search jobs..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                            <button className="refresh-btn" onClick={() => refetchRunning()} disabled={runningFetching}>
                                <RefreshCw size={16} className={runningFetching ? 'spinning' : ''} />
                                Refresh
                            </button>
                        </div>
                    </div>

                    {runningLoading ? (
                        <div className="loading-overlay">
                            <div className="loading-spinner"></div>
                            <p>Checking running jobs...</p>
                        </div>
                    ) : runningError ? (
                        <div className="error-state">
                            <XCircle size={40} />
                            <p>Failed to load running jobs: {runningError.message}</p>
                        </div>
                    ) : filteredRunning.length === 0 ? (
                        <div className="empty-state-card">
                            <div className="empty-icon">
                                <CheckCircle size={48} />
                            </div>
                            <h3>No Jobs Running</h3>
                            <p>All SQL Agent jobs are idle. Scheduled jobs will appear when they start executing.</p>
                        </div>
                    ) : (
                        <>
                            {/* Summary Cards */}
                            <div className="running-summary">
                                <div className="stat-card accent-blue">
                                    <div className="stat-icon blue">
                                        <Play size={24} />
                                    </div>
                                    <div className="stat-content">
                                        <h3>{filteredRunning.length}</h3>
                                        <p>Jobs Running</p>
                                    </div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-icon orange">
                                        <Timer size={24} />
                                    </div>
                                    <div className="stat-content">
                                        <h3>{Math.max(...filteredRunning.map(j => j.runningMinutes), 0)}m</h3>
                                        <p>Longest Running</p>
                                    </div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-icon cyan">
                                        <Users size={24} />
                                    </div>
                                    <div className="stat-content">
                                        <h3>{new Set(filteredRunning.map(j => j.clientName)).size}</h3>
                                        <p>Active Clients</p>
                                    </div>
                                </div>
                            </div>

                            {/* Running Jobs List */}
                            <div className="running-jobs-list">
                                {filteredRunning.map((job, idx) => (
                                    <div key={idx} className="running-job-card">
                                        <div className="running-job-left">
                                            <div className="running-pulse-wrapper">
                                                <div className="running-pulse"></div>
                                                <Loader2 size={20} className="spinning" />
                                            </div>
                                            <div className="running-job-info">
                                                <div className="running-job-name">{job.jobName}</div>
                                                <div className="running-job-meta">
                                                    <span className="running-client-tag">{job.clientName}</span>
                                                    <span className="running-step">
                                                        <Zap size={12} />
                                                        Step {job.currentStepNumber}: {job.currentStepName}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="running-job-right">
                                            <div className="running-timer">
                                                <Clock size={16} />
                                                <span className="timer-value">{job.runningTime}</span>
                                            </div>
                                            <div className="running-started">
                                                Started {job.startedAt ? (() => { const t = String(job.startedAt).split(' ')[1] || ''; const [h,m,s] = t.split(':').map(Number); if (isNaN(h)) return '—'; const ap = h < 12 ? 'AM' : 'PM'; return `${(h % 12 || 12)}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')} ${ap}`; })() : '—'}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ═══════════════════════════════════════════════════ */}
            {/* ─── TAB 3: SCHEDULED JOBS ───────────────────────── */}
            {/* ═══════════════════════════════════════════════════ */}
            {activeTab === 'scheduled' && (
                <div className="scheduled-tab">
                    {/* Filter Panel */}
                    <DateFilter 
                        filterType={filterType}
                        selectedClient={selectedClient}
                        selectedDate={selectedDate}
                        selectedMonth={selectedMonth}
                        selectedYear={selectedYear}
                        fromDate={fromDate}
                        toDate={toDate}
                        onFilterTypeChange={handleFilterTypeChange}
                        onClientChange={handleFilterClientChange}
                        onDateChange={handleFilterDateChange}
                        onMonthChange={handleFilterMonthChange}
                        onYearChange={handleFilterYearChange}
                        onFromDateChange={handleFilterFromDateChange}
                        onToDateChange={handleFilterToDateChange}
                        onReset={handleFilterReset}
                    />

                    {/* Toolbar */}
                    <div className="tab-toolbar">
                        <div className="toolbar-left">
                            <CalendarClock size={18} className="toolbar-icon" />
                            <span className="toolbar-info">Upcoming scheduled runs</span>
                        </div>
                        <div className="toolbar-right">
                            <input
                                type="text"
                                className="search-input"
                                placeholder="Search jobs..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                            <button className="refresh-btn" onClick={() => refetchScheduled()} disabled={scheduledFetching}>
                                <RefreshCw size={16} className={scheduledFetching ? 'spinning' : ''} />
                                Refresh
                            </button>
                        </div>
                    </div>

                    {scheduledLoading ? (
                        <div className="loading-overlay">
                            <div className="loading-spinner"></div>
                            <p>Loading schedule...</p>
                        </div>
                    ) : scheduledError ? (
                        <div className="error-state">
                            <XCircle size={40} />
                            <p>Failed to load scheduled jobs: {scheduledError.message}</p>
                        </div>
                    ) : filteredScheduled.length === 0 ? (
                        <div className="empty-state-card">
                            <div className="empty-icon">
                                <CalendarClock size={48} />
                            </div>
                            <h3>No Upcoming Schedules</h3>
                            <p>There are no future scheduled job runs configured.</p>
                        </div>
                    ) : (
                        <>
                            {/* Frequency Summary Cards */}
                            <div className="scheduled-summary">
                                <div className="stat-card">
                                    <div className="stat-icon blue">
                                        <CalendarClock size={24} />
                                    </div>
                                    <div className="stat-content">
                                        <h3>{filteredScheduled.length}</h3>
                                        <p>Upcoming Runs</p>
                                    </div>
                                </div>
                                {Object.entries(scheduledData?.frequencySummary || {}).map(([freq, count]) => (
                                    <div key={freq} className="stat-card">
                                        <div className="stat-icon green">
                                            <Repeat size={24} />
                                        </div>
                                        <div className="stat-content">
                                            <h3>{count}</h3>
                                            <p>{freq}</p>
                                        </div>
                                    </div>
                                ))}
                                <div className="stat-card">
                                    <div className="stat-icon cyan">
                                        <Users size={24} />
                                    </div>
                                    <div className="stat-content">
                                        <h3>{new Set(filteredScheduled.map(j => j.clientName)).size}</h3>
                                        <p>Clients Scheduled</p>
                                    </div>
                                </div>
                            </div>

                            {/* Schedule Table */}
                            <div className="schedule-table-wrapper">
                                <table className="schedule-table">
                                    <thead>
                                        <tr>
                                            <th>Job Name</th>
                                            <th>Client</th>
                                            <th>Schedule</th>
                                            <th>Frequency</th>
                                            <th>Next Run</th>
                                            <th>Time Until</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredScheduled.map((job, idx) => (
                                            <tr key={idx}>
                                                <td>
                                                    <div className="schedule-job-name">
                                                        <Server size={14} />
                                                        {job.jobName}
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className="schedule-client-tag">{job.clientName}</span>
                                                </td>
                                                <td className="schedule-name-cell">{job.scheduleName}</td>
                                                <td>
                                                    <span className={`freq-badge ${job.frequency.toLowerCase().replace(/[^a-z]/g, '')}`}>
                                                        {job.frequency}
                                                    </span>
                                                </td>
                                                <td className="schedule-datetime">
                                                    <Calendar size={13} />
                                                    {job.nextScheduledRun
                                                        ? new Date(job.nextScheduledRun).toLocaleString('en-US', {
                                                            year: 'numeric', month: 'short', day: '2-digit',
                                                            hour: '2-digit', minute: '2-digit', hour12: true
                                                          })
                                                        : '—'}
                                                </td>
                                                <td>
                                                    <span className="time-until-badge">
                                                        <Clock size={13} />
                                                        {job.timeUntil || '—'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className={`enabled-badge ${job.jobEnabled ? 'enabled' : 'disabled'}`}>
                                                        {job.jobEnabled ? 'Enabled' : 'Disabled'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default Dashboard;
