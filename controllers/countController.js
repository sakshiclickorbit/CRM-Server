const db = require('../db/Connection');

// controllers/campaignController.js
exports.getCampaignCount = async (req, res) => {
  try {
    const { role, id } = req.body;

    if (!role || !id) {
      return res.status(400).json({
        success: false,
        message: "role and id are required",
      });
    }

    // Normalize role → always array
    const roles = Array.isArray(role) ? role : [role];

    let query = "";
    let params = [];

    /* ---------------------------------------------------
       CASE 1: ADMIN → total LIVE campaigns
    --------------------------------------------------- */
    if (roles.includes("admin")) {
      query = `
        SELECT COUNT(DISTINCT cd.campaign_name) AS campaign_count
        FROM campaign_data cd
        WHERE cd.status = 'live'
      `;
    }

    /* ---------------------------------------------------
       CASE 2: ADVERTISER / ADVERTISER_MANAGER / OPERATIONS
    --------------------------------------------------- */
    else if (
      roles.some(r =>
        ["advertiser", "advertiser_manager", "operations"].includes(r)
      )
    ) {
      query = `
        SELECT COUNT(DISTINCT cd.campaign_name) AS campaign_count
        FROM campaign_data cd
        WHERE cd.user_id = ?
          AND cd.status = 'live'
      `;
      params = [id];
    }

    /* ---------------------------------------------------
       CASE 3: PUBLISHER / PUBLISHER_MANAGER
    --------------------------------------------------- */
    else if (
      roles.some(r =>
        ["publisher", "publisher_manager"].includes(r)
      )
    ) {
      // Step 1: get username
      const [userRows] = await db.query(
        "SELECT username FROM login WHERE id = ?",
        [id]
      );

      if (userRows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      const username = userRows[0].username;

      // Step 2: count LIVE campaigns linked to publisher
      query = `
        SELECT COUNT(DISTINCT cd.campaign_name) AS campaign_count
        FROM campaign_data cd
        JOIN adv_data ad
          ON ad.campaign_id = cd.id
        WHERE cd.status = 'live'
          AND ad.pub_name = ?
      `;
      params = [username];
    }

    /* ---------------------------------------------------
       INVALID ROLE
    --------------------------------------------------- */
    else {
      return res.status(400).json({
        success: false,
        message: "Invalid role",
      });
    }

    const [rows] = await db.query(query, params);

    return res.status(200).json({
      success: true,
      roles,
      id,
      campaign_count: rows[0]?.campaign_count || 0,
    });

  } catch (error) {
    console.error("Error fetching campaign count:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};
  

  exports.getPausedPidCount = async (req, res) => {
    const { role, id } = req.body;
  
    if (!role || !id) {
      return res.status(400).json({ message: "role and id are required" });
    }
  
    try {
      let query = "";
      let params = [];
  
      // ✅ 1️⃣ advertiser / advertiser_manager / operations
      if (["advertiser", "advertiser_manager", "operations"].includes(role)) {
        query = `
          SELECT COUNT(DISTINCT pid) AS paused_pid_count
          FROM adv_data
          WHERE user_id = ?
            AND paused_date IS NOT NULL
            AND flag = 0
        `;
        params = [id];
      }
  
      // ✅ 2️⃣ admin — count all paused pids
      else if (role === "admin") {
        query = `
          SELECT COUNT(DISTINCT pid) AS paused_pid_count
          FROM adv_data
          WHERE paused_date IS NOT NULL
            AND flag = 0
        `;
      }
  
      // ✅ 3️⃣ publisher / publisher_manager
      else if (["publisher", "publisher_manager"].includes(role)) {
        // Step 1: Get username from login
        const [userRows] = await db.query(
          "SELECT username FROM login WHERE id = ?",
          [id]
        );
  
        if (userRows.length === 0) {
          return res.status(404).json({ message: "User not found" });
        }
  
        const username = userRows[0].username;
  
        // Step 2: Count paused pids where pub_name = username
        query = `
          SELECT COUNT(DISTINCT pid) AS paused_pid_count
          FROM adv_data
          WHERE pub_name = ?
            AND paused_date IS NOT NULL
            AND flag = 0
        `;
        params = [username];
      }
  
      else {
        return res.status(400).json({ message: "Invalid role" });
      }
  
      // ✅ Execute query
      const [rows] = await db.query(query, params);
  
      res.status(200).json({
        success: true,
        role,
        id,
        paused_pid_count: rows[0]?.paused_pid_count || 0
      });
  
    } catch (error) {
      console.error("Error fetching paused PID count:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  };
  

  exports.getLivePidCount = async (req, res) => {
    const { role, id } = req.body;
  
    if (!role || !id) {
      return res.status(400).json({ message: "role and id are required" });
    }
  
    try {
      let query = "";
      let params = [];
  
      // ✅ 1️⃣ advertiser / advertiser_manager / operations
      if (["advertiser", "advertiser_manager", "operations"].includes(role)) {
        query = `
          SELECT COUNT(DISTINCT pid) AS live_pid_count
          FROM adv_data
          WHERE user_id = ?
            AND (
                  paused_date IS NULL
               OR (paused_date IS NOT NULL AND flag = 1)
            )
        `;
        params = [id];
      }
  
      // ✅ 2️⃣ admin — count all live pids
      else if (role === "admin") {
        query = `
          SELECT COUNT(DISTINCT pid) AS live_pid_count
          FROM adv_data
          WHERE paused_date IS NULL
             OR (paused_date IS NOT NULL AND flag = 1)
        `;
      }
  
      // ✅ 3️⃣ publisher / publisher_manager
      else if (["publisher", "publisher_manager"].includes(role)) {
        // Step 1: Get username from login
        const [userRows] = await db.query(
          "SELECT username FROM login WHERE id = ?",
          [id]
        );
  
        if (userRows.length === 0) {
          return res.status(404).json({ message: "User not found" });
        }
  
        const username = userRows[0].username;
  
        // Step 2: Count live pids where pub_name = username
        query = `
          SELECT COUNT(DISTINCT pid) AS live_pid_count
          FROM adv_data
          WHERE pub_name = ?
            AND (
                  paused_date IS NULL
               OR (paused_date IS NOT NULL AND flag = 1)
            )
        `;
        params = [username];
      }
  
      else {
        return res.status(400).json({ message: "Invalid role" });
      }
  
      // ✅ Execute query
      const [rows] = await db.query(query, params);
  
      res.status(200).json({
        success: true,
        role,
        id,
        live_pid_count: rows[0]?.live_pid_count || 0
      });
  
    } catch (error) {
      console.error("Error fetching live PID count:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  };
  
