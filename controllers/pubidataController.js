const db = require('../db/Connection');
const moment = require('moment');

// 📊 Get All pubiddata + Related adv_data by campaign_id
// 📊 Get All pubiddata + Related adv_data by campaign_id
exports.getPubidWithAdvData0 = async (req, res) => {
    try {
      // Step 1: Fetch pubiddata (only needed fields)
      const [pubidRows] = await db.query(`
        SELECT 
id,         
 campaign_id,
          achieved,
          review,
          note,
          category,
          updated_at
        FROM pubidata
      `);
  
      if (pubidRows.length === 0) {
        return res.status(404).json({ message: "No pubiddata found" });
      }
  
      // Step 2: Extract all campaign_ids
      const campaignIds = pubidRows.map(row => row.campaign_id);
  
      // Step 3: Fetch adv_data joined with login to get adv_AM (username)
      const [advRows] = await db.query(
        `
        SELECT 
          a.user_id,
          l.username AS adv_AM,
          a.adv_id,
          a.pub_name,
          a.pub_id,
          a.campaign_name,
          a.campaign_id,
          a.geo,
          a.os
        FROM adv_data a
        LEFT JOIN login l ON a.user_id = l.id
        WHERE a.campaign_id IN (?)
        `,
        [campaignIds]
      );
  
      // Step 4: Create lookup map for adv_data by campaign_id
      const advMap = {};
      advRows.forEach(adv => {
        advMap[adv.campaign_id] = adv;
      });
  
      // Step 5: Combine both tables
      const combinedData = pubidRows.map(pub => {
        const adv = advMap[pub.campaign_id] || {};
        return {
          adv_AM: adv.adv_AM || null,      // from login.username
          adv_id: adv.adv_id || null,
          pub_name: adv.pub_name || null,  // from adv_data
          pub_id: adv.pub_id || null,      // from adv_data
          campaign_name: adv.campaign_name || null,
          campaign_id: pub.campaign_id,
          geo: adv.geo || null,
          os: adv.os || null,
          category: pub.category || null,  // from pubiddata
          id: pub.id || null,
          updated_at: pub.updated_at || null,

          achieved: pub.achieved || null,
          review: pub.review || null,
          note: pub.note || null,
          update: pub.update_field || null,
        };
      });
  
      // Step 6: Return final response
      res.status(200).json({
        success: true,
        count: combinedData.length,
        data: combinedData,
        message: "✅ pubiddata + adv_data (with adv_AM from login) fetched successfully",
      });
  
    } catch (error) {
      console.error("❌ Error fetching pubiddata with adv_data:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  };
  
  
exports.getPubidWithAdvData = async (req, res) => {
  try {
    console.log("\n==========================================");
    console.log("🚀 API: getPubidWithAdvData STARTED");
    console.log("==========================================\n");

    // ---------------------------------------------
    // 1️⃣ Fetch pubidata table
    // ---------------------------------------------
    const [pubidRows] = await db.query(`
      SELECT 
        id,
        campaign_id,
        achieved,
        review,
        note,
        category
      FROM pubidata
    `);

    console.log("📌 pubidata Rows:", pubidRows);

    if (pubidRows.length === 0) {
      console.log("❌ No pubiddata found");
      return res.status(404).json({ message: "No pubiddata found" });
    }

    // Extract campaign_ids
    const campaignIds = pubidRows.map(row => row.campaign_id);
    console.log("📌 Campaign IDs extracted:", campaignIds);

    // ---------------------------------------------
    // 2️⃣ Fetch adv_data with AM name
    // ---------------------------------------------
    const [advRows] = await db.query(
      `
      SELECT 
        a.user_id,
        l.username AS adv_AM,
        a.adv_id,
        a.pub_id,
        a.campaign_name,
        a.campaign_id,
        a.geo,
        a.os,
        a.pub_name
      FROM adv_data a
      LEFT JOIN login l ON a.user_id = l.id
      WHERE a.campaign_id IN (?)
      `,
      [campaignIds]
    );

    console.log("📌 adv_data fetched:", advRows);

    // Create lookup map for adv_data
    const advMap = {};
    advRows.forEach(adv => {
      advMap[adv.campaign_id] = adv;
    });

    // ---------------------------------------------
    // 3️⃣ Fetch unique adv_ids and pub_ids
    // ---------------------------------------------
    const advIds = [...new Set(advRows.map(a => a.adv_id).filter(v => v))];
    const pubIds = [...new Set(advRows.map(a => a.pub_id).filter(v => v))];

    console.log("📌 Unique advIds:", advIds);
    console.log("📌 Unique pubIds:", pubIds);

    // ---------------------------------------------
    // 4️⃣ Fetch adv_name from advids
    // ---------------------------------------------
    const [advNames] = advIds.length > 0
      ? await db.query(
          `SELECT adv_id, adv_name FROM advids WHERE adv_id IN (?)`,
          [advIds]
        )
      : [[]];

    console.log("📌 advNames fetched from advids:", advNames);

    const advNameMap = {};
    advNames.forEach(a => {
      advNameMap[a.adv_id] = a.adv_name;
    });

    console.log("📌 advNameMap created:", advNameMap);

    // ---------------------------------------------
    // 5️⃣ Fetch pub_name from publids
    // ---------------------------------------------
    const [pubNames] = pubIds.length > 0

      ? await db.query(
          `SELECT pub_id, pub_name FROM publids WHERE pub_id IN (?)`,
          [pubIds]
        )
      : [[]];

    console.log("📌 pubNames fetched from publids:", pubNames);

    const pubNameMap = {};
    pubNames.forEach(p => {
      pubNameMap[p.pub_id] = p.pub_name;
    });
    
    console.log("📌 pubNameMap created:", pubNameMap);

    // ---------------------------------------------
    // 6️⃣ Final merging of all data
    // ---------------------------------------------
    const combinedData = pubidRows.map(pub => {
      const adv = advMap[pub.campaign_id] || {};

      const adv_id = adv.adv_id || null;
      const pub_id = adv.pub_id || null;

      const adv_display = adv_id
        ? `${advNameMap[adv_id] || "NA"} (${adv_id})`
        : null;

      const pub_display = pub_id
        ? `${pubNameMap[pub_id] || "NA"} (${pub_id})`
        : null;

      console.log(`🔗 Mapping campaign_id: ${pub.campaign_id}`);
      console.log("   → adv_id:", adv_id, "adv_display:", adv_display);
      console.log("   → pub_id:", pub_id, "pub_display:", pub_display);

      return {
        adv_AM: adv.adv_AM || null,
        adv_display,
        pub_display,
        adv_id,
        pub_id,
        campaign_name: adv.campaign_name || null,
        pub_name: adv.pub_name || null,  // from adv_data

        campaign_id: pub.campaign_id,
        geo: adv.geo || null,
        os: adv.os || null,
        category: pub.category || null,
        achieved: pub.achieved || null,
        review: pub.review || null,
        note: pub.note || null,
        updated_at: pub.updated_at || null,
        id: pub.id || null
      };
    });

    console.log("\n✅ Final Combined Data:", combinedData);


    // ---------------------------------------------
// 7️⃣ APPLY ROLE-BASED FILTER (NEW ✅)
// ---------------------------------------------
const { getAccessibleUserIds } = require('../utils/accessControl'); // adjust path

// 🔥 Get current user
const userId = req.query.id;

const [[user]] = await db.query(
  `SELECT id, role, username FROM login WHERE id = ?`,
  [userId]
);

let role = user?.role || "";
role = role.replace(/"/g, '').trim(); // fix quotes issue

console.log("🔐 Applying role-based filtering:", role);

// 🔥 Get accessible users
const accessibleIds = await getAccessibleUserIds(db, userId);

let accessibleUsernames = [];

if (accessibleIds.length > 0) {
  const placeholders = accessibleIds.map(() => '?').join(',');

  const [users] = await db.query(
    `SELECT username FROM login WHERE id IN (${placeholders})`,
    accessibleIds
  );

  accessibleUsernames = users.map(u => u.username);
}

console.log("✅ Accessible Usernames for filtering:", accessibleUsernames);

// 🔥 APPLY FILTER BASED ON ROLE
let filteredData = combinedData;

if (accessibleUsernames.length > 0) {

  // 👉 Publisher side
  if (["publisher", "publisher_manager", "pub_executive"].includes(role)) {
    filteredData = combinedData.filter(item =>
      accessibleUsernames.includes(item.pub_name)
    );
  }

  // 👉 Advertiser + Operations side
  else if (
    ["advertiser", "advertiser_manager", "adv_executive", "operations", "optimization"]
      .includes(role)
  ) {
    filteredData = combinedData.filter(item =>
      accessibleUsernames.includes(item.adv_AM)
    );
  }

  // 👉 Admin → no filter
  else if (role === "admin") {
    filteredData = combinedData;
  }

} else {
  // ❌ No access → no data
  filteredData = [];
}

console.log("📊 Final Filtered Count:", filteredData.length);
    // ---------------------------------------------
    // 7️⃣ API RESPONSE
    // ---------------------------------------------
    res.status(200).json({

      
      success: true,
      data: filteredData,
      count: filteredData.length,
      message: "pubiddata + adv_data + adv_name/pub_name fetched successfully",
    });

  } catch (error) {
    console.error("❌ Error in getPubidWithAdvData:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};



  
  // ✏️ Update pubiddata entry by campaign_id
  
  
  // ✏️ Update pubiddata entry by campaign_id
exports.updatePubidData = async (req, res) => {
    try {
      const { id } = req.params;
      console.log("🟡 Update pubiddata Request Received for ID:", id);
      const { achieved, review, note, category } = req.body;
  
      if (!id) {
        return res.status(400).json({ error: "id is required" });
      }
  
      // Step 1: Check if campaign_id exists
      const [existingRows] = await db.query(
        "SELECT * FROM pubidata WHERE id = ?",
        [id]
      );
  
      if (existingRows.length === 0) {
        return res.status(404).json({ error: "Campaign not found in pubidata" });
      }
  
      // Step 2: Build dynamic update query
      const fieldsToUpdate = {};
      if (achieved !== undefined) fieldsToUpdate.achieved = achieved;
      if (review !== undefined) fieldsToUpdate.review = review;
      if (note !== undefined) fieldsToUpdate.note = note;
      if (category !== undefined) fieldsToUpdate.category = category;
  
      // If no fields provided
      if (Object.keys(fieldsToUpdate).length === 0) {
        return res.status(400).json({ error: "No fields provided for update" });
      }
  
      // Step 3: Run the update query
      const [result] = await db.query(
        "UPDATE pubidata SET ?  WHERE id = ?",
        [fieldsToUpdate, id]
      );
  
      // Step 4: Return success
      res.status(200).json({
        success: true,
        message: "✅ pubiddata updated successfully",
        updated_fields: fieldsToUpdate,
        affected_rows: result.affectedRows,
      });
    } catch (error) {
      console.error("❌ Error updating pubiddata:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  };
   


// 🟡 Pause API
exports.pauseCampaign = async (req, res) => {
  try {
    const { campaign_id, os } = req.body;

    if (!campaign_id || !os) {
      return res.status(400).json({ message: "campaign_id and os are required" });
    }

    // IST date
    const pausedDate = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });

    // Update ONLY paused_date
    const [advResult] = await db.execute(
      `UPDATE adv_data 
       SET paused_date = ?
       WHERE campaign_id = ? AND os = ?`,
      [pausedDate, campaign_id, os]
    );

    // Update campaign_data
    const [campResult] = await db.execute(
      `UPDATE campaign_data 
       SET status = 'pause'
       WHERE id = ?`,
      [campaign_id]
    );

    return res.json({
      message: "Campaign paused successfully",
      paused_date: pausedDate,
      updated_records: advResult.affectedRows,
      status: "pause"
    });

  } catch (error) {
    console.error("Error pausing campaign:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

  
  
  // 🟢 Resume API
   exports.resumeCampaign = async (req, res) => {
    const connection = await db.getConnection();
    await connection.beginTransaction();
  
    try {
      const { campaign_id, os } = req.body;
  
      if (!campaign_id || !os) {
        return res.status(400).json({
          message: "campaign_id and os are required"
        });
      }
  
      // YYYY-MM-DD
      const sharedDate = new Date().toISOString().split("T")[0];
  
      /**
       * STEP 1: Fetch paused rows for this campaign + OS
       */
      const [pausedRows] = await connection.query(
        `
        SELECT *
        FROM adv_data
        WHERE campaign_id = ?
          AND os = ?
          AND paused_date IS NOT NULL
        `,
        [campaign_id, os]
      );
  
      if (pausedRows.length === 0) {
        return res.status(404).json({
          message: "No paused records found for this campaign"
        });
      }
  
      /**
       * STEP 2: Clone rows with selected fields only
       */
     // for (const row of pausedRows) {
       // await connection.query(
        //  `
        //  INSERT INTO adv_data (
          //  pub_name,
          //  campaign_name,
          //  geo,
          //  city,
         //   os,
         //   payable_event,
         //   mmp_tracker,
         //   adv_id,
         //   adv_payout,
         //   pub_id,
         //   pid,
         //   user_id,
         //   created_at,
         //   vertical,
         //   campaign_id,
         //   da,
  
       //     shared_date,
       //     paused_date,
       //     adv_total_no,
       //     adv_deductions,
       //     adv_approved_no,
       //     pay_out,
       //     pub_Apno,
       //     flag,
      //      note,
      //      fp,
      //      fa,
      //      fa1,
    //        updated_at
         // )
        //  VALUES (
         //   ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?,
          //  ?, NULL, 0, 0, 0, ?, NULL, 1, NULL, NULL, NULL, NULL, NOW()
        //  )
         // `,
       //   [
         //   row.pub_name,
         //   row.campaign_name,
         //   row.geo,
        //    row.city,
         //   row.os,
        //    row.payable_event,
        //    row.mmp_tracker,
         //   row.adv_id,
         //   row.adv_payout,
          //  row.pub_id,
           // row.pid,
           // row.user_id,
           // row.vertical,
          //  row.campaign_id,
          //  row.da,
        //    row.pay_out,

  
      //      sharedDate
    //      ]
  //      );
//      }
  
      /**
       * STEP 3: Keep old rows as historical (do NOT modify them)
       * (optional – if you want to mark them clearly, you can add a flag)
       */
  
      /**
       * STEP 4: Update campaign master table
       */
      await connection.query(
        `
        UPDATE campaign_data
        SET status = 'Live'
        WHERE id = ?
        `,
        [campaign_id]
      );
  
      await connection.commit();
  
      return res.json({
        message: "Campaign resumed successfully with new entries",
        resumed_records: pausedRows.length,
        shared_date: sharedDate,
        status: "live"
      });
  
    } catch (error) {
      await connection.rollback();
      console.error("Error resuming campaign:", error);
      return res.status(500).json({
        message: "Internal Server Error"
      });
    } finally {
      connection.release();
    }
  }; 


  // Mark notification as read
exports.markAsRead = async (req, res) => {
    const { id } = req.body; // expecting notification id
  
    if (!id) {
      return res.status(400).json({ success: false, message: "Notification ID is required" });
    }
  
    try {
      const [result] = await db.query(
        "UPDATE notifications SET is_read = 1 WHERE id = ?",
        [id]
      );
  
      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: "Notification not found" });
      }
  
      return res.status(200).json({ success: true, message: "Notification marked as read" });
    } catch (error) {
      console.error("Error updating notification:", error);
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
  };
  
