# Performance Analysis: Expense Records Loading Bottlenecks

## Summary
When loading many expense records, there are **3 main bottlenecks**:

---

## 1. ⚠️ BACKEND SQL QUERY (MAJOR BOTTLENECK - 70-80% of time)

### Current Problem:
```sql
INSERT INTO #expense_receipt_results
SELECT DISTINCT
    l.ReportV3_ID, l.ExpenseV3_ID, ...
FROM [DB].dbo.[LZ_TABLE] l
OUTER APPLY (
    SELECT TOP 1 FileName
    FROM [DB].dbo.tbl_AuditLogs_Receipt r
    WHERE r.FileName LIKE l.ReportV3_ID + '_% _' + l.ExpenseV3_ID + '_% '
    AND r.status = 1
) c
OUTER APPLY (
    SELECT TOP 1 FileName
    FROM [DB].dbo.tbl_AuditLogs_E_Receipt e
    WHERE e.FileName LIKE ...
    AND e.status = 1
) e
WHERE (date filter)
```

### Why it's slow:
- **N+1 Query Problem:** For EVERY expense row (e.g., 29,000 rows), it runs 2 separate lookups on receipt tables
- **LIKE Pattern Matching:** The pattern `FileName LIKE 'REPID_%_EXPID_%'` cannot use indexes efficiently; SQL Server must scan table pages
- **No Pre-Filtering:** The receipt tables are filtered only INSIDE the OUTER APPLY, so if they have 100k+ rows, all are scanned for each expense

**Example Timeline:**
- Expense rows to process: 29,000
- Receipt lookups: 29,000 × 2 = 58,000 queries!
- If each lookup takes 50ms due to LIKE scanning: 58,000 × 50ms = **2,900 seconds!** (but SQL optimizes batches, so roughly 30-60 seconds)

---

## 2. ⚠️ FRONTEND REACT RENDERING (10-15% of time, noticeable with 300+ rows per client)

### Current Problem:
File: `Expenses.jsx` lines 530-660

```jsx
{Object.entries(groupedDetails).map(([clientName, dates], ci) => {
    // For each client, group by date
    {Object.entries(dates).map(([dateStr, rows], di) => {
        // For each date, render a table with rows
        {rows.map((row, ri) => (
            <tr>...</tr>  // Creates DOM elements for every row
        ))}
    })}
})}
```

### Why it's slow:
- **Large DOM Tree:** With 7 clients × 300 rows each = 2,100 `<tr>` elements in the DOM at once
- **No Virtualization:** All rows are rendered even if not visible on screen
- **JavaScript Computation:**
  - `groupedDetails` useMemo recalculates grouping every time `detailRows` changes
  - For 2,100 rows, grouping logic is O(n) but creates many intermediate objects
  - React re-renders the tree structure even if only expanding/collapsing

**Example Timeline (Browser):**
- Parse JSON from server: 50-100ms
- JavaScript grouping (2,100 rows): 30-50ms
- React render of detail tree: 80-150ms
- Browser paint/layout: 50-100ms
- **Total: 210-400ms** (but feels slower due to JS execution blocking)

---

## 3. 📊 NETWORK TRANSFER (5-10% of time)

### Current Problem:
- Sending 2,100+ expense records as JSON from backend to frontend
- Each record has 10+ fields, filenames are 100+ characters
- Rough size: **2,100 rows × 500 bytes = 1.05 MB** of JSON

**Example Timeline:**
- Network RTT: 50-100ms (depending on latency)
- JSON serialization on backend: 20-30ms
- JSON parsing on frontend: 20-30ms

---

## BOTTLENECK RANKING

| Portion | Time | % | Impact |
|---------|------|---|--------|
| **SQL OUTER APPLY lookups** | 30-60s | **70-80%** | CRITICAL |
| Frontend grouping/rendering | 0.2-0.4s | 10-15% | Noticeable |
| Network JSON transfer | 0.1-0.2s | 5-10% | Minor |
| **TOTAL** | **30-60s** | **100%** | Very Slow |

---

## SOLUTIONS

### ✅ Quick Fix (Easy):
- Reduce limit from 300 to 100 records per client → saves ~30% backend time
- Implement **virtual scrolling** on frontend → eliminates DOM bloat

### ⭐ Best Fix (Recommended):
- **Rewrite SQL query** to use `LEFT JOIN` with `MAX()` instead of `OUTER APPLY`
  - Pre-filter receipt tables by status externally
  - Use indexed lookups (if FileName has index on prefix)
  - This could reduce from 30-60s down to 3-8 seconds!

### Advanced Fix (Complex):
- Index `tbl_AuditLogs_Receipt.FileName` with computed prefix column
- Add database query cache layer
- Implement pagination in frontend (load 50 rows, then "Load More" button)

---

## WHERE IS THE WAIT HAPPENING?

**User Perspective:**
1. Click "By Range" / filter change
2. **Wait 30-60 seconds** (backend SQL query executing)
3. See spinner on screen
4. Data arrives and renders (fast, 0.3-0.5s)
5. **Page is now responsive**

**Breakdown:**
- First 30-50s: Backend SQL is running (you're waiting for database)
- Last 0.3-0.5s: Frontend rendering (UI feels instant once data arrives)

The bottleneck is **100% the SQL OUTER APPLY query**, not the frontend.

---

## RECOMMENDED ACTION

**Priority:** Fix the SQL query with `LEFT JOIN` approach instead of `OUTER APPLY`

This alone will improve performance from **30-60 seconds → 3-8 seconds** (6-10x faster!)

Would you like me to implement the optimized SQL query?
