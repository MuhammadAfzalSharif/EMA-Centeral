const express = require('express');
const sql = require('mssql');
const dbConfig = require('../config/db');

const router = express.Router();

// ──────────────────────────────────────────────────────────────
// Helper: Discover all expense databases and their tables/prefixes
// dynamically from sys.databases + file_specs
// ──────────────────────────────────────────────────────────────
async function discoverClients(pool) {
    const discoverSql = `
        SET NOCOUNT ON;

        IF OBJECT_ID('tempdb..#AllDatabaseData') IS NOT NULL DROP TABLE #AllDatabaseData;
        CREATE TABLE #AllDatabaseData (
            SourceDB NVARCHAR(255),
            prefix NVARCHAR(255),
            [desc] NVARCHAR(255),
            table_name NVARCHAR(255)
        );

        DECLARE @Sql_GetDBs NVARCHAR(MAX) = '';

        SELECT @Sql_GetDBs = @Sql_GetDBs +
            'SELECT ''' + db_name + ''', prefix, [desc], (''LZ_2022_''+prefix) FROM ' +
            QUOTENAME(db_name) + '.dbo.[file_specs] WHERE prefix LIKE ''%Extract%'' AND prefix != ''Extract_syneos'' UNION ALL '
        FROM (SELECT DISTINCT db_name FROM ema_support_module.dbo.Db_Job_Name_Concure_vs_Receipts WHERE isEnabled = 1) dbs;

        IF @Sql_GetDBs != ''
        BEGIN
            SET @Sql_GetDBs = 'INSERT INTO #AllDatabaseData (SourceDB, prefix, [desc], table_name) ' +
                              LEFT(@Sql_GetDBs, LEN(@Sql_GetDBs) - 10);
            EXEC sp_executesql @Sql_GetDBs;
        END

        SELECT SourceDB, prefix, [desc], table_name FROM #AllDatabaseData ORDER BY prefix;

        DROP TABLE #AllDatabaseData;
    `;

    const result = await pool.request().query(discoverSql);
    return result.recordset || [];
}

// ──────────────────────────────────────────────────────────────
// GET /api/expenses/clients - dynamically discovered from DB
// ──────────────────────────────────────────────────────────────
router.get('/clients', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const configs = await discoverClients(pool);

        const clients = configs.map(c => ({
            client: c.prefix,
            database_name: c.SourceDB,
            description: c.desc,
            table_name: c.table_name,
        }));

        res.json(clients);
    } catch (err) {
        console.error('Client discovery error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/expenses/stats - main expense vs receipt stats
// Uses temp table approach: build entire SQL as ONE batch so #temp stays in scope
router.get('/stats', async (req, res) => {
    try {
        const { fromDate, toDate, client, dateType, type, date, month, year } = req.query;
        // dateType: 'create', 'submit', or 'paid' → maps to flag 0, 1, or 2
        const flag = dateType === 'submit' ? 1 : dateType === 'paid' ? 2 : 0;

        // Build date range from filter params
        let d1, d2;
        if (type === 'range' && fromDate && toDate) {
            d1 = fromDate;
            d2 = toDate;
        } else if (type === 'day' && date) {
            d1 = date;
            d2 = date;
        } else if (type === 'month' && month && year) {
            d1 = `${year}-${month}-01`;
            const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
            d2 = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
        } else if (type === 'year' && year) {
            d1 = `${year}-01-01`;
            d2 = `${year}-12-31`;
        } else if (type === 'all') {
             d1 = '2000-01-01';
             d2 = '2099-12-31';
        } else {
            // Default: today
            const now = new Date();
            d1 = now.toISOString().split('T')[0];
            d2 = d1;
        }

        console.log(`Expenses stats: flag=${flag}, d1=${d1}, d2=${d2}, client=${client || 'ALL'}`);

        const pool = await sql.connect(dbConfig);


        // Determine which date column to use for aggregation
        const dateCol = flag === 2 ? 'Report_Paid_Date' : flag === 1 ? 'Report_Submit_Date' : 'Report_Create_Date';

        // ══════════════════════════════════════════════════════════════════
        // Fully dynamic: discover databases from sys.databases,
        // get table/prefix from file_specs, build UNION ALL, execute once
        // ══════════════════════════════════════════════════════════════════
        const batchSql = `
            SET NOCOUNT ON;

            -- ── Step 1: Result temp table ──
            IF OBJECT_ID('tempdb..#expense_receipt_results') IS NOT NULL
                DROP TABLE #expense_receipt_results;

            CREATE TABLE #expense_receipt_results (
                DatabaseName        NVARCHAR(255),
                filename            NVARCHAR(MAX),
                prefix              NVARCHAR(100),
                ReportV3_ID         NVARCHAR(255),
                ExpenseV3_ID        NVARCHAR(255),
                Report_Submit_Date  VARCHAR(50),
                Report_Create_Date  VARCHAR(50),
                Report_Paid_Date    VARCHAR(50),
                Receipt_Filename    NVARCHAR(MAX),
                E_Receipt_Filename  NVARCHAR(MAX)
            );

            -- ── Step 2: Discover all databases and their file_specs ──
            IF OBJECT_ID('tempdb..#AllDatabaseData') IS NOT NULL DROP TABLE #AllDatabaseData;
            CREATE TABLE #AllDatabaseData (
                SourceDB NVARCHAR(255),
                prefix NVARCHAR(255),
                [desc] NVARCHAR(255),
                table_name NVARCHAR(255)
            );

            DECLARE @Sql_GetDBs NVARCHAR(MAX) = '';

            SELECT @Sql_GetDBs = @Sql_GetDBs +
                'SELECT ''' + db_name + ''', prefix, [desc], (''LZ_2022_''+prefix) FROM ' +
                QUOTENAME(db_name) + '.dbo.[file_specs] WHERE prefix LIKE ''%Extract%'' AND prefix != ''Extract_syneos'' UNION ALL '
            FROM (SELECT DISTINCT db_name FROM Db_Job_Name_Concure_vs_Receipts WHERE isEnabled = 1) dbs;

            IF @Sql_GetDBs != ''
            BEGIN
                SET @Sql_GetDBs = 'INSERT INTO #AllDatabaseData (SourceDB, prefix, [desc], table_name) ' +
                                  LEFT(@Sql_GetDBs, LEN(@Sql_GetDBs) - 10);
                EXEC sp_executesql @Sql_GetDBs;
            END

            -- ── Step 3: Build UNION ALL query from discovered data ──
            DECLARE @Sql_Main NVARCHAR(MAX) = '';

            SET @Sql_Main = 'INSERT INTO #expense_receipt_results ';

            SELECT @Sql_Main = @Sql_Main +
                'SELECT DISTINCT
                    ''' + SourceDB + ''' AS DatabaseName,
                    l.filename AS Filename,
                    ''' + prefix + ''' AS Prefix,
                    l.ReportV3_ID,
                    l.ExpenseV3_ID,
                    SUBSTRING(l.ReportV3_SubmitDate, 1, 10),
                    SUBSTRING(l.ReportV3_CreateDate, 1, 10),
                    SUBSTRING(l.reportv3_paiddate, 1, 10),
                    c.filename AS Receipt_Filename,
                    e.filename AS E_Receipt_Filename
                FROM ' + QUOTENAME(SourceDB) + '.dbo.' + QUOTENAME(table_name) + ' l

                LEFT JOIN (
                    SELECT
                        CASE WHEN CHARINDEX(''_'', FileName) > 0
                             THEN LEFT(FileName, CHARINDEX(''_'', FileName) - 1)
                        END AS ReportID,
                        CASE
                            WHEN CHARINDEX(''_'', FileName) > 0
                             AND CHARINDEX(''_'', FileName, CHARINDEX(''_'', FileName) + 1) > 0
                            THEN SUBSTRING(FileName,
                                CHARINDEX(''_'', FileName, CHARINDEX(''_'', FileName) + 1) + 1,
                                CHARINDEX(''_'', FileName,
                                    CHARINDEX(''_'', FileName, CHARINDEX(''_'', FileName) + 1) + 1)
                                - CHARINDEX(''_'', FileName, CHARINDEX(''_'', FileName) + 1) - 1)
                        END AS ExpenseID,
                        filename,
                        ROW_NUMBER() OVER(PARTITION BY
                            CASE WHEN CHARINDEX(''_'', FileName) > 0
                                 THEN LEFT(FileName, CHARINDEX(''_'', FileName) - 1)
                            END,
                            CASE
                                WHEN CHARINDEX(''_'', FileName) > 0
                                 AND CHARINDEX(''_'', FileName, CHARINDEX(''_'', FileName) + 1) > 0
                                THEN SUBSTRING(FileName,
                                    CHARINDEX(''_'', FileName, CHARINDEX(''_'', FileName) + 1) + 1,
                                    CHARINDEX(''_'', FileName,
                                        CHARINDEX(''_'', FileName, CHARINDEX(''_'', FileName) + 1) + 1)
                                    - CHARINDEX(''_'', FileName, CHARINDEX(''_'', FileName) + 1) - 1)
                            END,
                             CASE
    WHEN CHARINDEX(''_'', REVERSE(FileName)) > 1
     AND CHARINDEX(''T'', RIGHT(FileName, CHARINDEX(''_'', REVERSE(FileName)) - 1)) > 1
    THEN LEFT(
        RIGHT(FileName, CHARINDEX(''_'', REVERSE(FileName)) - 1),
        CHARINDEX(''T'', RIGHT(FileName, CHARINDEX(''_'', REVERSE(FileName)) - 1)) - 1
    )
    ELSE NULL
END 
                            ORDER BY ID DESC) AS rn,
                            CASE
                                WHEN CHARINDEX(''_'', REVERSE(FileName)) > 1
                                 AND CHARINDEX(''T'', RIGHT(FileName, CHARINDEX(''_'', REVERSE(FileName)) - 1)) > 1
                                THEN LEFT(
                                    RIGHT(FileName, CHARINDEX(''_'', REVERSE(FileName)) - 1),
                                    CHARINDEX(''T'', RIGHT(FileName, CHARINDEX(''_'', REVERSE(FileName)) - 1)) - 1
                                )
                                ELSE NULL
                            END AS Extracted_Date
                    FROM ' + QUOTENAME(SourceDB) + '.dbo.tbl_AuditLogs_Receipt
                    WHERE FileName LIKE ''%_%_%_%'' AND status = 1
                ) c ON l.ReportV3_ID = c.ReportID AND l.ExpenseV3_ID = c.ExpenseID AND c.rn = 1
                  AND c.Extracted_Date = SUBSTRING(l.ReportV3_SubmitDate, 1, 10)

                LEFT JOIN (
                    SELECT
                        CASE WHEN CHARINDEX(''_'', FileName) > 0
                             THEN LEFT(FileName, CHARINDEX(''_'', FileName) - 1)
                        END AS ReportID,
                        CASE
                            WHEN CHARINDEX(''_'', FileName) > 0
                             AND CHARINDEX(''_'', FileName, CHARINDEX(''_'', FileName) + 1) > 0
                            THEN SUBSTRING(FileName,
                                CHARINDEX(''_'', FileName, CHARINDEX(''_'', FileName) + 1) + 1,
                                CHARINDEX(''_'', FileName,
                                    CHARINDEX(''_'', FileName, CHARINDEX(''_'', FileName) + 1) + 1)
                                - CHARINDEX(''_'', FileName, CHARINDEX(''_'', FileName) + 1) - 1)
                        END AS ExpenseID,
                        filename,
                        ROW_NUMBER() OVER(PARTITION BY
                            CASE WHEN CHARINDEX(''_'', FileName) > 0
                                 THEN LEFT(FileName, CHARINDEX(''_'', FileName) - 1)
                            END,
                            CASE
                                WHEN CHARINDEX(''_'', FileName) > 0
                                 AND CHARINDEX(''_'', FileName, CHARINDEX(''_'', FileName) + 1) > 0
                                THEN SUBSTRING(FileName,
                                    CHARINDEX(''_'', FileName, CHARINDEX(''_'', FileName) + 1) + 1,
                                    CHARINDEX(''_'', FileName,
                                        CHARINDEX(''_'', FileName, CHARINDEX(''_'', FileName) + 1) + 1)
                                    - CHARINDEX(''_'', FileName, CHARINDEX(''_'', FileName) + 1) - 1)
                            END,
                             CASE
    WHEN CHARINDEX(''_'', REVERSE(FileName)) > 1
     AND CHARINDEX(''T'', RIGHT(FileName, CHARINDEX(''_'', REVERSE(FileName)) - 1)) > 1
    THEN LEFT(
        RIGHT(FileName, CHARINDEX(''_'', REVERSE(FileName)) - 1),
        CHARINDEX(''T'', RIGHT(FileName, CHARINDEX(''_'', REVERSE(FileName)) - 1)) - 1
    )
    ELSE NULL
END 
                            ORDER BY ID DESC) AS rn,
                            CASE
                                WHEN CHARINDEX(''_'', REVERSE(FileName)) > 1
                                 AND CHARINDEX(''T'', RIGHT(FileName, CHARINDEX(''_'', REVERSE(FileName)) - 1)) > 1
                                THEN LEFT(
                                    RIGHT(FileName, CHARINDEX(''_'', REVERSE(FileName)) - 1),
                                    CHARINDEX(''T'', RIGHT(FileName, CHARINDEX(''_'', REVERSE(FileName)) - 1)) - 1
                                )
                                ELSE NULL
                            END AS Extracted_Date

                    FROM ' + QUOTENAME(SourceDB) + '.dbo.tbl_AuditLogs_E_Receipt
                    WHERE status = 1
                ) e ON l.ReportV3_ID = e.ReportID AND l.ExpenseV3_ID = e.ExpenseID AND e.rn = 1
                  AND e.Extracted_Date = SUBSTRING(l.ReportV3_SubmitDate, 1, 10)


                WHERE 1=1
                  AND (
                      (@flag = 1 AND CAST(SUBSTRING(l.ReportV3_SubmitDate, 1, 10) AS DATE) BETWEEN @d1 AND @d2)
                      OR
                      (@flag = 0 AND CAST(SUBSTRING(l.ReportV3_CreateDate, 1, 10) AS DATE) BETWEEN @d1 AND @d2)
                      or 
                      (@flag = 2 AND CAST(SUBSTRING(l.reportv3_paiddate , 1, 10) AS DATE) BETWEEN @d1 AND @d2)
                  )
                UNION ALL '
            FROM #AllDatabaseData
            WHERE (@clientFilter IS NULL OR prefix = @clientFilter);

            -- ── Step 4: Execute the UNION ALL query ──
            IF LEN(@Sql_Main) > 50
            BEGIN
                SET @Sql_Main = LEFT(@Sql_Main, LEN(@Sql_Main) - 10);

                EXEC sp_executesql @Sql_Main,
                     N'@flag INT, @d1 DATE, @d2 DATE',
                     @flag = ${flag}, @d1 = @d1, @d2 = @d2;
            END

            -- ── Step 5: Aggregated results ──

            -- Result Set 1: Grand Totals
            SELECT
                COUNT(*) AS totalExpenses,
                SUM(CASE WHEN Receipt_Filename IS NOT NULL THEN 1 ELSE 0 END) AS totalReceiptReceived,
                SUM(CASE WHEN Receipt_Filename IS NULL     THEN 1 ELSE 0 END) AS totalReceiptMissing,
                SUM(CASE WHEN E_Receipt_Filename IS NOT NULL THEN 1 ELSE 0 END) AS totalEReceiptReceived,
                SUM(CASE WHEN E_Receipt_Filename IS NULL     THEN 1 ELSE 0 END) AS totalEReceiptMissing
            FROM #expense_receipt_results;

            -- Result Set 2: Per-Client Totals
            SELECT
                prefix,
                COUNT(*) AS totalExpenses,
                SUM(CASE WHEN Receipt_Filename IS NOT NULL THEN 1 ELSE 0 END) AS receiptReceived,
                SUM(CASE WHEN Receipt_Filename IS NULL     THEN 1 ELSE 0 END) AS receiptMissing,
                SUM(CASE WHEN E_Receipt_Filename IS NOT NULL THEN 1 ELSE 0 END) AS eReceiptReceived,
                SUM(CASE WHEN E_Receipt_Filename IS NULL     THEN 1 ELSE 0 END) AS eReceiptMissing
            FROM #expense_receipt_results
            GROUP BY prefix
            ORDER BY prefix;

            -- Result Set 3: Detail rows
            SELECT
                DatabaseName, filename, prefix, ReportV3_ID, ExpenseV3_ID,
                Report_Submit_Date,
                Report_Create_Date,
                Report_Paid_Date,
                Receipt_Filename, E_Receipt_Filename
            FROM #expense_receipt_results
            ORDER BY prefix, ${dateCol} DESC;

            -- Cleanup
            DROP TABLE #expense_receipt_results;
            DROP TABLE #AllDatabaseData;
        `;

        // ── Execute entire batch in ONE call ──
        const request = pool.request();
        request.timeout = 120000; // 2 min timeout
        request.input('d1', sql.Date, d1);
        request.input('d2', sql.Date, d2);
        request.input('clientFilter', sql.NVarChar, client || null);
        const result = await request.query(batchSql);

        // Parse the 3 result sets
        const grandTotals  = result.recordsets[0]?.[0] || {
            totalExpenses: 0, totalReceiptReceived: 0, totalReceiptMissing: 0,
            totalEReceiptReceived: 0, totalEReceiptMissing: 0
        };
        const clientTotals = result.recordsets[1] || [];
        const detailRows   = result.recordsets[2] || [];

        const {
            totalExpenses, totalReceiptReceived, totalReceiptMissing,
            totalEReceiptReceived, totalEReceiptMissing
        } = grandTotals;

        // Rates
        const receiptRate  = totalExpenses > 0 ? Math.round((totalReceiptReceived  / totalExpenses) * 1000) / 10 : 0;
        const missingRate  = totalExpenses > 0 ? Math.round((totalReceiptMissing   / totalExpenses) * 1000) / 10 : 0;
        const eReceiptRate = totalExpenses > 0 ? Math.round((totalEReceiptReceived / totalExpenses) * 1000) / 10 : 0;

        // Chart data
        const receiptsByClient = clientTotals.map(c => ({
            name: c.prefix,
            total_expenses: c.totalExpenses,
            received: c.receiptReceived,
            not_attached: c.receiptMissing,
            ereceipt_received: c.eReceiptReceived,
        }));

        const receiptStatusData = [
            { status: 'Receipt Received',   count: totalReceiptReceived },
            { status: 'Receipt Missing',    count: totalReceiptMissing },
            { status: 'E-Receipt Received', count: totalEReceiptReceived },
            { status: 'E-Receipt Missing',  count: totalEReceiptMissing },
        ];

        console.log(`Expenses complete: ${totalExpenses} expenses, ${clientTotals.length} clients`);
        console.log(`--- DETAIL ROWS COUNT: ${detailRows.length} ---`);

        res.json({
            dateType: flag === 2 ? 'paid' : flag === 1 ? 'submit' : 'create',
            dateRange: { from: d1, to: d2 },
            totalExpenses,
            totalReceiptReceived,
            totalReceiptMissing,
            totalEReceiptReceived,
            totalEReceiptMissing,
            receiptRate,
            missingRate,
            eReceiptRate,
            activeClients: clientTotals.length,
            receiptsByClient,
            receiptStatusData,
            clientTotals: clientTotals.map(c => ({
                prefix: c.prefix,
                totalExpenses: c.totalExpenses,
                receiptReceived: c.receiptReceived,
                receiptMissing: c.receiptMissing,
                eReceiptReceived: c.eReceiptReceived,
                eReceiptMissing: c.eReceiptMissing,
                receiptRate: c.totalExpenses > 0 ? Math.round((c.receiptReceived / c.totalExpenses) * 1000) / 10 : 0,
                missingRate: c.totalExpenses > 0 ? Math.round((c.receiptMissing / c.totalExpenses) * 1000) / 10 : 0,
            })),
            detailRows,
        });

    } catch (err) {
        console.error('Expenses stats error:', err);
        res.status(500).json({ error: err.message, details: err.toString() });
    }
});

module.exports = router;
