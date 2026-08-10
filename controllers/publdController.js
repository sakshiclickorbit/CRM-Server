const db = require('../db/Connection');
const jwt = require('jsonwebtoken');
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
require('dotenv').config();
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");


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




// Create Advertisement by Sub-Admin
// 🔑 Generate random password
function generatePassword(length = 10) {
  return crypto.randomBytes(length).toString("base64").slice(0, length);
}

async function createPublisherAccount({ pub_id, created_by }, connection) {
  const username = `pub_${pub_id}`;

  // 🔐 Temporary password pattern: username_@123
  const plainPassword = `${username}_@123`;
console.log("g",plainPassword)
  const hashedPassword = await bcrypt.hash(plainPassword, 10);

  await connection.query(
    `
    INSERT INTO pub_accounts (username, password, role, pubid, created_by)
    VALUES (?, ?, 'publisher', ?, ?)
    `,
    [username, hashedPassword, pub_id, created_by]
  );

  return {
    username,
    password: plainPassword, // ⚠️ return once to show admin / email
  };
}



// Create Advertisement by Sub-Admin
exports.createPublisher = async (req, res) => {
    try {
      const connection = await db.getConnection();
      await connection.beginTransaction();
        console.log("🟢 Create Publisher Request Received:", req.body);

        const { pub_name, pub_id, user_id, geo, note, level, vector } = req.body;

        // ✅ Validation: Ensure all fields are provided
        if (!pub_name || !pub_id || !user_id || !geo) {
            return res.status(400).json({ message: "All fields are required" });
        }

        // ✅ Insert Advertisement into Database
        await connection.query(
            "INSERT INTO publids (pub_name, pub_id, user_id, geo, note, level, vector) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [pub_name, pub_id, user_id, geo, note, level, vector]
        );

    // 2️⃣ Create account (reusable function)
    const credentials = await createPublisherAccount(
      { pub_id, created_by: user_id },
      connection
    );
    await connection.commit();


        console.log("✅ Publisher Created Successfully");
        res.status(201).json({ success: true, message: "Publisher created successfully" , credentials        });
    } catch (error) {
        console.error("❌ Server Error:", error);
        res.status(500).json({ message: "Internal server error",error });
    }
};


/**
 * Fetch publishers by user_id with postback + login details
 */



async function fetchPublishersWithLoginByUserId(user_id) {
  const [rows] = await db.query(
    `
    SELECT 
      p.*,
 
      -- Login details
      l.username AS publisher_username,
      l.role     AS publisher_role,
      l.act_pass AS password,
      l.mail     AS mail,
      l.id       AS publisher_login_id,
 
      -- ✅ Billing as JSON array
      (
        SELECT JSON_ARRAYAGG(
          JSON_OBJECT(
            'legal_name', pb.legal_name,
            'billing_address', pb.billing_address,
            'tax_type', pb.tax_type,
            'tax_id', pb.tax_id,
            'created_at', pb.created_at,
            'updated_at', pb.updated_at
          )
        )
        FROM publisher_billing_details pb
        WHERE pb.pub_id = p.pub_id
      ) AS billing_details
 
    FROM publids p
 
    LEFT JOIN pub_accounts l
      ON l.pubid = p.pub_id
 
    WHERE p.user_id = ?
    `,
    [user_id]
  );
 
  return rows;
}

// Get publisherd by User ID
exports.getPublisherByUserId = async (req, res) => {
  try {
    console.log("🟢 Get Publisher Request Received:", req.params);

    const { user_id } = req.params;

    if (!user_id) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const publishers = await fetchPublishersWithLoginByUserId(user_id);

    if (publishers.length > 0) {
      return res.status(200).json({
        success: true,
        publishers
      });
    }

    return res.status(200).json({ success: false, publishers: [] });

  } catch (error) {
    console.error("❌ getPublisherByUserId error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};



         
exports.updatePublishermaildata = async (req, res) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    console.log("🟡 Update Publisher Request:", req.body);

    const {
      pub_name,
      pub_id,
      user_id,
      geo,
      note,
      target,
      level,
      vector,
      username, // not used now
      mail
    } = req.body;

    if (!pub_id || !user_id) {
      return res.status(400).json({
        success: false,
        message: "pub_id and user_id are required"
      });
    }

    // ✅ Get existing publisher
    const [rows] = await connection.query(
      "SELECT * FROM publids WHERE pub_id = ?",
      [pub_id]
    );

    if (!rows.length) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({
        success: false,
        message: "Publisher not found"
      });
    }

    const existing = rows[0];

    // ✅ Dynamic update builder
    const fields = [];
    const values = [];

    const checkAndPush = (fieldName, newValue) => {
      if (newValue !== undefined && newValue !== existing[fieldName]) {
        fields.push(`${fieldName} = ?`);
        values.push(newValue);
      }
    };

    checkAndPush("pub_name", pub_name);
    checkAndPush("geo", geo);
    checkAndPush("note", note);
    checkAndPush("target", target);
    checkAndPush("user_id", user_id);
    checkAndPush("level", level);
    checkAndPush("vector", vector);

    // ✅ Update only if changes exist
    if (fields.length > 0) {
      const updateQuery = `UPDATE publids SET ${fields.join(", ")} WHERE pub_id = ?`;
      values.push(pub_id);

      const [result] = await connection.query(updateQuery, values);
      console.log("🔄 Publids Updated:", result.affectedRows);
    } else {
      console.log("⚡ No changes detected in publids");
    }

    // ✅ Update email if changed
    if (mail && mail !== existing.mail) {
      await connection.query(
        `UPDATE pub_accounts SET email = ? WHERE pub_id = ?`,
        [mail, pub_id]
      );
    }

    await connection.commit();
    connection.release();

    console.log("✅ Publisher updated successfully");
    res.status(200).json({
      success: true,
      message: "Publisher updated successfully"
    });

  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error("❌ Error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

// Update Advertisement update
exports.updatePublisher = async (req, res) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();
 
  try {
    console.log("🟡 Update Publisher Request Received:", req.body);
 
    const {
      pub_name,
      pub_id,
      user_id,
      geo,
      note,
      target,
      level,
      vector,
      username,
      mail,
      pause,
      role,
    } = req.body;
 
    if (!pub_id || !user_id) {
      return res
        .status(400)
        .json({ success: false, message: "pub_id and user_id are required" });
    }
 
    // ✅ Get existing publisher
    const [existingPublisherRows] = await connection.query(
      "SELECT * FROM publids WHERE pub_id = ?",
      [pub_id],
    );
 
    if (!existingPublisherRows.length) {
      connection.release();
      return res
        .status(404)
        .json({ success: false, message: "Publisher not found" });
    }
 
    const previous_user_id = existingPublisherRows[0].user_id;
 
    // ✅ Step 1: Update publisher data
    const [result] = await connection.query(
      "UPDATE publids SET pub_name = ?, geo = ?, note = ?, target = ?, user_id = ?, level = ?, vector = ?,pause=? WHERE pub_id = ?",
      [pub_name, geo, note, target, user_id, level, vector, pause, pub_id],
    );
 
    console.log("🔄 Rows affected:", result.affectedRows);
 
    // ✅ Step 2: Update adv_data (assuming pub_id maps to adv_id or adjust logic as needed)
    //   await connection.query(
    //     `UPDATE adv_data SET pub_name = ? WHERE pub_id = ?`,
    //   [username, pub_id] // if pub_id ≠ adv_id, change this to pub_data logic
    // );
    console.log("✅ adv_data Updated Successfully", username, pub_id);
 
    // ✅ NEW STEP: Update email in pub_accounts
    await updatePublisherEmail(connection, pub_id, mail);
 
    // ✅ Step 3: Log the transfer
    if (previous_user_id !== user_id) {
      await connection.query(
        `INSERT INTO adv_transfer_logs (adv_id, from_user_id, to_user_id) VALUES (?, ?, ?)`,
        [pub_id, previous_user_id, user_id], // again, adjust if it's pub_transfer_logs
      );
 
      // ✅ Step 4: Update id_ranges if sub_admin_id matches
      await connection.query(
        // `UPDATE id_ranges SET sub_admin_id = ? WHERE sub_admin_id = ?`,
        `UPDATE id_assignments SET sub_admin_id = ? WHERE single_id = ?`,
 
        [user_id, pub_id],
      );
    }
    console.log("✅ ID Ranges Updated Successfully");
 
    await connection.commit();
    connection.release();
 
    console.log("✅ Publisher Updated Successfully");
    res
      .status(200)
      .json({ success: true, message: "Publisher updated successfully" });
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error("❌ Server Error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};


const updatePublisherEmail = async (connection, pub_id, mail) => {
  try {
    if (!mail) return; // skip if no email provided

    await connection.query(
      `UPDATE pub_accounts SET mail = ? WHERE pubid = ?`,
      [mail, pub_id]
    );

    console.log("✅ pub_accounts email updated:", mail, pub_id);
  } catch (err) {
    console.error("❌ Failed to update pub_accounts email:", err);
    throw err; // important for transaction rollback
  }
}; 

         
        

// Update Pause Status for a Publisher
exports.updatePublisherPause = async (req, res) => {
    try {
        console.log("🟠 Update Pause Request Received:", req.body);

        const { pub_id, pause } = req.body;

        // ✅ Validate request body
        if (!pub_id || typeof pause === 'undefined') {
            return res.status(400).json({
                success: false,
                message: "Missing required fields: 'pub_id' and 'pause' are mandatory.",
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
        const [result] = await db.query("UPDATE publids SET pause = ? WHERE pub_id = ?", [pause, pub_id]);

        if (result.affectedRows === 0) {
            // ⚠️ pub_id does not exist
            return res.status(404).json({
                success: false,
                message: `Publisher with pub_id '${pub_id}' not found.`,
            });
        }

        // ✅ Update successful
        console.log("✅ Pause Field Updated Successfully for pub_id:", pub_id);
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




//new update place_link
exports.updatePublisherPlaceLink = async (req, res) => {
    try {
      const { pub_id, user_id, place_link } = req.body;
  console.log("🟡 Update Place Link Request Received:", req.body);
  
      // ✅ Validation
      if (!pub_id || !user_id || !place_link) {
        return res.status(400).json({
          success: false,
          message: "pub_id, user_id and place_link are required"
        });
      }
  
      // ✅ Update place_link
      const [result] = await db.query(
        `
        UPDATE publisher_links
        SET postback_url = ?
        WHERE publisher_id = ? AND pub_id = ?
        `,
        [place_link.trim(), pub_id, user_id]
      );
  
      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "No matching publisher record found"
        });
      }
  
      return res.status(200).json({
        success: true,
        message: "place_link updated successfully",
        affected_rows: result.affectedRows
      });
  
    } catch (error) {
      console.error("❌ Update place_link error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  };
  
