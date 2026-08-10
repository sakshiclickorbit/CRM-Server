
const db = require('../db/Connection');
const jwt = require('jsonwebtoken');
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
require('dotenv').config();
const multer = require("multer");
const path = require("path");
const { getAccessibleUserIds } = require('../utils/accessControl');

const cron = require('node-cron');
const axios = require('axios');
const { transactionUtils } = require("../routes/transactionUtils"); // Import function

// const { sendNotification } = require("../socket"); // Import the function from socket.js


// Secret key for J
// WT (store this securely, e.g., in environment variables)
const JWT_SECRET = process.env.VITE_API_JWT_SECRET;

console.log("JWT_SECRET",JWT_SECRET)
// const JWT_SECRET = 'gurdeep0111';
dotenv.config();






// Create  reviews Entry
exports.createPid = async (req, res) => {
    try {
        const { user_id, pid } = req.body;

        if (!user_id || !pid) {
            return res.status(400).json({ message: "User ID and PID are required" });
        }

        await db.query(
            "INSERT INTO allpids (user_id, pid, created_at) VALUES (?, ?, NOW())",
            [user_id, pid]
        );

        res.status(201).json({ success: true, message: "pid entry created successfully" });
    } catch (error) {
        console.error("❌ Server Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};


// Get reviews Entries by User ID
exports.getPids = async (req, res) => {
    try {
        // const { user_id } = req.params;

        // if (!user_id) {
        //     return res.status(400).json({ message: "User ID is required" });
        // }

        const [entries] = await db.query("SELECT * FROM allpids");

        res.status(200).json({ success: true, data: entries });
    } catch (error) {
        console.error("❌ Server Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Edit reviews Entry
exports.editPid = async (req, res) => {
    try {
        const { id } = req.params;
        const { pid } = req.body;

        if (!id || !pid) {
            return res.status(400).json({ message: "ID and pid text are required" });
        }

        await db.query(
            "UPDATE allpids SET pid = ? WHERE id = ?",
            [pid, id]
        );

        res.status(200).json({ success: true, message: "pid text entry updated successfully" });
    } catch (error) {
        console.error("❌ Server Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
// Get all publishers
exports.getAllPublishers = async (req, res) => {
    try {
        console.log("🟢 Fetching all publishers...");

        // ✅ Fetch all data from publids table
        const [publishers] = await db.query("SELECT * FROM publids");

        // ✅ Check if data exists
        if (publishers.length === 0) {
            return res.status(404).json({ success: false, message: "No publishers found." });
        }

        console.log("✅ Publishers retrieved successfully.");
        res.status(200).json({ success: true, data: publishers });

    } catch (error) {
        console.error("❌ Error fetching publishers:", error);
        res.status(500).json({ success: false, message: "Internal server error." });
    }
};

// Get all publishers with username from login table
// Get all publishers with publisher login details (from pub_accounts)
exports.getNamePublishers = async (req, res) => {
  try {
    console.log("🟢 Fetching publishers with role-based access...");
    const { user_id } = req.query;
    console.log(req.query);
    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: "user_id is required",
      });
    }
 
    // =========================================================
    // 🔥 GET ACCESSIBLE USER IDS
    // =========================================================
    const accessibleIds = await getAccessibleUserIds(db, user_id);
 
    console.log("✅ Accessible IDs:", accessibleIds);
 
    if (!accessibleIds.length) {
      return res.status(200).json({
        success: true,
        data: [],
      });
    }
 
    const placeholders = accessibleIds.map(() => "?").join(",");
 
    // =========================================================
    // 🔥 MAIN QUERY (FILTERED)
    // =====================================================
    const [publishers] = await db.query(
      `
  SELECT
    p.*,
 
    l.username AS username,
    l.role     AS user_role,
 
    pa.username AS publisher_username,
    pa.role     AS publisher_role,
    pa.act_pass AS password,
    pa.mail     AS mail,
    pa.id       AS publisher_login_id,
 
    -- ✅ Billing as JSON array (clean + no null objects)
    COALESCE(
      JSON_ARRAYAGG(
        CASE
          WHEN pbd.id IS NOT NULL THEN JSON_OBJECT(
            'id', pbd.id,
            'legal_name', pbd.legal_name,
            'billing_address', pbd.billing_address,
            'tax_type', pbd.tax_type,
            'tax_id', pbd.tax_id,
            'user_id', pbd.user_id,
            'created_at', pbd.created_at,
            'updated_at', pbd.updated_at
          )
        END
      ),
      JSON_ARRAY()
    ) AS billing_details
 
  FROM publids p
 
  LEFT JOIN login l
    ON p.user_id = l.id
 
  LEFT JOIN pub_accounts pa
    ON pa.pubid = p.pub_id
 
  LEFT JOIN publisher_billing_details pbd
    ON pbd.pub_id = p.pub_id
 
  WHERE p.user_id IN (${placeholders})
 
  GROUP BY
    p.pub_id,
    p.id,
    l.username,
    l.role,
    pa.username,
    pa.role,
    pa.act_pass,
    pa.mail,
    pa.id
  `,
      accessibleIds,
    );
    console.log(publishers[0]);
    //  console.log("Current User:", user);
    console.log("Accessible IDs Count:", accessibleIds.length);
    console.log("First 20 IDs:", accessibleIds.slice(0, 20));
    if (publishers.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No publishers found.",
      });
    }
 
    console.log("✅ Publishers retrieved successfully.");
    return res.status(200).json({
      success: true,
      data: publishers,
    });
  } catch (error) {
    console.error("❌ Error fetching publishers:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};

exports.ffgetNamePublishers = async (req, res) => {
  try {
    console.log("🟢 Fetching all publishers...");

    const [publishers] = await db.query(`
      SELECT 
        p.*,

        -- User who created publisher (if needed)
        l.username AS username,
        l.role     AS user_role,

        -- Publisher login details
        pa.username AS publisher_username,
        pa.role     AS publisher_role,

        pa.act_pass AS publisher_password,
                pa.mail AS mail,

        pa.id       AS publisher_login_id,

        -- Latest postback
        pl.postback_url

      FROM publids p

      -- Main user login
      LEFT JOIN login l 
        ON p.user_id = l.id

      -- Publisher account login
      LEFT JOIN pub_accounts pa
        ON pa.pubid = p.pub_id

      -- Latest postback per publisher
      LEFT JOIN (
        SELECT publisher_id, MAX(postback_url) AS postback_url
        FROM publisher_links
        GROUP BY publisher_id
      ) pl
        ON pl.publisher_id = p.pub_id
    `);

    if (publishers.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No publishers found."
      });
    }

    console.log("✅ Publishers retrieved successfully.");
    return res.status(200).json({
      success: true,
      data: publishers
    });

  } catch (error) {
    console.error("❌ Error fetching publishers:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error."
    });
  }
};



exports.getNamePublishe = async (req, res) => {
    try {
      console.log("🟢 Fetching all publishers...");
  
      const [publishers] = await db.query(`
        SELECT 
          p.*,
          l.username,
          pl.postback_url
        FROM publids p
        LEFT JOIN login l 
          ON p.user_id = l.id
        LEFT JOIN (
          SELECT publisher_id, MAX(postback_url) AS postback_url
          FROM publisher_links
          GROUP BY publisher_id
        ) pl
          ON pl.publisher_id = p.pub_id
      `);
  
      if (publishers.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No publishers found."
        });
      }
  
      console.log("✅ Publishers retrieved successfully.");
      return res.status(200).json({
        success: true,
        data: publishers
      });
  
    } catch (error) {
      console.error("❌ Error fetching publishers:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error."
      });
    }
  };
  

// ✅ POST /blacklist - Add a new blacklist entry
exports.addBlacklist = async (req, res) => {
    try {
        const { blacklistID } = req.body;

        if (!blacklistID) {
            return res.status(400).json({ error: 'blacklistID is required' });
        }

        const [result] = await db.query(
            'INSERT INTO blacklist (blacklistID) VALUES (?)',
            [blacklistID]
        );

        return res.status(201).json({
            message: 'Blacklist entry created successfully',
            insertId: result.insertId
        });
    } catch (err) {
        console.error('Error in addBlacklist:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

// ✅ GET /blacklist - Fetch all blacklist entries
exports.getAllBlacklist = async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT * FROM blacklist ORDER BY blacklist_date DESC'
        );

        return res.status(200).json(rows);
    } catch (err) {
        console.error('Error in getAllBlacklist:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
// ✅ DELETE /blacklist/:id - Remove a blacklist entry by ID
exports.deleteBlacklist = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({ error: 'ID parameter is required' });
        }

        const [result] = await db.query(
            'DELETE FROM blacklist WHERE id = ?',
            [id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Blacklist entry not found' });
        }

        return res.status(200).json({ message: 'Blacklist entry deleted successfully' });
    } catch (err) {
        console.error('Error in deleteBlacklist:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

//new  working  api
exports.getClicksConversionsReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
 
    let dateFilterClicks = "";
    let dateFilterConvWhere = "";
    let dateFilterConvAnd = "";
    let dateFilterImp = "";
    let params = [];
 
    if (startDate && endDate) {
      const startDateTime = `${startDate} 00:00:00`;
      const endDateTime = `${endDate} 23:59:59`;
 
      dateFilterClicks = "WHERE c.created_at BETWEEN ? AND ?";
      dateFilterConvWhere = "WHERE created_at BETWEEN ? AND ?";
      dateFilterConvAnd = "AND created_at BETWEEN ? AND ?";
      dateFilterImp = "WHERE i.created_at BETWEEN ? AND ?";
 
      params = [
        startDateTime, endDateTime, // base: clicks
        startDateTime, endDateTime, // base: impressions
        startDateTime, endDateTime, // c agg: clicks
        startDateTime, endDateTime, // imp agg: impressions
        startDateTime, endDateTime, // conv agg: conversions
        startDateTime, endDateTime, // conv events: event
        startDateTime, endDateTime  // conv events: event_goal
      ];
    }
 
    const [rows] = await db.query(
      `
      SELECT
        base.campaign_id,
        cd.campaign_name,
        cd.geo,
        c.source,
        base.publisher_id,
        IFNULL(c.total_clicks, 0) AS total_clicks,
 
        IFNULL(imp.total_impressions, 0) AS total_impressions,
 
        IFNULL(conv.total_conversions, 0) AS total_conversions,
        IFNULL(conv.total_payout, 0) AS total_payout,
        conv.p1,
        conv.p2,
        conv.p3,
        conv.p4,
        conv.p5,
 
        IFNULL(conv.event_data, JSON_ARRAY()) AS event_data,
 
        CASE
          WHEN IFNULL(c.total_clicks, 0) > 0
            THEN ROUND((IFNULL(conv.total_conversions, 0) / c.total_clicks) * 100, 2)
          WHEN IFNULL(imp.total_impressions, 0) > 0
            THEN ROUND((IFNULL(conv.total_conversions, 0) / imp.total_impressions) * 100, 2)
          ELSE NULL
        END AS conversion_rate
 
      FROM (
        SELECT campaign_id, publisher_id FROM clicks c ${dateFilterClicks}
        UNION
        SELECT campaign_id, publisher_id FROM impressions i ${dateFilterImp}
      ) base
 
      INNER JOIN campaign_data cd
        ON cd.id = base.campaign_id
 
      LEFT JOIN (
        SELECT
          campaign_id,
          publisher_id,
          GROUP_CONCAT(DISTINCT source SEPARATOR ',') AS source,
          COUNT(*) AS total_clicks
        FROM clicks c
        ${dateFilterClicks}
        GROUP BY campaign_id, publisher_id
      ) c
        ON c.campaign_id = base.campaign_id
        AND c.publisher_id <=> base.publisher_id
 
      LEFT JOIN (
        SELECT
          campaign_id,
          publisher_id,
          COUNT(*) AS total_impressions
        FROM impressions i
        ${dateFilterImp}
        GROUP BY campaign_id, publisher_id
      ) imp
        ON imp.campaign_id = base.campaign_id
        AND imp.publisher_id <=> base.publisher_id
 
      LEFT JOIN (
        SELECT
          agg.campaign_id,
          agg.publisher_id,
          agg.total_conversions,
          agg.total_payout,
          agg.p1,
          agg.p2,
          agg.p3,
          agg.p4,
          agg.p5,
          IFNULL(ev.event_data, JSON_ARRAY()) AS event_data
        FROM (
          SELECT
            campaign_id,
            publisher_id,
            COUNT(*) AS total_conversions,
            ROUND(SUM(payout), 2) AS total_payout,
 
            GROUP_CONCAT(DISTINCT p1 SEPARATOR ',') AS p1,
            GROUP_CONCAT(DISTINCT p2 SEPARATOR ',') AS p2,
            GROUP_CONCAT(DISTINCT p3 SEPARATOR ',') AS p3,
            GROUP_CONCAT(DISTINCT p4 SEPARATOR ',') AS p4,
            GROUP_CONCAT(DISTINCT p5 SEPARATOR ',') AS p5
 
          FROM conversions
          ${dateFilterConvWhere}
          GROUP BY campaign_id, publisher_id
        ) agg
 
        LEFT JOIN (
          SELECT
            campaign_id,
            publisher_id,
            JSON_ARRAYAGG(
              JSON_OBJECT(
                'event', event_name,
                'count', event_count
              )
            ) AS event_data
          FROM (
            SELECT
              campaign_id,
              publisher_id,
              event AS event_name,
              COUNT(*) AS event_count
            FROM conversions
            WHERE event IS NOT NULL
              AND event != ''
              ${dateFilterConvAnd}
            GROUP BY campaign_id, publisher_id, event
 
            UNION ALL
 
            SELECT
              campaign_id,
              publisher_id,
              event_goal AS event_name,
              COUNT(*) AS event_count
            FROM conversions
            WHERE event_goal IS NOT NULL
              AND event_goal != ''
              ${dateFilterConvAnd}
            GROUP BY campaign_id, publisher_id, event_goal
          ) t
          GROUP BY campaign_id, publisher_id
        ) ev
          ON ev.campaign_id = agg.campaign_id
          AND ev.publisher_id <=> agg.publisher_id
      ) conv
        ON conv.campaign_id = base.campaign_id
        AND conv.publisher_id <=> base.publisher_id
 
      ORDER BY base.campaign_id, total_clicks DESC
      `,
      params
    );
 
    return res.status(200).json({
      success: true,
      count: rows.length,
      data: rows
    });
 
  } catch (error) {
    console.error("❌ All Campaign Summary error:", error);
 
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};





exports.getCampaignInstallsEvents = async (req, res) => {
  try {
    const { campaign_id, startDate, endDate } = req.query;

    if (!campaign_id) {
      return res.status(400).json({
        success: false,
        message: "campaign_id is required"
      });
    }

    let dateFilter = "";
    let params = [campaign_id];

    if (startDate && endDate) {
      dateFilter = "AND created_at BETWEEN ? AND ?";
      params.push(startDate, endDate);
    }

    const [rows] = await db.query(`SELECT
    c.campaign_id,

    COUNT(DISTINCT c.id) AS installs,

    (
      SELECT COUNT(*)
      FROM events e
      WHERE e.campaign_id = c.campaign_id
      AND e.event_value IS NOT NULL
      AND e.event_value != ''
      ${dateFilter}
    ) AS events

  FROM conversions c

  WHERE c.campaign_id = ?
  ${dateFilter}

  GROUP BY c.campaign_id`, params);



      //SELECT
        //campaign_id,

        //COUNT(*) AS installs,

        //SUM(
          //CASE 
            //WHEN event IS NOT NULL AND event != '' THEN 1
            //ELSE 0
          //END
        //) AS events

      //FROM conversions
     // WHERE campaign_id = ?
    //  ${dateFilter}
  //    GROUP BY campaign_id
//
//    `, params);
console.log("Campaign Installs & Events:", rows);
    return res.status(200).json({
      success: true,
      data: rows.length ? rows[0] : {
        campaign_id,
        installs: 0,
        events: 0
      }
    });

  } catch (error) {
    console.error("❌ Installs & Events API error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};


exports.ClicsConversionsReport = async (req, res) => {
    try {
      const {
        campaign_id,
        publisher_id,
        advertiser_id, // optional (maps to adv_key)
        from_date,
        to_date
      } = req.query;
  
      // 🔹 Dynamic filters
      const conditions = [];
      const params = [];
  
      if (campaign_id) {
        conditions.push("c.campaign_id = ?");
        params.push(campaign_id);
      }
  
      if (publisher_id) {
        conditions.push("c.publisher_id = ?");
        params.push(publisher_id);
      }
  
      if (advertiser_id) {
        conditions.push("conv.adv_key = ?");
        params.push(advertiser_id);
      }
  
      if (from_date && to_date) {
        conditions.push("c.created_at BETWEEN ? AND ?");
        params.push(from_date, to_date);
      }
  
      const whereClause = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";
  
      const [rows] = await db.query(
        `SELECT
          c.id               AS click_row_id,
          c.click_id,
          c.advertiser_click_id,
          c.campaign_id,
          c.publisher_id,
          c.pub_id,
          c.sub_pub_id,
          c.gaid,
          c.idfa,
          c.source,
          c.ip_address,
          c.user_agent,
          c.created_at       AS click_time,
  
          conv.id            AS conversion_id,
          conv.conversion_id AS advertiser_conversion_id,
          conv.payout,
          conv.status,
          conv.created_at    AS conversion_time,
          conv.adv_key       AS advertiser_id
  
        FROM clicks c
        LEFT JOIN conversions conv
          ON conv.advertiser_click_id = c.advertiser_click_id
          AND conv.campaign_id = c.campaign_id
  
        ${whereClause}
        ORDER BY c.created_at DESC`,
        params
      );
  
      return res.status(200).json({
        success: true,
        count: rows.length,
        data: rows
      });
  
    } catch (error) {
      console.error("❌ Report API error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  };



async function getNextAvailableId(connection) {
  const sql = `
    SELECT adv_id AS used_id FROM advids
    UNION
    SELECT pub_id AS used_id FROM publids
    ORDER BY used_id ASC
  `;

  const [rows] = await connection.query(sql);

  let expectedId = 1;

  for (const row of rows) {
    const usedId = Number(row.used_id); // 🔥 FIX

    if (usedId === expectedId) {
      expectedId++;
    } else if (usedId > expectedId) {
      break;
    }
  }

  return expectedId;
}


  
  exports.getAvailableId = async (req, res) => {
    const connection = await db.getConnection();
  
    try {
      const nextId = await getNextAvailableId(connection);
  
      res.json({
        success: true,
        available_id: nextId
      });
  
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: "Server error" });
    } finally {
      connection.release();
    }
  };
  


exports.createPublisherBilling = async (req, res) => {
  try {
    let { billingData } = req.body;
 
    // ✅ Normalize input (allow single object or array)
    if (!billingData) {
      return res.status(400).json({
        success: false,
        message: "billingData is required",
      });
    }
 
    if (!Array.isArray(billingData)) {
      billingData = [billingData];
    }
 
    if (billingData.length === 0) {
      return res.status(400).json({
        success: false,
        message: "billingData cannot be empty",
      });
    }
 
    // ✅ Validate required fields
    for (const item of billingData) {
      if (!item.pub_id || !item.user_id) {
        return res.status(400).json({
          success: false,
          message: "Required fields missing: pub_id, user_id",
        });
      }
    }
 
    // ✅ Create placeholders
    const placeholders = billingData.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(",");
 
    const query = `
      INSERT INTO publisher_billing_details
      (pub_id, user_id,
       official_name, address,
       account_holder, account_number, account_currency,
       bank_name, bank_branch_address, swift_bic, ach_routing_number, account_type,
       usdt, paypal, payoneer)
      VALUES ${placeholders}
    `;
 
    // ✅ Flatten values
    const values = billingData.flatMap(item => [
      item.pub_id,
      item.user_id,
      item.official_name        || null,
      item.address              || null,
      item.account_holder       || null,
      item.account_number       || null,
      item.account_currency     || null,
      item.bank_name            || null,
      item.bank_branch_address  || null,
      item.swift_bic            || null,
      item.ach_routing_number   || null,
      item.account_type         || null,
      item.usdt                 || null,
      item.paypal               || null,
      item.payoneer             || null,
    ]);
 
    console.log("📦 Publisher Billing Insert Running...");
    console.log("📦 Values:", values);
 
    const [result] = await db.query(query, values);
 
    return res.status(200).json({
      success: true,
      message: "Publisher billing created successfully",
      insertedRows: result.affectedRows,
    });
 
  } catch (error) {
    console.error("❌ Error creating publisher billing:", error);
 
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};


// controllers/publisherBilling.controller.js
// Get publisher billing details with optional filters
exports.blisherBilling = async (req, res) => {
  try {
    const { user_id, pub_id } = req.query;

    // ✅ Validation
    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: "user_id is required",
      });
    }

    // ✅ Normalize user_id
    const userIds = Array.isArray(user_id) ? user_id : [user_id];
    const userPlaceholders = userIds.map(() => "?").join(",");

    // ✅ Base query
    let query = `
      SELECT 
        id,
        pub_id,
        legal_name,
        billing_address,
        tax_type,
        tax_id,
        user_id,
        created_at,
        updated_at
      FROM publisher_billing_details
      WHERE user_id IN (${userPlaceholders})
    `;

    const queryParams = [...userIds];

    // ✅ Optional pub_id filter
    if (pub_id) {
      const pubIds = Array.isArray(pub_id) ? pub_id : [pub_id];

      if (pubIds.length > 0 && pubIds[0] !== "") {
        const pubPlaceholders = pubIds.map(() => "?").join(",");
        query += ` AND pub_id IN (${pubPlaceholders})`;
        queryParams.push(...pubIds);
      }
    }

    // ✅ Optional sorting
    query += ` ORDER BY id DESC`;

    console.log("📥 Get Publisher Billing Query:", query);
    console.log("📥 Params:", queryParams);

    const [rows] = await db.query(query, queryParams);

    return res.status(200).json({
      success: true,
      count: rows.length,
      data: rows,
    });

  } catch (error) {
    console.error("❌ Error fetching publisher billing:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};



exports.getPublisherBilling = async (req, res) => {
  try {
    const { user_id, pub_id } = req.query;
 
    // ✅ Validation
    if (!user_id) {
      return res.status(400).json({
        success: false,
        message: "user_id is required",
      });
    }
 
    // ✅ Normalize user_id
    const userIds = Array.isArray(user_id) ? user_id : [user_id];
    const userPlaceholders = userIds.map(() => "?").join(",");
 
    // ✅ Base query
    let query = `
      SELECT
        id,
        pub_id,
        user_id,
        official_name,
        address,
        account_holder,
        account_number,
        account_currency,
        bank_name,
        bank_branch_address,
        swift_bic,
        ach_routing_number,
        account_type,
        usdt,
        paypal,
        payoneer,
        created_at,
        updated_at
      FROM publisher_billing_details
      WHERE user_id IN (${userPlaceholders})
    `;
 
    const queryParams = [...userIds];
 
    // ✅ Optional pub_id filter
    if (pub_id) {
      const pubIds = Array.isArray(pub_id) ? pub_id : [pub_id];
 
      if (pubIds.length > 0 && pubIds[0] !== "") {
        const pubPlaceholders = pubIds.map(() => "?").join(",");
        query += ` AND pub_id IN (${pubPlaceholders})`;
        queryParams.push(...pubIds);
      }
    }
 
    // ✅ Optional sorting
    query += ` ORDER BY id DESC`;
 
    console.log("📥 Get Publisher Billing Query:", query);
    console.log("📥 Params:", queryParams);
 
    const [rows] = await db.query(query, queryParams);
 
    return res.status(200).json({
      success: true,
      count: rows.length,
      data: rows,
    });
 
  } catch (error) {
    console.error("❌ Error fetching publisher billing:", error);
 
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

exports.getPublisherStatus = async (req, res) => {
  try {
    const { publisher } = req.query;
 
    if (!publisher) {
      return res.status(400).json({
        success: false,
        message: "Publisher name is required",
      });
    }
 
    const searchWord = publisher.trim().toLowerCase();
 
    const query = `
      SELECT
          p.pub_id,
          p.pub_name,
          p.user_id,
          l.username,
          p.pause,
          CASE
              WHEN p.pause = '1' THEN 'Paused'
              ELSE 'Active'
          END AS status
      FROM publids p
      LEFT JOIN login l
          ON p.user_id = l.id
      WHERE LOWER(p.pub_name) REGEXP CONCAT('(^|[[:space:]])', ?, '([[:space:]]|$)')
      LIMIT 1
    `;
 
    const [rows] = await db.query(query, [searchWord]);
 
    if (rows.length === 0) {
      return res.json({
        success: true,
        found: false,
        message: "Publisher not found",
      });
    }
 
    return res.json({
      success: true,
      found: true,
      data: rows[0],
    });
  } catch (error) {
    console.error(error);
 
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};
