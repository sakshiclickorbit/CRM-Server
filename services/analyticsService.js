// ==========================
// 📁 services/analyticsService.js
// ==========================
const db = require('../db/Connection');

// 🔹 Get publisher IDs based on role
async function getPublisherIds(user_id, role) {
    console.log("🔹 Fetching publisher IDs for user_id:", user_id, "role:", role);
  
    // ADMIN → no filter
    if (role === "admin") return null;
  
    let userIds = [];
  
    // 🔹 Publisher
    if (role === "publisher") {
      userIds = [user_id];
    }
  
    // 🔹 Manager
    if (role === "publisher_manager") {
      const [rows] = await db.query(
        "SELECT sub_admin_id FROM manager_subadmins WHERE manager_id = ?",
        [user_id]
      );
  
      userIds = [user_id, ...rows.map(r => r.sub_admin_id)];
    }
  
    // 🔥 Step 2: Convert user_ids → pub_ids
    if (userIds.length === 0) return [];
  
    const [pubRows] = await db.query(
      `SELECT pub_id FROM publids WHERE user_id IN (${userIds.map(() => "?").join(",")})`,
      userIds
    );
  
    const pubIds = pubRows.map(r => r.pub_id);
  
    console.log("✅ Final pub_ids:", pubIds);
  
    return pubIds;
  }

// 🔹 Build WHERE clause
function buildWhere(pubIds, month) {
  let conditions = [`status = 'locked'`];
  let values = [];

  if (month) {
    conditions.push("month = ?");
    values.push(month);
  }

//   if (pubIds) {
//     conditions.push(`pub_id IN (${pubIds.map(() => "?").join(",")})`);
//     values.push(...pubIds);
//   }

  return {
    where: `WHERE ${conditions.join(" AND ")}`,
    values,
  };
}

// 🔹 Top GEO
async function getTopGeo(pubIds, month) {
    // 🔹 Base WHERE (no pub_id filter here)
    const baseWhere = [];
    const baseValues = [];
  
    baseWhere.push(`status = 'locked'`);
  
    if (month) {
      baseWhere.push(`month = ?`);
      baseValues.push(month);
    }
  
    const where1 = `WHERE ${baseWhere.join(" AND ")}`;
  
    // 🔹 Alias WHERE (no pub_id filter here)
    const aliasWhere = [];
    const aliasValues = [];
  
    aliasWhere.push(`c.status = 'locked'`);
  
    if (month) {
      aliasWhere.push(`c.month = ?`);
      aliasValues.push(month);
    }
  
    const where2 = `WHERE ${aliasWhere.join(" AND ")}`;
  
    // 🔥 FINAL QUERY (pub_id filter moved here)
    const query = `
      WITH geo_rev AS (
        SELECT geo,
          SUM(pub_payout * pub_apno) AS total_revenue
        FROM publisher_billing
        ${where1}
        GROUP BY geo
        ORDER BY total_revenue DESC
        LIMIT 10
      ),
      geo_pub AS (
        SELECT 
          c.geo,
          c.pub_id,
          pl.pub_name,
          l.username,
          SUM(c.pub_payout * c.pub_apno) AS revenue,
          ROW_NUMBER() OVER (
            PARTITION BY c.geo 
            ORDER BY SUM(c.pub_payout * c.pub_apno) DESC
          ) AS rnk
        FROM publisher_billing c
        LEFT JOIN publids pl ON c.pub_id = pl.pub_id
        LEFT JOIN login l ON pl.user_id = l.id
        ${where2}
        GROUP BY c.geo, c.pub_id, pl.pub_name, l.username
      )
      SELECT 
        g.geo, 
        g.total_revenue, 
        p.pub_id, 
        p.pub_name,
        p.username,
        p.revenue, 
        p.rnk
      FROM geo_rev g
      JOIN geo_pub p ON g.geo = p.geo
      WHERE p.rnk <= 15
      ${pubIds && pubIds.length ? `AND p.pub_id IN (${pubIds.join(",")})` : ""}
    `;
  
    // 🔹 Only month is used → no pubIds in params
    const finalValues = [...baseValues, ...aliasValues];
  
    console.log("👉 FINAL VALUES:", finalValues);
  
    const [rows] = await db.query(query, finalValues);
  
    console.log("👉 ROW COUNT:", rows.length);
  
    const result = {};
  
    rows.forEach(r => {
      if (!result[r.geo]) {
        result[r.geo] = {
          geo: r.geo || "UNKNOWN",
          total_revenue: r.total_revenue,
          top_publishers: [],
        };
      }
  
      result[r.geo].top_publishers.push({
        pub_id: r.pub_id,
        pub_name: r.pub_name,
        username: r.username,
        revenue: r.revenue,
        rank: r.rnk, // 🔥 real global rank
      });
    });
  
    return Object.values(result);
  }

// 🔹 Top Vertical
async function getTopVertical(pubIds, month) {
    // 🔹 Base WHERE (NO pub_id filter)
    const baseWhere = [];
    const baseValues = [];
  
    baseWhere.push(`status = 'locked'`);
  
    if (month) {
      baseWhere.push(`month = ?`);
      baseValues.push(month);
    }
  
    const where1 = `WHERE ${baseWhere.join(" AND ")}`;
  
    // 🔹 Alias WHERE (NO pub_id filter)
    const aliasWhere = [];
    const aliasValues = [];
  
    aliasWhere.push(`c.status = 'locked'`);
  
    if (month) {
      aliasWhere.push(`c.month = ?`);
      aliasValues.push(month);
    }
  
    const where2 = `WHERE ${aliasWhere.join(" AND ")}`;
  
    // 🔥 Query (filter AFTER ranking)
    const query = `
      WITH vert_rev AS (
        SELECT COALESCE(vertical, 'UNKNOWN') AS vertical,
          SUM(pub_payout * pub_apno) AS total_revenue
        FROM publisher_billing
        ${where1}
        GROUP BY vertical
        ORDER BY total_revenue DESC
        LIMIT 10
      ),
      vert_pub AS (
        SELECT 
          COALESCE(c.vertical, 'UNKNOWN') AS vertical,
          c.pub_id,
          pl.pub_name,
          l.username,
          SUM(c.pub_payout * c.pub_apno) AS revenue,
          ROW_NUMBER() OVER (
            PARTITION BY COALESCE(c.vertical, 'UNKNOWN') 
            ORDER BY SUM(c.pub_payout * c.pub_apno) DESC
          ) AS rnk
        FROM publisher_billing c
        LEFT JOIN publids pl ON c.pub_id = pl.pub_id
        LEFT JOIN login l ON pl.user_id = l.id
        ${where2}
        GROUP BY c.vertical, c.pub_id, pl.pub_name, l.username
      )
      SELECT 
        v.vertical, 
        v.total_revenue, 
        p.pub_id, 
        p.pub_name,
        p.username,
        p.revenue, 
        p.rnk
      FROM vert_rev v
      JOIN vert_pub p ON v.vertical = p.vertical
      WHERE p.rnk <= 15
      ${pubIds && pubIds.length ? `AND p.pub_id IN (${pubIds.join(",")})` : ""}
    `;
  
    // 🔹 Only month used
    const finalValues = [...baseValues, ...aliasValues];
  
    console.log("👉 FINAL VALUES (VERTICAL):", finalValues);
  
    const [rows] = await db.query(query, finalValues);
  
    console.log("👉 ROW COUNT (VERTICAL):", rows.length);
  
    const result = {};
  
    rows.forEach(r => {
      if (!result[r.vertical]) {
        result[r.vertical] = {
          vertical: r.vertical || "UNKNOWN",
          total_revenue: r.total_revenue,
          top_publishers: [],
        };
      }
  
      result[r.vertical].top_publishers.push({
        pub_id: r.pub_id,
        pub_name: r.pub_name,
        username: r.username,
        revenue: r.revenue,
        rank: r.rnk, // 🔥 real global rank
      });
    });
  
    return Object.values(result);
  }

// 🔹 Top OS (handled in Node)
async function getTopOS(pubIds, month) {
    // 🔹 REMOVE pub_id filtering here (VERY IMPORTANT)
    const baseWhere = [];
    const values = [];
  
    baseWhere.push(`status = 'locked'`);
  
    if (month) {
      baseWhere.push(`month = ?`);
      values.push(month);
    }
  
    const where = `WHERE ${baseWhere.join(" AND ")}`;
  
    // 🔹 Step 1: Fetch ALL data (no pub_id filter)
    const [rows] = await db.query(
      `SELECT pub_id, os, pub_payout, pub_apno FROM publisher_billing ${where}`,
      values
    );
  
    const osMap = {};
  
    function normalizeOS(os) {
      os = os.toLowerCase().trim();
      if (os === "ios") return "iOS";
      if (os === "android") return "Android";
      return os;
    }
  
    // 🔹 Step 2: Build OS revenue map (GLOBAL)
    rows.forEach(r => {
      if (!r.os) return;
  
      const revenue = r.pub_payout * r.pub_apno;
  
      const osList = r.os.split(",").map(o => normalizeOS(o));
      const splitRevenue = revenue / osList.length;
  
      osList.forEach(os => {
        if (!osMap[os]) osMap[os] = {};
        if (!osMap[os][r.pub_id]) osMap[os][r.pub_id] = 0;
  
        osMap[os][r.pub_id] += splitRevenue;
      });
    });
  
    // 🔹 Step 3: Get all pub_ids
    const allPubIds = Object.values(osMap)
      .flatMap(p => Object.keys(p))
      .map(Number);
  
    const uniquePubIds = [...new Set(allPubIds)];
  
    // 🔹 Step 4: Fetch pub_name + username
    let pubMap = {};
  
    if (uniquePubIds.length) {
      const [pubRows] = await db.query(
        `SELECT pl.pub_id, pl.pub_name, l.username
         FROM publids pl
         LEFT JOIN login l ON pl.user_id = l.id
         WHERE pl.pub_id IN (${uniquePubIds.map(() => "?").join(",")})`,
        uniquePubIds
      );
  
      pubRows.forEach(p => {
        pubMap[p.pub_id] = {
          pub_name: p.pub_name,
          username: p.username,
        };
      });
    }
  
    // 🔹 Step 5: Build result (GLOBAL ranking first)
    const result = Object.keys(osMap).map(os => {
      const allPubs = Object.entries(osMap[os])
        .map(([pub_id, revenue]) => ({
          pub_id: Number(pub_id),
          pub_name: pubMap[pub_id]?.pub_name || null,
          username: pubMap[pub_id]?.username || null,
          revenue,
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .map((p, i) => ({
          ...p,
          rank: i + 1, // 🔥 GLOBAL rank
        }));
  
      // 🔥 FILTER AFTER RANKING
      const filteredPubs = pubIds && pubIds.length
        ? allPubs.filter(p => pubIds.includes(p.pub_id))
        : allPubs;
  
      return {
        os,
        total_revenue: allPubs.reduce((sum, p) => sum + p.revenue, 0),
        top_publishers: filteredPubs.slice(0, 15),
      };
    });
  
    return result
      .sort((a, b) => b.total_revenue - a.total_revenue)
      .slice(0, 10);
  }
module.exports = {
  getPublisherIds,
  getTopGeo,
  getTopVertical,
  getTopOS,
};
