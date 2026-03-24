const express = require('express');
const sql = require('mssql');
const dbConfig = require('../config/db');

const router = express.Router();

// ──────────────────────────────────────────────────────────────
// GET /api/flagcheck/clients - dynamically discovered from DB
// ──────────────────────────────────────────────────────────────
router.get('/clients', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);

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
        const configs = result.recordset || [];

        const clients = configs.map(c => ({
            client: c.prefix,
            database_name: c.SourceDB,
            description: c.desc,
            table_name: c.table_name,
        }));

        res.json(clients);
    } catch (err) {
        console.error('FlagCheck client discovery error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ──────────────────────────────────────────────────────────────
// GET /api/flagcheck/stats - LZ iteration_id & islatest flag check
// ──────────────────────────────────────────────────────────────
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
            const now = new Date();
            d1 = now.toISOString().split('T')[0];
            d2 = d1;
        }

        console.log(`FlagCheck stats: flag=${flag}, d1=${d1}, d2=${d2}, client=${client || 'ALL'}`);

        const pool = await sql.connect(dbConfig);

        const batchSql = `
            SET NOCOUNT ON;

            -- 1. CLEANUP
            IF OBJECT_ID('tempdb..#flag_update_LZ') IS NOT NULL
                DROP TABLE #flag_update_LZ;

            -- 2. CREATE RESULT TABLE
            CREATE TABLE #flag_update_LZ (
                DatabaseName NVARCHAR(255),
                Filename NVARCHAR(MAX),
                Prefix NVARCHAR(100),
                report_id NVARCHAR(250),
                expense_id NVARCHAR(250),
                report_submit_Date DATE,
                report_create_Date DATE,
                report_paid_Date DATE,
                iteration_id NVARCHAR(250),
                islatest NVARCHAR(50),
                islatest_iteration_id_flag_check NVARCHAR(50)
            );

            -- 3. DISCOVER DATABASES
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

            -- 4. CURSOR THROUGH EACH DATABASE
            DECLARE @db_name NVARCHAR(255);
            DECLARE @prefix NVARCHAR(255);
            DECLARE @table_name NVARCHAR(255);
            DECLARE @sql NVARCHAR(MAX);

            DECLARE db_cursor CURSOR LOCAL FAST_FORWARD FOR
                SELECT SourceDB, prefix, table_name
                FROM #AllDatabaseData
                WHERE (@clientFilter IS NULL OR prefix = @clientFilter);

            OPEN db_cursor;
            FETCH NEXT FROM db_cursor INTO @db_name, @prefix, @table_name;

            WHILE @@FETCH_STATUS = 0
            BEGIN
                SET @sql = N'
                INSERT INTO #flag_update_LZ (DatabaseName, Filename, Prefix, report_id, expense_id, report_submit_Date, report_create_Date, report_paid_Date, iteration_id, islatest, islatest_iteration_id_flag_check)
                SELECT DISTINCT
                    ''' + @db_name + N''' AS DatabaseName,
                    Filename,
                    ''' + @prefix + N''',
                    ReportV3_ID,
                    ExpenseV3_ID,
                    TRY_CAST(LEFT(ISNULL(ReportV3_SubmitDate, ''1900-01-01''), 10) AS DATE),
                    TRY_CAST(LEFT(ISNULL(ReportV3_CreateDate, ''1900-01-01''), 10) AS DATE),
                    TRY_CAST(LEFT(ISNULL(ReportV3_PaidDate, ''1900-01-01''), 10) AS DATE),
                    CAST(iteration_id AS NVARCHAR(250)),
                    CAST(islatest AS NVARCHAR(50)),
                    CASE
                        WHEN iteration_id IS NOT NULL AND islatest IS NOT NULL THEN ''Yes''
                        ELSE ''No''
                    END
                FROM ' + QUOTENAME(@db_name) + N'.dbo.' + QUOTENAME(@table_name) + N'
                WHERE
                    (@flag = 1 AND TRY_CAST(LEFT(ISNULL(ReportV3_SubmitDate, ''1900-01-01''), 10) AS DATE) BETWEEN @d1 AND @d2)
                    OR
                    (@flag = 0 AND TRY_CAST(LEFT(ISNULL(ReportV3_CreateDate, ''1900-01-01''), 10) AS DATE) BETWEEN @d1 AND @d2)
                    OR
                    (@flag = 2 AND TRY_CAST(LEFT(ISNULL(ReportV3_PaidDate, ''1900-01-01''), 10) AS DATE) BETWEEN @d1 AND @d2);
                ';

                BEGIN TRY
                    EXEC sp_executesql @sql, N'@flag INT, @d1 DATE, @d2 DATE', @flag = ${flag}, @d1 = @d1, @d2 = @d2;
                END TRY
                BEGIN CATCH
                    PRINT 'Error processing ' + @db_name + ' (' + @prefix + '): ' + ERROR_MESSAGE();
                END CATCH

                FETCH NEXT FROM db_cursor INTO @db_name, @prefix, @table_name;
            END

            CLOSE db_cursor;
            DEALLOCATE db_cursor;

            -- 5. RESULT SETS

            -- Result Set 1: Grand Totals
            SELECT
                COUNT(*) AS totalRecords,
                SUM(CASE WHEN islatest_iteration_id_flag_check = 'Yes' THEN 1 ELSE 0 END) AS totalValid,
                SUM(CASE WHEN islatest_iteration_id_flag_check = 'No' THEN 1 ELSE 0 END) AS totalInvalid,
                COUNT(DISTINCT Prefix) AS activeClients,
                COUNT(DISTINCT Filename) AS totalFiles,
                COUNT(DISTINCT report_id) AS totalReports,
                COUNT(DISTINCT expense_id) AS totalExpenses
            FROM #flag_update_LZ;

            -- Result Set 2: Per-Client Totals
            SELECT
                Prefix,
                COUNT(*) AS totalRecords,
                SUM(CASE WHEN islatest_iteration_id_flag_check = 'Yes' THEN 1 ELSE 0 END) AS validCount,
                SUM(CASE WHEN islatest_iteration_id_flag_check = 'No' THEN 1 ELSE 0 END) AS invalidCount,
                COUNT(DISTINCT Filename) AS totalFiles,
                COUNT(DISTINCT report_id) AS totalReports,
                COUNT(DISTINCT expense_id) AS totalExpenses
            FROM #flag_update_LZ
            GROUP BY Prefix
            ORDER BY Prefix;

            -- Result Set 3: Detail rows
            SELECT
                DatabaseName,
                Filename,
                Prefix,
                report_id,
                expense_id,
                CONVERT(VARCHAR(10), report_submit_Date, 120) AS report_submit_Date,
                CONVERT(VARCHAR(10), report_create_Date, 120) AS report_create_Date,
                CONVERT(VARCHAR(10), report_paid_Date, 120) AS report_paid_Date,
                iteration_id,
                islatest,
                islatest_iteration_id_flag_check
            FROM #flag_update_LZ
            ORDER BY Prefix, Filename, report_id;

            -- Cleanup
            DROP TABLE #flag_update_LZ;
            DROP TABLE #AllDatabaseData;
        `;

        const request = pool.request();
        request.timeout = 180000; // 3 min timeout (can be large dataset)
        request.input('d1', sql.Date, d1);
        request.input('d2', sql.Date, d2);
        request.input('clientFilter', sql.NVarChar, client || null);
        const result = await request.query(batchSql);

        // Parse the 3 result sets
        const grandTotals = result.recordsets[0]?.[0] || {
            totalRecords: 0, totalValid: 0, totalInvalid: 0,
            activeClients: 0, totalFiles: 0, totalReports: 0, totalExpenses: 0
        };
        const clientTotals = result.recordsets[1] || [];
        const detailRows = result.recordsets[2] || [];

        const {
            totalRecords, totalValid, totalInvalid,
            activeClients, totalFiles, totalReports, totalExpenses
        } = grandTotals;

        // Rates
        const validRate = totalRecords > 0 ? Math.round((totalValid / totalRecords) * 1000) / 10 : 0;
        const invalidRate = totalRecords > 0 ? Math.round((totalInvalid / totalRecords) * 1000) / 10 : 0;

        // Chart data: per-client breakdown
        const flagCheckByClient = clientTotals.map(c => ({
            name: c.Prefix,
            totalRecords: c.totalRecords,
            valid: c.validCount,
            invalid: c.invalidCount,
            totalFiles: c.totalFiles,
            totalReports: c.totalReports,
            totalExpenses: c.totalExpenses,
        }));

        const statusData = [
            { status: 'Valid (Has Flags)', count: totalValid },
            { status: 'Invalid (Missing)', count: totalInvalid },
        ];

        console.log(`FlagCheck complete: ${totalRecords} records, ${clientTotals.length} clients, ${totalValid} valid, ${totalInvalid} invalid`);

        res.json({
            dateType: flag === 2 ? 'paid' : flag === 1 ? 'submit' : 'create',
            dateRange: { from: d1, to: d2 },
            totalRecords,
            totalValid,
            totalInvalid,
            validRate,
            invalidRate,
            activeClients,
            totalFiles,
            totalReports,
            totalExpenses,
            flagCheckByClient,
            statusData,
            clientTotals: clientTotals.map(c => ({
                prefix: c.Prefix,
                totalRecords: c.totalRecords,
                validCount: c.validCount,
                invalidCount: c.invalidCount,
                totalFiles: c.totalFiles,
                totalReports: c.totalReports,
                totalExpenses: c.totalExpenses,
                validRate: c.totalRecords > 0 ? Math.round((c.validCount / c.totalRecords) * 1000) / 10 : 0,
                invalidRate: c.totalRecords > 0 ? Math.round((c.invalidCount / c.totalRecords) * 1000) / 10 : 0,
            })),
            detailRows,
        });

    } catch (err) {
        console.error('FlagCheck stats error:', err);
        res.status(500).json({ error: err.message, details: err.toString() });
    }
});

module.exports = router;
