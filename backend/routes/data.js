const express = require('express');
const sql = require('mssql');
const dbConfig = require('../config/db');

const router = express.Router();

// Route to fetch jobs with optional date and client filtering
router.get('/jobs', async (req, res) => {
    try {
        const { type, date, month, year, client } = req.query;
        let pool = await sql.connect(dbConfig);

        // PKT date = RunDate + Run_time (UTC HHMMSS) + 5 hours
        const pktDate = `CONVERT(DATE, DATEADD(SECOND,
            (ISNULL(Run_time,0)/10000)*3600 + ((ISNULL(Run_time,0)/100)%100)*60 + (ISNULL(Run_time,0)%100) + 18000,
            CAST(RunDate AS DATETIME)))`;

        let query = "SELECT * FROM jobs_details";
        let conditions = [];
        
        // Date filtering uses PKT-converted date so midnight-crossover jobs appear on the correct day
        if (type === 'day' && date) {
            // Pre-filter on UTC RunDate for index usage, then exact PKT filter
            conditions.push(`RunDate BETWEEN DATEADD(DAY, -1, '${date}') AND '${date}'`);
            conditions.push(`${pktDate} = '${date}'`);
        } else if (type === 'month' && month && year) {
            conditions.push(`YEAR(${pktDate}) = ${parseInt(year)} AND MONTH(${pktDate}) = ${parseInt(month)}`);
        } else if (type === 'year' && year) {
            conditions.push(`YEAR(${pktDate}) = ${parseInt(year)}`);
        }
        
        // Add client filtering - client name is in JobName column
        if (client) {
            const clientPattern = client.replace(/'/g, "''");
            conditions.push(`JobName LIKE '%${clientPattern}%'`);
        }
        
        if (conditions.length > 0) {
            query += ` WHERE ${conditions.join(' AND ')}`;
        }
        
        query += " ORDER BY RunDate DESC, Run_time DESC";
        
        let result = await pool.request().query(query);
        res.json(result.recordset);
    } catch (err) {
        console.error('Jobs fetch error:', err);
        res.status(500).send(err.message);
    }
});

module.exports = router;
