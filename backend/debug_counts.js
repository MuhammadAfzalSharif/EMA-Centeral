
require('dotenv').config();
const dbConfig = require('./config/db');
const sql = require('mssql');

const DB_TABLE_CONFIG = [
    { database_name: 'Expense_Report_Audit_Beigene_Product', table_name: 'LZ_2022_Extract_Beigene', client: 'Beigene' },
    { database_name: 'Expense_Report_Audit_Collegium',       table_name: 'LZ_2022_Extract_Collegium', client: 'Collegium' },
    { database_name: 'Expense_Report_Audit_Treace_Product',  table_name: 'LZ_2022_Extract_treace', client: 'Treace' },
    { database_name: 'Expense_Report_Audit_Kowa',            table_name: 'LZ_2022_Extract_KOWA', client: 'Kowa' },
    { database_name: 'Expense_Report_Audit_Syneos',          table_name: 'LZ_2022_Extract_syneos_ASTRAZENECA', client: 'Syneos_ASTRAZENECA' },
    { database_name: 'Expense_Report_Audit_Syneos',          table_name: 'LZ_2022_Extract_syneos_ELI_LILLY', client: 'Syneos_ELI_LILLY' },
    { database_name: 'Expense_Report_Audit_Syneos',          table_name: 'LZ_2024_Extract_Syneos_GSK', client: 'Syneos_GSK' },
];

(async () => {
    try {
        console.log('Connecting...');
        const pool = await sql.connect(dbConfig);
        console.log('Connected.');

        let batchSql = '';
        const configs = DB_TABLE_CONFIG;

        // Create temp table first
        batchSql += `
            IF OBJECT_ID('tempdb..#expense_receipt_results_test') IS NOT NULL
                DROP TABLE #expense_receipt_results_test;

            CREATE TABLE #expense_receipt_results_test (
                DatabaseName        NVARCHAR(255),
                filename            NVARCHAR(500),
                prefix              NVARCHAR(100)
            );
        `;

        for (const config of configs) {
            const { database_name, table_name } = config;
            const dbEsc = database_name.replace(/'/g, "''");
            const tblEsc = table_name.replace(/'/g, "''");

            batchSql += `
            BEGIN TRY
                INSERT INTO #expense_receipt_results_test
                SELECT '${dbEsc}', filename, '${config.client}'
                FROM [${dbEsc}].dbo.[${tblEsc}];
            END TRY
            BEGIN CATCH
                PRINT 'Error reading ${tblEsc}';
            END CATCH
            `;
        }

        // Check counts
        batchSql += `
            SELECT prefix, COUNT(*) as Count
            FROM #expense_receipt_results_test
            GROUP BY prefix;
            
            DROP TABLE #expense_receipt_results_test;
        `;

        console.log('Executing count query...');
        const result = await pool.request().query(batchSql);
        console.table(result.recordset);

        pool.close();
    } catch (err) {
        console.error('Error:', err);
    }
})();
