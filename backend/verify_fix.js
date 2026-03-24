
const express = require('express');
require('dotenv').config();
const expensesRouter = require('./routes/expenses');
const app = express();

app.use('/test_expenses', expensesRouter);

// Mock the request
const req = {
    url: '/test_expenses/stats?type=month&dateType=submit&month=11&year=2025&client=',
    method: 'GET'
};

// We can just run a mini server and hit it with http
const http = require('http');

const server = app.listen(5001, () => {
    console.log('Test server running on 5001');
    
    http.get('http://localhost:5001/test_expenses/stats?type=month&dateType=submit&month=11&year=2025', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            try {
                const json = JSON.parse(data);
                console.log('Total Expenses:', json.totalExpenses);
                console.log('Detail Rows Count:', json.detailRows ? json.detailRows.length : 'undefined');
                if (json.detailRows) {
                    const counts = {};
                    json.detailRows.forEach(r => {
                        counts[r.prefix] = (counts[r.prefix] || 0) + 1;
                    });
                    console.log('Per Client Counts:', counts);
                }
            } catch (e) {
                console.error('Parse error', e);
            } finally {
                server.close();
            }
        });
    }).on('error', (e) => {
        console.error(e);
        server.close();
    });
});
