const db = require("../db/Connection");
const chatDb = require("../db/ChatConnection");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
require("dotenv").config();
const multer = require("multer");
const path = require("path");

const cron = require("node-cron");
const axios = require("axios");
const { transactionUtils } = require("../routes/transactionUtils"); // Import function
const { sendOTPEmail } = require("../utils/mail.service");

const { getAccessibleUserIds } = require("../utils/accessControl");

// const { sendNotification } = require("../socket"); // Import the function from socket.js

// Secret key for J
// WT (store this securely, e.g., in environment variables)
const JWT_SECRET = process.env.VITE_API_JWT_SECRET;

console.log("JWT_SECRET", JWT_SECRET);
// const JWT_SECRET = 'gurdeep0111';
dotenv.config();

//get assignuser
exports.getAssignedUsers = async (req, res) => {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({
      success: false,
      message: "Manager ID is required as query param ?id=",
    });
  }

  try {
    // Recursively get all descendant sub_admin_ids at every level
    const [assignments] = await db.query(
      `WITH RECURSIVE assigned AS (
          SELECT
              sub_admin_id,
              CAST(sub_admin_id AS CHAR(1000)) AS path,
              1 AS depth
          FROM manager_subadmins
          WHERE manager_id = ?
    
          UNION ALL
    
          SELECT
              ms.sub_admin_id,
              CONCAT(a.path, ',', ms.sub_admin_id),
              a.depth + 1
          FROM manager_subadmins ms
          INNER JOIN assigned a
              ON ms.manager_id = a.sub_admin_id
          WHERE
              FIND_IN_SET(ms.sub_admin_id, a.path) = 0
              AND a.depth < 50
      )
      SELECT DISTINCT sub_admin_id FROM assigned`,
      [id],
    );

    if (assignments.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    const subAdminIds = assignments.map((row) => row.sub_admin_id);

    // Fetch id, username, role for all assigned users at all levels
    const [users] = await db.query(
      `SELECT id, username, email, role FROM login WHERE id IN (?)`,
      [subAdminIds],
    );

    if (users.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    const userIds = users.map((u) => u.id);

    //Fetch permissions for all users (id in user_permissions = login.id)
    const [permRows] = await db.query(
      `SELECT * FROM user_permissions WHERE id IN (?)`,
      [userIds],
    );

    const permissionsMap = {};
    for (const row of permRows) {
      const { id: userId, created_at, ...permFields } = row;
      permissionsMap[userId] = permFields;
    }

    const result = users.map((user) => ({
      id: user.id,
      username: user.username,
      role: user.role,
      email: user.email,
      permissions: permissionsMap[user.id] || {},
    }));

    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error("❌ getAssignedUsers error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};

// Create Sub-Admin
exports.createSubAdmin = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { username, email, password, role, assigned_subadmins } = req.body;

    console.log("🟢 Create Sub-Admin Request:", req.body);

    if (!username || !email || !password || !role) {
      return res.status(400).json({ message: "All fields are required" });
    }

    await connection.beginTransaction();
    const [[existingUser]] = await connection.query(
      `SELECT id FROM login WHERE username = ? OR email = ?`,
      [username, email],
    );

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Username or Email already exists",
      });
    }
    // Step 3: Create Sub-Admin
    const hashedPassword = await bcrypt.hash(password, 10);

    const [subAdminResult] = await connection.query(
      `INSERT INTO login (username, email, password, role)
     VALUES (?, ?, ?, ?)`,
      [username, email, hashedPassword, role],
    );

    const subAdminId = subAdminResult.insertId;
    console.log("✅ Sub-Admin Inserted with ID:", subAdminId);

    // Step 3a: Insert default permissions for buttons and inputs
    const { can_see_button1, can_see_input1, can_add_store } = req.body;

    // Use 0 if no value provided
    await connection.query(
      `INSERT INTO user_permissions 
    (id, can_see_button1, can_see_input1, can_add_store) 
    VALUES (?, ?, ?, ?)`,
      [
        subAdminId,
        can_see_button1 || 0,
        can_see_input1 || 0,
        can_add_store || 0,
      ],
    );

    console.log("🟢 Default permissions inserted for Sub-Admin:", subAdminId);

    // Step 5: Assign sub-admins to manager (if applicable)
    if (
      (role === "publisher_manager" || role === "advertiser_manager") &&
      assigned_subadmins?.length > 0
    ) {
      for (const subAdmin of assigned_subadmins) {
        await connection.query(
          "INSERT INTO manager_subadmins (manager_id, sub_admin_id) VALUES (?, ?)",
          [subAdminId, subAdmin],
        );
        console.log(
          `👥 Assigned Sub-Admin ${subAdmin} to Manager ${subAdminId}`,
        );
      }
    }

    await connection.commit();

    try {
      const PUB_ROLES = [
        "publisher", "publisher_manager", "pub_executive",
        "optimization", "operations", "operation_manager",
      ];
      const ADV_ROLES = ["advertiser", "advertiser_manager", "adv_executive"];

      const normalizedRole = (Array.isArray(role) ? role[0] : role || "")
        .replace(/"/g, "").trim().toLowerCase();

      let crm_user_id = null;
      if (PUB_ROLES.includes(normalizedRole))       crm_user_id = `pub_0${subAdminId}`;
      else if (ADV_ROLES.includes(normalizedRole))  crm_user_id = `adv_0${subAdminId}`;
      else if (normalizedRole === "admin")           crm_user_id = `admin_0${subAdminId}`;

      const chatEmail = email || `${username}@clickorbits.com`;
      const now = new Date();

      await chatDb.query(
        `INSERT INTO users
         (id, username, full_name, email, password_hash, role, crm_user_id,
          is_online, last_seen, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           username      = VALUES(username),
           full_name     = VALUES(full_name),
           email         = VALUES(email),
           password_hash = VALUES(password_hash),
           role          = VALUES(role),
           crm_user_id   = VALUES(crm_user_id),
           updated_at    = VALUES(updated_at)`,
        [
          subAdminId, username, username, chatEmail,
          hashedPassword, normalizedRole, crm_user_id,
          now, now, now,
        ]
      );
      console.log(`✅ [ChatDB] User '${username}' (id: ${subAdminId}) synced to chat users table`);
    } catch (syncErr) {
      console.warn(
        `⚠️  [ChatDB] Could not sync user '${username}' to chat users table:`,
        syncErr.message
      );
    }
    console.log("✅ Sub-Admin Created Successfully");
    res.status(201).json({
      success: true,
      message: "Sub-admin created successfully",
      subAdmin: {
        id: subAdminId,
        username,
        email,
        role,
        // ranges: finalMiniRanges,
        assigned_subadmins:
          role === "publisher_manager" || role === "advertiser_manager"
            ? assigned_subadmins
            : undefined,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error("❌ Server Error:", error);
    res.status(500).json({ message: "Internal server error", error });
  } finally {
    connection.release();
  }
};

// Create Sub-Admin
// exports.createSubAdmin = async (req, res) => {
//     const connection = await db.getConnection(); // Start a transaction
//     try {
//         console.log("🟢 Create Sub-Admin Request Received:", req.body);

//         const { username, password, role, ranges, assigned_subadmins } = req.body;

//         // ✅ Validation: Ensure all fields are provided
//         if (!username || !password || !role || !ranges || !Array.isArray(ranges) || ranges.length === 0) {
//             return res.status(400).json({ message: "All fields are required" });
//         }

//         await connection.beginTransaction();

//         // ✅ Check for Range Conflicts
//         for (const range of ranges) {
//             const { start, end } = range;

//             const [existingRanges] = await connection.query(
//                 "SELECT * FROM id_ranges WHERE (range_start <= ? AND range_end >= ?) OR (range_start <= ? AND range_end >= ?) OR (range_start >= ? AND range_end <= ?)",
//                 [start, start, end, end, start, end]
//             );

//             if (existingRanges.length) {
//                 console.warn("⚠️ Range Conflict Detected");
//                 await connection.rollback(); // Rollback transaction
//                 return res.status(400).json({ message: `The selected range (${start}-${end}) overlaps with an existing sub-admin` });
//             }
//         }

//         // ✅ Hash Password
//         const hashedPassword = await bcrypt.hash(password, 10);

//         // ✅ Insert Sub-Admin into Database
//         const [subAdminResult] = await connection.query(
//             "INSERT INTO login (username, password, role) VALUES (?, ?, ?)",
//             [username, hashedPassword, role]
//         );

//         const subAdminId = subAdminResult.insertId;

//         // ✅ Insert Ranges into Database
//         for (const range of ranges) {
//             await connection.query(
//                 "INSERT INTO id_ranges (sub_admin_id, range_start, range_end, created_at) VALUES (?, ?, ?, NOW())",
//                 [subAdminId, range.start, range.end]
//             );
//         }

//         // ✅ If role is 'manager', assign sub-admins
//         if (role === 'manager' && assigned_subadmins && Array.isArray(assigned_subadmins) && assigned_subadmins.length > 0) {
//             for (const subAdmin of assigned_subadmins) {
//                 await connection.query(
//                     "INSERT INTO manager_subadmins (manager_id, sub_admin_id) VALUES (?, ?)",
//                     [subAdminId, subAdmin]
//                 );
//             }
//         }

//         await connection.commit(); // Commit transaction

//         console.log("✅ Sub-Admin Created Successfully");
//         res.status(201).json({
//             success: true,
//             message: "Sub-admin created successfully",
//             subAdmin: {
//                 id: subAdminId,
//                 username,
//                 role,
//                 ranges,
//                 assigned_subadmins: role === 'manager' ? assigned_subadmins : undefined
//             }
//         });
//     } catch (error) {
//         await connection.rollback(); // Rollback transaction on error
//         console.error("❌ Server Error:", error);
//         res.status(500).json({ message: "Internal server error" });
//     } finally {
//         connection.release(); // Release connection
//     }
// };

// Login Sub-Admin
// exports.loginSubAdmin = async (req, res) => {
//     try {
//         console.log("🟢 Login Request Received:", req.body);

//         const { username, password } = req.body;

//         // ✅ Validation: Ensure both username and password are provided
//         if (!username || !password) {
//             return res.status(400).json({ message: "Username and password are required" });
//         }

//         // ✅ Fetch Sub-Admin by Username
//         const [results] = await db.query("SELECT * FROM login WHERE username = ?", [username]);

//         if (!results.length) {
//             console.warn("⚠️ Sub-Admin not found");
//             return res.status(401).json({ message: "Invalid username or password" });
//         }

//         const subAdmin = results[0];

//         // ✅ Verify Password
//         const passwordMatch = await bcrypt.compare(password, subAdmin.password);

//         if (!passwordMatch) {
//             console.warn("⚠️ Incorrect password");
//             return res.status(401).json({ message: "Invalid username or password" });
//         }

//         // ✅ Fetch Range Details
//         const [rangeResults] = await db.query("SELECT range_start, range_end FROM id_ranges WHERE sub_admin_id = ?", [subAdmin.id]);
//         const range = rangeResults.length ? rangeResults[0] : { range_start: null, range_end: null };

//         console.log("✅ Sub-Admin logged in successfully!");
//         res.status(200).json({
//             success: true,
//             message: "Login successful",
//             subAdmin: {
//                 id: subAdmin.id,
//                 username: subAdmin.username,
//                 role: subAdmin.role,
//                 range: {
//                     range_start: range.range_start,
//                     range_end: range.range_end
//                 }
//             }
//         });

//     } catch (error) {
//         console.error("❌ Server Error:", error);
//         res.status(500).json({ message: "Internal server error" });
//     }
// };

const checkIfUserPaused = (user) => {
  return user.pause === 1;
};

exports.loginSubAdmin = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ message: "Username and password are required" });
    }

    // Fetch Sub-Admin basic details + permissions
    const [userResults] = await db.query(
      `SELECT l.id AS sub_admin_id, l.username, l.role, l.password,l.pause,
                  up.can_see_button1, up.can_see_input1, up.can_add_store
           FROM login l
           LEFT JOIN user_permissions up ON l.id = up.id
           WHERE l.username = ? OR email = ?`,
      [username, username],
    );

    if (!userResults.length) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    const subAdmin = userResults[0];
    // 🚫 Check if account is paused
    if (checkIfUserPaused(subAdmin)) {
      return res.status(403).json({
        success: false,
        message: "Your account is suspended. Please contact admin.",
      });
    }
    // ✅ Parse role (in case it's stored as JSON array)
    try {
      subAdmin.role = JSON.parse(subAdmin.role || "[]");
    } catch {
      // fallback: if not JSON (older entries), wrap as single role
      // subAdmin.role = [subAdmin.role];
      subAdmin.role = subAdmin.role || "[]";
    }

    const passwordMatch = await bcrypt.compare(password, subAdmin.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    // Fetch ID Ranges
    const [rangeResults] = await db.query(
      `SELECT range_start, range_end FROM id_ranges WHERE sub_admin_id = ?`,
      [subAdmin.sub_admin_id],
    );

    const ranges = rangeResults.map((r) => ({
      start: r.range_start,
      end: r.range_end,
    }));

    // Fetch Individual Assigned IDs
    const [singleIdResults] = await db.query(
      `SELECT single_id FROM id_assignments WHERE sub_admin_id = ?`,
      [subAdmin.sub_admin_id],
    );

    const singleIds = singleIdResults.map((row) => row.single_id);

    // If manager, fetch sub-admins assigned
    // let assignedSubAdmins = [];
    // if (subAdmin.role === 'publisher_manager' || subAdmin.role === 'advertiser_manager') {
    //     const [assignedResults] = await db.query(
    //         "SELECT sub_admin_id FROM manager_subadmins WHERE manager_id = ?",
    //         [subAdmin.sub_admin_id]
    //     );
    //     assignedSubAdmins = assignedResults.map(r => r.sub_admin_id);
    // }
    // =========================================================
    // 🔥 GET FULL HIERARCHY (RECURSIVE)
    // =========================================================
    const getAllSubAdmins = async (startIds) => {
      let allIds = [...startIds];
      let queue = [...startIds];

      while (queue.length > 0) {
        const placeholders = queue.map(() => "?").join(",");

        const [rows] = await db.query(
          `SELECT sub_admin_id
       FROM manager_subadmins
       WHERE manager_id IN (${placeholders})`,
          queue,
        );

        const newIds = rows
          .map((r) => r.sub_admin_id)
          .filter((id) => !allIds.includes(id));

        if (newIds.length === 0) break;

        allIds.push(...newIds);
        queue = newIds;
      }

      return allIds;
    };

    // =========================================================
    // 🔥 NORMALIZE ROLE (IMPORTANT)
    // =========================================================
    let role = subAdmin.role;
    if (Array.isArray(role)) role = role[0];
    role = (role || "").replace(/"/g, "").trim();

    // =========================================================
    // 🔥 GET ASSIGNED USERS BASED ON ROLE
    // =========================================================
    let assignedSubAdmins = [];

    if (
      [
        "publisher",
        "advertiser",
        "publisher_manager",
        "advertiser_manager",
      ].includes(role)
    ) {
      const allIds = await getAllSubAdmins([subAdmin.sub_admin_id]);

      // ❗ remove self if you don’t want it in list
      assignedSubAdmins = allIds.filter((id) => id !== subAdmin.sub_admin_id);
    }

    // Generate JWT
    const token = jwt.sign(
      { id: subAdmin.sub_admin_id, role: role, type: "sub_admin" },
      process.env.JWT_SECRET || "long_jwt_secret_key",
      { expiresIn: "7d" },
    );

    // Final response with permissions
    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      subAdmin: {
        id: subAdmin.sub_admin_id,
        username: subAdmin.username,
        role: subAdmin.role,
        ranges, // Array of {start, end}
        single_ids: singleIds, // Array of individual IDs
        assigned_subadmins:
          assignedSubAdmins.length > 0 ? assignedSubAdmins : undefined,
        permissions: {
          can_see_button1: subAdmin.can_see_button1 || 0,
          can_see_input1: subAdmin.can_see_input1 || 0,
          can_add_store: subAdmin.can_add_store || 0,
        },
      },
    });
  } catch (error) {
    console.error("❌ Login error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Login Sub-Admin
exports.loginSubAdminon = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ message: "Username and password are required" });
    }

    // Fetch Sub-Admin basic details + permissions
    const [userResults] = await db.query(
      `SELECT l.id AS sub_admin_id, l.username, l.role, l.password,l.pause,
                  up.can_see_button1, up.can_see_input1, up.can_add_store
           FROM login l
           LEFT JOIN user_permissions up ON l.id = up.id
           WHERE l.username = ?`,
      [username],
    );

    if (!userResults.length) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    const subAdmin = userResults[0];

    // 🚫 Check if account is paused
    if (checkIfUserPaused(subAdmin)) {
      return res.status(403).json({
        success: false,
        message: "Your account is suspended. Please contact admin.",
      });
    }

    // ✅ Parse role (in case it's stored as JSON array)

    try {
      subAdmin.role = JSON.parse(subAdmin.role || "[]");
    } catch {
      // fallback: if not JSON (older entries), wrap as single role
      // subAdmin.role = [subAdmin.role];
      subAdmin.role = subAdmin.role || "[]";
    }

    const passwordMatch = await bcrypt.compare(password, subAdmin.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    // Fetch ID Ranges
    const [rangeResults] = await db.query(
      `SELECT range_start, range_end FROM id_ranges WHERE sub_admin_id = ?`,
      [subAdmin.sub_admin_id],
    );

    const ranges = rangeResults.map((r) => ({
      start: r.range_start,
      end: r.range_end,
    }));

    // Fetch Individual Assigned IDs
    const [singleIdResults] = await db.query(
      `SELECT single_id FROM id_assignments WHERE sub_admin_id = ?`,
      [subAdmin.sub_admin_id],
    );

    const singleIds = singleIdResults.map((row) => row.single_id);

    // If manager, fetch sub-admins assigned
    let assignedSubAdmins = [];
    if (
      subAdmin.role === "publisher_manager" ||
      subAdmin.role === "advertiser_manager"
    ) {
      const [assignedResults] = await db.query(
        "SELECT sub_admin_id FROM manager_subadmins WHERE manager_id = ?",
        [subAdmin.sub_admin_id],
      );
      assignedSubAdmins = assignedResults.map((r) => r.sub_admin_id);
    }

    // Final response with permissions
    return res.status(200).json({
      success: true,
      message: "Login successful",
      subAdmin: {
        id: subAdmin.sub_admin_id,
        username: subAdmin.username,
        role: subAdmin.role,
        ranges, // Array of {start, end}
        single_ids: singleIds, // Array of individual IDs
        assigned_subadmins:
          assignedSubAdmins.length > 0 ? assignedSubAdmins : undefined,
        permissions: {
          can_see_button1: subAdmin.can_see_button1 || 0,
          can_see_input1: subAdmin.can_see_input1 || 0,
          can_add_store: subAdmin.can_add_store || 0,
        },
      },
    });
  } catch (error) {
    console.error("❌ Login error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Update Sub-Admin Status (Pause / Live)
exports.updateSubAdminStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { pause } = req.body;

    // -------------------------------
    // VALIDATION
    // -------------------------------
    if (pause === undefined) {
      return res.status(400).json({
        success: false,
        message: "pause field is required (0 or 1)",
      });
    }

    if (![0, 1].includes(Number(pause))) {
      return res.status(400).json({
        success: false,
        message: "pause must be 0 (live) or 1 (paused)",
      });
    }

    // -------------------------------
    // CHECK USER EXISTS
    // -------------------------------
    const [existing] = await db.query(
      "SELECT id, pause FROM login WHERE id = ?",
      [id],
    );

    if (!existing.length) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // -------------------------------
    // UPDATE STATUS
    // -------------------------------
    await db.query("UPDATE login SET pause = ? WHERE id = ?", [pause, id]);

    // -------------------------------
    // SYNC STATUS TO CHATDB
    // -------------------------------
    try {
      const isActive = Number(pause) === 1 ? 0 : 1;
      await chatDb.query("UPDATE users SET is_active = ? WHERE id = ?", [
        isActive,
        id,
      ]);
      console.log(`✅ [ChatDB] is_active synced for user ${id}`);
    } catch (syncErr) {
      console.warn(
        `⚠️  [ChatDB] Could not sync is_active for user ${id}:`,
        syncErr.message,
      );
    }

    return res.json({
      success: true,
      message:
        pause === 1
          ? "User has been paused successfully"
          : "User is now active (live)",
      data: {
        user_id: id,
        status: pause === 1 ? "paused" : "live",
      },
    });
  } catch (error) {
    console.error("❌ Update Status Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update user status",
      error: error.message,
    });
  }
};

/**
 * Change user password
 */
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmNewPassword } = req.body;
    const { userId } = req.params;
    console.log("pass", currentPassword, newPassword, confirmNewPassword);
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({ message: "New passwords do not match" });
    }

    // Get user details
    const [user] = await db.query("SELECT password FROM login WHERE id = ?", [
      userId,
    ]);

    if (user.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(currentPassword, user[0].password);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password
    await db.query("UPDATE login SET password = ? WHERE id = ?", [
      hashedPassword,
      userId,
    ]);

    try {
      await chatDb.query(
        "UPDATE users SET password_hash = ? WHERE id = ?",
        [hashedPassword, userId]
      );
      console.log(`✅ [ChatDB] password_hash synced for user ${userId}`);
    } catch (syncErr) {
      console.warn(
        `⚠️  [ChatDB] Could not sync password_hash for user ${userId}:`,
        syncErr.message
      );
    }
    res.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Error changing password:", error);
    res.status(500).json({ message: "Failed to change password" });
  }
};

exports.getCombinedData = async (req, res) => {
  try {
    console.log("🟢 Fetching Combined Data for User ID:", req.params.pid);

    const [results] = await db.query(
      `SELECT 
                a.id AS adv_id, a.pub_name, a.campaign_name AS adv_campaign, a.geo AS adv_geo, a.city AS adv_city, 
                a.os AS adv_os, a.payable_event AS adv_payable_event, a.mmp_tracker AS adv_mmp_tracker, 
                a.adv_id, a.adv_payout, a.pub_id AS adv_pub_id, a.pid AS adv_pid, a.shared_date AS adv_shared_date, 
                a.paused_date AS adv_paused_date, a.adv_total_no, a.adv_deductions, a.adv_approved_no, a.user_id AS adv_user_id,

                p.id AS pub_id, p.adv_name, p.campaign_name AS pub_campaign, p.geo AS pub_geo, p.city AS pub_city, 
                p.os AS pub_os, p.payable_event AS pub_payable_event, p.mmp_tracker AS pub_mmp_tracker, 
                p.pub_id AS pub_pub_id, p.p_id AS pub_p_id, p.pub_payout, p.shared_date AS pub_shared_date, 
                p.paused_date AS pub_paused_date, p.review, p.pub_total_numbers, p.pub_deductions, p.pub_approved_numbers, 
                p.user_id AS pub_user_id
            FROM adv_data a
            LEFT JOIN pub_data p ON a.pid = p.p_id
            WHERE a.pid = ? OR p.p_id = ?`,
      [req.params.pid, req.params.pid],
    );

    if (results.length === 0) {
      console.warn("⚠️ No Data Found for User ID:", req.params.pid);
      return res.status(404).json({ message: "No data found for this user" });
    }

    console.log("✅ Combined Data Retrieved Successfully");
    res.status(200).json(results);
  } catch (error) {
    console.error("❌ Server Error:", error);
    res
      .status(500)
      .json({ message: "Internal server error", details: error.message });
  }
};

exports.getUserData = async (req, res) => {
  const userId = req.params.userId;
  const { start_date, end_date } = req.query;

  try {
    // -------------------------------
    // 1️⃣ Validate user
    // -------------------------------
    const [[user]] = await db.query(
      "SELECT id, role FROM login WHERE id = ? AND pause = 0",
      [userId],
    );

    if (!user) {
      return res.status(404).json({ error: "User not found or paused" });
    }

    const { role } = user;

    // -------------------------------
    // 2️⃣ Get accessible user IDs
    // -------------------------------
    const accessibleUserIds = await getAccessibleUserIds(db, userId);

    console.log("🔐 Accessible IDs:", accessibleUserIds);

    if (!accessibleUserIds || accessibleUserIds.length === 0) {
      return res.status(403).json({ error: "No access" });
    }

    // Prepare placeholders (?, ?, ?)
    const placeholders = accessibleUserIds.map(() => "?").join(",");

    // -------------------------------
    // 3️⃣ Date Filters
    // -------------------------------
    let advDateCondition = "";
    let advDateParams = [];

    if (start_date && end_date) {
      advDateCondition = " AND ad.shared_date BETWEEN ? AND ?";
      advDateParams = [start_date, end_date];
    }

    let pubDateCondition = "";
    let pubDateParams = [];

    if (start_date && end_date) {
      pubDateCondition = " AND shared_date BETWEEN ? AND ?";
      pubDateParams = [start_date, end_date];
    }

    // -------------------------------
    // 4️⃣ Advertiser Data
    // -------------------------------
    const [advData] = await db.query(
      `
SELECT DISTINCT
    ad.*,
    l.id AS user_id,
    l.username,
    l.role,
    adv.adv_name,
    pub.pub_name AS pub_am,
    CONCAT(adv.adv_name, ' (', ad.adv_id, ')') AS adv_display,
    CONCAT(pub.pub_name, ' (', ad.pub_id, ')') AS pub_display
FROM adv_data ad
LEFT JOIN login l
    ON l.id = ad.user_id

      LEFT JOIN advids av
          ON av.adv_id = ad.adv_id

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

      WHERE (
          ad.user_id IN (${placeholders})
          OR av.assign_id IN (${placeholders})
      )
      ${advDateCondition}
      `,
      [...accessibleUserIds, ...accessibleUserIds, ...advDateParams],
    );

    // -------------------------------
    // 5️⃣ Publisher Data
    // -------------------------------
    const [pubData] = await db.query(
      `
      SELECT *
      FROM pub_data
      WHERE user_id IN (${placeholders})
      ${pubDateCondition}
      `,
      [...accessibleUserIds, ...pubDateParams],
    );

    // -------------------------------
    // 6️⃣ Final Response
    // -------------------------------
    return res.json({
      success: true,
      role,
      accessible_user_ids: accessibleUserIds,
      data: {
        advertiser_data: advData,
        publisher_data: pubData,
      },
    });
  } catch (err) {
    console.error("❌ Error fetching user data:", err);
    return res.status(500).json({
      success: false,
      error: "Database error",
      details: err.message,
    });
  }
};

exports.getUserDatsssa = async (req, res) => {
  const userId = req.params.userId;
  const { start_date, end_date } = req.query; // ✅ new

  console.log("id", userId, "date range:", start_date, end_date);

  try {
    // ✅ Fetch role
    const [results] = await db.query(
      "SELECT id, role FROM login WHERE id = ?",
      [userId],
    );

    if (results.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const { role } = results[0];

    let userData = [];

    // 🔹 Common date filter
    let dateCondition = "";
    let dateParams = [];

    if (start_date && end_date) {
      dateCondition = " AND ad.shared_date BETWEEN ? AND ?";
      dateParams = [start_date, end_date];
    }

    // ✅ Advertiser
    if (role === "advertiser") {
      const [advData] = await db.query(
        `
              SELECT DISTINCT ad.* 
              FROM adv_data ad 
              LEFT JOIN advids av ON av.adv_id = ad.adv_id 
              WHERE (ad.user_id = ? OR av.assign_id = ?)
              ${dateCondition}
          `,
        [userId, userId, ...dateParams],
      );

      userData = advData;
    }

    // ✅ Publisher
    else if (role === "publisher") {
      let pubDateCondition = "";
      let pubParams = [userId, userId];

      if (start_date && end_date) {
        pubDateCondition = " AND shared_date BETWEEN ? AND ?";
        pubParams.push(start_date, end_date);
      }

      const [pubData] = await db.query(
        `SELECT * FROM pub_data 
               WHERE (user_id = ? OR assign_id = ?)
               ${pubDateCondition}`,
        pubParams,
      );

      userData = pubData;
    }

    // ✅ Manager (Both)
    else if (role === "publisher_manager" || role === "advertiser_manager") {
      const [advData] = await db.query(
        `
              SELECT DISTINCT ad.* 
              FROM adv_data ad 
              LEFT JOIN advids av ON av.adv_id = ad.adv_id 
              WHERE (ad.user_id = ? OR av.assign_id = ?)
              ${dateCondition}
          `,
        [userId, userId, ...dateParams],
      );

      let pubDateCondition = "";
      let pubParams = [userId];

      if (start_date && end_date) {
        pubDateCondition = " AND shared_date BETWEEN ? AND ?";
        pubParams.push(start_date, end_date);
      }

      const [pubData] = await db.query(
        `SELECT * FROM pub_data 
               WHERE user_id = ?
               ${pubDateCondition}`,
        pubParams,
      );

      userData = {
        advertiser_data: advData,
        publisher_data: pubData,
      };
    } else {
      return res.status(400).json({ error: "Invalid role" });
    }

    return res.json({
      role,
      data: userData,
    });
  } catch (err) {
    console.error("❌ Error fetching user data:", err);
    return res.status(500).json({ error: "Database error" });
  }
};

// exports.getUserData = async (req, res) => {
//     const userId = req.params.userId;
// console.log("id",userId)
//     try {
//         // Fetch role from login table
//         const [results] = await db.query("SELECT id, role FROM login WHERE id = ?", [userId]);

//         if (results.length === 0) {
//             return res.status(404).json({ error: "User not found" });
//         }

//         const { id, role } = results[0];

//         // Decide table based on role
//         let query;
//         if (role === "advertiser") {
//             query = "SELECT * FROM adv_data WHERE user_id = ?";
//         } else if (role === "publisher") {
//             query = "SELECT * FROM pub_data WHERE user_id = ?";
//         } else {
//             return res.status(400).json({ error: "Invalid role" });
//         }

//         // Fetch user data from the selected table
//         const [userData] = await db.query(query, [userId]);

//         return res.json({ role, data: userData });

//     } catch (err) {
//         console.error("Error fetching user data:", err);
//         return res.status(500).json({ error: "Database error" });
//     }
// };

// // Get Sub Admins along with ID Ranges data
// exports.getSubAdmins = async (req, res) => {
//     try {
//         // Fetch all users from login table along with their corresponding id_ranges data
//         const query = `
//             SELECT l.*, ir.*
//             FROM login l
//             LEFT JOIN id_ranges ir ON l.id = ir.sub_admin_id
//         `;

//         const [entries] = await db.query(query);

//         res.status(200).json({ success: true, data: entries });
//     } catch (error) {
//         console.error("❌ Server Error:", error);
//         res.status(500).json({ message: "Internal server error" });
//     }
// };

// Get Sub Admins along with ID Ranges data

exports.getSubAdmins = async (req, res) => {
  console.log("testing api");
  try {
    // Main query: sub-admins, ranges, permissions
    const query = `
      SELECT 
          l.id AS sub_admin_id,
          l.username,
          l.email,
          l.role,
                         l.pause,  
          
          ir.range_start,
          ir.range_end,
          up.can_see_button1,
          up.can_see_input1,
          up.can_add_store
      FROM login l
      LEFT JOIN id_ranges ir ON l.id = ir.sub_admin_id
      LEFT JOIN user_permissions up ON l.id = up.id
    `;

    const [entries] = await db.query(query);
    console.log("entry", entries[0]);
    // Manager-subadmin relation query
    const managerQuery = `
      SELECT 
          ms.manager_id,
          ms.sub_admin_id,
          l.username AS sub_admin_name
      FROM manager_subadmins ms
      JOIN login l ON ms.sub_admin_id = l.id
    `;
    const [managerEntries] = await db.query(managerQuery);

    // ✅ Group by sub-admin and combine ranges into an array
    const subAdmins = entries.reduce((acc, entry) => {
      const {
        sub_admin_id,
        username,
        role,
        email,
        pause,
        range_start,
        range_end,
        can_see_button1,
        can_see_input1,
        can_add_store,
      } = entry;

      let subAdmin = acc.find((item) => item.id === sub_admin_id);

      if (!subAdmin) {
        subAdmin = {
          id: sub_admin_id,
          username,
          email,
          role,
          pause: pause,

          ranges: [],
          permissions: {
            can_see_button1: can_see_button1 || 0,
            can_see_input1: can_see_input1 || 0,
            can_add_store: can_add_store || 0,
          },
          assigned_subadmins: [], // ✅ will fill below if this sub-admin is a manager
        };
        acc.push(subAdmin);
      }

      if (range_start && range_end) {
        subAdmin.ranges.push({ start: range_start, end: range_end });
      }

      return acc;
    }, []);

    // ✅ Attach assigned sub-admins for each manager
    subAdmins.forEach((subAdmin) => {
      const assigned = managerEntries.filter(
        (m) => m.manager_id === subAdmin.id,
      );
      if (assigned.length > 0) {
        subAdmin.assigned_subadmins = assigned.map((m) => ({
          id: m.sub_admin_id,
          username: m.sub_admin_name,
        }));
      }
    });

    res.status(200).json({ success: true, data: subAdmins });
  } catch (error) {
    console.error("❌ Server Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Update review in pub_data by ID
exports.updateReview = async (req, res) => {
  try {
    const { id } = req.params; // Get ID from URL
    const { review } = req.body; // Get review from request body

    // 🛑 Check if ID and review are provided
    if (!id || !review) {
      return res
        .status(400)
        .json({ success: false, message: "ID and review are required." });
    }

    // 🔍 Check if record exists
    const [existingRecord] = await db.query(
      "SELECT * FROM pub_data WHERE id = ?",
      [id],
    );

    if (existingRecord.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Record not found." });
    }

    // ✅ Update the review
    const [result] = await db.query(
      "UPDATE pub_data SET review = ? WHERE id = ?",
      [review, id],
    );

    if (result.affectedRows === 0) {
      return res.status(500).json({
        success: false,
        message: "Update failed. No changes applied.",
      });
    }

    // 🎉 Successfully updated
    res
      .status(200)
      .json({ success: true, message: "Review updated successfully." });
  } catch (error) {
    console.error("❌ Error updating review:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// ✅ Update Sub-Admin
// exports.updateSubAdmin = async (req, res) => {
//     const connection = await db.getConnection();
//     try {
//         console.log("🟡 Update Sub-Admin Request Received:", req.body);

//         const { id, username, password, role, ranges, assigned_subadmins } = req.body;

//         if (!id || !username || !role || !ranges || !Array.isArray(ranges) || ranges.length === 0) {
//             return res.status(400).json({ message: "All fields are required" });
//         }

//         await connection.beginTransaction();

//         // ✅ Check for Range Conflicts
//         for (const range of ranges) {
//             const { start, end } = range;

//             const [existingRanges] = await connection.query(
//                 "SELECT * FROM id_ranges WHERE ((range_start <= ? AND range_end >= ?) OR (range_start <= ? AND range_end >= ?) OR (range_start >= ? AND range_end <= ?)) AND sub_admin_id != ?",
//                 [start, start, end, end, start, end, id]
//             );

//             if (existingRanges.length) {
//                 console.warn("⚠️ Range Conflict Detected");
//                 await connection.rollback();
//                 return res.status(400).json({ message: `The selected range (${start}-${end}) overlaps with another sub-admin` });
//             }
//         }

//         // ✅ Update Password (Only if Provided)
//         let hashedPassword;
//         if (password) {
//             hashedPassword = await bcrypt.hash(password, 10);
//             await connection.query("UPDATE login SET password = ? WHERE id = ?", [hashedPassword, id]);
//         }

//         // ✅ Update Sub-Admin Details
//         await connection.query("UPDATE login SET username = ?, role = ? WHERE id = ?", [username, role, id]);

//         // ✅ Delete Existing Ranges & Re-Insert New Ones
//         await connection.query("DELETE FROM id_ranges WHERE sub_admin_id = ?", [id]);
//         for (const range of ranges) {
//             await connection.query(
//                 "INSERT INTO id_ranges (sub_admin_id, range_start, range_end, created_at) VALUES (?, ?, ?, NOW())",
//                 [id, range.start, range.end]
//             );
//         }

//         // ✅ Update Assigned Sub-Admins (Only if Role is Manager)
//         if (role === "manager") {
//             await connection.query("DELETE FROM manager_subadmins WHERE manager_id = ?", [id]);

//             if (assigned_subadmins && Array.isArray(assigned_subadmins) && assigned_subadmins.length > 0) {
//                 for (const subAdmin of assigned_subadmins) {
//                     await connection.query(
//                         "INSERT INTO manager_subadmins (manager_id, sub_admin_id) VALUES (?, ?)",
//                         [id, subAdmin]
//                     );
//                 }
//             }
//         }

//         await connection.commit();

//         console.log("✅ Sub-Admin Updated Successfully");
//         res.status(200).json({
//             success: true,
//             message: "Sub-admin updated successfully",
//             subAdmin: {
//                 id,
//                 username,
//                 role,
//                 ranges,
//                 assigned_subadmins: role === "manager" ? assigned_subadmins : undefined,
//             },
//         });
//     } catch (error) {
//         await connection.rollback();
//         console.error("❌ Server Error:", error);
//         res.status(500).json({ message: "Internal server error" });
//     } finally {
//         connection.release();
//     }
// };

exports.updateSubAdmin = async (req, res) => {
  const connection = await db.getConnection();
  try {
    console.log("🟡 Update Sub‑Admin Request Received:", req.body);

    const {
      id,
      username,
      email,
      password,
      role,
      can_see_button1,
      can_see_input1,
      can_add_store,
      // ranges = [],
      assigned_subadmins = [],
    } = req.body;

    // const { can_see_button1, can_see_input1 } = req.body;

    const isManager =
      role === "publisher_manager" ||
      role === "advertiser_manager" ||
      role === "publisher" ||
      role === "advertiser";

    if (!id || !username || !email || !role) {
      return res.status(400).json({ message: "All fields are required" });
    }

    await connection.beginTransaction();
    const [[existingUser]] = await connection.query(
      `
  SELECT id
  FROM login
  WHERE (username = ? OR email = ?)
    AND id != ?
  `,
      [username, email, id],
    );

    if (existingUser) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Username or Email already exists",
      });
    }
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await connection.query("UPDATE login SET password = ? WHERE id = ?", [
        hash,
        id,
      ]);
    }

    await connection.query(
      `
  UPDATE login
  SET
    username = ?,
    email = ?,
    role = ?
  WHERE id = ?
  `,
      [username, email, Array.isArray(role) ? role.join(",") : role, id],
    );

    // Step 3a: Update permissions for buttons and inputs
    await connection.query(
      `UPDATE user_permissions
   SET can_see_button1 = ?, can_see_input1 = ?, can_add_store = ?
   WHERE id = ?`,
      [can_see_button1 || 0, can_see_input1 || 0, can_add_store || 0, id],
    );

    console.log("🟢 Permissions updated for Sub-Admin:", id);

    // 🔄 Delete old id_ranges and id_assignments
    //await connection.query("DELETE FROM id_ranges WHERE sub_admin_id = ?", [id]);
    // await connection.query("DELETE FROM id_assignments WHERE sub_admin_id = ?", [id]);
    await connection.query(
      "DELETE FROM manager_subadmins WHERE manager_id = ?",
      [id],
    );

    // ✅ Insert new id_ranges and id_assignments

    if (isManager && assigned_subadmins.length) {
      const [existingRows] = await connection.query(
        "SELECT sub_admin_id FROM manager_subadmins WHERE manager_id = ?",
        [id],
      );
      const existingAssigned = existingRows.map((row) => row.sub_admin_id);

      const newAssignments = assigned_subadmins.filter(
        (sa) => !existingAssigned.includes(sa),
      );

      if (newAssignments.length > 0) {
        const values = newAssignments.map((sa) => [id, sa]);
        await connection.query(
          "INSERT INTO manager_subadmins (manager_id, sub_admin_id) VALUES ?",
          [values],
        );
        console.log("🟢 New sub-admins added:", newAssignments);
      }
    }

    await connection.commit();
    console.log("✅ Sub‑Admin Updated Successfully");

    try {
      const PUB_ROLES = [
        "publisher", "publisher_manager", "pub_executive",
        "optimization", "operations", "operation_manager",
      ];
      const ADV_ROLES = ["advertiser", "advertiser_manager", "adv_executive"];

      const normalizedRole = (Array.isArray(role) ? role[0] : role || "")
        .replace(/"/g, "").trim().toLowerCase();

      let crm_user_id = null;
      if (PUB_ROLES.includes(normalizedRole))       crm_user_id = `pub_0${id}`;
      else if (ADV_ROLES.includes(normalizedRole))  crm_user_id = `adv_0${id}`;
      else if (normalizedRole === "admin")           crm_user_id = `admin_0${id}`;

      const chatEmail = email || `${username}@clickorbits.com`;
      const now = new Date();

      if (password) {
        const newHash = await bcrypt.hash(password, 10);
        await chatDb.query(
          `UPDATE users
           SET username = ?, full_name = ?, email = ?, password_hash = ?,
               role = ?, crm_user_id = ?, updated_at = ?
           WHERE id = ?`,
          [username, username, chatEmail, newHash, normalizedRole, crm_user_id, now, id]
        );
      } else {
        await chatDb.query(
          `UPDATE users
           SET username = ?, full_name = ?, email = ?,
               role = ?, crm_user_id = ?, updated_at = ?
           WHERE id = ?`,
          [username, username, chatEmail, normalizedRole, crm_user_id, now, id]
        );
      }
      console.log(`✅ [ChatDB] User '${username}' (id: ${id}) updated in chat users table`);
    } catch (syncErr) {
      console.warn(
        `⚠️  [ChatDB] Could not update user '${username}' in chat users table:`,
        syncErr.message
      );
    }
    res.status(200).json({
      success: true,
      message: "Sub‑admin updated successfully",
      subAdmin: {
        id,
        username,
        email,
        role,
        // ranges: finalMiniRanges,
        assigned_subadmins: isManager ? assigned_subadmins : undefined,
      },
    });
  } catch (err) {
    await connection.rollback();
    console.error("❌ Server Error:", err);
    res.status(500).json({ message: "Internal server error", err });
  } finally {
    connection.release();
  }
};

// ✅ Delete Sub-Admin
exports.deleteSubAdmin = async (req, res) => {
  const connection = await db.getConnection();
  try {
    console.log("🔴 Delete Sub-Admin Request Received:", req.body);

    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ message: "Sub-admin ID is required" });
    }

    await connection.beginTransaction();

    // ✅ Remove Ranges
    await connection.query("DELETE FROM id_ranges WHERE sub_admin_id = ?", [
      id,
    ]);

    // ✅ Remove Assigned Sub-Admins (If Manager)
    await connection.query(
      "DELETE FROM manager_subadmins WHERE manager_id = ?",
      [id],
    );

    // ✅ Remove Sub-Admin from Login
    const [result] = await connection.query("DELETE FROM login WHERE id = ?", [
      id,
    ]);

    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Sub-admin not found" });
    }

    await connection.commit();

    console.log("✅ Sub-Admin Deleted Successfully");

    // -------------------------------
    // SYNC DELETE TO CHATDB
    // -------------------------------
    try {
      await chatDb.query("DELETE FROM users WHERE id = ?", [id]);
      console.log(`✅ [ChatDB] User (id: ${id}) removed from chat users table`);
    } catch (syncErr) {
      console.warn(
        `⚠️  [ChatDB] Could not remove user (id: ${id}) from chat users table:`,
        syncErr.message,
      );
    }

    res
      .status(200)
      .json({ success: true, message: "Sub-admin deleted successfully" });
  } catch (error) {
    await connection.rollback();
    console.error("❌ Server Error:", error);
    res.status(500).json({ message: "Internal server error" });
  } finally {
    connection.release();
  }
};

exports.publisherLogin = async (req, res) => {
  try {
    const { mail, password } = req.body;

    // ✅ Validation
    if (!mail || !password) {
      return res.status(400).json({
        success: false,
        message: "mail and password are required",
      });
    }

    // ✅ Fetch user
    const [rows] = await db.query(
      "SELECT id, mail,username, password, role,pubid, created_by FROM pub_accounts WHERE mail = ? LIMIT 1",
      [mail],
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid mail or password",
      });
    }

    const user = rows[0];

    // ✅ Compare bcrypt password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid mail or password",
      });
    }

    // ✅ Generate JWT
    const token = jwt.sign(
      { id: user.id, role: user.role, type: "publisher_external" },
      process.env.JWT_SECRET || "long_jwt_secret_key",
      { expiresIn: "7d" },
    );

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        created_by: user.created_by,
        permissions: {
          can_see_button1: 0,
          can_see_input1: 0,
          can_add_store: 0,
        },
        pubid: user.pubid,
      },
    });
  } catch (err) {
    console.error("❌ Publisher Login Error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const [[user]] = await db.query(
      "SELECT id,email FROM login WHERE email=?",
      [email],
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No account found with this email.",
      });
    }

    // Delete previous OTP
    await db.query("DELETE FROM password_reset_otp WHERE user_id=?", [user.id]);

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    const otpHash = await bcrypt.hash(otp, 10);

    const expires = new Date(Date.now() + 10 * 60 * 1000);

    await db.query(
      `
      INSERT INTO password_reset_otp
      (
        user_id,
        otp_hash,
        expires_at
      )
      VALUES
      (?,?,?)
      `,
      [user.id, otpHash, expires],
    );

    await sendOTPEmail(user.email, otp);

    res.json({
      success: true,
      message: "OTP sent successfully.",
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required.",
      });
    }

    // Find user
    const [[user]] = await db.query("SELECT id FROM login WHERE email = ?", [
      email,
    ]);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No account found with this email.",
      });
    }

    // Get latest OTP
    const [[otpData]] = await db.query(
      `
      SELECT *
      FROM password_reset_otp
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT 1
      `,
      [user.id],
    );

    if (!otpData) {
      return res.status(400).json({
        success: false,
        message: "OTP not found. Please request a new OTP.",
      });
    }

    // Expired?
    if (new Date() > new Date(otpData.expires_at)) {
      await db.query("DELETE FROM password_reset_otp WHERE id = ?", [
        otpData.id,
      ]);

      return res.status(400).json({
        success: false,
        message: "OTP has expired.",
      });
    }

    // Max attempts
    if (otpData.attempts >= 5) {
      await db.query("DELETE FROM password_reset_otp WHERE id = ?", [
        otpData.id,
      ]);

      return res.status(400).json({
        success: false,
        message: "Maximum OTP attempts exceeded.",
      });
    }

    // Verify OTP
    const matched = await bcrypt.compare(otp, otpData.otp_hash);

    if (!matched) {
      await db.query(
        `
        UPDATE password_reset_otp
        SET attempts = attempts + 1
        WHERE id = ?
        `,
        [otpData.id],
      );

      return res.status(400).json({
        success: false,
        message: "Invalid OTP.",
      });
    }

    // Mark verified
    await db.query(
      `
      UPDATE password_reset_otp
      SET verified = 1
      WHERE id = ?
      `,
      [otpData.id],
    );

    res.json({
      success: true,
      message: "OTP verified successfully.",
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};
exports.resetPassword = async (req, res) => {
  try {
    const { email, password, confirmPassword } = req.body;

    if (!email || !password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "All fields are required.",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match.",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters.",
      });
    }

    // Find user
    const [[user]] = await db.query("SELECT id FROM login WHERE email=?", [
      email,
    ]);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // Check verified OTP
    const [[otp]] = await db.query(
      `
      SELECT *
      FROM password_reset_otp
      WHERE
        user_id = ?
        AND verified = 1
      ORDER BY id DESC
      LIMIT 1
      `,
      [user.id],
    );

    if (!otp) {
      return res.status(400).json({
        success: false,
        message: "OTP verification required.",
      });
    }

    // Expired?
    if (new Date() > new Date(otp.expires_at)) {
      await db.query("DELETE FROM password_reset_otp WHERE id=?", [otp.id]);

      return res.status(400).json({
        success: false,
        message: "OTP has expired.",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update password
    await db.query(
      `
      UPDATE login
      SET password=?
      WHERE id=?
      `,
      [hashedPassword, user.id],
    );

    // ── Sync password to chat app's users table
    try {
      await chatDb.query(
        "UPDATE users SET password_hash = ? WHERE id = ?",
        [hashedPassword, user.id]
      );
      console.log(`✅ [ChatDB] password_hash synced for user ${user.id}`);
    } catch (syncErr) {
      console.warn(
        `⚠️  [ChatDB] Could not sync password_hash for user ${user.id}:`,
        syncErr.message
      );
    }
    // Delete OTP
    await db.query(
      `
      DELETE FROM password_reset_otp
      WHERE user_id=?
      `,
      [user.id],
    );

    res.json({
      success: true,
      message: "Password reset successfully.",
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};