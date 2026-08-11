const db = require("../db/Connection");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
require("dotenv").config();
const multer = require("multer");
const path = require("path");

const cron = require("node-cron");
const axios = require("axios");
const { transactionUtils } = require("../routes/transactionUtils"); // Import function

// const { sendNotification } = require("../socket"); // Import the function from socket.js

// Secret key for J
// WT (store this securely, e.g., in environment variables)
const JWT_SECRET = process.env.VITE_API_JWT_SECRET;

console.log("JWT_SECRET", JWT_SECRET);
// const JWT_SECRET = 'gurdeep0111';
dotenv.config();

// // Add new data
// exports.addAdvData = async (req, res) => {
//     try {
//         const data = req.body;
//         const sql = `INSERT INTO adv_data SET ?`;

//         db.query(sql, data, (err, result) => {
//             if (err) {
//                 console.error("Error inserting data:", err);
//                 return res.status(500).json({ error: "Database error", details: err.sqlMessage });
//             }
//             res.status(201).json({ message: "Data added successfully", id: result.insertId });
//         });
//     } catch (error) {
//         console.error("Server error:", error);
//         res.status(500).json({ error: "Server error", details: error.message });
//     }
// };

// Add new data
exports.addAdvData = async (req, res) => {
  try {
    console.log("🟢 Add Adv Data Request Received:", req.body);

    const {
      pub_name,
      campaign_name,
      geo,
      city,
      os,
      payable_event,
      mmp_tracker,
      adv_id,
      adv_payout,
      pub_id,
      pid,
      shared_date,
      paused_date,
      adv_total_no,
      adv_deductions,
      adv_approved_no,
      user_id,
      pay_out,
      fa,
      fa1,
      vertical,
    } = req.body;

    // ✅ Insert Data into Database
    const [result] = await db.query(
      `INSERT INTO adv_data 
            (pub_name, campaign_name, geo, city, os, payable_event, 
            mmp_tracker, adv_id, adv_payout, pub_id, pid, 
            shared_date, paused_date, adv_total_no, adv_deductions, adv_approved_no,user_id,pay_out,fa,fa1,vertical) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        pub_name,
        campaign_name,
        geo,
        city,
        os,
        payable_event,
        mmp_tracker,
        adv_id,
        adv_payout,
        pub_id,
        pid,
        shared_date,
        paused_date,
        adv_total_no,
        adv_deductions,
        adv_approved_no,
        user_id,
        pay_out,
        fa,
        fa1,
        vertical,
      ],
    );

    console.log("✅ Data Added Successfully");
    res.status(201).json({
      success: true,
      message: "Data added successfully",
      id: result.insertId,
    });
  } catch (error) {
    console.error("❌ Server Error:", error);
    res
      .status(500)
      .json({ message: "Internal server error", details: error.message });
  }
};

//for update note in adv_data
exports.updateNote = async (req, res) => {
  try {
    // prefer id from params, fallback to body
    const id = req.params.id ?? req.body.id;
    const { note, fp, vertical } = req.body;

    if (!id) {
      return res
        .status(400)
        .json({ success: false, message: "Missing id parameter." });
    }

    // Build dynamic query parts
    const fields = [];
    const values = [];

    if (note !== undefined) {
      fields.push("note = ?");
      values.push(note);
    }
    if (fp !== undefined) {
      fields.push("fp = ?");
      values.push(fp);
    }
    if (vertical !== undefined) {
      fields.push("vertical = ?");
      values.push(vertical);
    }

    if (fields.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No fields to update." });
    }

    values.push(id);

    const [result] = await db.query(
      `UPDATE adv_data SET ${fields.join(", ")} WHERE id = ?`,
      values,
    );

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({
          success: false,
          message: "Record not found or nothing changed.",
        });
    }

    // Optional: return updated row
    const [rows] = await db.query("SELECT * FROM adv_data WHERE id = ?", [id]);
    return res.json({
      success: true,
      message: "Record updated",
      data: rows[0],
    });
  } catch (err) {
    console.error("updateAdvData error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

// ✅ Get all adv_data with username from login table
exports.getAllAdvData = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "startDate and endDate are required",
      });
    }

    const [rows] = await db.query(
      `
      SELECT 
        ad.*,
        l.username,

        adv.adv_name,
        pub.pub_name AS pub_am,

        CONCAT(adv.adv_name, ' (', ad.adv_id, ')') AS adv_display,
        CONCAT(pub.pub_name, ' (', ad.pub_id, ')') AS pub_display

      FROM adv_data ad

      -- ✅ login is unique
      LEFT JOIN login l
        ON l.id = ad.user_id

      -- ✅ UNIQUE advertiser rows
      LEFT JOIN (
        SELECT adv_id, MAX(adv_name) AS adv_name
        FROM advids
        GROUP BY adv_id
      ) adv
        ON adv.adv_id = ad.adv_id

      -- ✅ UNIQUE publisher rows
      LEFT JOIN (
        SELECT pub_id, MAX(pub_name) AS pub_name
        FROM publids
        GROUP BY pub_id
      ) pub
        ON pub.pub_id = ad.pub_id

      WHERE ad.shared_date BETWEEN ? AND ?
      ORDER BY ad.shared_date ASC
      `,
      [startDate, endDate],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "No adv data found for selected period.",
      });
    }

    return res.status(200).json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error("❌ Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get data by ID
exports.getAdvDataById = async (req, res) => {
  const userId = req.params.id;
  const { startDate, endDate } = req.query;

  try {
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "startDate and endDate are required",
      });
    }

    const [rows] = await db.query(
      `
      SELECT
        ad.*,
        l.username,
        adv.adv_name,
        pub.pub_name AS pub_am,

        CONCAT(adv.adv_name, ' (', ad.adv_id, ')') AS adv_display,
        CONCAT(pub.pub_name, ' (', ad.pub_id, ')') AS pub_display

      FROM adv_data ad

      LEFT JOIN login l
        ON l.id = ad.user_id

      LEFT JOIN (
        SELECT adv_id, MAX(adv_name) AS adv_name
        FROM advids
        GROUP BY adv_id
      ) adv
        ON adv.adv_id = ad.adv_id

      LEFT JOIN (
        SELECT pub_id, MAX(pub_name) AS pub_name
        FROM publids
        GROUP BY pub_id
      ) pub
        ON pub.pub_id = ad.pub_id

      WHERE
        ad.shared_date BETWEEN ? AND ?
        AND ad.user_id = ?

      ORDER BY ad.shared_date ASC
      `,
      [startDate, endDate, userId],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "No advertiser data found for selected period",
      });
    }

    return res.status(200).json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (err) {
    console.error("❌ Server Error:", err);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      details: err.message,
    });
  }
};

// ✅ update adv_data by ID
exports.updateAdvData = async (req, res) => {
  try {
    const id = req.params.id;

    if (!id) {
      return res.status(400).json({ message: "ID is required" });
    }

    console.log("🟢 Updating Adv Data ID:", id);

    const allowedFields = [
      "pub_name",
      "campaign_name",
      "geo",
      "city",
      "os",
      "payable_event",
      "mmp_tracker",
      "adv_id",
      "adv_payout",
      "pub_id",
      "pid",
      "shared_date",
      "paused_date",
      "adv_total_no",
      "adv_deductions",
      "adv_approved_no",
      "user_id",
      "pay_out",
      "pub_Apno",
      "fa",
      "fa1",
      "vertical",
      "campaign_id",
    ];

    // 🧠 Build dynamic update
    const updates = {};
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        message: "No valid fields provided to update",
      });
    }

    // 🧩 Build SQL dynamically
    const columns = Object.keys(updates)
      .map((key) => `${key} = ?`)
      .join(", ");

    const values = Object.values(updates);

    const [result] = await db.query(
      `
      UPDATE adv_data
      SET ${columns}
      WHERE id = ?
      `,
      [...values, id],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Adv data not found",
      });
    }

    // 🚀 OPTIONAL: skip SELECT for max speed
    return res.status(200).json({
      success: true,
      message: "Adv data updated successfully",
      updated_id: id,
      updated_fields: updates,
    });
  } catch (error) {
    console.error("❌ updateAdvData Error:", error);
    res.status(500).json({
      message: "Internal server error",
      details: error.message,
    });
  }
};

// ✅ Delete pub_data by ID
exports.deleteAdvData = async (req, res) => {
  try {
    console.log("🟢 Deleting Adv Data:", req.params.id);

    const [result] = await db.query(`DELETE FROM adv_data WHERE id = ?`, [
      req.params.id,
    ]);

    if (result.affectedRows === 0) {
      console.warn("⚠️ No Data Found to Delete");
      return res.status(404).json({ message: "Adv data not found" });
    }

    console.log("✅ Adv Data Deleted Successfully");
    res
      .status(200)
      .json({ success: true, message: "Adv data deleted successfully" });
  } catch (error) {
    console.error("❌ Server Error:", error);
    res
      .status(500)
      .json({ message: "Internal server error", details: error.message });
  }
};

// Send message from Publisher to Advertiser (no DB, just acknowledge)
exports.sendPubMessage = async (req, res) => {
  try {
    console.log("📩 Message from Publisher to Advertiser received");

    const { publisherId, advertiserId, message } = req.body;

    if (!publisherId || !advertiserId || !message) {
      return res.status(400).json({
        success: false,
        message: "publisherId, advertiserId, and message are required.",
      });
    }

    // Simulate sending/receiving notification
    console.log(
      `🟢 Publisher ${publisherId} sent to Advertiser ${advertiserId}: "${message}"`,
    );

    res.status(200).json({
      success: true,
      message: "Message received by advertiser.",
    });
  } catch (error) {
    console.error("❌ Error in sendPubMessage:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};
const isEmpty = (value) =>
  value === null || value === undefined || value === "";

function calculatePubApno(record) {
  const { adv_deductions, adv_approved_no, adv_payout, pay_out } = record;

  if (
    isEmpty(adv_deductions) ||
    isEmpty(adv_approved_no) ||
    isEmpty(adv_payout) ||
    isEmpty(pay_out)
  ) {
    throw new Error("Missing or empty required fields in the record.");
  }

  const approved = Number(adv_approved_no);
  const payout = Number(adv_payout);
  const pub = Number(pay_out);

  const advAmount = approved * payout;
  const pubAmount = approved * pub;
  const seventyPercent = advAmount * 0.7;

  let pub_Apno;

  if (pubAmount > seventyPercent) {
    pub_Apno = (0.7 * approved * payout) / pub;
  } else {
    pub_Apno = approved;
  }

  return pub_Apno;
}

exports.calculateAndUpdatePubApno = async (req, res) => {
  try {
    const [rows] = await db.execute("SELECT * FROM adv_data");

    const results = [];
    console.log(rows, "rows");
    for (const row of rows) {
      const { id, adv_deductions, adv_approved_no, adv_payout, pay_out } = row;

      if (
        isEmpty(adv_deductions) ||
        isEmpty(adv_approved_no) ||
        isEmpty(adv_payout) ||
        isEmpty(pay_out)
      ) {
        console.log(
          `Skipping ID ${id} due to missing fields.${
            (adv_deductions, adv_approved_no, adv_payout, pay_out)
          }`,
        );
        continue;
      }

      try {
        const pub_Apno = calculatePubApno(row);
        console.log(`✅ ID ${id}: pub_Apno = ${pub_Apno}`);

        // Update the row
        await db.execute("UPDATE adv_data SET pub_Apno = ? WHERE id = ?", [
          pub_Apno,
          id,
        ]);

        results.push({ id, pub_Apno });
      } catch (error) {
        console.error(`❌ Error processing ID ${row.id}:`, error.message);
      }
    }

    res.json({
      success: true,
      updated: results.length,
      data: results,
    });
  } catch (err) {
    console.error("Server Error:", err.message);
    res.status(500).json({ success: false, error: "Server Error" });
  }
};
