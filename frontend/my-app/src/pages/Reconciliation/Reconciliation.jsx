import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchReconciliationStats, fetchReconciliationClients } from '../../api/queries';
import StatusFilter from '../../components/StatusFilter/StatusFilter';
import {
    FileText,
    CheckCircle,
    XCircle,
    Users,
    TrendingUp,
    TrendingDown,
    ChevronDown,
    ChevronRight,
    Calendar,
    Activity,
    AlertTriangle,
    Database,
    LayoutDashboard,
    ArrowLeftRight,
    FileCheck,
    FileMinus,
} from 'lucide-react';
import {
    BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
    CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import './Reconciliation.css';

// ── Custom chart tooltip ──
const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="custom-tooltip">
                <p className="tooltip-label">{label || payload[0]?.name}</p>
                <p className="tooltip-value">{payload[0].value?.toLocaleString()}</p>
            </div>
        );
    }
    return null;
};

// ── Multi-value tooltip for stacked/grouped bars ──
const MultiTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="custom-tooltip">
                <p className="tooltip-label">{label}</p>
                {payload.map((p, i) => (
                    <p key={i} className="tooltip-value" style={{ color: p.color, fontSize: 14 }}>
                        {p.name}: {p.value?.toLocaleString()}
                    </p>
                ))}
            </div>
        );
    }
    return null;
};

const Reconciliation = () => {
    // ── Filters ──
    const [filterType, setFilterType] = useState('day');
    const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [selectedMonth, setSelectedMonth] = useState('');
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
    const [fromDate, setFromDate] = useState(() => {
        const d = new Date(); d.setMonth(d.getMonth() - 6);
        return d.toISOString().split('T')[0];
    });
    const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [selectedClient, setSelectedClient] = useState('');
    const [dateType, setDateType] = useState('submit'); // 'create', 'submit', or 'paid'
    const [viewMode, setViewMode] = useState('all'); // 'all' or 'clients'
    const [expandedClients, setExpandedClients] = useState({});
    const [statusFilter, setStatusFilter] = useState('');

    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
    const months = [
        { value: '01', label: 'January' }, { value: '02', label: 'February' },
        { value: '03', label: 'March' }, { value: '04', label: 'April' },
        { value: '05', label: 'May' }, { value: '06', label: 'June' },
        { value: '07', label: 'July' }, { value: '08', label: 'August' },
        { value: '09', label: 'September' }, { value: '10', label: 'October' },
        { value: '11', label: 'November' }, { value: '12', label: 'December' },
    ];

    // Build filter params
    const buildFilters = () => {
        const filters = { dateType, client: selectedClient };
        if (filterType === 'day' && selectedDate) {
            filters.type = 'day';
            filters.date = selectedDate;
        } else if (filterType === 'month' && selectedMonth) {
            filters.type = 'month';
            filters.month = selectedMonth;
            filters.year = selectedYear;
        } else if (filterType === 'year') {
            filters.type = 'year';
            filters.year = selectedYear;
        } else if (filterType === 'range' && fromDate && toDate) {
            filters.type = 'range';
            filters.fromDate = fromDate;
            filters.toDate = toDate;
        } else {
            filters.type = 'all';
        }
        return filters;
    };

    const appliedFilters = useMemo(buildFilters, [
        filterType, selectedDate, selectedMonth, selectedYear,
        fromDate, toDate, selectedClient, dateType,
    ]);

    // ── Queries ──
    const { data: reconClients } = useQuery({
        queryKey: ['reconciliationClients'],
        queryFn: fetchReconciliationClients,
    });

    const { data: stats, isLoading, error, isFetching } = useQuery({
        queryKey: ['reconciliationStats', appliedFilters],
        queryFn: () => fetchReconciliationStats(appliedFilters),
        staleTime: 30000,
        enabled: !!(
            filterType === 'all' ||
            (filterType === 'day' && selectedDate) ||
            (filterType === 'month' && selectedMonth) ||
            (filterType === 'year') ||
            (filterType === 'range' && fromDate && toDate)
        ),
    });

    const handleReset = () => {
        setFilterType('day');
        setSelectedDate(new Date().toISOString().split('T')[0]);
        setSelectedMonth('');
        setSelectedYear(new Date().getFullYear().toString());
        const d = new Date(); d.setMonth(d.getMonth() - 6);
        setFromDate(d.toISOString().split('T')[0]);
        setToDate(new Date().toISOString().split('T')[0]);
        setSelectedClient('');
        setDateType('submit');
    };

    const toggleClient = (key) => setExpandedClients(p => ({ ...p, [key]: !p[key] }));

    // ── Summary text ──
    const getFilterSummary = () => {
        const parts = [];
        if (selectedClient) parts.push(`Client: ${selectedClient}`);
        parts.push(`Date: ${dateType === 'paid' ? 'Paid Date' : dateType === 'submit' ? 'Submit Date' : dateType === 'system' ? 'File In System Date' : 'Create Date'}`);
        if (filterType === 'day' && selectedDate) parts.push(selectedDate);
        else if (filterType === 'month' && selectedMonth) {
            const ml = months.find(m => m.value === selectedMonth)?.label;
            parts.push(`${ml} ${selectedYear}`);
        } else if (filterType === 'year') parts.push(`Year: ${selectedYear}`);
        else if (filterType === 'range' && fromDate && toDate) parts.push(`${fromDate} → ${toDate}`);
        else parts.push('All Time');
        return parts.join(' | ');
    };

    // ── Extract data ──
    const totalFiles = stats?.totalFiles || 0;
    const totalConcurCount = stats?.totalConcurCount || 0;
    const totalLzCount = stats?.totalLzCount || 0;
    const totalMatched = stats?.totalMatched || 0;
    const totalMismatched = stats?.totalMismatched || 0;
    const matchRate = stats?.matchRate || 0;
    const mismatchRate = stats?.mismatchRate || 0;
    const activeClients = stats?.activeClients || 0;
    const reconciliationByClient = stats?.reconciliationByClient || [];
    const statusData = stats?.statusData || [];
    const clientTotals = stats?.clientTotals || [];
    const detailRows = stats?.detailRows || [];

    const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#14b8a6'];
    const STATUS_COLORS = { 'Matched': '#10b981', 'Mismatched': '#ef4444' };

    // Filter detail rows by status
    const filteredDetailRows = useMemo(() => {
        if (!statusFilter) return detailRows;
        if (statusFilter === 'matched') return detailRows.filter(r => r.result === 'success');
        if (statusFilter === 'mismatched') return detailRows.filter(r => r.result === 'fail');
        return detailRows;
    }, [detailRows, statusFilter]);

    // Group detail rows by client
    const groupedDetails = useMemo(() => {
        const groups = {};
        filteredDetailRows.forEach(row => {
            const client = row.Prefix || 'Unknown';
            if (!groups[client]) groups[client] = [];
            groups[client].push(row);
        });
        return groups;
    }, [filteredDetailRows]);

    // Pie chart data (files per client)
    const pieData = reconciliationByClient.map(c => ({
        name: c.name,
        value: c.totalFiles,
    }));

    const showInitialLoading = isLoading && !stats;

    return (
        <div className="reconciliation-page">
            {/* ───── FILTER PANEL ───── */}
            <div className="recon-filter">
                <div className="filter-header">
                    <ArrowLeftRight size={20} />
                    <h3>Reconciliation Filters</h3>
                    <span className="filter-summary">{getFilterSummary()}</span>
                </div>

                <div className="filter-controls">
                    {/* Report Date Type */}
                    <div className="filter-section">
                        <div className="section-label">
                            <Calendar size={16} />
                            <span>Report Date Type</span>
                        </div>
                        <div className="filter-type-buttons">
                            <button
                                className={`filter-type-btn ${dateType === 'create' ? 'active' : ''}`}
                                onClick={() => setDateType('create')}
                            >
                                Report Create Date
                            </button>
                            <button
                                className={`filter-type-btn ${dateType === 'submit' ? 'active' : ''}`}
                                onClick={() => setDateType('submit')}
                            >
                                Report Submit Date
                            </button>
                            <button
                                className={`filter-type-btn ${dateType === 'paid' ? 'active' : ''}`}
                                onClick={() => setDateType('paid')}
                            >
                                Report Paid Date
                            </button>
                            <button
                                className={`filter-type-btn ${dateType === 'system' ? 'active' : ''}`}
                                onClick={() => setDateType('system')}
                            >
                                File In System Date
                            </button>
                        </div>
                    </div>

                    {/* Client Filter */}
                    <div className="filter-section">
                        <div className="section-label">
                            <Users size={16} />
                            <span>Filter by Client</span>
                        </div>
                        <div className="input-group">
                            <div className="select-wrapper">
                                <select
                                    value={selectedClient}
                                    onChange={(e) => setSelectedClient(e.target.value)}
                                    className="select-input"
                                >
                                    <option value="">All Clients</option>
                                    {reconClients?.map((c, i) => (
                                        <option key={i} value={c.client}>{c.client}</option>
                                    ))}
                                </select>
                                <ChevronDown size={16} className="select-icon" />
                            </div>
                        </div>
                    </div>

                    {/* Date Filter */}
                    <div className="filter-section">
                        <div className="section-label">
                            <Calendar size={16} />
                            <span>Filter by Date</span>
                        </div>
                        <div className="filter-type-buttons">
                            {['all', 'day', 'month', 'year', 'range'].map(t => (
                                <button
                                    key={t}
                                    className={`filter-type-btn ${filterType === t ? 'active' : ''}`}
                                    onClick={() => {
                                        setFilterType(t);
                                        setSelectedDate('');
                                        setSelectedMonth('');
                                        setFromDate('');
                                        setToDate('');
                                    }}
                                >
                                    {t === 'all' ? 'All Time' : t === 'day' ? 'By Day' : t === 'month' ? 'By Month' : t === 'year' ? 'By Year' : 'By Range'}
                                </button>
                            ))}
                        </div>

                        <div className="filter-inputs">
                            {filterType === 'day' && (
                                <div className="input-group">
                                    <label>Select Date</label>
                                    <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="date-input" />
                                </div>
                            )}
                            {filterType === 'range' && (
                                <div className="input-row">
                                    <div className="input-group">
                                        <label>From Date</label>
                                        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} max={toDate} className="date-input" />
                                    </div>
                                    <div className="input-group">
                                        <label>To Date</label>
                                        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} min={fromDate} className="date-input" />
                                    </div>
                                </div>
                            )}
                            {filterType === 'month' && (
                                <div className="input-row">
                                    <div className="input-group">
                                        <label>Month</label>
                                        <div className="select-wrapper">
                                            <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="select-input">
                                                <option value="">Select Month</option>
                                                {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                            </select>
                                            <ChevronDown size={16} className="select-icon" />
                                        </div>
                                    </div>
                                    <div className="input-group">
                                        <label>Year</label>
                                        <div className="select-wrapper">
                                            <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="select-input">
                                                {years.map(y => <option key={y} value={y}>{y}</option>)}
                                            </select>
                                            <ChevronDown size={16} className="select-icon" />
                                        </div>
                                    </div>
                                </div>
                            )}
                            {filterType === 'year' && (
                                <div className="input-group">
                                    <label>Select Year</label>
                                    <div className="select-wrapper">
                                        <select value={selectedYear} onChange={e => setSelectedYear(e.target.value)} className="select-input">
                                            {years.map(y => <option key={y} value={y}>{y}</option>)}
                                        </select>
                                        <ChevronDown size={16} className="select-icon" />
                                    </div>
                                </div>
                            )}
                            <button type="button" className="reset-btn" onClick={handleReset}>Reset All Filters</button>
                        </div>
                    </div>
                </div>
            </div>

            {isFetching && !showInitialLoading && (
                <div className="loading-bar-container">
                    <div className="loading-bar"></div>
                    <span className="loading-bar-text">Loading reconciliation data...</span>
                </div>
            )}

            {/* ───── LOADING / ERROR ───── */}
            {showInitialLoading && (
                <div className="loading-section">
                    <div className="loading-spinner"></div>
                    <p>Loading reconciliation data...</p>
                </div>
            )}

            {error && !stats && (
                <div className="error-banner">Error loading data: {error?.message}</div>
            )}

            {/* ───── STATS CARDS ───── */}
            {stats && (<>
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon blue"><FileText size={24} /></div>
                    <div className="stat-content">
                        <h3>{totalFiles.toLocaleString()}</h3>
                        <p>Total Files</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon purple"><Database size={24} /></div>
                    <div className="stat-content">
                        <h3>{totalConcurCount.toLocaleString()}</h3>
                        <p>Concur Transactions</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon cyan"><Database size={24} /></div>
                    <div className="stat-content">
                        <h3>{totalLzCount.toLocaleString()}</h3>
                        <p>LZ Transactions</p>
                    </div>
                </div>
                <div className="stat-card accent-green">
                    <div className="stat-icon green"><CheckCircle size={24} /></div>
                    <div className="stat-content">
                        <h3>{totalMatched.toLocaleString()}</h3>
                        <p>Files Matched</p>
                    </div>
                </div>
                <div className="stat-card accent-red">
                    <div className="stat-icon red"><XCircle size={24} /></div>
                    <div className="stat-content">
                        <h3>{totalMismatched.toLocaleString()}</h3>
                        <p>Files Mismatched</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon green"><TrendingUp size={24} /></div>
                    <div className="stat-content">
                        <h3>{matchRate}%</h3>
                        <p>Match Rate</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon red"><TrendingDown size={24} /></div>
                    <div className="stat-content">
                        <h3>{mismatchRate}%</h3>
                        <p>Mismatch Rate</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon orange"><Users size={24} /></div>
                    <div className="stat-content">
                        <h3>{activeClients}</h3>
                        <p>Active Clients</p>
                    </div>
                </div>
            </div>

            {/* ───── VIEW MODE TOGGLE ───── */}
            <div className="view-mode-toggle">
                <button className={viewMode === 'all' ? 'active' : ''} onClick={() => setViewMode('all')}>
                    <LayoutDashboard size={18} /> All Clients Overview
                </button>
                <button className={viewMode === 'clients' ? 'active' : ''} onClick={() => setViewMode('clients')}>
                    <Users size={18} /> Client by Client
                </button>
            </div>

            {/* ───── CLIENT TILES (client-by-client view) ───── */}
            {viewMode === 'clients' && (
                <div className="client-tiles-section">
                    <h2 className="section-title">Client Reconciliation Statistics</h2>
                    <div className="client-tiles-grid">
                        {clientTotals.map((client, index) => (
                            <div key={client.prefix} className="client-tile">
                                <div className="client-tile-header" style={{ borderLeftColor: COLORS[index % COLORS.length] }}>
                                    <h3>{client.prefix}</h3>
                                    <div className="client-total">
                                        <Activity size={18} />
                                        <span>{client.totalFiles.toLocaleString()} files</span>
                                    </div>
                                </div>
                                <div className="client-tile-stats">
                                    <div className="client-stat info">
                                        <div className="stat-label"><Database size={16} /><span>Concur Count</span></div>
                                        <div className="stat-values">
                                            <span className="count">{client.totalConcurCount.toLocaleString()}</span>
                                        </div>
                                    </div>
                                    <div className="client-stat info">
                                        <div className="stat-label"><Database size={16} /><span>LZ Count</span></div>
                                        <div className="stat-values">
                                            <span className="count">{client.totalLzCount.toLocaleString()}</span>
                                        </div>
                                    </div>
                                    <div className="client-stat success">
                                        <div className="stat-label"><CheckCircle size={16} /><span>Matched</span></div>
                                        <div className="stat-values">
                                            <span className="count">{client.matchedFiles.toLocaleString()}</span>
                                            <span className="percentage">{client.matchRate}%</span>
                                        </div>
                                    </div>
                                    <div className="client-stat failed">
                                        <div className="stat-label"><XCircle size={16} /><span>Mismatched</span></div>
                                        <div className="stat-values">
                                            <span className="count">{client.mismatchedFiles.toLocaleString()}</span>
                                            <span className="percentage">{client.mismatchRate}%</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ───── CHARTS ───── */}
            <div className="charts-grid">
                <div className="chart-card">
                    <div className="chart-header">
                        <h3>Files by Client</h3>
                        <p>Distribution of files across clients</p>
                    </div>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={pieData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={100}
                                fill="#8884d8"
                                dataKey="value"
                                label={({ name, value }) => `${name} (${value.toLocaleString()})`}
                            >
                                {pieData.map((_, i) => (
                                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip content={<CustomTooltip />} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                <div className="chart-card">
                    <div className="chart-header">
                        <h3>Match Status</h3>
                        <p>Matched vs mismatched files</p>
                    </div>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={statusData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                            <XAxis dataKey="status" stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
                            <YAxis stroke="var(--text-muted)" />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                                {statusData.map((entry, i) => (
                                    <Cell key={i} fill={STATUS_COLORS[entry.status] || '#3b82f6'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Grouped bar: Concur vs LZ per client */}
                <div className="chart-card chart-card-wide">
                    <div className="chart-header">
                        <h3>Concur vs LZ by Client</h3>
                        <p>Transaction count comparison per client</p>
                    </div>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={reconciliationByClient}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                            <XAxis dataKey="name" stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
                            <YAxis stroke="var(--text-muted)" />
                            <Tooltip content={<MultiTooltip />} />
                            <Legend />
                            <Bar dataKey="concurCount" name="Concur Count" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                            <Bar dataKey="lzCount" name="LZ Count" fill="#06b6d4" radius={[6, 6, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* ───── DETAILED RECORDS TREE ───── */}
            <div className="detail-section">
                <div className="section-header">
                    <Activity size={20} />
                    <h2>Detailed Reconciliation Records</h2>
                    <span className="badge">{detailRows.length} entries</span>
                </div>

                <StatusFilter
                    statusFilter={statusFilter}
                    onStatusFilterChange={setStatusFilter}
                    options={[
                        { value: 'matched', label: 'Matched', color: 'green' },
                        { value: 'mismatched', label: 'Mismatched', color: 'red' },
                    ]}
                    totalCount={detailRows.length}
                    filteredCount={filteredDetailRows.length}
                    label="Filter by Result"
                />

                {filteredDetailRows.length === 0 && (
                    <div className="empty-state">
                        <AlertTriangle size={40} />
                        <p>No reconciliation records found for the selected filters.</p>
                    </div>
                )}

                <div className="recon-tree">
                    {Object.entries(groupedDetails).map(([clientName, rows], ci) => {
                        const isClientExpanded = expandedClients[clientName];
                        const matchedCount = rows.filter(r => r.result === 'success').length;
                        const mismatchedCount = rows.filter(r => r.result === 'fail').length;

                        return (
                            <div key={clientName} className="tree-group">
                                <div
                                    className={`tree-group-header ${isClientExpanded ? 'expanded' : ''}`}
                                    onClick={() => toggleClient(clientName)}
                                >
                                    <div className="tree-toggle">
                                        {isClientExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                    </div>
                                    <div className="tree-group-info">
                                        <span className="tree-client-tag" style={{
                                            background: COLORS[ci % COLORS.length] + '22',
                                            color: COLORS[ci % COLORS.length]
                                        }}>
                                            {clientName}
                                        </span>
                                    </div>
                                    <div className="tree-group-meta">
                                        <span className="tree-run-count">{rows.length} files</span>
                                        <div className="tree-status-pills">
                                            {matchedCount > 0 && <span className="pill success">{matchedCount} matched</span>}
                                            {mismatchedCount > 0 && <span className="pill failed">{mismatchedCount} mismatched</span>}
                                        </div>
                                    </div>
                                </div>

                                {isClientExpanded && (
                                    <div className="tree-runs">
                                        <div className="tree-run-details">
                                            <div className="detail-table-wrapper">
                                                <table className="detail-table compact">
                                                    <thead>
                                                        <tr>
                                                            <th>Database</th>
                                                            <th>Filename</th>
                                                            <th>System Date</th>
                                                            <th>Submit Date</th>
                                                            <th>Create Date</th>
                                                            <th>Paid Date</th>
                                                            <th>Concur Count</th>
                                                            <th>LZ Count</th>
                                                            <th>Difference</th>
                                                            <th>Result</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {rows.map((row, ri) => {
                                                            const diff = (row.lz_count || 0) - (row.concure_count || 0);
                                                            return (
                                                                <tr key={ri}>
                                                                    <td className="mono">{row.DatabaseName}</td>
                                                                    <td className="filename" title={row.Filename}>
                                                                        {row.Filename?.substring(0, 50)}{row.Filename?.length > 50 ? '...' : ''}
                                                                    </td>
                                                                    <td className="mono">{row.file_in_system_Date ? String(row.file_in_system_Date).substring(0, 10) : '—'}</td>
                                                                    <td className="mono">{row.submit_date ? String(row.submit_date).substring(0, 10) : '—'}</td>
                                                                    <td className="mono">{row.create_date ? String(row.create_date).substring(0, 10) : '—'}</td>
                                                                    <td className="mono">{row.paid_date ? String(row.paid_date).substring(0, 10) : '—'}</td>
                                                                    <td className="num">{(row.concure_count || 0).toLocaleString()}</td>
                                                                    <td className="num">{(row.lz_count || 0).toLocaleString()}</td>
                                                                    <td className={`num ${diff === 0 ? 'success-text' : 'danger-text'}`}>
                                                                        {diff === 0 ? '0' : (diff > 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString())}
                                                                    </td>
                                                                    <td>
                                                                        {row.result === 'success' ? (
                                                                            <span className="recon-status matched">
                                                                                <CheckCircle size={14} /> Matched
                                                                            </span>
                                                                        ) : (
                                                                            <span className="recon-status mismatched">
                                                                                <XCircle size={14} /> Mismatched
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
            </>)}
        </div>
    );
};

export default Reconciliation;
