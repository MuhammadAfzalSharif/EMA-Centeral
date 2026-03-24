const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: true,
        trustServerCertificate: true,
        requestTimeout: 300000, // 5 minutes timeout for long running queries
        useUTC: false           // return datetime columns in SQL Server local time (not UTC)
    }
};

module.exports = dbConfig;