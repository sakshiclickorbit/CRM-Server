// jobs/updateLevelsJob.js
const pool = require("../db/Connection");

// --- Vertical abbreviation mapping ---
const verticalMap = {
  "e-commerce": "E",
  "betting casino": "BC",
  "betting sports": "BS",
  "utilities": "U",
  "finance": "F",
  "food delivery": "FD",
};

// --- Helper: extract abbreviation from vertical column ---
function getVerticalAbbreviation(vertical) {
  if (!vertical) return "";
  const key = vertical.trim().toLowerCase();
  return verticalMap[key] || "";
}

// --- Helper: calculate level (case-insensitive) ---
function calculateLevel(fp, fa, fa1) {
  fp = (fp || "").toLowerCase().trim();
  fa = (fa || "").toLowerCase().trim();
  fa1 = (fa1 || "").toLowerCase().trim();

  if (fp === "not live" && !fa && !fa1) return -0.25;
  if (fp === "live" && fa === "quality" && !fa1) return 1.5;
  if (fp === "live" && fa === "quality" && (fa1 === "not optimised" || fa1 === "no optimised")) return -2;
  if (fp === "live" && fa === "no quality" && !fa1) return -1;
  if (fp === "live" && fa === "no live" && !fa1) return -0.33;
  if (fp === "live" && fa === "no quality" && fa1 === "optimised") return 2;
  if (fp === "live" && fa === "no quality" && (fa1 === "not optimised" || fa1 === "no optimised")) return -2;

  return 0;
}

// --- Main job ---
async function updateLevelsJob() {
 

  try {
    // ✅ Get only last 60 days of adv_data
    const [rows] = await pool.query(`
      SELECT p.pub_id, a.fp, a.fa, a.fa1, a.vertical, a.created_at
      FROM publids p
      JOIN adv_data a ON p.pub_id = a.pub_id
      WHERE a.created_at >= DATE_SUB(NOW(), INTERVAL 60 DAY)
    `);

   
    if (!rows.length) return console.log(" ^z ^o No records found. Exiting.");

    // Group by pub_id + vertical with SUM model
    const grouped = {};
    for (const row of rows) {
      const { pub_id, fp, fa, fa1, vertical } = row;

      if (!fp && !fa && !fa1 && !vertical) {
        continue;
      }

      const levelNum = calculateLevel(fp, fa, fa1);
      const abbr = getVerticalAbbreviation(vertical);
      if (!abbr) continue;

      if (!grouped[pub_id]) grouped[pub_id] = {};
      if (!grouped[pub_id][abbr]) grouped[pub_id][abbr] = 0;

      grouped[pub_id][abbr] += levelNum; // ✅ SUM instead of average
    }

    // Update DB with comma-separated values
    for (const pub_id of Object.keys(grouped)) {
      const levelsArr = Object.entries(grouped[pub_id]).map(
        ([abbr, total]) => `${total}(${abbr})`
      );
      const finalLevel = levelsArr.join(",");

      await pool.query(`UPDATE publids SET level = ? WHERE pub_id = ?`, [
        finalLevel,
        pub_id,
      ]);

      console.log(` ✅ Updated pub_id=${pub_id} => level="${finalLevel}"`);
    }

    console.log(" ^|^e All levels updated.");
  } catch (err) {
    console.error(" ❌ Error in updateLevelsJob:", err);
  }

  console.log(" ^=^o^a updateLevelsJob finished.\n");
}

module.exports = updateLevelsJob;

