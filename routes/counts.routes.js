const express = require("express");
const router = express.Router();
// const db = require("../db/db"); // adjust path if needed
const db = require('../db/Connection');

// Campaign Count
router.post("/campaign-count", async (req, res) => {
  let { role, id } = req.body;

  const isAdmin = Array.isArray(role)
    ? role.includes("admin")
    : role === "admin";

  try {
    let query = `
      SELECT COUNT(DISTINCT TRIM(campaign_id)) AS campaign_count
      FROM adv_data
      WHERE campaign_id IS NOT NULL
        AND campaign_id != ''
        AND (paused_date IS NULL OR paused_date = '')
        AND YEAR(STR_TO_DATE(shared_date, '%Y-%m-%d')) = YEAR(CURDATE())
        AND MONTH(STR_TO_DATE(shared_date, '%Y-%m-%d')) = MONTH(CURDATE())
    `;

    const params = [];

    if (!isAdmin) {
      query += " AND user_id = ?";
      params.push(id);
    }

    const [rows] = await db.query(query, params);

    res.json({ campaign_count: rows[0]?.campaign_count || 0 });
  } catch (err) {
    console.error("Campaign Count Error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Geo Count
router.post("/geo-count", async (req, res) => {
  let { role, id } = req.body;

  const isAdmin = Array.isArray(role)
    ? role.includes("admin")
    : role === "admin";

  try {
    let query = `
      SELECT COUNT(DISTINCT geo) AS totalGeo
      FROM (
        SELECT TRIM(j.geo) AS geo
        FROM adv_data a
        JOIN JSON_TABLE(
          CONCAT(
            '["',
            REPLACE(REPLACE(a.geo, ' ', ''), ',', '","'),
            '"]'
          ),
          '$[*]' COLUMNS (geo VARCHAR(10) PATH '$')
        ) j
        WHERE a.geo IS NOT NULL
          AND a.geo != ''
          AND (a.paused_date IS NULL OR a.paused_date = '')
          AND YEAR(STR_TO_DATE(a.shared_date, '%Y-%m-%d')) = YEAR(CURDATE())
          AND MONTH(STR_TO_DATE(a.shared_date, '%Y-%m-%d')) = MONTH(CURDATE())
    `;

    const params = [];

    if (!isAdmin) {
      query += " AND a.user_id = ?";
      params.push(id);
    }

    query += ") t WHERE geo != ''";

    const [rows] = await db.query(query, params);
    res.json({ totalGeo: rows[0]?.totalGeo || 0 });
  } catch (err) {
    console.error("Geo Count Error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// PID Count
router.post("/pid-count", async (req, res) => {
  let { role, id } = req.body;

  const isAdmin = Array.isArray(role)
    ? role.includes("admin")
    : role === "admin";

  try {
    let query = `
      SELECT COUNT(DISTINCT LOWER(TRIM(pid))) AS totalPid
      FROM adv_data
      WHERE pid IS NOT NULL
        AND pid != ''
        AND (paused_date IS NULL OR paused_date = '')
        AND YEAR(STR_TO_DATE(shared_date, '%Y-%m-%d')) = YEAR(CURDATE())
        AND MONTH(STR_TO_DATE(shared_date, '%Y-%m-%d')) = MONTH(CURDATE())
    `;

    const params = [];

    if (!isAdmin) {
      query += " AND user_id = ?";
      params.push(id);
    }

    const [rows] = await db.query(query, params);
    res.json({ totalPid: rows[0]?.totalPid || 0 });
  } catch (err) {
    console.error("PID Count Error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ADV Count
router.post("/adv-count", async (req, res) => {
  let { role, id } = req.body;

  const isAdmin = Array.isArray(role)
    ? role.includes("admin")
    : role === "admin";

  try {
    let query = `
      SELECT COUNT(DISTINCT TRIM(adv_id)) AS totalAdv
      FROM adv_data
      WHERE adv_id IS NOT NULL
        AND adv_id != ''
        AND (paused_date IS NULL OR paused_date = '')
        AND YEAR(STR_TO_DATE(shared_date, '%Y-%m-%d')) = YEAR(CURDATE())
        AND MONTH(STR_TO_DATE(shared_date, '%Y-%m-%d')) = MONTH(CURDATE())
    `;

    const params = [];

    if (!isAdmin) {
      query += " AND user_id = ?";
      params.push(id);
    }

    const [rows] = await db.query(query, params);
    res.json({ totalAdv: rows[0]?.totalAdv || 0 });
  } catch (err) {
    console.error("ADV Count Error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// PUB Count
router.post("/pub-count", async (req, res) => {
  let { role, id } = req.body;

  const isAdmin = Array.isArray(role)
    ? role.includes("admin")
    : role === "admin";

  try {
    let query = `
      SELECT COUNT(DISTINCT TRIM(pub_id)) AS totalPub
      FROM adv_data
      WHERE pub_id IS NOT NULL
        AND pub_id != ''
        AND (paused_date IS NULL OR paused_date = '')
        AND YEAR(STR_TO_DATE(shared_date, '%Y-%m-%d')) = YEAR(CURDATE())
        AND MONTH(STR_TO_DATE(shared_date, '%Y-%m-%d')) = MONTH(CURDATE())
    `;

    const params = [];

    if (!isAdmin) {
      query += " AND user_id = ?";
      params.push(id);
    }

    const [rows] = await db.query(query, params);
    res.json({ totalPub: rows[0]?.totalPub || 0 });
  } catch (err) {
    console.error("PUB Count Error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;

