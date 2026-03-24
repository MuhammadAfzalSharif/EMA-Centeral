const express = require('express');
const sql = require('mssql');
const jwt = require('jsonwebtoken');
const dbConfig = require('../config/db');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'ema-central-job-monitoring-secret-2026';
const TOKEN_EXPIRY = '24h';

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // Validate email format and domain
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Please enter a valid email address' });
        }
        const allowedDomains = ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'live.com', 'msn.com', 'aol.com', 'icloud.com', 'mail.com', 'protonmail.com', 'zoho.com', 'qordata.com'];
        const emailDomain = email.split('@')[1]?.toLowerCase();
        if (!allowedDomains.includes(emailDomain)) {
            return res.status(400).json({ error: `Email domain "${emailDomain}" is not allowed. Please use a valid email provider (Gmail, Outlook, Yahoo, etc.)` });
        }

        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        let pool = await sql.connect(dbConfig);

        // Check if user already exists
        const existing = await pool.request()
            .input('email', sql.NVarChar, email)
            .query('SELECT UserId FROM dbo.User_Credentials WHERE Email = @email');

        if (existing.recordset.length > 0) {
            return res.status(409).json({ error: 'An account with this email already exists' });
        }

        // Insert user (storing password directly as requested)
        await pool.request()
            .input('email', sql.NVarChar, email)
            .input('password', sql.NVarChar, password)
            .query('INSERT INTO dbo.User_Credentials (Email, HashPass) VALUES (@email, @password)');

        res.status(201).json({ message: 'Account created successfully' });
    } catch (err) {
        console.error('Signup error:', err);
        res.status(500).json({ error: 'Failed to create account', details: err.message });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        let pool = await sql.connect(dbConfig);

        const result = await pool.request()
            .input('email', sql.NVarChar, email)
            .input('password', sql.NVarChar, password)
            .query('SELECT UserId, Email FROM dbo.User_Credentials WHERE Email = @email AND HashPass = @password');

        if (result.recordset.length === 0) {
            // Check if user exists at all to give a better message
            const userExists = await pool.request()
                .input('emailCheck', sql.NVarChar, email)
                .query('SELECT UserId FROM dbo.User_Credentials WHERE Email = @emailCheck');

            if (userExists.recordset.length === 0) {
                return res.status(401).json({ error: 'No account found with this email. Please sign up first.' });
            }
            return res.status(401).json({ error: 'Incorrect password. Please try again.' });
        }

        const user = result.recordset[0];

        // Generate JWT token (24 hour expiry)
        const token = jwt.sign(
            { userId: user.UserId, email: user.Email },
            JWT_SECRET,
            { expiresIn: TOKEN_EXPIRY }
        );

        res.json({
            message: 'Login successful',
            token,
            user: { userId: user.UserId, email: user.Email }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Login failed', details: err.message });
    }
});

// GET /api/auth/verify — verify if token is still valid
router.get('/verify', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ valid: false });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        res.json({ valid: true, user: { userId: decoded.userId, email: decoded.email } });
    } catch (err) {
        res.status(401).json({ valid: false });
    }
});

module.exports = router;
