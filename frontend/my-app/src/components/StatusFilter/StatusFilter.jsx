import { Filter, X } from 'lucide-react';
import './StatusFilter.css';

/**
 * Reusable Status Filter component for detail tables.
 *
 * Props:
 *  - statusFilter: string  — current selected filter value ('' = All)
 *  - onStatusFilterChange: (value: string) => void
 *  - options: Array<{ value: string, label: string, color: 'green'|'red'|'cyan'|'orange'|'blue' }>
 *  - totalCount: number  — total rows before filtering
 *  - filteredCount: number  — rows after filtering
 *  - label?: string  — label text (default: "Filter by Status")
 */
const StatusFilter = ({
    statusFilter,
    onStatusFilterChange,
    options,
    totalCount,
    filteredCount,
    label = 'Filter by Status',
}) => {
    return (
        <div className="status-filter-bar">
            <div className="status-filter-left">
                <Filter size={16} className="status-filter-icon" />
                <span className="status-filter-label">{label}</span>
                <div className="status-filter-buttons">
                    <button
                        className={`status-btn ${statusFilter === '' ? 'active all' : ''}`}
                        onClick={() => onStatusFilterChange('')}
                    >
                        All
                    </button>
                    {options.map(opt => (
                        <button
                            key={opt.value}
                            className={`status-btn ${statusFilter === opt.value ? `active ${opt.color}` : ''}`}
                            onClick={() => onStatusFilterChange(opt.value)}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="status-filter-right">
                {statusFilter && (
                    <button className="status-clear-btn" onClick={() => onStatusFilterChange('')}>
                        <X size={14} />
                        Clear
                    </button>
                )}
                <span className="status-filter-count">
                    {statusFilter
                        ? `${filteredCount.toLocaleString()} of ${totalCount.toLocaleString()}`
                        : `${totalCount.toLocaleString()} total`}
                </span>
            </div>
        </div>
    );
};

export default StatusFilter;
