const db = require('../db/Connection');
const jwt = require('jsonwebtoken');
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
require('dotenv').config();
const multer = require("multer");
const path = require("path");

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






// controllers/fixEmptyAdvFields.js

exports.fixEmptyAdvFieldsByDateRange = async (req, res) => {
  try {
    const { startDate, endDate, user_id, adv_id } = req.body;

    if (!startDate || !endDate || !user_id) {
      return res.status(400).json({
        success: false,
        message: "startDate, endDate and user_id are required",
      });
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return res.status(400).json({
        success: false,
        message: "startDate and endDate must be in YYYY-MM-DD format",
      });
    }

    if (new Date(startDate) > new Date(endDate)) {
      return res.status(400).json({
        success: false,
        message: "startDate cannot be after endDate",
      });
    }

    const userIds = Array.isArray(user_id) ? user_id : [user_id];
    const userPlaceholders = userIds.map(() => "?").join(",");

    let query = `
      UPDATE adv_data
      SET
        pub_Apno        = COALESCE(pub_Apno, 0),
        adv_total_no    = COALESCE(adv_total_no, 0),
        adv_deductions  = COALESCE(adv_deductions, 0),
        adv_approved_no = COALESCE(adv_approved_no, 0)
      WHERE shared_date BETWEEN ? AND ?
      AND user_id IN (${userPlaceholders})
    `;

    const queryParams = [startDate, endDate, ...userIds];

    if (adv_id !== undefined) {
      const advIds = Array.isArray(adv_id) ? adv_id : [adv_id];
      if (advIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Please select at least one advertiser",
        });
      }
      const advPlaceholders = advIds.map(() => "?").join(",");
      query += ` AND adv_id IN (${advPlaceholders})`;
      queryParams.push(...advIds);
    }

    const [result] = await db.query(query, queryParams);

    if (result.affectedRows === 0) {
      return res.status(200).json({
        success: true,
        message: "No rows matched the given filters or all values were already set",
        affectedRows: 0,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Records updated successfully",
      affectedRows: result.affectedRows,
    });

  } catch (error) {
    console.error("❌ Error fixing empty adv fields:", error);
    const message = error.code === "ECONNREFUSED"
      ? "Database connection failed"
      : "Internal server error";
    return res.status(500).json({ success: false, message });
  }
};
