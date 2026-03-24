
# ============================================================================
#          EMA — EXPENSE MANAGEMENT AUDIT PORTAL
#          PROJECT PRESENTATION
# ============================================================================
#  Presented By : [Your Name]
#  Date         : March 2026
#  Technology   : React 19 + Express 5 + MS SQL Server
# ============================================================================


================================================================================
                        SECTION 1 — PROJECT OVERVIEW
================================================================================

What is EMA?
─────────────
EMA (Expense Management Audit) is a full-stack web application that automates
the monitoring and auditing of expense-related data across multiple client
databases. It replaces manual, spreadsheet-driven audit processes with a
centralised, real-time dashboard system.

The system connects to a central MSSQL database (EMA_Support_Module) and
dynamically discovers each client's database to analyse expense records,
receipts, reconciliation data, and data-quality flags — all from one portal.

Tech Stack:
  • Frontend  : React 19, Vite, React Router 7, TanStack React Query 5, Recharts
  • Backend   : Node.js, Express 5, mssql (tedious) driver
  • Auth      : JWT-based authentication (24-hour token)
  • Database  : Microsoft SQL Server (AWS-hosted)
  • Charts    : Recharts (Pie + Bar)


================================================================================
                        SECTION 2 — THE PROBLEM (BEFORE EMA)
================================================================================

Previously, the entire expense auditing process was MANUAL:

  1. Teams had to manually log into SQL Server Management Studio (SSMS) to check
     if SQL Agent jobs ran successfully or failed.

  2. To compare Concur transaction counts with Landing Zone (LZ) data, analysts
     had to manually run SQL queries, export to Excel, and compare columns
     side-by-side — one client at a time.

  3. Receipt verification required manually parsing file names from audit log
     tables, extracting Report IDs and Expense IDs using string operations,
     and then cross-referencing with expense tables.

  4. Qdera reconciliation required the same tedious SQL + Excel process —
     running queries for each client, exporting, and manually matching counts.

  5. Flag checks (iteration_id, islatest) required writing ad-hoc queries
     for each client database, running them one by one, and manually counting
     valid vs invalid records.

  6. Receipt categorization analysis required joining 3+ tables manually,
     comparing boolean flags with actual OCR data presence, and documenting
     mismatches in spreadsheets.

  7. There was NO centralised view of which clients had issues — managers had
     to ask individual analysts for status updates.

  8. There was NO historical trend tracking — each check was a one-time effort
     with no easy way to compare results over time.

  9. Errors were common because manual SQL queries and Excel comparisons are
     prone to copy-paste mistakes, wrong date filters, and missed clients.

 10. The process was extremely time-consuming — what should take minutes was
     taking hours or even days for a full audit cycle across all clients.


================================================================================
                        SECTION 3 — MODULES OVERVIEW
================================================================================

EMA has 6 core functional modules + Authentication:

  ┌────┬──────────────────────────┬─────────────────────────────────────────┐
  │ #  │ Module                   │ What It Does                            │
  ├────┼──────────────────────────┼─────────────────────────────────────────┤
  │ 1  │ Dashboard (Job Monitor)  │ Monitors SQL Agent job executions       │
  │ 2  │ Reconciliation           │ Compares Concur vs LZ transaction counts│
  │ 3  │ Qdera Reconciliation     │ Compares Qdera vs LZ transaction counts │
  │ 4  │ Expenses                 │ Checks receipt presence for expenses    │
  │ 5  │ Flag Check               │ Validates iteration_id & islatest flags │
  │ 6  │ Receipt Categorization   │ Cross-refs Qdera flags with OCR data   │
  │ 7  │ Authentication           │ Secure login/signup with JWT tokens     │
  └────┴──────────────────────────┴─────────────────────────────────────────┘


================================================================================
                 SECTION 4 — MODULE-BY-MODULE DETAILED BREAKDOWN
================================================================================


────────────────────────────────────────────────────────────────────────────────
  MODULE 1: DASHBOARD (SQL Agent Job Monitor)
────────────────────────────────────────────────────────────────────────────────

  WHAT IT DOES:
  Monitors all SQL Server Agent jobs that process expense data for each client.
  Shows real-time status of running jobs, history of completed jobs, and
  upcoming scheduled jobs.

  HOW IT WORKS:
  • The backend queries the Jobs_Details table and SQL Server system tables
    (msdb.dbo.sysjobactivity, sysjobs, sysjobsteps, sysjobschedules)
  • A 4-level CTE (Common Table Expression) chain classifies each job run:
      - Groups job steps into "runs" using window functions
      - Classifies each run as: SUCCESS / FAILED / CANCELLED
      - Extracts "invoked by" and "stopped by" usernames from messages
  • Frontend displays 3 tabs:
      Tab 1 — "Job Done": Full history with stats, charts, expandable tree
      Tab 2 — "Running": Auto-refreshes every 15 seconds, shows live progress
      Tab 3 — "Scheduled": Shows upcoming jobs with next run times

  KEY STATS DISPLAYED:
  • Total Executions, Success Count, Failed Count, Cancelled Count
  • Success Rate, Failed Rate, Cancelled Rate
  • Active Clients count
  • Pie Chart: Jobs by Client
  • Bar Chart: Jobs by Status (Success/Failed/Cancelled per client)

  WHAT PROBLEM IT SOLVES:
  Previously, someone had to open SSMS, navigate to SQL Agent → Job Activity
  Monitor, and manually check each job one by one. If a job failed at step 3
  of 5, they'd have to click into the job history, expand the run, and read
  each step's message. Now everything is visible at a glance.

  TEST CASE EXAMPLE:
  → Select Client: "Kowa" from the dropdown
  → Select Date: By Month → February 2026
  → The dashboard shows:
      Total Executions: 28  |  Success: 25  |  Failed: 2  |  Cancelled: 1
      Success Rate: 89.3%   |  Failed Rate: 7.1%  |  Cancelled Rate: 3.6%
  → Expand a failed job to see exact step where failure occurred
  → Click "Running" tab to see if any jobs are currently executing


────────────────────────────────────────────────────────────────────────────────
  MODULE 2: RECONCILIATION (Concur vs Landing Zone)
────────────────────────────────────────────────────────────────────────────────

  WHAT IT DOES:
  Compares the number of transactions reported by Concur (the expense system)
  against the number of records that actually landed in the Landing Zone (LZ)
  tables for each file.

  HOW IT WORKS:
  • Backend dynamically discovers all enabled client databases from the config
    table (Db_Job_Name_Concure_vs_Receipts)
  • For each client database:
      1. Counts LZ rows per filename from [ClientDB].dbo.LZ_2022_[prefix]
      2. Counts Concur rows per filename from [ClientDB].dbo.Audit_Logs
      3. Compares: if lz_count == concur_count → MATCHED, else → MISMATCHED
  • Supports filtering by 4 date types:
      - Create Date, Submit Date, Paid Date, System Date (from filename)

  KEY STATS DISPLAYED:
  • Total Files, Total Concur Transactions, Total LZ Transactions
  • Files Matched, Files Mismatched
  • Match Rate %, Mismatch Rate %
  • Active Clients
  • Charts: Pie (files per client), Bar (matched vs mismatched per client)

  WHAT PROBLEM IT SOLVES:
  Previously, an analyst had to:
    1. Open SSMS
    2. Write a query to count LZ records for a client
    3. Write another query to count Concur records
    4. Export both to Excel
    5. Use VLOOKUP to match filenames
    6. Manually check if counts match
    7. Repeat for every single client
  This took 2-3 hours per audit cycle. Now it takes seconds.

  UNDERSTANDING THE DATA:
  • MATCHED means: The same file has exactly the same number of records in
    both Concur and the Landing Zone. Data transfer was complete and accurate.
  • MISMATCHED means: The counts don't match — records were lost during
    transfer, duplicated, or the file was partially loaded.

  TEST CASE EXAMPLE:
  → Select Client: "All Clients"
  → Select Date Type: "System Date"
  → Select Date: By Range → 01-Feb-2026 to 28-Feb-2026
  → Results show:
      Total Files: 142  |  Matched: 135  |  Mismatched: 7
      Match Rate: 95.1%  |  Mismatch Rate: 4.9%
  → Click "Mismatched" filter to see only problem files
  → Detail table shows: Filename, Concur Count: 250, LZ Count: 248
    This tells us 2 records were lost during transfer for that file.


────────────────────────────────────────────────────────────────────────────────
  MODULE 3: QDERA RECONCILIATION (Qdera vs Landing Zone)
────────────────────────────────────────────────────────────────────────────────

  WHAT IT DOES:
  Same concept as Concur Reconciliation, but compares Qdera system data
  against Landing Zone data. Qdera is the OCR/template extraction system
  that processes receipts.

  HOW IT WORKS:
  • Discovers client databases dynamically
  • For each client:
      1. Counts LZ rows per filename
      2. Counts Qdera rows per filename from [ClientDB].dbo.qderatemplate
      3. Uses FULL OUTER JOIN (catches files in either source, not just LZ)
      4. Compares: lz_count == qdera_count → MATCHED, else → MISMATCHED

  KEY STATS DISPLAYED:
  • Total Files, Qdera Transactions, LZ Transactions
  • Files Matched / Mismatched with rates
  • Per-client breakdown with charts

  WHAT PROBLEM IT SOLVES:
  The Qdera processing pipeline extracts data from receipt images. If counts
  don't match between Qdera output and the Landing Zone, it means either:
    - Some receipts failed OCR processing
    - Some records weren't loaded into the LZ
    - Duplicate records exist in one system
  Previously this check was completely manual. Now it's automated.

  TEST CASE EXAMPLE:
  → Select Client: "Kowa"
  → Select Date Type: "Create Date"
  → Select Date: By Day → 15-Feb-2026
  → Results show:
      Total Files: 3  |  Matched: 2  |  Mismatched: 1
  → The mismatched file shows: LZ Count: 45, Qdera Count: 43
    Meaning 2 records in LZ have no corresponding Qdera extraction.


────────────────────────────────────────────────────────────────────────────────
  MODULE 4: EXPENSES (Receipt vs E-Receipt Verification)
────────────────────────────────────────────────────────────────────────────────

  WHAT IT DOES:
  For every expense record in the Landing Zone, checks if a corresponding
  physical receipt AND/OR e-receipt exists in the audit log tables.

  HOW IT WORKS:
  • For each client database, the backend:
      1. Queries all expense records from LZ_2022_[prefix] table
      2. LEFT JOINs with tbl_AuditLogs_Receipt — parses the receipt filename
         using CHARINDEX/SUBSTRING to extract ReportID, ExpenseID, and Date
      3. Uses ROW_NUMBER() with PARTITION to get only the most recent receipt
         per (ReportID, ExpenseID, Date) combination
      4. Similarly LEFT JOINs with tbl_AuditLogs_E_Receipt
      5. If Receipt_Filename IS NOT NULL → "Receipt Found" / else → "Receipt Missing"
      6. Same logic for E-Receipt

  KEY STATS DISPLAYED:
  • Total Expenses
  • Receipts Found / Receipts Not Found (with rates)
  • E-Receipts Found / E-Receipts Not Found (with rates)
  • Active Clients
  • Charts: Pie (expenses per client), Bar (found vs missing per client)

  WHAT PROBLEM IT SOLVES:
  Each expense claim must have a receipt attached for compliance. Previously,
  verifying this required:
    1. Querying the expense table for ReportID + ExpenseID
    2. Querying the receipt audit log table
    3. Parsing the complex filename pattern to extract IDs
    4. Matching records manually in Excel
    5. Repeating for physical receipts AND e-receipts separately
  This was the most tedious module to do manually because of the filename
  parsing logic. Now it's fully automated.

  UNDERSTANDING THE DATA:
  • "Receipt Found" = A physical receipt image exists in the audit log
    for that specific expense, matched by ReportID + ExpenseID + Date
  • "Receipt Missing" = No matching receipt was found — this is a
    compliance risk that needs investigation
  • "E-Receipt Found/Missing" = Same logic but for electronic receipts

  TEST CASE EXAMPLE:
  → Select Client: "All Clients"
  → Select Date Type: "Submit Date"
  → Select Date: By Month → January 2026
  → Results show:
      Total Expenses: 5,200
      Receipts Found: 4,850 (93.3%)  |  Receipts Missing: 350 (6.7%)
      E-Receipts Found: 3,900 (75%)  |  E-Receipts Missing: 1,300 (25%)
  → Filter by "Not Found" to see which expenses are missing receipts
  → Drill into detail table: shows ReportV3_ID, ExpenseV3_ID, dates,
    Receipt_Filename (blank where missing)


────────────────────────────────────────────────────────────────────────────────
  MODULE 5: FLAG CHECK (Data Integrity Validation)
────────────────────────────────────────────────────────────────────────────────

  WHAT IT DOES:
  Validates whether critical data-quality flags (iteration_id and islatest)
  are properly populated in the Landing Zone tables for each expense record.

  HOW IT WORKS:
  • For each expense record in LZ tables, checks:
      - If iteration_id IS NOT NULL AND islatest IS NOT NULL → "Found" (Valid)
      - If either is NULL → "Not Found" (Invalid)
  • Returns total valid vs invalid counts with per-client breakdown

  KEY STATS DISPLAYED:
  • Total Records, Found (Valid), Not Found (Invalid)
  • Found Rate %, Not Found Rate %
  • Unique Files count, Unique Reports count
  • Active Clients
  • Charts: Pie (records per client), Bar (valid vs invalid per client)

  WHAT PROBLEM IT SOLVES:
  The iteration_id and islatest flags are critical for the expense processing
  pipeline. If they're missing:
    - The system can't determine which version of a record is the latest
    - Duplicate processing can occur
    - Reports won't generate correctly
  Previously, checking these flags required writing a query for EACH client
  database, running it, counting NULLs, and reporting. For 10+ clients,
  this took significant time. Now it's a single click.

  UNDERSTANDING THE DATA:
  • "Found" (Valid) = Both iteration_id and islatest are populated. The
    record is properly flagged and can be processed correctly.
  • "Not Found" (Invalid) = One or both flags are NULL. This indicates a
    data-loading issue that needs to be investigated and fixed.

  TEST CASE EXAMPLE:
  → Select Client: "Kowa"
  → Select Date Type: "Create Date"
  → Select Date: By Year → 2026
  → Results show:
      Total Records: 12,500  |  Found: 12,480  |  Not Found: 20
      Found Rate: 99.8%  |  Not Found Rate: 0.2%
  → Filter by "Not Found" to see the 20 problematic records
  → Detail shows: Filename, ReportID, ExpenseID, iteration_id (NULL),
    islatest (NULL) — these need to be fixed


────────────────────────────────────────────────────────────────────────────────
  MODULE 6: RECEIPT CATEGORIZATION (Qdera Flags vs OCR Data)
────────────────────────────────────────────────────────────────────────────────

  WHAT IT DOES:
  Cross-references the categorization flags in the Qdera template table
  (hasSignInSheetAttached, hasDineInReceiptAttached) with the actual presence
  of OCR data in the DineIn and SignInSheet tables.

  HOW IT WORKS:
  • For each client database:
      1. Reads qderatemplate records with categorization flags
      2. LEFT JOINs with SignInSheetOcrData → checks if entry exists (Found_In_SIS)
      3. LEFT JOINs with DineInOnlineReceiptOcrData → checks if entry exists
         (Found_In_Dine)
      4. Comparison logic:
         - If hasSignInSheetAttached flag matches Found_In_SIS AND
           hasDineInReceiptAttached flag matches Found_In_Dine → "MATCH"
         - Otherwise → "MISMATCH" (Error)
      5. Also tracks NULL columns (isreceiptuploaded, isMultiDocument,
         isMealItemized) for data completeness

  KEY STATS DISPLAYED:
  • Total Records, Match (Found), Mismatch (Error)
  • Match Rate %, Mismatch Rate %
  • Charts: Grouped bar comparing SIS Flag vs Found SIS, Dine Flag vs Found Dine

  WHAT PROBLEM IT SOLVES:
  The Qdera system flags whether a sign-in sheet or dine-in receipt is
  attached. But are these flags accurate? This module verifies by checking
  if the actual OCR data exists in the corresponding tables. Mismatches
  indicate either:
    - A flag was set incorrectly (false positive)
    - OCR processing failed (flag says attached but no OCR data)
    - Data wasn't loaded into the correct table
  This verification was impossible to do manually at scale.

  TEST CASE EXAMPLE:
  → Select Client: "All Clients"
  → Select Date Type: "Submit Date"
  → Select Date: By Range → 01-Jan-2026 to 28-Feb-2026
  → Results show:
      Total Records: 8,400  |  Match: 8,100 (96.4%)  |  Mismatch: 300 (3.6%)
  → Filter by "Mismatch" to investigate errors
  → Detail row shows:
      hasSignInSheetAttached: 1, Found_In_SIS: 0
      → Flag says sign-in sheet is attached but no OCR data found!
      This means the OCR processing pipeline failed for these records.


================================================================================
            SECTION 5 — COMMON FEATURES ACROSS ALL MODULES
================================================================================

Every data module (Reconciliation, Qdera, Expenses, FlagCheck, Receipt
Categorization) shares these powerful features:

  1. DYNAMIC CLIENT DISCOVERY
     The system automatically discovers all enabled client databases from
     configuration tables. No hardcoded client names. When a new client is
     added to the config table, it automatically appears in the portal.

  2. FLEXIBLE DATE FILTERING
     Every module supports:
       • All Time — see everything
       • By Day — pick a specific date
       • By Month — pick month + year
       • By Year — pick a year
       • By Range — pick start date to end date
     Plus, filter by date TYPE: Create Date, Submit Date, Paid Date
     (and System Date for Reconciliation/Qdera)

  3. CLIENT FILTERING
     Select "All Clients" or drill into a specific client.

  4. STATUS FILTERING
     Filter the detail table by status (Match/Mismatch, Found/Not Found, etc.)
     with count badges showing how many records in each category.

  5. THREE-LEVEL DATA DISPLAY
     Grand totals → Per-client breakdown → Individual records.
     Tables are grouped by client and expandable for drill-down.

  6. VISUAL CHARTS
     Pie charts show distribution across clients.
     Bar charts show status breakdown per client.

  7. RESPONSIVE STAT CARDS
     Key metrics displayed as coloured cards at the top of every page
     for instant visibility.


================================================================================
            SECTION 6 — AUTHENTICATION & SECURITY
================================================================================

  • JWT-based authentication — every API call requires a valid token
  • Token expires after 24 hours — user must re-login
  • Protected routes — frontend prevents access to pages without login
  • Email domain whitelist — only approved email domains can register
  • Automatic redirect — if token expires, user is sent to login page


================================================================================
           SECTION 7 — 10 REASONS WHY EMA IS BETTER THAN THE PREVIOUS
                         MANUAL PROCESS
================================================================================

  ┌────┬─────────────────────────┬──────────────────────┬────────────────────────────┐
  │ #  │ ASPECT                  │ BEFORE (Manual)      │ AFTER (EMA Portal)         │
  ├────┼─────────────────────────┼──────────────────────┼────────────────────────────┤
  │    │                         │                      │                            │
  │ 1  │ SPEED                   │ A full audit across  │ All modules load in        │
  │    │                         │ all clients took     │ seconds. What took 4-6     │
  │    │                         │ 4-6 hours of manual  │ hours now takes under      │
  │    │                         │ SQL queries + Excel  │ 5 minutes for ALL clients  │
  │    │                         │ work                 │ combined.                  │
  │    │                         │                      │                            │
  │ 2  │ ACCURACY                │ Manual copy-paste    │ Automated SQL with tested  │
  │    │                         │ from SSMS to Excel   │ logic eliminates human     │
  │    │                         │ caused frequent      │ errors. Every comparison   │
  │    │                         │ mistakes — wrong     │ is computed by the system  │
  │    │                         │ date filters, missed │ consistently every time.   │
  │    │                         │ clients, formula     │                            │
  │    │                         │ errors               │                            │
  │    │                         │                      │                            │
  │ 3  │ SCALABILITY             │ Adding a new client  │ Just add the client to the │
  │    │                         │ meant creating new   │ config table in SQL. The   │
  │    │                         │ queries, new Excel   │ portal automatically       │
  │    │                         │ templates, and       │ discovers and includes the │
  │    │                         │ training the analyst │ new client. Zero code      │
  │    │                         │ on the new database  │ changes needed.            │
  │    │                         │ structure            │                            │
  │    │                         │                      │                            │
  │ 4  │ VISIBILITY              │ Only the analyst     │ Anyone with access can see │
  │    │                         │ running the queries  │ the dashboard. Managers    │
  │    │                         │ knew the results.    │ get instant visibility     │
  │    │                         │ Managers had to ask  │ into all clients, all      │
  │    │                         │ for email updates    │ modules, all statuses.     │
  │    │                         │                      │                            │
  │ 5  │ CONSISTENCY             │ Different analysts   │ ONE standardised system.   │
  │    │                         │ wrote different      │ Same logic, same output,   │
  │    │                         │ queries. Results     │ same format every time.    │
  │    │                         │ varied based on who  │ No variation regardless    │
  │    │                         │ ran the audit and    │ of who uses it.            │
  │    │                         │ how they wrote       │                            │
  │    │                         │ their SQL            │                            │
  │    │                         │                      │                            │
  │ 6  │ REAL-TIME MONITORING    │ Job failures were    │ Job status is visible in   │
  │    │                         │ discovered hours     │ real-time. The "Running"   │
  │    │                         │ later when someone   │ tab auto-refreshes every   │
  │    │                         │ manually checked.    │ 15 seconds. Failures are   │
  │    │                         │ By then, downstream  │ caught immediately.        │
  │    │                         │ processes had        │                            │
  │    │                         │ already failed       │                            │
  │    │                         │                      │                            │
  │ 7  │ MULTI-CLIENT IN         │ Each client required │ All clients are queried    │
  │    │ ONE VIEW                │ separate queries and │ in a single request using  │
  │    │                         │ separate Excel files │ dynamic SQL with cursors.  │
  │    │                         │ — no combined view   │ Grand totals + per-client  │
  │    │                         │                      │ breakdown in one screen.   │
  │    │                         │                      │                            │
  │ 8  │ DRILL-DOWN CAPABILITY   │ To investigate a     │ Click a row to see full    │
  │    │                         │ mismatch, analysts   │ details. Expand a client   │
  │    │                         │ had to go back to    │ group to see all records.  │
  │    │                         │ SSMS, modify the     │ Filter by status to see    │
  │    │                         │ query, re-run, and   │ only problems. No need to  │
  │    │                         │ look at raw data     │ go back to SSMS.           │
  │    │                         │                      │                            │
  │ 9  │ REDUCED DEPENDENCY      │ Only analysts with   │ Any authorised user can    │
  │    │ ON SKILLED RESOURCES    │ SQL knowledge could  │ use the portal. No SQL     │
  │    │                         │ perform audits.      │ knowledge required. Just   │
  │    │                         │ If that person was   │ select client, date, and   │
  │    │                         │ absent, audits       │ click. Audits never stop   │
  │    │                         │ didn't happen        │ because of absences.       │
  │    │                         │                      │                            │
  │ 10 │ DATA-DRIVEN DECISIONS   │ Results were in      │ Visual charts (pie + bar)  │
  │    │                         │ spreadsheets with    │ give instant insight.      │
  │    │                         │ raw numbers.         │ Match rates, failure       │
  │    │                         │ Difficult to spot    │ rates, and trends are      │
  │    │                         │ trends or summarise  │ visible at a glance.       │
  │    │                         │ for management       │ Perfect for management     │
  │    │                         │                      │ reporting.                 │
  └────┴─────────────────────────┴──────────────────────┴────────────────────────────┘


================================================================================
            SECTION 8 — TEST CASES & HOW TO DEMONSTRATE
================================================================================

Below are step-by-step test cases you can walk through during the presentation:

──────────────────────────────────────────
TEST CASE 1: Dashboard — Job Monitoring
──────────────────────────────────────────
  Step 1: Login with your email and password
  Step 2: You land on the Dashboard (Jobs page)
  Step 3: Select "All Clients" and "All Time"
  Step 4: Observe the stat cards showing total executions, success/failed/cancelled
  Step 5: Look at the Pie Chart — shows distribution of jobs across clients
  Step 6: Look at the Bar Chart — shows success/failed/cancelled per client
  Step 7: Expand a specific job in the table → see the step pipeline
  Step 8: Click "Running" tab → see any currently executing jobs (auto-refreshes)
  Step 9: Click "Scheduled" tab → see upcoming jobs with next run times
  Step 10: Click "Refresh Data" → triggers fresh job data pull from SQL Agent

  EXPECTED RESULT: All cards populate with real data, charts render,
  jobs are expandable with step-level detail.

──────────────────────────────────────────
TEST CASE 2: Reconciliation — Match/Mismatch
──────────────────────────────────────────
  Step 1: Navigate to "Reconciliation" from sidebar
  Step 2: Select Client: "All Clients"
  Step 3: Select Date Type: "System Date"
  Step 4: Select Date Filter: "By Month" → pick a recent month
  Step 5: Click to load data
  Step 6: Observe stats: Total Files, Concur Count, LZ Count, Matched, Mismatched
  Step 7: Click "Mismatched" in the StatusFilter bar
  Step 8: The table now shows ONLY files where concur_count ≠ lz_count
  Step 9: Expand a client group to see individual file details
  Step 10: Note the specific counts — e.g., Concur: 250, LZ: 248 = 2 records lost

  WHAT TO EXPLAIN:
  • "Matched" means the same file has equal transaction counts in both systems.
    Data transfer was complete and accurate.
  • "Mismatched" means counts differ — records may have been lost, duplicated,
    or partially loaded. Each mismatch needs investigation.

──────────────────────────────────────────
TEST CASE 3: Qdera Reconciliation
──────────────────────────────────────────
  Step 1: Navigate to "Qdera Reconciliation"
  Step 2: Select a specific client
  Step 3: Select Date Type: "Create Date"
  Step 4: Select a date range
  Step 5: Observe stats and charts
  Step 6: Filter by "Mismatched" to see problem files
  Step 7: Compare Qdera Count vs LZ Count for each file

  WHAT TO EXPLAIN:
  • Qdera is the OCR extraction system. If Qdera extracted 43 records but
    LZ has 45, it means 2 records weren't processed by Qdera.
  • Uses FULL OUTER JOIN — catches files that exist in only one system.

──────────────────────────────────────────
TEST CASE 4: Expenses — Receipt Found / Not Found
──────────────────────────────────────────
  Step 1: Navigate to "Expenses"
  Step 2: Select Client: "All Clients"
  Step 3: Select Date Type: "Submit Date"
  Step 4: Select "By Month" for a recent month
  Step 5: Observe stats: Total Expenses, Receipts Found, Receipts Missing,
          E-Receipts Found, E-Receipts Missing
  Step 6: Filter by "Not Found"
  Step 7: The table shows expense records that have NO matching receipt

  WHAT TO EXPLAIN:
  • "Receipt Found" = A physical receipt image exists matching that expense by
    ReportID + ExpenseID + Date. The receipt was properly uploaded and processed.
  • "Receipt Not Found" = No matching receipt exists. This is a compliance gap —
    the employee submitted an expense but didn't attach the receipt.
  • "E-Receipt" is the electronic version — same logic applies.
  • The system parses complex filenames to extract IDs — this was extremely
    error-prone when done manually.

──────────────────────────────────────────
TEST CASE 5: Flag Check — Found / Not Found
──────────────────────────────────────────
  Step 1: Navigate to "Flag Check"
  Step 2: Select a specific client
  Step 3: Select Date Type: "Create Date"
  Step 4: Select "By Year" → current year
  Step 5: Observe stats: Total Records, Found (Valid), Not Found (Invalid)
  Step 6: Filter by "Not Found"
  Step 7: See which specific records have NULL iteration_id or islatest

  WHAT TO EXPLAIN:
  • "Found" = Both iteration_id AND islatest are populated. The record is
    properly flagged in the system and will be processed correctly.
  • "Not Found" = One or both flags are NULL. This means the data loading
    process didn't assign proper version tracking to these records.
    Without these flags, the system can't determine which record version
    is the latest, causing potential duplicate processing.

──────────────────────────────────────────
TEST CASE 6: Receipt Categorization — Match / Mismatch
──────────────────────────────────────────
  Step 1: Navigate to "Receipt Categorization"
  Step 2: Select "All Clients"
  Step 3: Select a date range
  Step 4: Observe stats: Total Records, Match, Mismatch
  Step 5: Filter by "Mismatch"
  Step 6: Look at detail:
          - hasSignInSheetAttached: 1, Found_In_SIS: 0 → FLAG SAYS YES BUT NO OCR DATA
          - hasDineInReceiptAttached: 0, Found_In_Dine: 1 → FLAG SAYS NO BUT DATA EXISTS

  WHAT TO EXPLAIN:
  • "Match" = The Qdera flags align with actual OCR data presence.
    If the flag says a sign-in sheet is attached AND OCR data exists → correct.
    If the flag says no attachment AND no OCR data exists → also correct.
  • "Mismatch" = Flags and reality don't agree. Either:
    - Flag says "attached" but no OCR data found (processing failed)
    - Flag says "not attached" but OCR data exists (flag is wrong)
    Both cases need investigation.


================================================================================
            SECTION 9 — ARCHITECTURE & TECHNICAL HIGHLIGHTS
================================================================================

  ARCHITECTURE:
  ┌─────────────────┐          ┌──────────────────┐          ┌──────────────────┐
  │   React App     │  HTTP +  │   Express API    │  MSSQL   │  SQL Server      │
  │   (Browser)     │◄────────►│   (Node.js)      │◄────────►│  (EMA_Support    │
  │                 │   JWT    │                  │  Queries │   _Module)       │
  │  • Dashboard    │          │  • /dashboard/*  │          │                  │
  │  • Reconcile    │          │  • /reconcile/*  │          │  ┌──────────────┐│
  │  • Qdera        │          │  • /qdera/*      │          │  │ Client DB 1  ││
  │  • Expenses     │          │  • /expenses/*   │          │  │ Client DB 2  ││
  │  • FlagCheck    │          │  • /flagcheck/*  │          │  │ Client DB 3  ││
  │  • ReceiptCat   │          │  • /receipt/*    │          │  │ ...          ││
  └─────────────────┘          └──────────────────┘          │  └──────────────┘│
                                                              └──────────────────┘

  TECHNICAL HIGHLIGHTS:
  • Dynamic SQL with Cursor: Queries loop over all client databases
    automatically — no hardcoded database names
  • Temp Tables: Data from multiple clients consolidated into #temp tables
    for efficient aggregation
  • CTE Chains: Dashboard uses a 4-level CTE chain with window functions
    for job run classification
  • LEFT JOIN + ROW_NUMBER: Expenses module uses partition-based deduplication
    for getting the most recent receipt per expense
  • FULL OUTER JOIN: Qdera module catches records that exist in only one system
  • React Query: Smart caching with automatic refetch on filter change
  • Auto-refresh: Running jobs tab polls every 15 seconds
  • JWT Auth: Stateless authentication with automatic token expiry


================================================================================
            SECTION 10 — PERFORMANCE IMPROVEMENTS
================================================================================

  BEFORE OPTIMIZATION:
  • Original queries used OUTER APPLY causing N+1 lookups
  • Query execution time: 30-60 seconds per module
  • Frontend rendered 2100+ rows in one DOM tree — slow rendering

  AFTER OPTIMIZATION:
  • Replaced OUTER APPLY with LEFT JOIN + MAX() aggregation
  • Query execution time: 3-8 seconds per module (75-90% improvement)
  • Frontend uses grouped/expandable tables — renders only visible rows
  • React Query caching prevents unnecessary re-fetches


================================================================================
            SECTION 11 — SUMMARY
================================================================================

  EMA Portal transforms the expense auditing process from a manual, error-prone,
  time-consuming activity into an automated, accurate, real-time monitoring
  system. It covers the full audit lifecycle:

    1. JOB MONITORING  → Are the data pipelines running correctly?
    2. RECONCILIATION  → Did all Concur transactions reach the Landing Zone?
    3. QDERA RECON     → Did Qdera process all records correctly?
    4. EXPENSES         → Do all expenses have receipts attached?
    5. FLAG CHECK       → Are data-quality flags properly set?
    6. RECEIPT CATEG.   → Do categorization flags match actual OCR data?

  Total manual time saved per audit cycle: ~4-6 hours → ~5 minutes
  Error rate reduction: Eliminated manual copy-paste and formula errors
  Client scalability: Zero-code addition of new clients
  Accessibility: Any authorised user, no SQL skills required

================================================================================
                         END OF PRESENTATION
================================================================================
