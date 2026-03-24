const express = require('express');
const sql = require('mssql');
const dbConfig = require('../config/db');

const router = express.Router();

// ──────────────────────────────────────────────────────────────
// GET /api/receiptcategorization/clients - dynamically discovered from DB
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
                QUOTENAME(db_name) + '.dbo.[file_specs] WHERE isenable=1 UNION ALL '
            FROM (SELECT DISTINCT DB_NAME FROM ema_support_module.dbo.DB_Job_Name_Receipts_Categorization WHERE isEnabled=1) dbs;

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
        console.error('Receipt Categorization client discovery error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ──────────────────────────────────────────────────────────────
// GET /api/receiptcategorization/stats - Receipt categorization 
//   (qdera template vs DineIn + SignInSheet OCR data)
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

        console.log(`ReceiptCategorization stats: flag=${flag}, d1=${d1}, d2=${d2}, client=${client || 'ALL'}`);

        const pool = await sql.connect(dbConfig);

        const batchSql = `
            SET NOCOUNT ON;

            -- 1. CLEANUP
            IF OBJECT_ID('tempdb..#receipt_categorization') IS NOT NULL
                DROP TABLE #receipt_categorization;

            CREATE TABLE #receipt_categorization (
                client_db NVARCHAR(255),
                prefix NVARCHAR(255),
                filename NVARCHAR(MAX),
                report_id NVARCHAR(250),
                report_entry_id NVARCHAR(250),
                report_submit_date DATE,
                report_create_date DATE,
                report_paid_date DATE,
                isreceiptuploaded INT NULL,
                isMultiDocument INT NULL,
                isMealItemized INT NULL,
                hasSignInSheetAttached INT,
                hasDineInReceiptAttached INT,
                Found_In_SIS INT,
                Found_In_Dine INT,
                result NVARCHAR(50),
                isreceiptuploaded_null BIT DEFAULT 0,
                isMultiDocument_null BIT DEFAULT 0,
                isMealItemized_null BIT DEFAULT 0
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
                QUOTENAME(db_name) + '.dbo.[file_specs] WHERE isenable=1 UNION ALL '
            FROM (SELECT DISTINCT DB_NAME FROM DB_Job_Name_Receipts_Categorization WHERE isEnabled=1) dbs;

            IF @Sql_GetDBs != ''
            BEGIN
                SET @Sql_GetDBs = 'INSERT INTO #AllDatabaseData (SourceDB, prefix, [desc], table_name) ' +
                                  LEFT(@Sql_GetDBs, LEN(@Sql_GetDBs) - 10);
                EXEC sp_executesql @Sql_GetDBs;
            END

            -- 3. CURSOR THROUGH EACH DATABASE
            DECLARE @db_name NVARCHAR(255);
            DECLARE @prefix NVARCHAR(255);
            DECLARE @company_name NVARCHAR(255);
            DECLARE @sql NVARCHAR(MAX);
            DECLARE @ColExists INT;
            DECLARE @PaidDateCol NVARCHAR(255);
            DECLARE @PaidDateFilter NVARCHAR(MAX);
            DECLARE @CheckColSQL NVARCHAR(MAX);
            DECLARE @MultiDocExists INT, @MealItemExists INT, @ReceiptUploadedExists INT;
            DECLARE @MultiDocCol NVARCHAR(MAX), @MealItemCol NVARCHAR(MAX), @ReceiptUploadedCol NVARCHAR(MAX);

            DECLARE db_cursor CURSOR LOCAL FAST_FORWARD FOR
                SELECT SourceDB, prefix, [desc]
                FROM #AllDatabaseData
                WHERE (@clientFilter IS NULL OR prefix = @clientFilter);

            OPEN db_cursor;
            FETCH NEXT FROM db_cursor INTO @db_name, @prefix, @company_name;

            WHILE @@FETCH_STATUS = 0
            BEGIN
                -- Check if qderatemplate exists
                IF OBJECT_ID(QUOTENAME(@db_name) + '.dbo.qderatemplate') IS NULL
                BEGIN
                    GOTO NextLoop;
                END

                -- Check for report_paid_Date column
                SET @ColExists = 0; SET @MultiDocExists = 0; SET @MealItemExists = 0; SET @ReceiptUploadedExists = 0;
                SET @CheckColSQL = N'
                    SELECT @pExists = COUNT(*) FROM ' + QUOTENAME(@db_name) + N'.sys.columns 
                    WHERE object_id = OBJECT_ID(''' + QUOTENAME(@db_name) + N'.dbo.qderatemplate'') AND name = ''report_paid_Date'';
                    
                    SELECT @mExists = COUNT(*) FROM ' + QUOTENAME(@db_name) + N'.sys.columns 
                    WHERE object_id = OBJECT_ID(''' + QUOTENAME(@db_name) + N'.dbo.qderatemplate'') AND name = ''isMultiDocument'';
                    
                    SELECT @miExists = COUNT(*) FROM ' + QUOTENAME(@db_name) + N'.sys.columns 
                    WHERE object_id = OBJECT_ID(''' + QUOTENAME(@db_name) + N'.dbo.qderatemplate'') AND name = ''isMealItemized'';
                    
                    SELECT @rExists = COUNT(*) FROM ' + QUOTENAME(@db_name) + N'.sys.columns 
                    WHERE object_id = OBJECT_ID(''' + QUOTENAME(@db_name) + N'.dbo.qderatemplate'') AND name = ''isreceiptuploaded'';';
                
                EXEC sp_executesql @CheckColSQL, 
                    N'@pExists INT OUTPUT, @mExists INT OUTPUT, @miExists INT OUTPUT, @rExists INT OUTPUT', 
                    @pExists = @ColExists OUTPUT, @mExists = @MultiDocExists OUTPUT, @miExists = @MealItemExists OUTPUT, @rExists = @ReceiptUploadedExists OUTPUT;

                IF @ColExists >= 1
                    SET @PaidDateCol = N'q.report_paid_Date';
                ELSE
                    SET @PaidDateCol = N'NULL';

                SET @MultiDocCol = CASE WHEN @MultiDocExists >= 1 THEN N'q.isMultiDocument' ELSE N'NULL' END;
                SET @MealItemCol = CASE WHEN @MealItemExists >= 1 THEN N'q.isMealItemized' ELSE N'NULL' END;
                SET @ReceiptUploadedCol = CASE WHEN @ReceiptUploadedExists >= 1 THEN N'q.isreceiptuploaded' ELSE N'NULL' END;

                IF @ColExists >= 1
                    SET @PaidDateFilter = N'
                        OR (@p_flag = 2 AND ISNULL(TRY_CAST(q.report_paid_Date AS DATE), ''1900-01-01'') BETWEEN @p_d1 AND @p_d2)';
                ELSE
                    SET @PaidDateFilter = N'
                        OR (@p_flag = 2 AND ISNULL(TRY_CAST(q.report_submit_date AS DATE), ''1900-01-01'') BETWEEN @p_d1 AND @p_d2)';

                BEGIN TRY
                    SET @sql = N'
                    ;WITH 
                    CTE_Qdera_Base AS (
                        SELECT DISTINCT 
                            q.filename,
                            q.report_id,
                            q.report_submit_date,
                            q.report_create_date,
                            ' + @PaidDateCol + N' AS report_paid_Date,
                            ' + @ReceiptUploadedCol + N' AS isreceiptuploaded,
                            ' + @MultiDocCol + N' AS isMultiDocument,
                            ' + @MealItemCol + N' AS isMealItemized,
                            q.Report_Entry_Id,
                            q.hasSignInSheetAttached,
                            q.hasDineInReceiptAttached
                        FROM ' + QUOTENAME(@db_name) + N'.dbo.qderatemplate q
                        WHERE 
                        (
                            (@p_flag = 1 AND ISNULL(TRY_CAST(q.report_submit_date AS DATE), ''1900-01-01'') BETWEEN @p_d1 AND @p_d2)
                            OR (@p_flag = 0 AND ISNULL(TRY_CAST(q.report_create_date AS DATE), ''1900-01-01'') BETWEEN @p_d1 AND @p_d2)
                            ' + @PaidDateFilter + N'
                        )
                        AND q.filename LIKE ''%'' + @p_prefix + ''%''
                    ),

                    CTE_Find_Entry_Dine AS (
                        SELECT 
                            ReportId,
                            ReportEntryId,
                            report_submit_date,
                            COUNT(DISTINCT ReportEntryId) as Found_In_Dine
                        FROM ' + QUOTENAME(@db_name) + N'.dbo.DineInOnlineReceiptOcrData
                        GROUP BY ReportId, ReportEntryId, report_submit_date
                    ),

                    CTE_Find_Entry_SIS AS (
                        SELECT 
                            report_id, 
                            report_entry_id,
                            report_submit_date,
                            COUNT(DISTINCT report_entry_id) as Found_In_SIS
                        FROM ' + QUOTENAME(@db_name) + N'.dbo.SignInSheetOcrData
                        GROUP BY report_id, report_entry_id, report_submit_date
                    )

                    INSERT INTO #receipt_categorization (
                        client_db, prefix, filename, report_id, report_entry_id, report_submit_date, report_create_date, report_paid_date,
                        isreceiptuploaded, isMultiDocument, isMealItemized,
                        hasSignInSheetAttached, hasDineInReceiptAttached, Found_In_SIS, Found_In_Dine, result,
                        isreceiptuploaded_null, isMultiDocument_null, isMealItemized_null
                    )
                    SELECT 
                        @p_db_name,
                        @p_prefix,
                        q.filename,
                        q.report_id,
                        q.Report_Entry_Id,
                        q.report_submit_date,
                        q.report_create_date,
                        q.report_paid_Date,
                        q.isreceiptuploaded,
                        q.isMultiDocument,
                        q.isMealItemized,
                        q.hasSignInSheetAttached,
                        q.hasDineInReceiptAttached,
                        ISNULL(s.Found_In_SIS, 0),
                        ISNULL(d.Found_In_Dine, 0),
                        CASE 
                            WHEN (
                                (q.hasSignInSheetAttached = ISNULL(s.Found_In_SIS, 0) OR (q.hasSignInSheetAttached <> 0 AND ISNULL(s.Found_In_SIS, 0) = 1))
                                AND
                                (q.hasDineInReceiptAttached = ISNULL(d.Found_In_Dine, 0) OR (q.hasDineInReceiptAttached <> 0 AND ISNULL(d.Found_In_Dine, 0) = 1))
                            )
                            THEN ''found''
                            ELSE ''error''
                        END,
                        CASE WHEN ' + CASE WHEN @ReceiptUploadedExists >= 1 THEN N'0' ELSE N'1' END + N' = 1 THEN 1 ELSE CASE WHEN q.isreceiptuploaded IS NULL THEN 1 ELSE 0 END END,
                        CASE WHEN ' + CASE WHEN @MultiDocExists >= 1 THEN N'0' ELSE N'1' END + N' = 1 THEN 1 ELSE CASE WHEN q.isMultiDocument IS NULL THEN 1 ELSE 0 END END,
                        CASE WHEN ' + CASE WHEN @MealItemExists >= 1 THEN N'0' ELSE N'1' END + N' = 1 THEN 1 ELSE CASE WHEN q.isMealItemized IS NULL THEN 1 ELSE 0 END END
                    FROM CTE_Qdera_Base q
                    LEFT JOIN CTE_Find_Entry_Dine d ON q.report_id = d.ReportId AND q.Report_Entry_Id = d.ReportEntryId AND q.report_submit_date = d.report_submit_date
                    LEFT JOIN CTE_Find_Entry_SIS s ON q.report_id = s.report_id AND q.Report_Entry_Id = s.report_entry_id AND q.report_submit_date = s.report_submit_date;';

                    EXEC sp_executesql @sql, 
                        N'@p_flag INT, @p_d1 DATE, @p_d2 DATE, @p_db_name NVARCHAR(255), @p_prefix NVARCHAR(255)', 
                        @p_flag = @flag, @p_d1 = @d1, @p_d2 = @d2, @p_db_name = @db_name, @p_prefix = @prefix;
                END TRY
                BEGIN CATCH
                    PRINT 'Error processing ' + @db_name + ': ' + ERROR_MESSAGE();
                END CATCH

                NextLoop:
                FETCH NEXT FROM db_cursor INTO @db_name, @prefix, @company_name;
            END

            CLOSE db_cursor;
            DEALLOCATE db_cursor;

            -- 4. RESULT SETS

            -- Result Set 1: Grand Totals
            SELECT
                COUNT(*) AS totalRecords,
                SUM(CASE WHEN result = 'found' THEN 1 ELSE 0 END) AS totalFound,
                SUM(CASE WHEN result = 'error' THEN 1 ELSE 0 END) AS totalNotFound,
                COUNT(DISTINCT prefix) AS activeClients,
                COUNT(DISTINCT filename) AS totalFiles,
                COUNT(DISTINCT report_id) AS totalReports,
                COUNT(DISTINCT report_entry_id) AS totalEntries,
                SUM(hasSignInSheetAttached) AS totalSignInSheetFlags,
                SUM(hasDineInReceiptAttached) AS totalDineInFlags,
                SUM(Found_In_SIS) AS totalFoundInSIS,
                SUM(Found_In_Dine) AS totalFoundInDine,
                SUM(CASE WHEN isreceiptuploaded_null = 1 THEN 1 ELSE 0 END) AS totalReceiptUploadedNull,
                SUM(CASE WHEN isMultiDocument_null = 1 THEN 1 ELSE 0 END) AS totalMultiDocNull,
                SUM(CASE WHEN isMealItemized_null = 1 THEN 1 ELSE 0 END) AS totalMealItemizedNull
            FROM #receipt_categorization;

            -- Result Set 2: Per-Client Totals
            SELECT
                prefix,
                COUNT(*) AS totalRecords,
                SUM(CASE WHEN result = 'found' THEN 1 ELSE 0 END) AS foundCount,
                SUM(CASE WHEN result = 'error' THEN 1 ELSE 0 END) AS notFoundCount,
                COUNT(DISTINCT filename) AS totalFiles,
                COUNT(DISTINCT report_id) AS totalReports,
                COUNT(DISTINCT report_entry_id) AS totalEntries,
                SUM(hasSignInSheetAttached) AS signInSheetFlags,
                SUM(hasDineInReceiptAttached) AS dineInFlags,
                SUM(Found_In_SIS) AS foundInSIS,
                SUM(Found_In_Dine) AS foundInDine,
                SUM(CASE WHEN isreceiptuploaded_null = 1 THEN 1 ELSE 0 END) AS receiptUploadedNullCount,
                SUM(CASE WHEN isMultiDocument_null = 1 THEN 1 ELSE 0 END) AS multiDocNullCount,
                SUM(CASE WHEN isMealItemized_null = 1 THEN 1 ELSE 0 END) AS mealItemizedNullCount
            FROM #receipt_categorization
            GROUP BY prefix
            ORDER BY prefix;

            -- Result Set 3: Detail rows (full history)
            SELECT
                client_db,
                prefix,
                filename,
                report_id,
                report_entry_id,
                CONVERT(VARCHAR(10), report_submit_date, 120) AS report_submit_date,
                CONVERT(VARCHAR(10), report_create_date, 120) AS report_create_date,
                CONVERT(VARCHAR(10), report_paid_date, 120) AS report_paid_date,
                isreceiptuploaded,
                isMultiDocument,
                isMealItemized,
                hasSignInSheetAttached,
                hasDineInReceiptAttached,
                Found_In_SIS,
                Found_In_Dine,
                result,
                isreceiptuploaded_null,
                isMultiDocument_null,
                isMealItemized_null
            FROM #receipt_categorization
            ORDER BY prefix, filename, report_id;

            -- Cleanup
            DROP TABLE #receipt_categorization;
            DROP TABLE #AllDatabaseData;
        `;

        // Execute entire batch in ONE call
        const request = pool.request();
        request.timeout = 180000; // 3 min timeout
        request.input('d1', sql.Date, d1);
        request.input('d2', sql.Date, d2);
        request.input('flag', sql.Int, flag);
        request.input('clientFilter', sql.NVarChar, client || null);
        const result = await request.query(batchSql);

        // Parse the 3 result sets
        const grandTotals = result.recordsets[0]?.[0] || {
            totalRecords: 0, totalFound: 0, totalNotFound: 0,
            activeClients: 0, totalFiles: 0, totalReports: 0, totalEntries: 0,
            totalSignInSheetFlags: 0, totalDineInFlags: 0, totalFoundInSIS: 0, totalFoundInDine: 0
        };
        const clientTotals = result.recordsets[1] || [];
        const detailRows = result.recordsets[2] || [];

        const {
            totalRecords, totalFound, totalNotFound,
            activeClients, totalFiles, totalReports, totalEntries,
            totalSignInSheetFlags, totalDineInFlags, totalFoundInSIS, totalFoundInDine,
            totalReceiptUploadedNull, totalMultiDocNull, totalMealItemizedNull
        } = grandTotals;

        // Rates
        const foundRate = totalRecords > 0 ? Math.round((totalFound / totalRecords) * 1000) / 10 : 0;
        const errorRate = totalRecords > 0 ? Math.round((totalNotFound / totalRecords) * 1000) / 10 : 0;

        // Chart data: per-client breakdown
        const categorizationByClient = clientTotals.map(c => ({
            name: c.prefix,
            totalRecords: c.totalRecords,
            found: c.foundCount,
            notFound: c.notFoundCount,
            totalFiles: c.totalFiles,
            totalReports: c.totalReports,
            totalEntries: c.totalEntries,
            signInSheetFlags: c.signInSheetFlags,
            dineInFlags: c.dineInFlags,
            foundInSIS: c.foundInSIS,
            foundInDine: c.foundInDine,
            receiptUploadedNullCount: c.receiptUploadedNullCount || 0,
            multiDocNullCount: c.multiDocNullCount || 0,
            mealItemizedNullCount: c.mealItemizedNullCount || 0,
        }));

        const statusData = [
            { status: 'Found (Matched)', count: totalFound },
            { status: 'Error (Not Found)', count: totalNotFound },
        ];

        console.log(`ReceiptCategorization complete: ${totalRecords} records, ${clientTotals.length} clients, ${totalFound} found, ${totalNotFound} errors`);

        res.json({
            dateType: flag === 2 ? 'paid' : flag === 1 ? 'submit' : 'create',
            dateRange: { from: d1, to: d2 },
            totalRecords,
            totalFound,
            totalNotFound,
            foundRate,
            errorRate,
            activeClients,
            totalFiles,
            totalReports,
            totalEntries,
            totalSignInSheetFlags,
            totalDineInFlags,
            totalFoundInSIS,
            totalFoundInDine,
            totalReceiptUploadedNull: totalReceiptUploadedNull || 0,
            totalMultiDocNull: totalMultiDocNull || 0,
            totalMealItemizedNull: totalMealItemizedNull || 0,
            categorizationByClient,
            statusData,
            clientTotals: clientTotals.map(c => ({
                prefix: c.prefix,
                totalRecords: c.totalRecords,
                foundCount: c.foundCount,
                notFoundCount: c.notFoundCount,
                totalFiles: c.totalFiles,
                totalReports: c.totalReports,
                totalEntries: c.totalEntries,
                signInSheetFlags: c.signInSheetFlags,
                dineInFlags: c.dineInFlags,
                foundInSIS: c.foundInSIS,
                foundInDine: c.foundInDine,
                receiptUploadedNullCount: c.receiptUploadedNullCount || 0,
                multiDocNullCount: c.multiDocNullCount || 0,
                mealItemizedNullCount: c.mealItemizedNullCount || 0,
                foundRate: c.totalRecords > 0 ? Math.round((c.foundCount / c.totalRecords) * 1000) / 10 : 0,
                errorRate: c.totalRecords > 0 ? Math.round((c.notFoundCount / c.totalRecords) * 1000) / 10 : 0,
            })),
            detailRows,
        });

    } catch (err) {
        console.error('ReceiptCategorization stats error:', err);
        res.status(500).json({ error: err.message, details: err.toString() });
    }
});

module.exports = router;
