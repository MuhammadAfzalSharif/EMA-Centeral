const express = require('express');
const sql = require('mssql');
const dbConfig = require('../config/db');

const router = express.Router();

// Test database connection
router.get('/test', async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        
        // Test basic query
        let result = await pool.request().query("SELECT TOP 5 * FROM jobs_details");
        
        // Get table structure
        let columns = await pool.request().query(`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'jobs_details'
            ORDER BY ORDINAL_POSITION
        `);
        
        res.json({
            success: true,
            message: 'Database connection successful',
            sampleData: result.recordset,
            tableColumns: columns.recordset
        });
    } catch (err) {
        console.error('Test endpoint error:', err);
        res.status(500).json({ 
            success: false, 
            error: err.message,
            details: err.toString()
        });
    }
});

module.exports = router;
