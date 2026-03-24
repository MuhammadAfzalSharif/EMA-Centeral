import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchExpenseStats, fetchExpenseClients } from '../../api/queries';
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
    Receipt,
    FileCheck,
    FileMinus,
    Eye,
    LayoutDashboard,
} from 'lucide-react';
import {
    BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
    CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import './Expenses.css';

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

const Expenses = () => {
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
    const [expandedDates, setExpandedDates] = useState({});
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
    const { data: expenseClients } = useQuery({
        queryKey: ['expenseClients'],
        queryFn: fetchExpenseClients,
    });

    const { data: stats, isLoading, error, isFetching } = useQuery({
        queryKey: ['expenseStats', appliedFilters],
        queryFn: () => fetchExpenseStats(appliedFilters),
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
    const toggleDate = (key) => setExpandedDates(p => ({ ...p, [key]: !p[key] }));

    // ── Summary text ──
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
    const totalExpenses = stats?.totalExpenses || 0;
    const totalReceiptReceived = stats?.totalReceiptReceived || 0;
    const totalReceiptMissing = stats?.totalReceiptMissing || 0;
    const totalEReceiptReceived = stats?.totalEReceiptReceived || 0;
    const totalEReceiptMissing = stats?.totalEReceiptMissing || 0;
    const receiptRate = stats?.receiptRate || 0;
    const missingRate = stats?.missingRate || 0;
    const eReceiptRate = stats?.eReceiptRate || 0;
    const activeClients = stats?.activeClients || 0;
    const receiptsByClient = stats?.receiptsByClient || [];
    const receiptStatusData = stats?.receiptStatusData || [];
    const clientTotals = stats?.clientTotals || [];
    const detailRows = stats?.detailRows || [];

    const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#14b8a6'];
    const STATUS_COLORS = { 'Receipt Found': '#10b981', 'Receipt Not Found': '#ef4444', 'E-Receipt Found': '#06b6d4', 'E-Receipt Not Found': '#f59e0b' };

    // Filter detail rows by status
    const filteredDetailRows = useMemo(() => {
        if (!statusFilter) return detailRows;
        if (statusFilter === 'found') return detailRows.filter(r => r.Receipt_Filename);
        if (statusFilter === 'not_found') return detailRows.filter(r => !r.Receipt_Filename);
        return detailRows;
    }, [detailRows, statusFilter]);

    // Group detail rows by client then date
    const groupedDetails = useMemo(() => {
        const groups = {};
        filteredDetailRows.forEach(row => {
            const client = row.prefix || 'Unknown';
            const reportDate = dateType === 'paid' ? row.Report_Paid_Date : dateType === 'submit' ? row.Report_Submit_Date : row.Report_Create_Date;
            if (!groups[client]) groups[client] = {};
            if (!groups[client][reportDate]) groups[client][reportDate] = [];
            groups[client][reportDate].push(row);
        });
        return groups;
    }, [filteredDetailRows, dateType]);

    // ── Pie chart data ──
    const pieData = receiptsByClient.map(c => ({
        name: c.name,
        value: c.total_expenses,
    }));

    // We always render the page + filters; loading/error shown inline below filters
    const showInitialLoading = isLoading && !stats;

    return (
        <div className="expenses-page">
            {/* ───── FILTER PANEL ───── */}
            <div className="expense-filter">
                <div className="filter-header">
                    <Receipt size={20} />
                    <h3>Expense Filters</h3>
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
                                    {expenseClients?.map((c, i) => (
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
                    <span className="loading-bar-text">Loading data...</span>
                </div>
            )}

            {/* ───── LOADING / ERROR ───── */}
            {showInitialLoading && (
                <div className="loading-section">
                    <div className="loading-spinner"></div>
                    <p>Loading expense data...</p>
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
                        <h3>{totalExpenses.toLocaleString()}</h3>
                        <p>Total Expenses (LZ)</p>
                    </div>
                </div>
                <div className="stat-card accent-green">
                    <div className="stat-icon green"><CheckCircle size={24} /></div>
                    <div className="stat-content">
                        <h3>{totalReceiptReceived.toLocaleString()}</h3>
                        <p>Receipts Found</p>
                    </div>
                </div>
                <div className="stat-card accent-red">
                    <div className="stat-icon red"><XCircle size={24} /></div>
                    <div className="stat-content">
                        <h3>{totalReceiptMissing.toLocaleString()}</h3>
                        <p>Receipts Not Found</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon cyan"><FileCheck size={24} /></div>
                    <div className="stat-content">
                        <h3>{totalEReceiptReceived.toLocaleString()}</h3>
                        <p>E-Receipts Found</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon green"><TrendingUp size={24} /></div>
                    <div className="stat-content">
                        <h3>{receiptRate}%</h3>
                        <p>Found Rate</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon red"><TrendingDown size={24} /></div>
                    <div className="stat-content">
                        <h3>{missingRate}%</h3>
                        <p>Not Found Rate</p>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-icon cyan"><Receipt size={24} /></div>
                    <div className="stat-content">
                        <h3>{eReceiptRate}%</h3>
                        <p>E-Receipt Rate</p>
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
                    <h2 className="section-title">Client Statistics</h2>
                    <div className="client-tiles-grid">
                        {clientTotals.map((client, index) => (
                            <div key={client.prefix} className="client-tile">
                                <div className="client-tile-header" style={{ borderLeftColor: COLORS[index % COLORS.length] }}>
                                    <h3>{client.prefix}</h3>
                                    <div className="client-total">
                                        <Activity size={18} />
                                        <span>{client.totalExpenses.toLocaleString()} expenses</span>
                                    </div>
                                </div>
                                <div className="client-tile-stats">
                                    <div className="client-stat success">
                                        <div className="stat-label"><CheckCircle size={16} /><span>Receipt Found</span></div>
                                        <div className="stat-values">
                                            <span className="count">{client.receiptReceived.toLocaleString()}</span>
                                            <span className="percentage">{client.receiptRate}%</span>
                                        </div>
                                    </div>
                                    <div className="client-stat failed">
                                        <div className="stat-label"><XCircle size={16} /><span>Receipt Not Found</span></div>
                                        <div className="stat-values">
                                            <span className="count">{client.receiptMissing.toLocaleString()}</span>
                                            <span className="percentage">{client.missingRate}%</span>
                                        </div>
                                    </div>
                                    <div className="client-stat info">
                                        <div className="stat-label"><FileCheck size={16} /><span>E-Receipt</span></div>
                                        <div className="stat-values">
                                            <span className="count">{client.eReceiptReceived?.toLocaleString() || 0}</span>
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
                        <h3>Expenses by Client</h3>
                        <p>Distribution of expenses across clients</p>
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
                        <h3>Receipt Status Breakdown</h3>
                        <p>Receipts received vs missing</p>
                    </div>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={receiptStatusData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                            <XAxis dataKey="status" stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
                            <YAxis stroke="var(--text-muted)" />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                                {receiptStatusData.map((entry, i) => (
                                    <Cell key={i} fill={STATUS_COLORS[entry.status] || '#3b82f6'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Stacked bar: per-client receipt vs missing */}
                <div className="chart-card chart-card-wide">
                    <div className="chart-header">
                        <h3>Receipts by Client</h3>
                        <p>Receipt received vs missing per client</p>
                    </div>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={receiptsByClient}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                            <XAxis dataKey="name" stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
                            <YAxis stroke="var(--text-muted)" />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="received" name="Receipt Found" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                            <Bar dataKey="not_attached" name="Receipt Not Found" stackId="a" fill="#ef4444" radius={[6, 6, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* ───── DETAILED RECORDS TREE ───── */}
            <div className="detail-section">
                <div className="section-header">
                    <Activity size={20} />
                    <h2>Detailed Expense Records</h2>
                    <span className="badge">{detailRows.length} entries</span>
                </div>

                <StatusFilter
                    statusFilter={statusFilter}
                    onStatusFilterChange={setStatusFilter}
                    options={[
                        { value: 'found', label: 'Found', color: 'green' },
                        { value: 'not_found', label: 'Not Found', color: 'red' },
                    ]}
                    totalCount={detailRows.length}
                    filteredCount={filteredDetailRows.length}
                    label="Filter by Receipt Status"
                />

                {filteredDetailRows.length === 0 && (
                    <div className="empty-state">
                        <AlertTriangle size={40} />
                        <p>No expense records found for the selected filters.</p>
                    </div>
                )}

                <div className="expense-tree">
                    {Object.entries(groupedDetails).map(([clientName, dates], ci) => {
                        const isClientExpanded = expandedClients[clientName];
                        const totalForClient = Object.values(dates).reduce((sum, rows) => sum + rows.length, 0);

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
                                        <span className="tree-run-count">{totalForClient} expenses</span>
                                        <span className="tree-run-count">{Object.keys(dates).length} dates</span>
                                    </div>
                                </div>

                                {isClientExpanded && (
                                    <div className="tree-runs">
                                        {Object.entries(dates).sort(([a], [b]) => b.localeCompare(a)).map(([dateStr, rows], di) => {
                                            const dateKey = `${clientName}__${dateStr}`;
                                            const isDateExpanded = expandedDates[dateKey];
                                            const receivedCount = rows.filter(r => r.Receipt_Filename).length;
                                            const notFoundCount = rows.filter(r => !r.Receipt_Filename).length;

                                            return (
                                                <div key={dateStr} className="tree-run">
                                                    <div className="tree-run-header" onClick={() => toggleDate(dateKey)}>
                                                        <div className="tree-connector"></div>
                                                        <div className="tree-toggle-sm">
                                                            {isDateExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                        </div>
                                                        <Calendar size={14} />
                                                        <span className="run-status-label">{dateStr || 'No Date'}</span>
                                                        <span className="tree-run-count">{rows.length} expenses</span>
                                                        <div className="tree-status-pills">
                                                            {receivedCount > 0 && <span className="pill success">{receivedCount} found</span>}
                                                            {notFoundCount > 0 && <span className="pill failed">{notFoundCount} not found</span>}
                                                        </div>
                                                    </div>

                                                    {isDateExpanded && (
                                                        <div className="tree-run-details">
                                                            <div className="detail-table-wrapper">
                                                                <table className="detail-table compact">
                                                                    <thead>
                                                                        <tr>
                                                                            <th>Report ID</th>
                                                                            <th>Expense ID</th>
                                                                            <th>Filename</th>
                                                                            <th>Receipt</th>
                                                                            <th>E-Receipt</th>
                                                                            <th>Submit Date</th>
                                                                            <th>Create Date</th>
                                                                            <th>Paid Date</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {rows.map((row, ri) => (
                                                                            <tr key={ri}>
                                                                                <td className="mono">{row.ReportV3_ID}</td>
                                                                                <td className="mono">{row.ExpenseV3_ID}</td>
                                                                                <td className="filename" title={row.filename}>{row.filename?.substring(0, 40)}{row.filename?.length > 40 ? '...' : ''}</td>
                                                                                <td>
                                                                                    {row.Receipt_Filename ? (
                                                                                        <span className="receipt-status has-receipt" title={row.Receipt_Filename}>
                                                                                            <CheckCircle size={14} /> Found
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span className="receipt-status no-receipt">
                                                                                            <XCircle size={14} /> Not Found
                                                                                        </span>
                                                                                    )}
                                                                                </td>
                                                                                <td>
                                                                                    {row.E_Receipt_Filename ? (
                                                                                        <span className="receipt-status has-receipt" title={row.E_Receipt_Filename}>
                                                                                            <CheckCircle size={14} /> Found
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span className="receipt-status no-ereceipt">
                                                                                            <FileMinus size={14} /> Not Found
                                                                                        </span>
                                                                                    )}
                                                                                </td>
                                                                                <td>{row.Report_Submit_Date} {row.Report_Submit_Time}</td>
                                                                                <td>{row.Report_Create_Date} {row.Report_Create_Time}</td>
                                                                                <td>{row.Report_Paid_Date || '—'}</td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
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
            </>)}
        </div>
    );
};

export default Expenses;
