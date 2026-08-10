// monthlyClone.js
const cron = require('node-cron');
const dayjs = require('dayjs');
const pool = require('../db/Connection');

console.log('✅ monthlyClone.js started…');

// Parse CLI arguments (e.g., node monthlyClone.js 4 2025)
const args = process.argv.slice(2);
const targetMonth = args[0] ? parseInt(args[0], 10) : parseInt(dayjs().format('MM'), 10);
const targetYear = args[1] ? parseInt(args[1], 10) : parseInt(dayjs().format('YYYY'), 10);
const pauseDate = dayjs(`${targetYear}-${targetMonth}-01`).endOf('month').format('YYYY-MM-DD');

async function pauseCampaigns() {
  try {
    const conn = await pool.getConnection();
    console.log(`[${new Date().toISOString()}] ⏸️ Pausing campaigns for ${targetMonth}/${targetYear} with pause_date = ${pauseDate}`);

    // Pause pub_data
    const [pubResult] = await conn.query(
      `UPDATE pub_data 
       SET paused_date = ? 
       WHERE MONTH(shared_date) = ? AND YEAR(shared_date) = ? 
       AND (paused_date IS NULL OR TRIM(paused_date) = '')`,
      [pauseDate, targetMonth, targetYear]
    );
    console.log(`✅ Paused ${pubResult.affectedRows} pub_data rows`);

    // Pause adv_data
    const [advResult] = await conn.query(
      `UPDATE adv_data 
       SET paused_date = ? 
       WHERE MONTH(shared_date) = ? AND YEAR(shared_date) = ? 
       AND (paused_date IS NULL OR TRIM(paused_date) = '')`,
      [pauseDate, targetMonth, targetYear]
    );
    console.log(`✅ Paused ${advResult.affectedRows} adv_data rows`);

    conn.release();
    console.log(`[${new Date().toISOString()}] ✅ Pausing complete.`);
  } catch (error) {
    console.error('❌ Error while pausing campaigns:', error);
  }
}

// Run script immediately if executed directly
if (require.main === module) {
  pauseCampaigns();
}

