import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchReceiptCatStats, fetchReceiptCatClients } from '../../api/queries';
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
    LayoutDashboard,
    Hash,
    ClipboardList,
    FileSearch,
    BookOpen,
    Utensils,
} from 'lucide-react';
import {
    BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
    CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import './ReceiptCategorization.css';

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

const ReceiptCategorization = () => {
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
    const [dateType, setDateType] = useState('submit');
    const [viewMode, setViewMode] = useState('all');
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
    const { data: rcClients } = useQuery({
        queryKey: ['receiptCatClients'],
        queryFn: fetchReceiptCatClients,
    });

    const { data: stats, isLoading, error, isFetching } = useQuery({
        queryKey: ['receiptCatStats', appliedFilters],
        queryFn: () => fetchReceiptCatStats(appliedFilters),
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

    const getFilterSummary = () => {
        const parts = [];
        if (selectedClient) parts.push(`Client: ${selectedClient}`);
        parts.push(`Date: ${dateType === 'paid' ? 'Paid Date' : dateType === 'submit' ? 'Submit Date' : 'Create Date'}`);
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
    const totalRecords = stats?.totalRecords || 0;
    const totalFound = stats?.totalFound || 0;
    const totalNotFound = stats?.totalNotFound || 0;
    const foundRate = stats?.foundRate || 0;
    const errorRate = stats?.errorRate || 0;
    const activeClients = stats?.activeClients || 0;
    const totalFiles = stats?.totalFiles || 0;
    const totalReports = stats?.totalReports || 0;
    const totalEntries = stats?.totalEntries || 0;
    const statusData = stats?.statusData || [];
    const clientTotals = stats?.clientTotals || [];
    const detailRows = stats?.detailRows || [];

    const COLORS = ['#6366f1', '#14b8a6', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#10b981'];
    const STATUS_COLORS = { 'Match': '#10b981', 'Mismatch': '#ef4444' };

    // Filter detail rows by status
    const filteredDetailRows = useMemo(() => {
        if (!statusFilter) return detailRows;
        if (statusFilter === 'match') return detailRows.filter(r => r.result === 'found');
        if (statusFilter === 'mismatch') return detailRows.filter(r => r.result === 'error');
        return detailRows;
    }, [detailRows, statusFilter]);

    // Group detail rows by client
    const groupedDetails = useMemo(() => {
        const groups = {};
        filteredDetailRows.forEach(row => {
            const client = row.prefix || 'Unknown';
            if (!groups[client]) groups[client] = [];
            groups[client].push(row);
        });
        return groups;
    }, [filteredDetailRows]);

    // Pie chart: total records per client
    const pieData = clientTotals.map(c => ({
        name: (c.prefix || c.client || 'Unknown').replace(/^Extract_/i, ''),
        value: c.totalRecords || 0,
    }));

    // Grouped bar chart data: SIS/Dine flags in Qdera vs found in SIS/Dine table
    const clientComparisonData = clientTotals.map(c => ({
        client: (c.prefix || c.client || 'Unknown').replace(/^Extract_/i, ''),
        'SIS Flag': c.signInSheetFlags || 0,
        'Dine Flag': c.dineInFlags || 0,
        'Found SIS': c.foundInSIS || 0,
        'Found Dine': c.foundInDine || 0,
    }));

    const showInitialLoading = isLoading && !stats;

    const formatDate = (d) => {
        if (!d) return '—';
        const val = String(d).substring(0, 10);
        return val === '1900-01-01' ? '—' : val;
    };

    const formatNullableField = (value, isNull) => {
        if (isNull || (value === null && isNull !== false)) return { display: 'N/A', isNull: true };
        return { display: value ?? '—', isNull: false };
    };

    return (
        <div className="receiptcat-page">
            {/* ───── FILTER PANEL ───── */}
            <div className="receiptcat-filter">
                <div className="filter-header">
                    <ClipboardList size={20} />
                    <h3>Receipt Categorization Filters</h3>
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
                                    {rcClients?.map((c, i) => (
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
                    <span className="loading-bar-text">Loading receipt categorization data...</span>
                </div>
            )}

            {showInitialLoading && (
                <div className="loading-section">
                    <div className="loading-spinner"></div>
                    <p>Loading receipt categorization data...</p>
                </div>
            )}

            {error && !stats && (
                <div className="error-banner">Error loading data: {error?.message}</div>
            )}

            {/* ───── STATS CARDS ───── */}
            {stats && (<>
            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-icon blue"><Hash size={24} /></div>
                    <div className="stat-content">
                        <h3>{totalRecords.toLocaleString()}</h3>
                        <p>Total Records</p>
                    </div>
                </div>
                <div className="stat-card accent-green">
                    <div className="stat-icon green"><CheckCircle size={24} /></div>
                    <div className="stat-content">
                        <h3>{totalFound.toLocaleString()}</h3>
                        <p>Match</p>
                    </div>
                </div>
                <div className="stat-card accent-red">
                    <div className="stat-icon red"><XCircle size={24} /></div>
                    <div className="stat-content">
                        <h3>{totalNotFound.toLocaleString()}</h3>
                        <p>Mismatch</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon green"><TrendingUp size={24} /></div>
                    <div className="stat-content">
                        <h3>{foundRate}%</h3>
                        <p>Match Rate</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon red"><TrendingDown size={24} /></div>
                    <div className="stat-content">
                        <h3>{errorRate}%</h3>
                        <p>Mismatch Rate</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon cyan"><FileText size={24} /></div>
                    <div className="stat-content">
                        <h3>{totalFiles.toLocaleString()}</h3>
                        <p>Unique Files</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon purple"><FileSearch size={24} /></div>
                    <div className="stat-content">
                        <h3>{totalReports.toLocaleString()}</h3>
                        <p>Unique Reports</p>
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

            {/* ───── CLIENT TILES ───── */}
            {viewMode === 'clients' && (
                <div className="client-tiles-section">
                    <h2 className="section-title">Client Receipt Categorization Statistics</h2>
                    <div className="client-tiles-grid">
                        {clientTotals.map((client, index) => (
                            <div key={client.prefix} className="client-tile">
                                <div className="client-tile-header" style={{ borderLeftColor: COLORS[index % COLORS.length] }}>
                                    <h3>{client.prefix}</h3>
                                    <div className="client-total">
                                        <Activity size={18} />
                                        <span>{client.totalRecords.toLocaleString()} records</span>
                                    </div>
                                </div>
                                <div className="client-tile-stats">
                                    <div className="client-stat info">
                                        <div className="stat-label"><FileText size={16} /><span>Files</span></div>
                                        <div className="stat-values">
                                            <span className="count">{client.totalFiles.toLocaleString()}</span>
                                        </div>
                                    </div>
                                    <div className="client-stat info">
                                        <div className="stat-label"><FileSearch size={16} /><span>Reports</span></div>
                                        <div className="stat-values">
                                            <span className="count">{client.totalReports.toLocaleString()}</span>
                                        </div>
                                    </div>
                                    <div className="client-stat success">
                                        <div className="stat-label"><CheckCircle size={16} /><span>Match</span></div>
                                        <div className="stat-values">
                                            <span className="count">{client.foundCount.toLocaleString()}</span>
                                            <span className="percentage">{client.foundRate}%</span>
                                        </div>
                                    </div>
                                    <div className="client-stat failed">
                                        <div className="stat-label"><XCircle size={16} /><span>Mismatch</span></div>
                                        <div className="stat-values">
                                            <span className="count">{client.notFoundCount.toLocaleString()}</span>
                                            <span className="percentage">{client.errorRate}%</span>
                                        </div>
                                    </div>
                                    <div className="client-stat info">
                                        <div className="stat-label"><BookOpen size={16} /><span>SIS Flagged / Found</span></div>
                                        <div className="stat-values">
                                            <span className="count">{client.signInSheetFlags} / {client.foundInSIS}</span>
                                        </div>
                                    </div>
                                    <div className="client-stat info">
                                        <div className="stat-label"><Utensils size={16} /><span>Dine Flagged / Found</span></div>
                                        <div className="stat-values">
                                            <span className="count">{client.dineInFlags} / {client.foundInDine}</span>
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
                {/* Pie: Records per client */}
                <div className="chart-card">
                    <div className="chart-header">
                        <h3>Records by Client</h3>
                        <p>Total expense entries distribution per client</p>
                    </div>
                    {pieData.length === 0 ? (
                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>No data</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%" cy="50%"
                                    innerRadius={55} outerRadius={95}
                                    dataKey="value"
                                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                    labelLine={false}
                                >
                                    {pieData.map((_, i) => (
                                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip content={<CustomTooltip />} />
                                <Legend
                                    formatter={(value) => <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{value}</span>}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* Bar: OCR comparison per client */}
                <div className="chart-card">
                    <div className="chart-header">
                        <h3>Client OCR Comparison</h3>
                        <p>SIS Flag &amp; Dine Flag in Qdera vs entries Found in SIN table &amp; Dine table — per client</p>
                    </div>
                    {clientComparisonData.length === 0 ? (
                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>No client data available</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={360}>
                            <BarChart
                                data={clientComparisonData}
                                margin={{ top: 10, right: 20, left: 0, bottom: 70 }}
                                barCategoryGap="20%"
                                barGap={3}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                                <XAxis
                                    dataKey="client"
                                    stroke="var(--text-muted)"
                                    tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                                    angle={-35}
                                    textAnchor="end"
                                    interval={0}
                                />
                                <YAxis stroke="var(--text-muted)" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
                                <Tooltip
                                    contentStyle={{
                                        background: 'var(--bg-secondary)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: 8,
                                        color: 'var(--text-primary)',
                                        fontSize: 13,
                                    }}
                                    labelStyle={{ color: 'var(--text-primary)', fontWeight: 600, marginBottom: 4 }}
                                />
                                <Legend
                                    wrapperStyle={{ color: 'var(--text-secondary)', fontSize: 13, paddingTop: 8 }}
                                />
                                <Bar dataKey="SIS Flag"  fill="#6366f1" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="Dine Flag" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="Found SIS"  fill="#10b981" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="Found Dine" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>

            {/* ───── DETAILED RECORDS TREE ───── */}
            <div className="detail-section">
                <div className="section-header">
                    <Activity size={20} />
                    <h2>Expense History - All Receipt Records</h2>
                    <span className="badge">{detailRows.length} entries</span>
                </div>

                <StatusFilter
                    statusFilter={statusFilter}
                    onStatusFilterChange={setStatusFilter}
                    options={[
                        { value: 'match', label: 'Match', color: 'green' },
                        { value: 'mismatch', label: 'Mismatch', color: 'red' },
                    ]}
                    totalCount={detailRows.length}
                    filteredCount={filteredDetailRows.length}
                    label="Filter by Result"
                />

                {filteredDetailRows.length === 0 && (
                    <div className="empty-state">
                        <AlertTriangle size={40} />
                        <p>No records found for the selected filters.</p>
                    </div>
                )}

                <div className="receipt-tree">
                    {Object.entries(groupedDetails).map(([clientName, rows], ci) => {
                        const isClientExpanded = expandedClients[clientName];
                        const foundCount = rows.filter(r => r.result === 'found').length;
                        const errorCount = rows.filter(r => r.result === 'error').length;

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
                                        <span className="tree-run-count">{rows.length} records</span>
                                        <div className="tree-status-pills">
                                            {foundCount > 0 && <span className="pill success">{foundCount} match</span>}
                                            {errorCount > 0 && <span className="pill failed">{errorCount} mismatch</span>}
                                        </div>
                                    </div>
                                </div>

                                {isClientExpanded && (
                                    <div className="tree-runs">
                                        <div className="tree-run-details">
                                            <div className="detail-table-wrapper">
                                                <table className="detail-table compact">
                                                    <colgroup>
                                                        <col style={{ minWidth: '100px' }} />
                                                        <col style={{ minWidth: '220px' }} />
                                                        <col style={{ minWidth: '120px' }} />
                                                        <col style={{ minWidth: '200px' }} />
                                                        <col style={{ minWidth: '260px' }} />
                                                        <col style={{ minWidth: '120px' }} />
                                                        <col style={{ minWidth: '120px' }} />
                                                        <col style={{ minWidth: '120px' }} />
                                                        <col style={{ minWidth: '130px' }} />
                                                        <col style={{ minWidth: '130px' }} />
                                                        <col style={{ minWidth: '130px' }} />
                                                        <col style={{ minWidth: '100px' }} />
                                                        <col style={{ minWidth: '100px' }} />
                                                        <col style={{ minWidth: '100px' }} />
                                                        <col style={{ minWidth: '100px' }} />
                                                        <col style={{ minWidth: '110px' }} />
                                                    </colgroup>
                                                    <thead>
                                                        <tr>
                                                            <th>Database</th>
                                                            <th>Filename</th>
                                                            <th>Prefix</th>
                                                            <th>Report ID</th>
                                                            <th>Entry ID</th>
                                                            <th>Submit Date</th>
                                                            <th>Create Date</th>
                                                            <th>Paid Date</th>
                                                            <th>Receipt Uploaded</th>
                                                            <th>Multi Document</th>
                                                            <th>Meal Itemized</th>
                                                            <th>SIS Flag</th>
                                                            <th>Dine Flag</th>
                                                            <th>Found SIS</th>
                                                            <th>Found Dine</th>
                                                            <th>Result</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {rows.map((row, ri) => {
                                                            const rcptUploaded = formatNullableField(row.isreceiptuploaded, row.isreceiptuploaded_null);
                                                            const multiDoc = formatNullableField(row.isMultiDocument, row.isMultiDocument_null);
                                                            const mealItem = formatNullableField(row.isMealItemized, row.isMealItemized_null);
                                                            return (
                                                            <tr key={ri}>
                                                                <td className="mono">{row.client_db}</td>
                                                                <td className="mono" style={{ wordBreak: 'break-all' }}>
                                                                    {row.filename}
                                                                </td>
                                                                <td className="mono">{row.prefix}</td>
                                                                <td className="mono" style={{ wordBreak: 'break-all' }}>
                                                                    {row.report_id}
                                                                </td>
                                                                <td className="mono" style={{ wordBreak: 'break-all' }}>
                                                                    {row.report_entry_id}
                                                                </td>
                                                                <td className="mono">{formatDate(row.report_submit_date)}</td>
                                                                <td className="mono">{formatDate(row.report_create_date)}</td>
                                                                <td className="mono">{formatDate(row.report_paid_date)}</td>
                                                                <td className={`center ${rcptUploaded.isNull ? 'null-cell' : ''}`}>
                                                                    {rcptUploaded.isNull ? <span className="null-badge">NULL</span> : rcptUploaded.display}
                                                                </td>
                                                                <td className={`center ${multiDoc.isNull ? 'null-cell' : ''}`}>
                                                                    {multiDoc.isNull ? <span className="null-badge">NULL</span> : multiDoc.display}
                                                                </td>
                                                                <td className={`center ${mealItem.isNull ? 'null-cell' : ''}`}>
                                                                    {mealItem.isNull ? <span className="null-badge">NULL</span> : mealItem.display}
                                                                </td>
                                                                <td className="center">{row.hasSignInSheetAttached}</td>
                                                                <td className="center">{row.hasDineInReceiptAttached}</td>
                                                                <td className="center">{row.Found_In_SIS}</td>
                                                                <td className="center">{row.Found_In_Dine}</td>
                                                                <td>
                                                                    {row.result === 'found' ? (
                                                                        <span className="result-status status-found">
                                                                            <CheckCircle size={14} /> Match
                                                                        </span>
                                                                    ) : (
                                                                        <span className="result-status status-error">
                                                                            <XCircle size={14} /> Mismatch
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

export default ReceiptCategorization;
