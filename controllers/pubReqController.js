// controllers/pubReqController.js

const db = require('../db/Connection');

// Get PRM Advertiser Requests With Hierarchy Logic
// controllers/pubReqController.js


// 🔵 Get PRM Advertiser Requests (Hierarchy Based)
exports.getPrmadvRequests = async (req, res) => {
  try {
    console.log("🔵 Get All Pub Requests Received");

    const { id, start_date, end_date } = req.query;

    if (!id) {
      return res.status(400).json({ success: false, message: "user_id is required" });
    }

    // 🔹 Date condition (optional)
    let dateCondition = "";
    let dateParams = [];

    if (start_date && end_date) {
      dateCondition = " AND pr.created_at BETWEEN ? AND ?";
      dateParams = [
        `${start_date} 00:00:00`,
        `${end_date} 23:59:59`
      ];
    }

    // 1️⃣ FETCH USER DETAILS
    const [userRows] = await db.query(
      `SELECT id, role, username FROM login WHERE id = ?`,
      [id]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ success: false, message: "Invalid user_id" });
    }

    const role = userRows[0].role;
    const username = userRows[0].username;

    // 2️⃣ FETCH TOGGLE VALUE
    const [settingRows] = await db.query(
      "SELECT value FROM settings WHERE setting_key='reqhierarchy_view'"
    );

    const isHierarchyEnabled = settingRows[0]?.value == "1";
    console.log("⚙️ Hierarchy Enabled:", isHierarchyEnabled);

    let rows;

    // 3️⃣ TOGGLE OFF → ALL DATA
    if (!isHierarchyEnabled) {
      const [allRows] = await db.query(
        `SELECT * FROM pub_req WHERE 1=1 ${dateCondition}`,
        dateParams
      );
      return res.status(200).json({ success: true, data: allRows });
    }

    // 4️⃣ TOGGLE ON → ROLE BASED
    if (role === "admin") {
      [rows] = await db.query(
        `SELECT * FROM pub_req pr WHERE 1=1 ${dateCondition}`,
        dateParams
      );
    }


else if (role === "advertiser_manager") {

  [rows] = await db.query(

    `SELECT pr.*
     FROM pub_req pr
     JOIN login l ON pr.adv_name = l.username

     WHERE (

        l.id = ?

        OR l.id IN (

          WITH RECURSIVE hierarchy AS (

            -- Direct assigned users
            SELECT sub_admin_id
            FROM manager_subadmins
            WHERE manager_id = ?

            UNION

            -- Recursive children
            SELECT ms.sub_admin_id
            FROM manager_subadmins ms
            INNER JOIN hierarchy h
              ON ms.manager_id = h.sub_admin_id

          )

          SELECT sub_admin_id FROM hierarchy
        )

     )

     ${dateCondition}
    `,

    [id, id, ...dateParams]
  );
}
    //else if (role === "advertiser_manager") {
      //[rows] = await db.query(
       // `SELECT pr.*
        // FROM pub_req pr
         //JOIN login l ON pr.adv_name = l.username
        // WHERE (l.role IN ('advertiser') OR pr.adv_name = ?)
      //   ${dateCondition}`,
    //    [username, ...dateParams]
  //    );
//    }

   // else if (role === "advertiser") {
      //[rows] = await db.query(
       // `SELECT * FROM pub_req pr
      //   WHERE pr.adv_name = ?
    //     ${dateCondition}`,
  //      [username, ...dateParams]
     // );
//    }

else if (role === "advertiser") {

  [rows] = await db.query(

    `SELECT pr.*
     FROM pub_req pr
     JOIN login l ON pr.adv_name = l.username

     WHERE (

        l.id = ?

        OR l.id IN (

          WITH RECURSIVE hierarchy AS (

            -- Direct assigned users
            SELECT sub_admin_id
            FROM manager_subadmins
            WHERE manager_id = ?

            UNION

            -- Recursive children
            SELECT ms.sub_admin_id
            FROM manager_subadmins ms
            INNER JOIN hierarchy h
              ON ms.manager_id = h.sub_admin_id

          )

          SELECT sub_admin_id FROM hierarchy
        )

     )

     ${dateCondition}
    `,

    [id, id, ...dateParams]
  );
}

 else if (role === "adv_executive") {
      [rows] = await db.query(
        `SELECT * FROM pub_req pr
         WHERE pr.adv_name = ?
         ${dateCondition}`,
        [username, ...dateParams]
      );
    }

   else if (role === "operations") {
      [rows] = await db.query(
        `SELECT * FROM pub_req pr
         WHERE pr.adv_name = ?
         ${dateCondition}`,
        [username, ...dateParams]
      );
    }

    else if (role === "publisher_manager") {
      [rows] = await db.query(
        `SELECT pr.*
         FROM pub_req pr
         JOIN login l ON pr.pub_name = l.username
         WHERE (l.role IN ('publisher') OR pr.pub_name = ?)
         ${dateCondition}`,
        [username, ...dateParams]
      );
    }

    else if (role === "publisher") {
      [rows] = await db.query(
        `SELECT * FROM pub_req pr
         WHERE pr.pub_name = ?
         ${dateCondition}`,
        [username, ...dateParams]
      );
    }

    else {
      return res.status(400).json({ success: false, message: "Invalid role" });
    }

    // 5️⃣ NO RECORDS
    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: "No pub requests found" });
    }

    res.status(200).json({ success: true, data: rows });

  } catch (error) {
    console.error("❌ Error fetching pub requests:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};

exports.getPrmadvReque = async (req, res) => {
    try {
      console.log("🔵 Get All Pub Requests Received");
  
      const { id } = req.query;
  
      if (!id) {
        return res.status(400).json({ success: false, message: "user_id is required" });
      }
  
      // 1️⃣ FETCH USER DETAILS
      const [userRows] = await db.query(
        `SELECT id, role, username 
         FROM login 
         WHERE id = ?`,
        [id]
      );
  
      if (userRows.length === 0) {
        return res.status(404).json({ success: false, message: "Invalid user_id" });
      }
  
      const role = userRows[0].role;
      const username = userRows[0].username;
  
      // 2️⃣ FETCH TOGGLE VALUE
      const [settingRows] = await db.query(
        "SELECT value FROM settings WHERE setting_key='reqhierarchy_view'"
      );
  
      const isHierarchyEnabled = settingRows[0]?.value == "1";
      console.log("⚙️ Hierarchy Enabled:", isHierarchyEnabled);
  
      let rows;
  
      // 3️⃣ TOGGLE OFF → EVERYONE GETS ALL DATA
      if (!isHierarchyEnabled) {
        console.log("🟢 Toggle OFF → Showing ALL data");
        [rows] = await db.query("SELECT * FROM pub_req");
        return res.status(200).json({ success: true, data: rows });
      }
  
      // 4️⃣ TOGGLE ON → APPLY HIERARCHY
      console.log("🟠 Toggle ON → Applying role-based hierarchy");
  
      // ✔ ADMIN → SEE ALL
      if (role === "admin") {
        [rows] = await db.query("SELECT * FROM pub_req");
      }
  
      // ✔ ADVERTISER MANAGER → See advertisers + own data
      else if (role === "advertiser_manager") {
        [rows] = await db.query(
          `SELECT pr.*
           FROM pub_req pr
           JOIN login l ON pr.adv_name = l.username
           WHERE l.role IN ('advertiser')
           OR pr.adv_name = ?`,
          [username]
        );
      }
  
      // ✔ ADVERTISER → Only own data
      else if (role === "advertiser") {
        [rows] = await db.query(
          `SELECT * FROM pub_req WHERE adv_name = ?`,
          [username]
        );
      }
  
      // ⭐ NEW: ✔ PUBLISHER MANAGER
      else if (role === "publisher_manager") {
        [rows] = await db.query(
          `SELECT pr.*
           FROM pub_req pr
           JOIN login l ON pr.pub_name = l.username   -- <-- pub_name column
           WHERE l.role IN ('publisher')
           OR pr.pub_name = ?`,
          [username]
        );
      }
  
      // ⭐ NEW: ✔ PUBLISHER
      else if (role === "publisher") {
        [rows] = await db.query(
          `SELECT * FROM pub_req WHERE pub_name = ?`,
          [username]
        );
      }
  
      else {
        return res.status(400).json({ success: false, message: "Invalid role" });
      }
  
      // 5️⃣ NO RECORDS
      if (!rows || rows.length === 0) {
        return res.status(404).json({ success: false, message: "No pub requests found" });
      }
  
      // SUCCESS
      res.status(200).json({ success: true, data: rows });
  
    } catch (error) {
      console.error("❌ Error fetching pub requests:", error);
      res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
  };
  

// 🔄 Update Hierarchy Toggle (Admin)
exports.updateHierarchyToggle = async (req, res) => {
    try {
      const { value } = req.body;
  
      if (value !== 0 && value !== 1 && value !== "0" && value !== "1") {
        return res.status(400).json({ success: false, message: "value must be 0 or 1" });
      }
  
      const [result] = await db.query(
        `UPDATE settings 
         SET value = ?
         WHERE setting_key = 'reqhierarchy_view'`,
        [value]
      );
  
      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: "Setting not found" });
      }
  
      res.status(200).json({
        success: true,
        message: "Hierarchy toggle updated successfully",
        new_value: value
      });
  
    } catch (error) {
      console.error("❌ Error updating toggle:", error);
      res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
  };
  
  
  // 🔍 Get Hierarchy Toggle Value
  exports.getHierarchyToggle = async (req, res) => {
    try {
      const [rows] = await db.query(
        `SELECT value 
         FROM settings 
         WHERE setting_key = 'reqhierarchy_view'`
      );
  
      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: "Setting not found" });
      }
  
      res.status(200).json({
        success: true,
        setting_key: "reqhierarchy_view",
        value: rows[0].value
      });
  
    } catch (error) {
      console.error("❌ Error fetching toggle:", error);
      res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
  };

  // 🔍 Get Hierarchy Toggle Value
  exports.getcamHierarchyToggle = async (req, res) => {
    try {
      const [rows] = await db.query(
        `SELECT value 
         FROM settings 
         WHERE setting_key = 'camhierarchy_view'`
      );
  
      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: "Setting not found" });
      }
  
      res.status(200).json({
        success: true,
        setting_key: "camhierarchy_view",
        value: rows[0].value
      });
  
    } catch (error) {
      console.error("❌ Error fetching toggle:", error);
      res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
  };


  // 🔄 Update Hierarchy Toggle (Admin)
exports.updatecamHierarchyToggle = async (req, res) => {
    try {
      const { value } = req.body;
  
      if (value !== 0 && value !== 1 && value !== "0" && value !== "1") {
        return res.status(400).json({ success: false, message: "value must be 0 or 1" });
      }
  
      const [result] = await db.query(
        `UPDATE settings 
         SET value = ?
         WHERE setting_key = 'camhierarchy_view'`,
        [value]
      );
  
      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: "Setting not found" });
      }
  
      res.status(200).json({
        success: true,
        message: "Hierarchy toggle updated successfully",
        new_value: value
      });
  
    } catch (error) {
      console.error("❌ Error updating toggle:", error);
      res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
  };
