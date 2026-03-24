import api from './axios';

// Jobs API with date and client filtering
export const fetchJobs = async (filterParams) => {
    const params = new URLSearchParams();
    if (filterParams?.type) params.append('type', filterParams.type);
    if (filterParams?.date) params.append('date', filterParams.date);
    if (filterParams?.month) params.append('month', filterParams.month);
    if (filterParams?.year) params.append('year', filterParams.year);
    if (filterParams?.client) params.append('client', filterParams.client);
    
    const response = await api.get(`/jobs?${params.toString()}`);
    return response.data;
};

// Dashboard Stats API with date and client filtering
export const fetchDashboardStats = async (filterParams) => {
    const params = new URLSearchParams();
    if (filterParams?.type) params.append('type', filterParams.type);
    if (filterParams?.date) params.append('date', filterParams.date);
    if (filterParams?.month) params.append('month', filterParams.month);
    if (filterParams?.year) params.append('year', filterParams.year);
    if (filterParams?.fromDate) params.append('fromDate', filterParams.fromDate);
    if (filterParams?.toDate) params.append('toDate', filterParams.toDate);
    if (filterParams?.client) params.append('client', filterParams.client);
    
    const response = await api.get(`/dashboard/stats?${params.toString()}`);
    return response.data;
};

// Running Jobs API - currently executing SQL Agent jobs
export const fetchRunningJobs = async (filterParams) => {
    const params = new URLSearchParams();
    if (filterParams?.type) params.append('type', filterParams.type);
    if (filterParams?.date) params.append('date', filterParams.date);
    if (filterParams?.month) params.append('month', filterParams.month);
    if (filterParams?.year) params.append('year', filterParams.year);
    if (filterParams?.fromDate) params.append('fromDate', filterParams.fromDate);
    if (filterParams?.toDate) params.append('toDate', filterParams.toDate);
    if (filterParams?.client) params.append('client', filterParams.client);
    const response = await api.get(`/dashboard/running?${params.toString()}`);
    return response.data;
};

// Scheduled Jobs API - upcoming scheduled SQL Agent jobs
export const fetchScheduledJobs = async (filterParams) => {
    const params = new URLSearchParams();
    if (filterParams?.type) params.append('type', filterParams.type);
    if (filterParams?.date) params.append('date', filterParams.date);
    if (filterParams?.month) params.append('month', filterParams.month);
    if (filterParams?.year) params.append('year', filterParams.year);
    if (filterParams?.fromDate) params.append('fromDate', filterParams.fromDate);
    if (filterParams?.toDate) params.append('toDate', filterParams.toDate);
    if (filterParams?.client) params.append('client', filterParams.client);
    const response = await api.get(`/dashboard/scheduled?${params.toString()}`);
    return response.data;
};

// Clients API
export const fetchClients = async () => {
    const response = await api.get('/clients');
    return response.data;
};

// Expenses API: fetch expense clients
export const fetchExpenseClients = async () => {
    const response = await api.get('/expenses/clients');
    return response.data;
};

// Expenses API: fetch expense vs receipt stats
export const fetchExpenseStats = async (filterParams) => {
    const params = new URLSearchParams();
    if (filterParams?.type) params.append('type', filterParams.type);
    if (filterParams?.date) params.append('date', filterParams.date);
    if (filterParams?.month) params.append('month', filterParams.month);
    if (filterParams?.year) params.append('year', filterParams.year);
    if (filterParams?.fromDate) params.append('fromDate', filterParams.fromDate);
    if (filterParams?.toDate) params.append('toDate', filterParams.toDate);
    if (filterParams?.client) params.append('client', filterParams.client);
    if (filterParams?.dateType) params.append('dateType', filterParams.dateType);

    const response = await api.get(`/expenses/stats?${params.toString()}`);
    return response.data;
};

// Reconciliation API: fetch clients
export const fetchReconciliationClients = async () => {
    const response = await api.get('/reconciliation/clients');
    return response.data;
};

// Reconciliation API: fetch concur vs LZ stats
export const fetchReconciliationStats = async (filterParams) => {
    const params = new URLSearchParams();
    if (filterParams?.type) params.append('type', filterParams.type);
    if (filterParams?.date) params.append('date', filterParams.date);
    if (filterParams?.month) params.append('month', filterParams.month);
    if (filterParams?.year) params.append('year', filterParams.year);
    if (filterParams?.fromDate) params.append('fromDate', filterParams.fromDate);
    if (filterParams?.toDate) params.append('toDate', filterParams.toDate);
    if (filterParams?.client) params.append('client', filterParams.client);
    if (filterParams?.dateType) params.append('dateType', filterParams.dateType);

    const response = await api.get(`/reconciliation/stats?${params.toString()}`);
    return response.data;
};

// Qdera API: fetch clients
export const fetchQderaClients = async () => {
    const response = await api.get('/qdera/clients');
    return response.data;
};

// Qdera API: fetch qdera vs LZ stats
export const fetchQderaStats = async (filterParams) => {
    const params = new URLSearchParams();
    if (filterParams?.type) params.append('type', filterParams.type);
    if (filterParams?.date) params.append('date', filterParams.date);
    if (filterParams?.month) params.append('month', filterParams.month);
    if (filterParams?.year) params.append('year', filterParams.year);
    if (filterParams?.fromDate) params.append('fromDate', filterParams.fromDate);
    if (filterParams?.toDate) params.append('toDate', filterParams.toDate);
    if (filterParams?.client) params.append('client', filterParams.client);
    if (filterParams?.dateType) params.append('dateType', filterParams.dateType);

    const response = await api.get(`/qdera/stats?${params.toString()}`);
    return response.data;
};

// FlagCheck API: fetch clients
export const fetchFlagCheckClients = async () => {
    const response = await api.get('/flagcheck/clients');
    return response.data;
};

// FlagCheck API: fetch LZ flag validation stats
export const fetchFlagCheckStats = async (filterParams) => {
    const params = new URLSearchParams();
    if (filterParams?.type) params.append('type', filterParams.type);
    if (filterParams?.date) params.append('date', filterParams.date);
    if (filterParams?.month) params.append('month', filterParams.month);
    if (filterParams?.year) params.append('year', filterParams.year);
    if (filterParams?.fromDate) params.append('fromDate', filterParams.fromDate);
    if (filterParams?.toDate) params.append('toDate', filterParams.toDate);
    if (filterParams?.client) params.append('client', filterParams.client);
    if (filterParams?.dateType) params.append('dateType', filterParams.dateType);

    const response = await api.get(`/flagcheck/stats?${params.toString()}`);
    return response.data;
};

// Receipt Categorization API: fetch clients
export const fetchReceiptCatClients = async () => {
    const response = await api.get('/receiptcategorization/clients');
    return response.data;
};

// Receipt Categorization API: fetch receipt categorization stats
export const fetchReceiptCatStats = async (filterParams) => {
    const params = new URLSearchParams();
    if (filterParams?.type) params.append('type', filterParams.type);
    if (filterParams?.date) params.append('date', filterParams.date);
    if (filterParams?.month) params.append('month', filterParams.month);
    if (filterParams?.year) params.append('year', filterParams.year);
    if (filterParams?.fromDate) params.append('fromDate', filterParams.fromDate);
    if (filterParams?.toDate) params.append('toDate', filterParams.toDate);
    if (filterParams?.client) params.append('client', filterParams.client);
    if (filterParams?.dateType) params.append('dateType', filterParams.dateType);

    const response = await api.get(`/receiptcategorization/stats?${params.toString()}`);
    return response.data;
};
