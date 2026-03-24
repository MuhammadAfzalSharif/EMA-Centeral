import { Calendar, ChevronDown, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchClients } from '../../api/queries';
import './DateFilter.css';

const DateFilter = ({
    // Controlled filter state (managed by parent)
    filterType,
    selectedClient,
    selectedDate,
    selectedMonth,
    selectedYear,
    fromDate,
    toDate,
    // Callbacks
    onFilterTypeChange,
    onClientChange,
    onDateChange,
    onMonthChange,
    onYearChange,
    onFromDateChange,
    onToDateChange,
    onReset,
    newJobsButton
}) => {
    const { data: clients } = useQuery({
        queryKey: ['clients'],
        queryFn: fetchClients,
    });

    const currentYear = parseInt(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' }).split('-')[0]);
    const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
    const months = [
        { value: '01', label: 'January' },
        { value: '02', label: 'February' },
        { value: '03', label: 'March' },
        { value: '04', label: 'April' },
        { value: '05', label: 'May' },
        { value: '06', label: 'June' },
        { value: '07', label: 'July' },
        { value: '08', label: 'August' },
        { value: '09', label: 'September' },
        { value: '10', label: 'October' },
        { value: '11', label: 'November' },
        { value: '12', label: 'December' }
    ];

    // Get display text for current filter
    const getFilterSummary = () => {
        let summary = [];
        if (selectedClient) {
            summary.push(`Client: ${selectedClient}`);
        }
        if (filterType === 'day' && selectedDate) {
            summary.push(`Date: ${selectedDate}`);
        } else if (filterType === 'month' && selectedMonth) {
            const monthLabel = months.find(m => m.value === selectedMonth)?.label || selectedMonth;
            summary.push(`${monthLabel} ${selectedYear}`);
        } else if (filterType === 'year') {
            summary.push(`Year: ${selectedYear}`);
        } else if (filterType === 'range' && fromDate && toDate) {
            summary.push(`${fromDate} to ${toDate}`);
        } else if (filterType === 'all') {
            summary.push('All Time');
        }
        return summary.join(' | ');
    };

    return (
        <div className="date-filter">
            {newJobsButton && (
                <div className="filter-action-button">
                    {newJobsButton}
                </div>
            )}
            <div className="filter-header">
                <Calendar size={20} />
                <h3>Filter Data</h3>
                <span className="filter-summary">{getFilterSummary()}</span>
            </div>
            
            <div className="filter-controls">
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
                                onChange={(e) => onClientChange(e.target.value)}
                                className="select-input"
                            >
                                <option value="">All Clients</option>
                                {clients?.map((c, idx) => (
                                    <option key={idx} value={c.client}>
                                        {c.client}
                                    </option>
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
                        <button
                            type="button"
                            className={`filter-type-btn ${filterType === 'all' ? 'active' : ''}`}
                            onClick={() => onFilterTypeChange('all')}
                        >
                            All Time
                        </button>
                        <button
                            type="button"
                            className={`filter-type-btn ${filterType === 'day' ? 'active' : ''}`}
                            onClick={() => onFilterTypeChange('day')}
                        >
                            By Day
                        </button>
                        <button
                            type="button"
                            className={`filter-type-btn ${filterType === 'month' ? 'active' : ''}`}
                            onClick={() => onFilterTypeChange('month')}
                        >
                            By Month
                        </button>
                        <button
                            type="button"
                            className={`filter-type-btn ${filterType === 'year' ? 'active' : ''}`}
                            onClick={() => onFilterTypeChange('year')}
                        >
                            By Year
                        </button>
                        <button
                            type="button"
                            className={`filter-type-btn ${filterType === 'range' ? 'active' : ''}`}
                            onClick={() => onFilterTypeChange('range')}
                        >
                            By Range
                        </button>
                    </div>

                    <div className="filter-inputs">
                        {filterType === 'day' && (
                            <div className="input-group">
                                <label>Select Date</label>
                                <input
                                    type="date"
                                    value={selectedDate}
                                    onChange={(e) => onDateChange(e.target.value)}
                                    max={new Date().toISOString().split('T')[0]}
                                    className="date-input"
                                />
                            </div>
                        )}

                        {filterType === 'range' && (
                            <div className="input-row">
                                <div className="input-group">
                                    <label>From Date</label>
                                    <input
                                        type="date"
                                        value={fromDate}
                                        onChange={(e) => onFromDateChange(e.target.value)}
                                        max={toDate || new Date().toISOString().split('T')[0]}
                                        className="date-input"
                                    />
                                </div>
                                <div className="input-group">
                                    <label>To Date</label>
                                    <input
                                        type="date"
                                        value={toDate}
                                        onChange={(e) => onToDateChange(e.target.value)}
                                        min={fromDate}
                                        max={new Date().toISOString().split('T')[0]}
                                        className="date-input"
                                    />
                                </div>
                            </div>
                        )}
                        
                        {filterType === 'month' && (
                            <div className="input-row">
                                <div className="input-group">
                                    <label>Month</label>
                                    <div className="select-wrapper">
                                        <select
                                            value={selectedMonth}
                                            onChange={(e) => onMonthChange(e.target.value)}
                                            className="select-input"
                                        >
                                            <option value="">Select Month</option>
                                            {months.map(m => (
                                                <option key={m.value} value={m.value}>{m.label}</option>
                                            ))}
                                        </select>
                                        <ChevronDown size={16} className="select-icon" />
                                    </div>
                                </div>
                                <div className="input-group">
                                    <label>Year</label>
                                    <div className="select-wrapper">
                                        <select
                                            value={selectedYear}
                                            onChange={(e) => onYearChange(e.target.value)}
                                            className="select-input"
                                        >
                                            {years.map(y => (
                                                <option key={y} value={y}>{y}</option>
                                            ))}
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
                                    <select
                                        value={selectedYear}
                                        onChange={(e) => onYearChange(e.target.value)}
                                        className="select-input"
                                    >
                                        {years.map(y => (
                                            <option key={y} value={y}>{y}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={16} className="select-icon" />
                                </div>
                            </div>
                        )}

                        {(filterType !== 'all' || selectedClient) && (
                            <button type="button" className="reset-btn" onClick={onReset}>
                                Reset All Filters
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DateFilter;
