const express = require('express');
const sql = require('mssql');
const dbConfig = require('../config/db');

const router = express.Router();

// Get all unique clients from Db_Job_Name table
router.get('/', async (req, res) => {
    try {
        let pool = await sql.connect(dbConfig);
        let result = await pool.request().query(`
            SELECT job_name, db_name, isEnabled
            FROM Db_Job_Name
            WHERE isEnabled = 1
            ORDER BY job_name
        `);

        const clients = result.recordset.map(row => {
            // Clean % wildcards from job_name to get readable client name
            const cleanName = row.job_name.replace(/%/g, '_');
            const match = cleanName.match(/Expense_Report_Audit_(.+)/i);
            const clientName = match ? match[1].replace(/_$/, '') : cleanName;
            
            return {
                client: clientName,
                job_name: row.job_name,
                db_name: row.db_name
            };
        });

        res.json(clients);
    } catch (err) {
        console.error('Client fetch error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
