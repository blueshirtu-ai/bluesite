import cron from 'node-cron';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();
const { Pool } = pg;

const pool = new Pool({
  user: 'saikumararigonda',
  host: 'localhost',
  database: 'SaiTech_Production_DB',
  port: 5432,
});

// Run every minute (* * * * *)
cron.schedule('* * * * *', async () => {
  console.log('⏰ Scheduler Waking Up: Checking for Pending Invoices...');
  try {
    // Note: We are using pk_invoice_id from your specific schema
    const res = await pool.query("SELECT COUNT(*) FROM invoices WHERE status = 'Pending'");
    console.log(`📊 Automated Report: There are ${res.rows[0].count} pending invoices.`);
  } catch (err) {
    console.error('❌ Scheduler Error:', err.message);
  }
});

console.log('🚀 Sai Tech Scheduler is running...');
