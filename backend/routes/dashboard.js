const express = require('express');
const sql = require('mssql');
const dbConfig = require('../config/db');

const router = express.Router();

// Helper: Extract client name from a job name like
//   "Expense_Report_Audit_Kowa"  or  "ExpenseReportAudit_Kowa"
function extractClientName(jobName) {
    if (!jobName) return null;
    const match = jobName.match(/Expense_?Report_?Audit_(.+)/i);
    if (match) return match[1].replace(/_product$/i, '');
    return null;
}

// POST /api/dashboard/insert-new-jobs - Execute stored procedure to insert new job details
router.post('/insert-new-jobs', async (req, res) => {
    try {
        console.log('Executing stored procedure: sp_new_job_detail_Insert');
        let pool = await sql.connect(dbConfig);

        // Execute the stored procedure
        const result = await pool.request().execute('dbo.sp_new_job_detail_Insert');

        console.log('Stored procedure executed successfully');
        res.json({
            success: true,
            message: 'New job details inserted successfully',
            rowsAffected: result.rowsAffected
        });
    } catch (err) {
        console.error('Error executing stored procedure:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to insert new job details',
            details: err.message
        });
    }
});

// ──────────────────────────────────────────────────────────────
// PKT DATE COMPUTATION
// ──────────────────────────────────────────────────────────────
// Jobs_Details stores RunDate (DATE, UTC) and Run_time (INT HHMMSS, UTC).
// To get the PKT date we build a UTC datetime from RunDate + Run_time,
// then add 5 hours (18 000 seconds) and extract the date portion.
// This ensures a job running at 2 AM PKT (= 9 PM UTC previous day)
// is correctly attributed to the current PKT day.
// ──────────────────────────────────────────────────────────────
const PKT_DATE_EXPR = `CONVERT(DATE, DATEADD(SECOND,
    (ISNULL(Run_time,0)/10000)*3600 + ((ISNULL(Run_time,0)/100)%100)*60 + (ISNULL(Run_time,0)%100) + 18000,
    CAST(RunDate AS DATETIME)))`;

// Helper: Build WHERE conditions from query params (all dates in PKT)
function buildConditions(query) {
    const { type, date, month, year, client, fromDate, toDate } = query;
    let conditions = [];

    if (type === 'day' && date) {
        // Sargable pre-filter on UTC RunDate to keep index usage, then exact PKT filter
        conditions.push(`RunDate BETWEEN DATEADD(DAY, -1, '${date}') AND '${date}'`);
        conditions.push(`${PKT_DATE_EXPR} = '${date}'`);
    } else if (type === 'month' && month && year) {
        conditions.push(`YEAR(${PKT_DATE_EXPR}) = ${parseInt(year)} AND MONTH(${PKT_DATE_EXPR}) = ${parseInt(month)}`);
    } else if (type === 'year' && year) {
        conditions.push(`YEAR(${PKT_DATE_EXPR}) = ${parseInt(year)}`);
    } else if (type === 'range' && fromDate && toDate) {
        conditions.push(`${PKT_DATE_EXPR} BETWEEN '${fromDate}' AND '${toDate}'`);
    }

    if (client) {
        const clientPattern = client.replace(/'/g, "''");
        conditions.push(`JobName LIKE '%Audit[_]${clientPattern}%'`);
    }

    return conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';
}

// GET /api/dashboard/stats - Dashboard stats using CTE-based analysis
router.get('/stats', async (req, res) => {
    try {
        const filterConditions = buildConditions(req.query);
        console.log('Stats API called with filters:', req.query);
        let pool = await sql.connect(dbConfig);

        // ── Main CTE query: groups steps into runs, diagnoses, classifies ──
        const analysisQuery = `
            ;WITH JobGroups AS (
                SELECT 
                    *,
                    SUM(CASE WHEN step_id = 0 THEN 1 ELSE 0 END) 
                    OVER (PARTITION BY job_id ORDER BY instance_id DESC) as RunGroupID
                FROM Jobs_Details 
                WHERE 1=1 ${filterConditions}
            ),
            RunDiagnostics AS (
                SELECT 
                    job_id,
                    JobName,
                    RunGroupID,
                    -- PKT RunDate: earliest step's UTC datetime + 5 hours
                    CONVERT(VARCHAR(10), DATEADD(HOUR, 5, MIN(
                        DATEADD(SECOND,
                            (ISNULL(Run_time,0)/10000)*3600
                          + ((ISNULL(Run_time,0)/100)%100)*60
                          + (ISNULL(Run_time,0)%100),
                            CAST(RunDate AS DATETIME))
                    )), 120) as RunDate,
                    MIN(instance_id) as InstanceId_Of_First_Step,
                    MAX(instance_id) as InstanceId_Of_Last_Step,
                    MIN(Run_time) as RunTime_Of_First_Step,
                    MAX(Run_time) as RunTime_Of_Last_Step,
                    MAX(CASE WHEN step_id = 0 THEN run_duration ELSE NULL END) as TotalDuration,
                    MAX(CASE WHEN step_id = 0 THEN 1 ELSE 0 END) as HasOutcomeStep,
                    MAX(CASE WHEN run_status = 3 THEN 1 ELSE 0 END) as HasCancel,
                    MAX(CASE WHEN run_status = 0 THEN 1 ELSE 0 END) as HasFail,
                    CAST(STRING_AGG(CASE WHEN run_status = 3 AND step_id > 0 THEN CAST(StepName AS NVARCHAR(MAX)) ELSE NULL END, ', ') 
                        WITHIN GROUP (ORDER BY step_id) AS NVARCHAR(MAX)) as Cancelled_Step_List,
                    CAST(STRING_AGG(CASE WHEN run_status = 3 AND step_id > 0 THEN CAST(step_id AS VARCHAR) ELSE NULL END, ', ') 
                        WITHIN GROUP (ORDER BY step_id) AS NVARCHAR(MAX)) as Cancelled_Step_Id,
                    CAST(STRING_AGG(CASE WHEN run_status = 0 AND step_id > 0 THEN CAST(StepName AS NVARCHAR(MAX)) ELSE NULL END, ', ') 
                        WITHIN GROUP (ORDER BY step_id) AS NVARCHAR(MAX)) as Fail_Step_List,
                    CAST(STRING_AGG(CASE WHEN run_status = 0 AND step_id > 0 THEN CAST(step_id AS VARCHAR) ELSE NULL END, ', ') 
                        WITHIN GROUP (ORDER BY step_id) AS NVARCHAR(MAX)) as Fail_Step_Id,
                    CAST(STRING_AGG(CASE WHEN run_status = 1 AND step_id > 0 THEN CAST(StepName AS NVARCHAR(MAX)) ELSE NULL END, ', ') 
                        WITHIN GROUP (ORDER BY step_id) AS NVARCHAR(MAX)) as Success_Step_List,
                    CAST(STRING_AGG(CASE WHEN run_status = 1 AND step_id > 0 THEN CAST(step_id AS VARCHAR) ELSE NULL END, ', ') 
                        WITHIN GROUP (ORDER BY step_id) AS NVARCHAR(MAX)) as Success_Step_Id,
                    MAX(CASE WHEN step_id = 0 THEN ExecutionMessage END) as ExecutionMsg
                FROM JobGroups
                GROUP BY job_id, JobName, RunGroupID
            ),
            FinalClassification AS (
                SELECT 
                    *,
                    CASE 
                        WHEN HasCancel = 1 THEN 'Cancelled' 
                        WHEN HasFail = 1 THEN 'Failed'
                        WHEN HasOutcomeStep = 0 THEN 'Failed'
                        ELSE 'Success'
                    END as FinalStatus
                FROM RunDiagnostics
            ),
            FullAnalysis AS (
                SELECT 
                    *,
                    CASE 
                        WHEN CHARINDEX('invoked by User ', ExecutionMsg) > 0 THEN 
                            SUBSTRING(
                                ExecutionMsg, 
                                CHARINDEX('invoked by User ', ExecutionMsg) + 16, 
                                CASE 
                                    WHEN CHARINDEX('.', ExecutionMsg, CHARINDEX('invoked by User ', ExecutionMsg)) > 0
                                    THEN CHARINDEX('.', ExecutionMsg, CHARINDEX('invoked by User ', ExecutionMsg)) - (CHARINDEX('invoked by User ', ExecutionMsg) + 16)
                                    ELSE 50
                                END
                            )
                        ELSE 'System'
                    END as Job_Invoked_By,
                    CASE 
                        WHEN FinalStatus = 'Cancelled' AND CHARINDEX('stopped prior to completion by User ', ExecutionMsg) > 0 THEN 
                            SUBSTRING(
                                ExecutionMsg, 
                                CHARINDEX('stopped prior to completion by User ', ExecutionMsg) + 36, 
                                CASE
                                    WHEN CHARINDEX('.', ExecutionMsg, CHARINDEX('stopped prior to completion by User ', ExecutionMsg)) > 0
                                    THEN CHARINDEX('.', ExecutionMsg, CHARINDEX('stopped prior to completion by User ', ExecutionMsg)) - (CHARINDEX('stopped prior to completion by User ', ExecutionMsg) + 36)
                                    ELSE 50
                                END
                            )
                        ELSE NULL 
                    END as Job_Stopped_By
                FROM FinalClassification
            )
            SELECT * FROM FullAnalysis
            ORDER BY RunDate DESC, RunGroupID ASC
        `;

        console.log('Analysis Query executing...');
        const analysisResult = await pool.request().query(analysisQuery);
        const jobRuns = analysisResult.recordset || [];

        // ── Compute stats from the analysis ──
        const totalExecutions = jobRuns.length;
        const successCount = jobRuns.filter(j => j.FinalStatus === 'Success').length;
        const failedCount = jobRuns.filter(j => j.FinalStatus === 'Failed').length;
        const cancelledCount = jobRuns.filter(j => j.FinalStatus === 'Cancelled').length;

        // Calculate percentages properly to ensure they sum to 100%
        let successRate = 0;
        let failedRate = 0;
        let cancelledRate = 0;

        if (totalExecutions > 0) {
            // Calculate raw percentages
            const rawSuccess = (successCount / totalExecutions) * 100;
            const rawFailed = (failedCount / totalExecutions) * 100;
            const rawCancelled = (cancelledCount / totalExecutions) * 100;

            // Round to 1 decimal place
            successRate = Math.round(rawSuccess * 10) / 10;
            failedRate = Math.round(rawFailed * 10) / 10;
            cancelledRate = Math.round(rawCancelled * 10) / 10;

            // Adjust to ensure sum is exactly 100%
            const sum = successRate + failedRate + cancelledRate;
            if (sum !== 100) {
                const diff = 100 - sum;
                // Add the difference to the largest percentage
                if (successCount >= failedCount && successCount >= cancelledCount) {
                    successRate = Math.round((successRate + diff) * 10) / 10;
                } else if (failedCount >= cancelledCount) {
                    failedRate = Math.round((failedRate + diff) * 10) / 10;
                } else {
                    cancelledRate = Math.round((cancelledRate + diff) * 10) / 10;
                }
            }
        }

        // ── Extract unique active clients from JobName ──
        const clientSet = new Set();
        jobRuns.forEach(j => {
            const client = extractClientName(j.JobName);
            if (client) clientSet.add(client);
        });

        // ── Jobs by client for pie chart ──
        const clientCounts = {};
        jobRuns.forEach(j => {
            const clientName = extractClientName(j.JobName) || 'Other';
            clientCounts[clientName] = (clientCounts[clientName] || 0) + 1;
        });
        const jobsByClient = Object.entries(clientCounts).map(([name, count]) => ({
            client_name: name,
            job_count: count
        }));

        // ── Jobs by status for bar chart ──
        const jobsByStatus = [
            { status: 'Success', count: successCount },
            { status: 'Failed', count: failedCount },
            { status: 'Cancelled', count: cancelledCount }
        ];

        // ── Client statistics (grouped by client) ──
        const clientStats = {};
        jobRuns.forEach(j => {
            const clientName = extractClientName(j.JobName) || 'Other';

            if (!clientStats[clientName]) {
                clientStats[clientName] = {
                    clientName,
                    totalExecutions: 0,
                    successCount: 0,
                    failedCount: 0,
                    cancelledCount: 0
                };
            }

            clientStats[clientName].totalExecutions++;
            if (j.FinalStatus === 'Success') clientStats[clientName].successCount++;
            else if (j.FinalStatus === 'Failed') clientStats[clientName].failedCount++;
            else if (j.FinalStatus === 'Cancelled') clientStats[clientName].cancelledCount++;
        });

        // Convert to array and calculate percentages
        const clientStatistics = Object.values(clientStats).map(client => {
            const total = client.totalExecutions;
            if (total === 0) {
                return {
                    ...client,
                    successRate: 0,
                    failedRate: 0,
                    cancelledRate: 0
                };
            }

            // Calculate raw percentages
            const rawSuccess = (client.successCount / total) * 100;
            const rawFailed = (client.failedCount / total) * 100;
            const rawCancelled = (client.cancelledCount / total) * 100;

            // Round to 1 decimal
            let successRate = Math.round(rawSuccess * 10) / 10;
            let failedRate = Math.round(rawFailed * 10) / 10;
            let cancelledRate = Math.round(rawCancelled * 10) / 10;

            // Ensure sum = 100.0
            const sum = successRate + failedRate + cancelledRate;
            if (sum !== 100.0) {
                const diff = 100.0 - sum;
                // Add difference to the largest category
                if (client.successCount >= client.failedCount && client.successCount >= client.cancelledCount) {
                    successRate = Math.round((successRate + diff) * 10) / 10;
                } else if (client.failedCount >= client.cancelledCount) {
                    failedRate = Math.round((failedRate + diff) * 10) / 10;
                } else {
                    cancelledRate = Math.round((cancelledRate + diff) * 10) / 10;
                }
            }

            return {
                ...client,
                successRate,
                failedRate,
                cancelledRate
            };
        }).sort((a, b) => b.totalExecutions - a.totalExecutions); // Sort by most executions

        // ── Group job runs by JobName + RunDate for tree view ──
        const jobTree = {};
        jobRuns.forEach(run => {
            const clientName = extractClientName(run.JobName) || 'Unknown';
            const dateStr = run.RunDate ? String(run.RunDate).substring(0, 10) : 'Unknown';
            const key = `${run.JobName}__${dateStr}`;

            if (!jobTree[key]) {
                jobTree[key] = {
                    jobName: run.JobName,
                    jobId: run.job_id,
                    clientName,
                    date: dateStr,
                    runs: []
                };
            }

            jobTree[key].runs.push({
                runGroupId: run.RunGroupID,
                status: run.FinalStatus,
                runTimeStart: run.RunTime_Of_First_Step,
                runTimeEnd: run.RunTime_Of_Last_Step,
                totalDuration: run.TotalDuration ?? null,
                invokedBy: run.Job_Invoked_By,
                stoppedBy: run.Job_Stopped_By,
                failedSteps: run.Fail_Step_List,
                failedStepIds: run.Fail_Step_Id,
                cancelledSteps: run.Cancelled_Step_List,
                cancelledStepIds: run.Cancelled_Step_Id,
                successSteps: run.Success_Step_List,
                successStepIds: run.Success_Step_Id,
                instanceStart: run.InstanceId_Of_First_Step,
                instanceEnd: run.InstanceId_Of_Last_Step
            });
        });

        // Convert tree to sorted array
        const jobGroups = Object.values(jobTree).sort((a, b) => {
            if (a.date > b.date) return -1;
            if (a.date < b.date) return 1;
            return 0;
        });

        res.json({
            totalExecutions,
            successCount,
            failedCount,
            cancelledCount,
            successRate: parseFloat(successRate),
            failedRate: parseFloat(failedRate),
            cancelledRate: parseFloat(cancelledRate),
            activeClients: clientSet.size,
            jobsByClient,
            jobsByStatus,
            clientStatistics,
            jobGroups,
            rawRuns: jobRuns
        });
    } catch (err) {
        console.error('Dashboard stats error:', err);
        res.status(500).json({ error: err.message, details: err.toString() });
    }
});

// ──────────────────────────────────────────────────────────────
// GET /api/dashboard/running - Currently running SQL Agent jobs
// ──────────────────────────────────────────────────────────────
router.get('/running', async (req, res) => {
    try {
        const { client, type, date, month, year, fromDate, toDate } = req.query;
        let pool = await sql.connect(dbConfig);

        let clientCondition = '';
        if (client) {
            const clientPattern = client.replace(/'/g, "''");
            clientCondition = `AND j.name LIKE '%Audit[_]${clientPattern}%'`;
        }

        // Date conditions on PKT-converted start time
        let dateConditions = '';
        const pktExpr = 'DATEADD(HOUR, 5, ja.start_execution_date)';
        if (type === 'day' && date) {
            dateConditions = `AND CONVERT(DATE, ${pktExpr}) = '${date}'`;
        } else if (type === 'month' && month && year) {
            dateConditions = `AND YEAR(${pktExpr}) = ${parseInt(year)} AND MONTH(${pktExpr}) = ${parseInt(month)}`;
        } else if (type === 'year' && year) {
            dateConditions = `AND YEAR(${pktExpr}) = ${parseInt(year)}`;
        } else if (type === 'range' && fromDate && toDate) {
            dateConditions = `AND CONVERT(DATE, ${pktExpr}) BETWEEN '${fromDate}' AND '${toDate}'`;
        }

        const query = `
            SELECT
                j.job_id        AS jobId,
                j.name          AS jobName,
                CONVERT(VARCHAR(19), DATEADD(HOUR, 5, ja.start_execution_date), 120) AS startedAt,
                DATEDIFF(MINUTE, ja.start_execution_date, GETDATE()) AS runningMinutes,
                ISNULL(js.step_name, '(Job Outcome)') AS currentStepName,
                ISNULL(ja.last_executed_step_id, 0) + 1 AS currentStepNumber,
                ja.session_id   AS sessionId
            FROM msdb.dbo.sysjobactivity ja
            JOIN msdb.dbo.sysjobs j
                ON ja.job_id = j.job_id
            LEFT JOIN msdb.dbo.sysjobsteps js
                ON ja.job_id = js.job_id
                AND ja.last_executed_step_id = js.step_id
            WHERE
                ja.session_id = (SELECT MAX(session_id) FROM msdb.dbo.syssessions)
                AND ja.start_execution_date IS NOT NULL
                AND ja.stop_execution_date IS NULL
                AND  EXISTS (
            SELECT 1 
            FROM dbo.Db_Job_Name cfg 
            WHERE j.name LIKE cfg.job_name -- Matches the wildcard logic
            AND cfg.isEnabled = 1
                    )
                ${clientCondition}
                ${dateConditions}
            ORDER BY ja.start_execution_date ASC
        `;

        const result = await pool.request().query(query);
        const jobs = (result.recordset || []).map(row => {
            const clientName = extractClientName(row.jobName) || 'Other';
            const mins = row.runningMinutes || 0;
            const hours = Math.floor(mins / 60);
            const remainMins = mins % 60;
            const runningTime = hours > 0
                ? `${hours}h ${remainMins}m`
                : `${remainMins}m`;

            return {
                jobId: row.jobId,
                jobName: row.jobName,
                clientName,
                startedAt: row.startedAt,
                runningMinutes: mins,
                runningTime,
                currentStepName: row.currentStepName,
                currentStepNumber: row.currentStepNumber,
            };
        });

        res.json({ count: jobs.length, jobs });
    } catch (err) {
        console.error('Running jobs error:', err);
        res.status(500).json({ error: err.message, details: err.toString() });
    }
});

// ──────────────────────────────────────────────────────────────
// GET /api/dashboard/scheduled - Upcoming scheduled SQL Agent jobs
// ──────────────────────────────────────────────────────────────
// TIMEZONE NOTE:
//   SQL Server runs in UTC. When scheduling jobs in SSMS, the user
//   must subtract 5 hours from the desired PKT time.
//   Example: Want 1:52 PM PKT → enter 8:52 AM in SSMS schedule.
//   The query adds 5 hours back to display correct PKT time.
//   SQL Agent executes at the stored UTC time, which equals the
//   intended PKT time after the -5h offset.
// ──────────────────────────────────────────────────────────────
router.get('/scheduled', async (req, res) => {
    try {
        const { client, type, date, month, year, fromDate, toDate } = req.query;
        let pool = await sql.connect(dbConfig);

        let clientCondition = '';
        if (client) {
            const clientPattern = client.replace(/'/g, "''");
            clientCondition = `AND j.name LIKE '%Audit[_]${clientPattern}%'`;
        }

        // Date conditions on next scheduled run (PKT-converted)
        let dateConditions = '';
        const schedExpr = 'DATEADD(HOUR, 5, msdb.dbo.agent_datetime(s.active_start_date, s.active_start_time))';
        if (type === 'day' && date) {
            dateConditions = `AND CONVERT(DATE, ${schedExpr}) = '${date}'`;
        } else if (type === 'month' && month && year) {
            dateConditions = `AND YEAR(${schedExpr}) = ${parseInt(year)} AND MONTH(${schedExpr}) = ${parseInt(month)}`;
        } else if (type === 'year' && year) {
            dateConditions = `AND YEAR(${schedExpr}) = ${parseInt(year)}`;
        } else if (type === 'range' && fromDate && toDate) {
            dateConditions = `AND CONVERT(DATE, ${schedExpr}) BETWEEN '${fromDate}' AND '${toDate}'`;
        }

        const query = `
            SELECT
                j.job_id        AS jobId,
                j.name          AS jobName,
                s.name          AS scheduleName,
                CASE WHEN s.active_start_date > 0
                     THEN CONVERT(VARCHAR(19), DATEADD(HOUR, 5, msdb.dbo.agent_datetime(s.active_start_date, s.active_start_time)), 120)
                     ELSE NULL
                END AS nextScheduledRun,
                CASE s.freq_type
                    WHEN 1   THEN 'One Time'
                    WHEN 4   THEN 'Daily'
                    WHEN 8   THEN 'Weekly'
                    WHEN 16  THEN 'Monthly'
                    WHEN 32  THEN 'Monthly (Relative)'
                    WHEN 64  THEN 'Agent Startup'
                    WHEN 128 THEN 'Computer Idle'
                    ELSE 'Unknown'
                END AS frequency,
                j.enabled AS jobEnabled
            FROM msdb.dbo.sysjobs j
            INNER JOIN msdb.dbo.sysjobschedules js
                ON j.job_id = js.job_id
            INNER JOIN msdb.dbo.sysschedules s
                ON js.schedule_id = s.schedule_id
            WHERE s.active_start_date > 0
              AND msdb.dbo.agent_datetime(s.active_start_date, s.active_start_time) > GETDATE()
              AND EXISTS (
            SELECT 1 
            FROM dbo.Db_Job_Name cfg 
            WHERE j.name LIKE cfg.job_name -- Matches the wildcard logic
            AND cfg.isEnabled = 1
                    )
              ${clientCondition}
              ${dateConditions}
            ORDER BY msdb.dbo.agent_datetime(s.active_start_date, s.active_start_time) ASC
        `;

        const result = await pool.request().query(query);

        // nextScheduledRun = stored UTC time + 5h = PKT display time
        // User schedules in UTC (PKT - 5h), query adds 5h back for correct PKT display.
        // For timeUntil, we parse this PKT string with explicit +05:00 offset to get absolute UTC instant.

        const jobs = (result.recordset || []).map(row => {
            const clientName = extractClientName(row.jobName) || 'Other';
            const nextRunPKT = row.nextScheduledRun || null; // PKT time string (UTC + 5h from SQL)

            let timeUntil = '';
            if (nextRunPKT) {
                // Parse as ISO with explicit +05:00 offset to ensure it is treated as PKT regardless of server timezone
                const targetTime = new Date(nextRunPKT.replace(' ', 'T') + '+05:00');
                const diffMs = targetTime - Date.now();

                if (diffMs > 0) {
                    // Use Math.ceil so partial minutes round up (e.g. 30s left → "1m", never "0m")
                    const diffMins = Math.ceil(diffMs / 60000);
                    const hours = Math.floor(diffMins / 60);
                    const mins = diffMins % 60;
                    if (hours > 24) {
                        const days = Math.floor(hours / 24);
                        const remHours = hours % 24;
                        timeUntil = `${days}d ${remHours}h`;
                    } else if (hours > 0) {
                        timeUntil = `${hours}h ${mins}m`;
                    } else {
                        timeUntil = `${mins}m`;
                    }
                }
            }

            return {
                jobId: row.jobId,
                jobName: row.jobName,
                clientName,
                scheduleName: row.scheduleName,
                nextScheduledRun: nextRunPKT, // PKT time string (stored UTC + 5h)
                frequency: row.frequency,
                timeUntil,
                jobEnabled: row.jobEnabled === 1,
            };
        });

        const frequencySummary = {};
        jobs.forEach(j => {
            frequencySummary[j.frequency] = (frequencySummary[j.frequency] || 0) + 1;
        });

        res.json({ count: jobs.length, jobs, frequencySummary });
    } catch (err) {
        console.error('Scheduled jobs error:', err);
        res.status(500).json({ error: err.message, details: err.toString() });
    }
});

module.exports = router;
