const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// CORS configuration - allow multiple origins
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:5174'],
    credentials: true
}));

app.use(express.json());

// Routes
const authRoutes = require('./routes/auth');
const authMiddleware = require('./middleware/auth');
const dataRoutes = require('./routes/data');
const dashboardRoutes = require('./routes/dashboard');
const clientsRoutes = require('./routes/clients');
const expensesRoutes = require('./routes/expenses');
const reconciliationRoutes = require('./routes/reconciliation');
const qderaRoutes = require('./routes/qdera');
const flagcheckRoutes = require('./routes/flagcheck');
const receiptcategorizationRoutes = require('./routes/receiptcategorization');
const testRoutes = require('./routes/test');

// Public routes (no auth required)
app.use('/api/auth', authRoutes);

// Protected routes (require valid JWT)
app.use('/api', authMiddleware, dataRoutes);
app.use('/api/dashboard', authMiddleware, dashboardRoutes);
app.use('/api/clients', authMiddleware, clientsRoutes);
app.use('/api/expenses', authMiddleware, expensesRoutes);
app.use('/api/reconciliation', authMiddleware, reconciliationRoutes);
app.use('/api/qdera', authMiddleware, qderaRoutes);
app.use('/api/flagcheck', authMiddleware, flagcheckRoutes);
app.use('/api/receiptcategorization', authMiddleware, receiptcategorizationRoutes);
app.use('/api', authMiddleware, testRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));