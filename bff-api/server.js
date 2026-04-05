import express from 'express';
import pg from 'pg';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config();

const { Pool } = pg;
const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('../frontend'));

// Database connection credentials
const pool = new Pool({
  user: 'saikumararigonda',
  host: 'localhost',
  database: 'SaiTech_Production_DB',
  port: 5432,
  password: '', // Leave empty for local Homebrew setup
});

// 1. Initial Database Handshake (Check terminal for this log)
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database Connection Error:', err.stack);
  } else {
    console.log('✅ Database Handshake Successful:', res.rows[0].now);
  }
});

// 2. Status Route
app.get('/api/status', (_req, res) => {
  res.json({ status: 'BFF is Online', database: 'Connected' });
});

// 3. Health Check Route
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', database: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'unhealthy', error: err.message });
  }
});

// 4. Fetch Clients Route (The Data Bridge)
app.get('/api/clients', async (_req, res) => {
  try {
    // IMPORTANT: Note the table/column names from our 'pk_' architecture
    const result = await pool.query('SELECT * FROM clients');
    res.json(result.rows);
  } catch (err) {
    console.error('Database Error:', err.message);
    res.status(500).json({ error: 'Database connection failed' });
  }
});

app.listen(port, () => {
  console.log(`🚀 Sai Tech BFF running at http://localhost:${port}`);
});
// Summary Statistics (enhanced with paidRevenue + overdueCount)
app.get('/api/stats', async (_req, res) => {
  try {
    const clientCount = await pool.query('SELECT COUNT(*) FROM clients');
    const projectCount = await pool.query("SELECT COUNT(*) FROM projects WHERE status = 'Active'");
    const pendingSum = await pool.query("SELECT SUM(billed_amount) FROM invoices WHERE payment_status = 'Pending'");
    const paidSum = await pool.query("SELECT SUM(billed_amount) FROM invoices WHERE payment_status = 'Paid'");
    const overdueCount = await pool.query("SELECT COUNT(*) FROM invoices WHERE payment_status = 'Overdue'");

    res.json({
      clients: clientCount.rows[0].count,
      activeProjects: projectCount.rows[0].count,
      pendingRevenue: pendingSum.rows[0].sum || 0,
      paidRevenue: paidSum.rows[0].sum || 0,
      overdueCount: overdueCount.rows[0].count,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Projects Route
app.get('/api/projects', async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM projects ORDER BY status');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Invoices Route (most recent 10)
app.get('/api/invoices', async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM invoices ORDER BY created_at DESC LIMIT 10');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Region Status Route
app.get('/api/region-status', (_req, res) => {
  res.json([
    { region: 'us-east-1',  label: 'US East',  flag: '🇺🇸', latency: 12,  status: 'online' },
    { region: 'us-west-2',  label: 'US West',  flag: '🇺🇸', latency: 47,  status: 'online' },
    { region: 'eu-west-1',  label: 'EU West',  flag: '🇪🇺', latency: 91,  status: 'online' },
    { region: 'ap-south-1', label: 'AP South', flag: '🇮🇳', latency: 138, status: 'online' },
  ]);
});

