const express = require('express');
const sql = require('mssql');
const dbConfig = require('../config/db');

const router = express.Router();

// ──────────────────────────────────────────────────────────────
// GET /api/qdera/clients - dynamically discovered from DB
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
        console.error('Qdera client discovery error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ──────────────────────────────────────────────────────────────
// GET /api/qdera/stats - Qdera vs LZ transaction counts
// ──────────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
    try {
        const { fromDate, toDate, client, dateType, type, date, month, year } = req.query;
        // dateType: 'create', 'submit', 'paid', or 'system' → maps to flag 0, 1, 2, or 3
        const flag = dateType === 'submit' ? 1 : dateType === 'paid' ? 2 : dateType === 'system' ? 3 : 0;

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

        console.log(`Qdera stats: flag=${flag}, d1=${d1}, d2=${d2}, client=${client || 'ALL'}`);

        const pool = await sql.connect(dbConfig);

        const batchSql = `
            SET NOCOUNT ON;

            -- 1. CLEANUP
            IF OBJECT_ID('tempdb..#total_lz_vs_total_qdera') IS NOT NULL
                DROP TABLE #total_lz_vs_total_qdera;

            CREATE TABLE #total_lz_vs_total_qdera (
                DatabaseName NVARCHAR(100),
                Filename NVARCHAR(MAX),
                Prefix NVARCHAR(100),
                file_in_system_Date date,
                submit_date date,
                create_date date,
                paid_date date,
                qdera_count INT,
                lz_count INT,
                result NVARCHAR(50)
            );

            -- 2. DISCOVER DATABASES
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

            -- 3. CURSOR TO PROCESS EACH DATABASE
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
                ;WITH LZ_Counts AS (
                    SELECT
                        filename,
                                         TRY_CAST(SUBSTRING(filename, NULLIF(PATINDEX(''%_[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]%'', filename), 0) + 1, 8) AS DATE)  file_in_system_Date,

                        COUNT(*) as cnt,
                        MIN(TRY_CAST(LEFT(ReportV3_SubmitDate, 10) AS DATE)) as submit_date,
                        MIN(TRY_CAST(LEFT(ReportV3_CreateDate, 10) AS DATE)) as create_date,
                        MIN(TRY_CAST(LEFT(ReportV3_PaidDate, 10) AS DATE)) as paid_date
                    FROM ' + QUOTENAME(@db_name) + N'.dbo.' + QUOTENAME(@table_name) + N'
                    WHERE filename LIKE ''' + @prefix + N'%''
                      AND (
                          (@flag = 1 AND TRY_CAST(LEFT(ReportV3_SubmitDate, 10) AS DATE) BETWEEN @d1 AND @d2)
                          OR
                          (@flag = 0 AND TRY_CAST(LEFT(ReportV3_CreateDate, 10) AS DATE) BETWEEN @d1 AND @d2)
                          OR
                          (@flag = 2 AND TRY_CAST(LEFT(ReportV3_PaidDate, 10) AS DATE) BETWEEN @d1 AND @d2)
                        or 
                                 (@flag = 3 AND TRY_CAST(SUBSTRING(filename, NULLIF(PATINDEX(''%_[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]%'', filename), 0) + 1, 8) AS DATE) BETWEEN @d1 AND @d2)

                      
                      
                          )
                    GROUP BY filename
                ),
                Qdera_Counts AS (
                    SELECT
                        filename,
                                         TRY_CAST(SUBSTRING(filename, NULLIF(PATINDEX(''%_[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]%'', filename), 0) + 1, 8) AS DATE)  file_in_system_Date,

                        COUNT(*) as cnt,
                        MIN(TRY_CAST(LEFT(Report_Submit_Date, 10) AS DATE)) as submit_date,
                        MIN(TRY_CAST(LEFT(Report_Create_Date, 10) AS DATE)) as create_date,
                        MIN(TRY_CAST(LEFT(Report_Paid_Date, 10) AS DATE)) as paid_date
                    FROM ' + QUOTENAME(@db_name) + N'.dbo.qderatemplate
                    WHERE filename LIKE ''' + @prefix + N'%''
                      AND (
                          (@flag = 1 AND TRY_CAST(LEFT(Report_Submit_Date, 10) AS DATE) BETWEEN @d1 AND @d2)
                          OR
                          (@flag = 0 AND TRY_CAST(LEFT(Report_Create_Date, 10) AS DATE) BETWEEN @d1 AND @d2)
                          OR
                          (@flag = 2 AND TRY_CAST(LEFT(Report_Paid_Date, 10) AS DATE) BETWEEN @d1 AND @d2)
                     
                     
                          or 
                                   (@flag = 3 AND TRY_CAST(SUBSTRING(filename, NULLIF(PATINDEX(''%_[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]%'', filename), 0) + 1, 8) AS DATE) BETWEEN @d1 AND @d2)

                          )
                    GROUP BY filename
                )
                INSERT INTO #total_lz_vs_total_qdera
                SELECT
                    ''' + @db_name + N''' AS DatabaseName,
                    ISNULL(l.filename, q.filename) AS Filename,
                    ''' + @prefix + N''' AS Prefix,
                    COALESCE(l.file_in_system_Date, q.file_in_system_Date),
                    COALESCE(l.submit_date, q.submit_date) AS submit_date,
                    COALESCE(l.create_date, q.create_date) AS create_date,
                    COALESCE(l.paid_date, q.paid_date) AS paid_date,

                    ISNULL(q.cnt, 0) AS qdera_count,
                    ISNULL(l.cnt, 0) AS lz_count,
                    CASE
                        WHEN ISNULL(l.cnt, 0) = ISNULL(q.cnt, 0) THEN ''success''
                        ELSE ''fail''
                    END AS result
                FROM Qdera_Counts q
                FULL OUTER JOIN LZ_Counts l ON l.filename = q.filename;
                ';

                BEGIN TRY
                    EXEC sp_executesql @sql, N'@flag INT, @d1 DATE, @d2 DATE', @flag = ${flag}, @d1 = @d1, @d2 = @d2;
                END TRY
                BEGIN CATCH
                    PRINT 'Error processing ' + @db_name + ': ' + ERROR_MESSAGE();
                END CATCH

                FETCH NEXT FROM db_cursor INTO @db_name, @prefix, @table_name;
            END

            CLOSE db_cursor;
            DEALLOCATE db_cursor;

            -- 4. RESULT SETS

            -- Result Set 1: Grand Totals
            SELECT
                COUNT(*) AS totalFiles,
                SUM(qdera_count) AS totalQderaCount,
                SUM(lz_count) AS totalLzCount,
                SUM(CASE WHEN result = 'success' THEN 1 ELSE 0 END) AS totalMatched,
                SUM(CASE WHEN result = 'fail' THEN 1 ELSE 0 END) AS totalMismatched
            FROM #total_lz_vs_total_qdera;

            -- Result Set 2: Per-Client Totals
            SELECT
                Prefix,
                COUNT(*) AS totalFiles,
                SUM(qdera_count) AS totalQderaCount,
                SUM(lz_count) AS totalLzCount,
                SUM(CASE WHEN result = 'success' THEN 1 ELSE 0 END) AS matchedFiles,
                SUM(CASE WHEN result = 'fail' THEN 1 ELSE 0 END) AS mismatchedFiles
            FROM #total_lz_vs_total_qdera
            GROUP BY Prefix
            ORDER BY Prefix;

            -- Result Set 3: Detail rows
            SELECT
                DatabaseName,
                Filename,
                Prefix,
                CONVERT(VARCHAR(10), file_in_system_Date, 120) AS file_in_system_Date,
                CONVERT(VARCHAR(10), submit_date, 120) AS submit_date,
                CONVERT(VARCHAR(10), create_date, 120) AS create_date,
                CONVERT(VARCHAR(10), paid_date, 120) AS paid_date,
                qdera_count,
                lz_count,
                result
            FROM #total_lz_vs_total_qdera
            ORDER BY Prefix, Filename DESC;

            -- Cleanup
            DROP TABLE #total_lz_vs_total_qdera;
            DROP TABLE #AllDatabaseData;
        `;

        const request = pool.request();
        request.timeout = 120000;
        request.input('d1', sql.Date, d1);
        request.input('d2', sql.Date, d2);
        request.input('clientFilter', sql.NVarChar, client || null);
        const result = await request.query(batchSql);

        // Parse the 3 result sets
        const grandTotals = result.recordsets[0]?.[0] || {
            totalFiles: 0, totalQderaCount: 0, totalLzCount: 0,
            totalMatched: 0, totalMismatched: 0
        };
        const clientTotals = result.recordsets[1] || [];
        const detailRows = result.recordsets[2] || [];

        const {
            totalFiles, totalQderaCount, totalLzCount,
            totalMatched, totalMismatched
        } = grandTotals;

        const matchRate = totalFiles > 0 ? Math.round((totalMatched / totalFiles) * 1000) / 10 : 0;
        const mismatchRate = totalFiles > 0 ? Math.round((totalMismatched / totalFiles) * 1000) / 10 : 0;

        const reconciliationByClient = clientTotals.map(c => ({
            name: c.Prefix,
            totalFiles: c.totalFiles,
            qderaCount: c.totalQderaCount,
            lzCount: c.totalLzCount,
            matched: c.matchedFiles,
            mismatched: c.mismatchedFiles,
        }));

        const statusData = [
            { status: 'Matched', count: totalMatched },
            { status: 'Mismatched', count: totalMismatched },
        ];

        console.log(`Qdera reconciliation complete: ${totalFiles} files, ${clientTotals.length} clients`);

        res.json({
            dateType: flag === 3 ? 'system' : flag === 2 ? 'paid' : flag === 1 ? 'submit' : 'create',
            dateRange: { from: d1, to: d2 },
            totalFiles,
            totalQderaCount,
            totalLzCount,
            totalMatched,
            totalMismatched,
            matchRate,
            mismatchRate,
            activeClients: clientTotals.length,
            reconciliationByClient,
            statusData,
            clientTotals: clientTotals.map(c => ({
                prefix: c.Prefix,
                totalFiles: c.totalFiles,
                totalQderaCount: c.totalQderaCount,
                totalLzCount: c.totalLzCount,
                matchedFiles: c.matchedFiles,
                mismatchedFiles: c.mismatchedFiles,
                matchRate: c.totalFiles > 0 ? Math.round((c.matchedFiles / c.totalFiles) * 1000) / 10 : 0,
                mismatchRate: c.totalFiles > 0 ? Math.round((c.mismatchedFiles / c.totalFiles) * 1000) / 10 : 0,
            })),
            detailRows,
        });

    } catch (err) {
        console.error('Qdera stats error:', err);
        res.status(500).json({ error: err.message, details: err.toString() });
    }
});

module.exports = router;
