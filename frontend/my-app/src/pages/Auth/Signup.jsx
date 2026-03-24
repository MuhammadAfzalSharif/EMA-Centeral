import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, AlertCircle } from 'lucide-react';
import api from '../../api/axios';
import './Auth.css';

const ALLOWED_DOMAINS = ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'live.com', 'msn.com', 'aol.com', 'icloud.com', 'mail.com', 'protonmail.com', 'zoho.com', 'qordata.com'];

const Signup = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        confirmPassword: '',
    });
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [fieldErrors, setFieldErrors] = useState({});
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const [touched, setTouched] = useState({});

    const validateEmail = (email) => {
        if (!email) return 'Email is required';
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) return 'Please enter a valid email address';
        const domain = email.split('@')[1]?.toLowerCase();
        if (!ALLOWED_DOMAINS.includes(domain)) return `Email domain "${domain}" is not allowed. Use Gmail, Outlook, Yahoo, etc.`;
        return '';
    };

    const validatePassword = (password) => {
        if (!password) return 'Password is required';
        if (password.length < 8) return `Password must be at least 8 characters (${password.length}/8)`;
        return '';
    };

    const validateConfirmPassword = (confirmPassword, password) => {
        if (!confirmPassword) return 'Please confirm your password';
        if (confirmPassword !== password) return 'Passwords do not match';
        return '';
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));

        // Clear field error on change
        const errors = { ...fieldErrors };
        if (name === 'email') errors.email = validateEmail(value);
        if (name === 'password') {
            errors.password = validatePassword(value);
            if (formData.confirmPassword) errors.confirmPassword = validateConfirmPassword(formData.confirmPassword, value);
        }
        if (name === 'confirmPassword') errors.confirmPassword = validateConfirmPassword(value, formData.password);
        setFieldErrors(errors);
    };

    const handleBlur = (e) => {
        setTouched(prev => ({ ...prev, [e.target.name]: true }));
        const { name, value } = e.target;
        const errors = { ...fieldErrors };
        if (name === 'email') errors.email = validateEmail(value);
        if (name === 'password') errors.password = validatePassword(value);
        if (name === 'confirmPassword') errors.confirmPassword = validateConfirmPassword(value, formData.password);
        setFieldErrors(errors);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        // Validate all fields
        const errors = {
            email: validateEmail(formData.email),
            password: validatePassword(formData.password),
            confirmPassword: validateConfirmPassword(formData.confirmPassword, formData.password),
        };
        setFieldErrors(errors);
        setTouched({ email: true, password: true, confirmPassword: true });

        if (errors.email || errors.password || errors.confirmPassword) return;

        setLoading(true);

        try {
            await api.post('/auth/signup', {
                email: formData.email,
                password: formData.password,
            });
            setSuccess('Account created successfully! Redirecting to login...');
            setTimeout(() => navigate('/login'), 1500);
        } catch (err) {
            setError(err.response?.data?.error || 'Signup failed. Please try again.');
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
                    <p className="auth-subtitle">Create your account to get started.</p>
                </div>

                <form onSubmit={handleSubmit} className="auth-form">
                    {error && <div className="auth-error"><AlertCircle size={16} />{error}</div>}
                    {success && <div className="auth-success">{success}</div>}

                    <div className={`form-group ${touched.email && fieldErrors.email ? 'has-error' : ''}`}>
                        <label htmlFor="email">Email</label>
                        <div className="input-wrapper">
                            <Mail className="input-icon" size={18} />
                            <input
                                type="email"
                                id="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                onBlur={handleBlur}
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
                                name="password"
                                value={formData.password}
                                onChange={handleChange}
                                onBlur={handleBlur}
                                placeholder="Create a password (min 8 characters)"
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
                        {touched.password && !fieldErrors.password && formData.password && (
                            <span className="field-success">Password strength: OK</span>
                        )}
                    </div>

                    <div className={`form-group ${touched.confirmPassword && fieldErrors.confirmPassword ? 'has-error' : ''}`}>
                        <label htmlFor="confirmPassword">Confirm Password</label>
                        <div className="input-wrapper">
                            <Lock className="input-icon" size={18} />
                            <input
                                type={showConfirmPassword ? 'text' : 'password'}
                                id="confirmPassword"
                                name="confirmPassword"
                                value={formData.confirmPassword}
                                onChange={handleChange}
                                onBlur={handleBlur}
                                placeholder="Confirm your password"
                                required
                            />
                            <button
                                type="button"
                                className="toggle-password"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            >
                                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                        {touched.confirmPassword && fieldErrors.confirmPassword && (
                            <span className="field-error"><AlertCircle size={14} />{fieldErrors.confirmPassword}</span>
                        )}
                    </div>

                    <button type="submit" className="auth-btn" disabled={loading}>
                        {loading ? 'Creating Account...' : 'Sign Up'}
                    </button>

                    <p className="auth-switch">
                        Already have an account? <Link to="/login">Sign In</Link>
                    </p>
                </form>
            </div>
        </div>
    );
};

export default Signup;
