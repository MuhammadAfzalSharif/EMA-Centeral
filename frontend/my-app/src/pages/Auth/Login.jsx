import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, AlertCircle } from 'lucide-react';
import api from '../../api/axios';
import './Auth.css';

const Login = () => {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [fieldErrors, setFieldErrors] = useState({});
    const [touched, setTouched] = useState({});

    const handleBlur = (field) => {
        setTouched(prev => ({ ...prev, [field]: true }));
        const errors = { ...fieldErrors };
        if (field === 'email') {
            if (!email) errors.email = 'Email is required';
            else {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                errors.email = emailRegex.test(email) ? '' : 'Please enter a valid email address';
            }
        }
        if (field === 'password') {
            errors.password = !password ? 'Password is required' : '';
        }
        setFieldErrors(errors);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        // Validate
        const errors = {};
        if (!email) errors.email = 'Email is required';
        else {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) errors.email = 'Please enter a valid email address';
        }
        if (!password) errors.password = 'Password is required';

        setFieldErrors(errors);
        setTouched({ email: true, password: true });

        if (errors.email || errors.password) return;

        setLoading(true);

        try {
            const res = await api.post('/auth/login', { email, password });
            localStorage.setItem('token', res.data.token);
            localStorage.setItem('user', JSON.stringify(res.data.user));
            navigate('/jobs');
        } catch (err) {
            console.error('Login error:', err);
            const errorMsg = err.response?.data?.error || 'Invalid credentials. Please try again.';
            setError(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-header">
                    <div className="auth-logo">
                        <span className="logo-icon">⚡</span>
                        <h1>EMA Central Job Monitoring</h1>
                    </div>
                    <p className="auth-subtitle">Welcome back! Please login to continue.</p>
                </div>

                <form onSubmit={handleSubmit} className="auth-form">
                    {error && (
                        <div className="auth-error">
                            <AlertCircle size={16} />
                            <span>{error}</span>
                            {error.includes('sign up') && (
                                <Link to="/signup" className="error-action-link">Sign Up Now</Link>
                            )}
                        </div>
                    )}

                    <div className={`form-group ${touched.email && fieldErrors.email ? 'has-error' : ''}`}>
                        <label htmlFor="email">Email</label>
                        <div className="input-wrapper">
                            <Mail className="input-icon" size={18} />
                            <input
                                type="email"
                                id="email"
                                value={email}
                                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                                onBlur={() => handleBlur('email')}
                                placeholder="Enter your email"
                                required
                            />
                        </div>
                        {touched.email && fieldErrors.email && (
                            <span className="field-error"><AlertCircle size={14} />{fieldErrors.email}</span>
                        )}
                    </div>

                    <div className={`form-group ${touched.password && fieldErrors.password ? 'has-error' : ''}`}>
                        <label htmlFor="password">Password</label>
                        <div className="input-wrapper">
                            <Lock className="input-icon" size={18} />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                id="password"
                                value={password}
                                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                                onBlur={() => handleBlur('password')}
                                placeholder="Enter your password"
                                required
                            />
                            <button
                                type="button"
                                className="toggle-password"
                                onClick={() => setShowPassword(!showPassword)}
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                        {touched.password && fieldErrors.password && (
                            <span className="field-error"><AlertCircle size={14} />{fieldErrors.password}</span>
                        )}
                    </div>

                    <button type="submit" className="auth-btn" disabled={loading}>
                        {loading ? 'Signing in...' : 'Sign In'}
                    </button>

                    <p className="auth-switch">
                        Don't have an account? <Link to="/signup">Sign Up</Link>
                    </p>
                </form>
            </div>
        </div>
    );
};

export default Login;
