// monthlyClone.js
const cron = require('node-cron');
const dayjs = require('dayjs');
const pool = require('../db/Connection');

console.log('✅ monthlyClone.js started...');

// Parse CLI arguments (e.g., node monthlyClone.js 4 2025)
const args = process.argv.slice(2);
const currentMonth = args[0] ? parseInt(args[0], 10) : parseInt(dayjs().format('MM'), 10);
const currentYear = args[1] ? parseInt(args[1], 10) : parseInt(dayjs().format('YYYY'), 10);
const nextMonthFirst = dayjs(`${currentYear}-${currentMonth}-01`).add(1, 'month').startOf('month').format('YYYY-MM-DD');

async function duplicateData() {
  try {
    const conn = await pool.getConnection();

    console.log(`[${new Date().toISOString()}] 🔁 Starting data duplication...`);
    console.log(`Current month: ${currentMonth}, year: ${currentYear}`);
    console.log(`Duplicating for shared_date = ${nextMonthFirst}`);

    // Duplicate pub_data
    const [pubRows] = await conn.query(
      `SELECT * FROM pub_data
       WHERE MONTH(shared_date) = ? AND YEAR(shared_date) = ?
       AND (paused_date IS NULL OR TRIM(paused_date) = '')`,
      [currentMonth, currentYear]
    );

    console.log(`Found ${pubRows.length} pub_data rows to duplicate`);
    for (const row of pubRows) {
      const insertData = {
        ...row,
       // adv_total_no: null,
       // adv_deductions: null,
       // adv_approved_no: null,
        shared_date: nextMonthFirst,
        paused_date: null,
        created_at: new Date(),
       // flag: 1,
      };
      
      delete insertData.id;

      console.log('Duplicating pub_data row:', row);
      const [result] = await conn.query('INSERT INTO pub_data SET ?', insertData);
      console.log(`✅ Duplicated pub_data ID ${row.id} to new ID ${result.insertId}`);
    }

    // Duplicate adv_data
    const [advRows] = await conn.query(
      `SELECT * FROM adv_data
       WHERE MONTH(shared_date) = ? AND YEAR(shared_date) = ?
       AND (paused_date IS NULL OR TRIM(paused_date) = '')`,
      [currentMonth, currentYear]
    );

    console.log(`Found ${advRows.length} adv_data rows to duplicate`);
    for (const row of advRows) {
      const insertData = {
        ...row,
        adv_total_no: null,
        adv_deductions: null,
        adv_approved_no: null,
        shared_date: nextMonthFirst,
        paused_date: null,
        created_at: new Date(),
        flag: 1,
      };
      
      delete insertData.id;

      console.log('Duplicating adv_data row:', row);
      const [result] = await conn.query('INSERT INTO adv_data SET ?', insertData);
      console.log(`✅ Duplicated adv_data ID ${row.id} to new ID ${result.insertId}`);
    }

    console.log(`[${new Date().toISOString()}] ✅ Duplication complete.`);
    conn.release();
  } catch (error) {
    console.error('❌ Error during duplication:', error);
  }
}

// Schedule task for last day of month at 11:59 PM
cron.schedule('59 23 28-31 * *', () => {
  const tomorrow = dayjs().add(1, 'day').date();
  if (tomorrow === 1) {
    duplicateData();
  }
});

// Run immediately if script is executed directly
if (require.main === module) {
  duplicateData();
}
