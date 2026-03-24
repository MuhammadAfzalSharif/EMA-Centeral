import { useEffect } from 'react';
import { AlertCircle, CheckCircle, X } from 'lucide-react';
import './Toast.css';

const Toast = ({ id, type, message, onClose, duration = 4000 }) => {
    useEffect(() => {
        const timer = setTimeout(onClose, duration);
        return () => clearTimeout(timer);
    }, [onClose, duration]);

    const isError = type === 'error';
    const isSuccess = type === 'success';

    return (
        <div className={`toast ${type}`}>
            <div className="toast-icon">
                {isError && <AlertCircle size={20} />}
                {isSuccess && <CheckCircle size={20} />}
            </div>
            <div className="toast-content">
                <p className="toast-message">{message}</p>
            </div>
            <button className="toast-close" onClick={onClose}>
                <X size={16} />
            </button>
        </div>
    );
};

export default Toast;
