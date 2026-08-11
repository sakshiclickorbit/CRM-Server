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

// Create Advertisement by Sub-Admin
exports.createAdvertisement = async (req, res) => {
  try {
    console.log("🟢 Create Advertisement Request Received:", req.body);

    const {
      adv_name,
      adv_id,
      user_id,
      geo,
      note,
      poc_email,
      acc_email,
      assign_user,
      assign_id,
      level,
      vector,
    } = req.body;

    // ✅ Validation: Ensure mandatory fields are provided
    if (!adv_name || !adv_id || !user_id) {
      return res.status(400).json({
        success: false,
        message: "adv_name, adv_id, and user_id are required.",
      });
    }

    // ✅ Insert Advertisement into Database
    await db.query(
      `INSERT INTO advids 
            (adv_name, adv_id, user_id, geo, note, poc_email, acc_email, assign_user, assign_id, level, 
            vector) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        adv_name,
        adv_id,
        user_id,
        geo,
        note,
        poc_email,
        acc_email,
        assign_user,
        assign_id,
        level,
        vector,
      ],
    );

    console.log("✅ Advertisement Created Successfully");
    res
      .status(201)
      .json({ success: true, message: "Advertisement created successfully" });
  } catch (error) {
    console.error("❌ Error during Advertisement Creation:", error);

    // 🧠 Handle duplicate entry
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Duplicate entry: Advertisement ID already exists.",
      });
    }

    // 🧠 Handle foreign key constraint or other known SQL errors
    if (error.code === "ER_NO_REFERENCED_ROW_2") {
      return res.status(400).json({
        success: false,
        message: "Invalid foreign key reference. Please check related data.",
      });
    }

    // 🔴 Generic fallback error
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get Advertisements by User ID
//GET /api/advertisements/:user_id
exports.getAdvertisementsByUserId = async (req, res) => {
  try {
    console.log("🟢 Get Advertisements Request Received:", req.params);

    const { user_id } = req.params;

    if (!user_id) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const [ads] = await db.query(
      `
      SELECT 
        a.*,
        al.postback_url,
        l.username,
        bd.id         AS bd_id,
        bd.legal_name,
        bd.billing_address,
        bd.tax_type,
        bd.tax_id
      FROM (
        SELECT * FROM advids WHERE user_id = ?
        UNION
        SELECT * FROM advids WHERE assign_id = ?
      ) a
      LEFT JOIN (
        SELECT adv_id, MAX(postback_url) AS postback_url
        FROM advertiser_links
        GROUP BY adv_id
      ) al ON al.adv_id = a.adv_id
      LEFT JOIN login l
        ON l.id = a.user_id
      LEFT JOIN advertiser_billing_details bd
        ON bd.adv_id = a.adv_id
      `,
      [user_id, user_id],
    );

    if (ads.length === 0) {
      return res.status(200).json({ success: false });
    }

    // Group billing rows into each advertiser
    const adsMap = new Map();

    for (const row of ads) {
      const {
        bd_id,
        legal_name,
        billing_address,
        tax_type,
        tax_id,
        ...advFields
      } = row;

      if (!adsMap.has(advFields.adv_id)) {
        adsMap.set(advFields.adv_id, { ...advFields, billing_details: [] });
      }

      // Only push if a billing record actually exists
      if (bd_id) {
        adsMap.get(advFields.adv_id).billing_details.push({
          id: bd_id,
          legal_name,
          billing_address,
          tax_type,
          tax_id,
        });
      }
    }

    const advertisements = Array.from(adsMap.values());

    console.log("✅ Advertisements Retrieved Successfully");

    return res.status(200).json({ success: true, advertisements });
  } catch (error) {
    console.error("❌ Server Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Get all advertisers with username from login table
exports.getAllAdvertisers = async (req, res) => {
  try {
    console.log("🟢 Fetching all advertisers...");

    const [advertisers] = await db.query(`
        SELECT 
          a.*,
          l.username,
          al.postback_url
        FROM advids a
        LEFT JOIN login l 
          ON a.user_id = l.id
        LEFT JOIN (
          SELECT adv_id, MAX(postback_url) AS postback_url
          FROM advertiser_links
          GROUP BY adv_id
        ) al
          ON al.adv_id = a.adv_id
      `);

    if (advertisers.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No advertisers found.",
      });
    }

    console.log("✅ Advertisers retrieved successfully.");
    return res.status(200).json({
      success: true,
      data: advertisers,
    });
  } catch (error) {
    console.error("❌ Error fetching advertisers:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};

exports.getAllAdvertiserss = async (req, res) => {
  try {
    const user_id = req.params.user_id ? Number(req.params.user_id) : null;

    console.log("🟢 Requested user_id:", user_id);

    let condition = "";
    let values = [];

    if (user_id) {
      // Get sub-admin IDs assigned to this manager
      const [subAdmins] = await db.query(
        `
  WITH RECURSIVE sub_tree AS (
      SELECT sub_admin_id
      FROM manager_subadmins
      WHERE manager_id = ?

      UNION ALL

      SELECT ms.sub_admin_id
      FROM manager_subadmins ms
      INNER JOIN sub_tree st
          ON ms.manager_id = st.sub_admin_id
  )

  SELECT DISTINCT sub_admin_id
  FROM sub_tree
  `,
        [user_id],
      );

      const subAdminIds = subAdmins.map((r) => Number(r.sub_admin_id));

      const fetchUserIds = [...new Set([user_id, ...subAdminIds])];

      console.log("👤 Manager ID:", user_id);
      console.log("👥 Sub Admin IDs:", subAdminIds);
      console.log("🎯 FINAL USER IDs FETCHING ADVERTISER DATA:", fetchUserIds);

      const placeholders = fetchUserIds.map(() => "?").join(",");

      condition = `
  WHERE a.user_id IN (${placeholders})
`;

      values = fetchUserIds;
    }

    console.log("🧾 SQL Condition:", condition);
    console.log("🧾 SQL Values:", values);

    const [advertisers] = await db.query(
      `
      SELECT 
        a.*,
        l.username,
        al.postback_url
      FROM advids a
      LEFT JOIN login l 
        ON a.user_id = l.id
      LEFT JOIN (
        SELECT adv_id, MAX(postback_url) AS postback_url
        FROM advertiser_links
        GROUP BY adv_id
      ) al
        ON al.adv_id = a.adv_id
      ${condition}
      `,
      values,
    );

    // Log the actual users found in advids
    console.log("📊 USER IDs PRESENT IN FETCHED ADVERTISERS:", [
      ...new Set(advertisers.map((row) => row.user_id)),
    ]);

    // Log advertiser IDs
    console.log(
      "🆔 ADVERTISER IDs FETCHED:",
      advertisers.map((row) => row.adv_id),
    );

    if (!advertisers.length) {
      return res.status(404).json({
        success: false,
        message: "No advertisers found.",
      });
    }

    return res.status(200).json({
      success: true,
      count: advertisers.length,
      data: advertisers,
    });
  } catch (error) {
    console.error("❌ Error fetching advertisers:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};

// Update Advertisement update
// Update Advertisement update
exports.updateAdvertisement = async (req, res) => {
  const connection = await db.getConnection(); // using mysql2/promise
  await connection.beginTransaction();

  try {
    console.log("🟡 Update Advertisement Request Received:", req.body);

    const {
      adv_name,
      adv_id,
      user_id, // new user_id (possibly updated)
      geo,
      note,
      target,
      poc_email,
      acc_email,
      assign_user,
      assign_id,
      level,
      vector,
      billing_details = [], // ✅ new
    } = req.body;

    if (!adv_id || !user_id) {
      return res
        .status(400)
        .json({ success: false, message: "adv_id and user_id are required" });
    }

    // ✅ Fetch existing advertisement to compare user_id
    const [existingAds] = await connection.query(
      "SELECT * FROM advids WHERE adv_id = ?",
      [adv_id],
    );

    if (!existingAds.length) {
      await connection.release();
      return res
        .status(404)
        .json({ success: false, message: "Advertisement not found" });
    }

    const previous_user_id = existingAds[0].user_id;

    // ✅ Step 1: Update advids table
    await connection.query(
      `UPDATE advids SET adv_name = ?, geo = ?, note = ?, target = ?, poc_email = ?, acc_email = ?, assign_user = ?, assign_id = ?, user_id = ?, level = ?, vector = ?  WHERE adv_id = ?`,
      [
        adv_name,
        geo,
        note,
        target,
        poc_email,
        acc_email,
        assign_user,
        assign_id,
        user_id,
        level,
        vector,
        adv_id,
      ],
    );

    // ✅ Step 2: Update adv_data table
    await connection.query(`UPDATE adv_data SET user_id = ? WHERE adv_id = ?`, [
      user_id,
      adv_id,
    ]);

    await connection.query(
      `UPDATE campaign_data SET user_id = ? WHERE adv_d = ?`,
      [user_id, adv_id],
    );

    // ✅ Step 3: Log transfer if user_id has changed
    if (previous_user_id !== user_id) {
      // await connection.query(
      //     `INSERT INTO adv_transfer_logs (adv_id, from_user_id, to_user_id) VALUES (?, ?, ?)`,
      //     [adv_id, previous_user_id, user_id]
      // );
      // ✅ Step 4: Update id_ranges table if sub_admin_id matches old user_id
      await connection.query(
        // `UPDATE id_ranges SET sub_admin_id = ? WHERE sub_admin_id = ?`,
        `UPDATE id_assignments SET sub_admin_id = ? WHERE single_id = ?`,

        [user_id, adv_id],
      );
    }

    // ✅ Step 4: Upsert billing details
    if (billing_details.length > 0) {
      // Get IDs of entries sent from frontend (only existing ones have an id)
      const incomingIds = billing_details.filter((b) => b.id).map((b) => b.id);

      // Delete removed entries — those in DB but not in the incoming list
      if (incomingIds.length > 0) {
        await connection.query(
          `DELETE FROM advertiser_billing_details 
                   WHERE adv_id = ? AND id NOT IN (?)`,
          [adv_id, incomingIds],
        );
      } else {
        // All existing entries were removed — delete everything for this adv_id
        await connection.query(
          `DELETE FROM advertiser_billing_details WHERE adv_id = ?`,
          [adv_id],
        );
      }

      // Update existing + insert new entries
      for (const b of billing_details) {
        if (b.id) {
          // Existing row → UPDATE
          await connection.query(
            `UPDATE advertiser_billing_details 
                       SET legal_name = ?, billing_address = ?, tax_type = ?, tax_id = ?
                       WHERE id = ? AND adv_id = ?`,
            [
              b.legal_name,
              b.billing_address,
              b.tax_type,
              b.tax_id,
              b.id,
              adv_id,
            ],
          );
        } else {
          // New row → INSERT
          await connection.query(
            `INSERT INTO advertiser_billing_details 
                       (adv_id, legal_name, billing_address, tax_type, tax_id, user_id)
                       VALUES (?, ?, ?, ?, ?, ?)`,
            [
              adv_id,
              b.legal_name,
              b.billing_address,
              b.tax_type,
              b.tax_id,
              user_id,
            ],
          );
        }
      }
    } else {
      // Frontend sent empty array — remove all billing entries for this advertiser
      await connection.query(
        `DELETE FROM advertiser_billing_details WHERE adv_id = ?`,
        [adv_id],
      );
    }

    await connection.commit();
    connection.release();

    console.log("✅ Advertisement Updated Successfully");
    res
      .status(200)
      .json({ success: true, message: "Advertisement updated successfully" });
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error("❌ Server Error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

exports.updateCampData = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const {
      id,
      os_old,
      os_new,
      advertiser_link,
      tracking_url,
      advertiser_impression_url,
      preview_url,
      ...fieldsToUpdate
    } = req.body;

    // fallback mapping
    const finalAdvertiserLink = advertiser_link || tracking_url;
    console.log(advertiser_impression_url, "hh");

    console.log("advertiser_link:", advertiser_link);
    console.log("tracking_url:", req.body.tracking_url);
    if (tracking_url !== undefined) {
      fieldsToUpdate.tracking_url = tracking_url || null;
    }

    if (preview_url !== undefined) {
      fieldsToUpdate.preview_url = preview_url || null;
    }

    if (advertiser_impression_url !== undefined) {
      fieldsToUpdate.advertiser_impression_url =
        advertiser_impression_url || null;
    }

    if (!id || !os_old || !os_new) {
      return res.status(400).json({
        message: "id, os_old and os_new are required",
      });
    }

    await connection.beginTransaction();

    // ✅ Clean GEO → flat JSON array
    if (Array.isArray(fieldsToUpdate.geo)) {
      fieldsToUpdate.geo = JSON.stringify(
        fieldsToUpdate.geo.flat().map(String),
      );
    }

    // ✅ Clean state_city → flat JSON array
    if (Array.isArray(fieldsToUpdate.state_city)) {
      fieldsToUpdate.state_city = JSON.stringify(
        fieldsToUpdate.state_city.flat().map(String),
      );
    }

    // 🔥 OS update
    fieldsToUpdate.os = os_new;
    fieldsToUpdate.updated_at = new Date();

    if (Object.keys(fieldsToUpdate).length === 0 && !finalAdvertiserLink) {
      return res.status(400).json({
        message: "No fields provided to update",
      });
    }

    // -------------------------------
    // 1️⃣ UPDATE campaign_data
    // -------------------------------
    if (Object.keys(fieldsToUpdate).length > 0) {
      const columns = Object.keys(fieldsToUpdate)
        .map((key) => `${key} = ?`)
        .join(", ");

      const values = Object.values(fieldsToUpdate);

      const [campResult] = await connection.query(
        `
        UPDATE campaign_data
        SET ${columns}
        WHERE id = ? AND os = ?
        `,
        [...values, id, os_old],
      );

      if (campResult.affectedRows === 0) {
        throw new Error("Campaign not found or OS mismatch");
      }
    }

    // -------------------------------
    // 2️⃣ UPDATE advertiser_links
    // -------------------------------

    console.log(advertiser_link, "Update Request Received:", req.body);

    if (finalAdvertiserLink) {
      console.log(
        `Updating advertiser_links for campaign_id ${id} with new link: ${finalAdvertiserLink}`,
      );

      await connection.query(
        `
        UPDATE advertiser_links
        SET advertiser_link = ?, advertiser_impression_url= ?, updated_at = NOW()
        WHERE campaign_id = ?
        `,
        [finalAdvertiserLink, advertiser_impression_url, id],
      );
    }

    await connection.commit();

    return res.json({
      success: true,
      message: "Campaign & advertiser link updated successfully",
      campaign_id: id,
      os_changed_from: os_old,
      os_changed_to: os_new,
      updated_fields: fieldsToUpdate,
      advertiser_link_updated: !!advertiser_link,
      advertiser_impression_url: advertiser_impression_url,
    });
  } catch (error) {
    await connection.rollback();
    console.error("❌ updateCampData Error:", error);

    res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  } finally {
    connection.release();
  }
};

// Update Pause Status for a Publisher
exports.updateAdvPause = async (req, res) => {
  try {
    console.log("🟠 Update Pause Request Received:", req.body);

    const { adv_id, pause } = req.body;

    // ✅ Validate request body
    if (!adv_id || typeof pause === "undefined") {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: 'adv_id' and 'pause' are mandatory.",
      });
    }

    // ✅ Validate pause value
    if (![0, 1].includes(Number(pause))) {
      return res.status(422).json({
        success: false,
        message: "Invalid 'pause' value. Allowed values are 0 or 1.",
      });
    }

    // ✅ Update the pause field in the database
    const [result] = await db.query(
      "UPDATE advids SET pause = ? WHERE adv_id = ?",
      [pause, adv_id],
    );

    if (result.affectedRows === 0) {
      // ⚠️ pub_id does not exist
      return res.status(404).json({
        success: false,
        message: `advids with pub_id '${adv_id}' not found.`,
      });
    }

    // ✅ Update successful
    console.log("✅ Pause Field Updated Successfully for adv_id:", adv_id);
    return res.status(200).json({
      success: true,
      message: "Pause status updated successfully.",
    });
  } catch (error) {
    // ❌ Unexpected error
    console.error("❌ Internal Server Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error. Please try again later.",
      error: error.message,
    });
  }
};
