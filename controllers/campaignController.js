const db = require('../db/Connection');


//get campaign by id 
exports.getCampaignById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    console.log("Fetching campaign with ID:", id);

    const [rows] = await db.query(
      "SELECT * FROM campaign_data WHERE id = ?",
      [id]
    );

    console.log("DB RESULT:", rows);

    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    return res.status(200).json({
      success: true,
      data: rows[0]
    });

  } catch (error) {
    console.error("SERVER ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};



// ➕ CREATE Campaign (Promise-based)
exports.CampaignData = async (req, res) => {
    console.log("📥 [POST] /api/campaigns - Create request received");
  
    try {
      const data = req.body;
  
      const sql = `
        INSERT INTO campaign_data (
          Adv_name, campaign_name, Vertical, geo, state_city, os,
          payable_event, mmp_tracker, adv_payout, preview_url, kpi, adv_d,
          campaign_id, category, Target, achieve_number, adv_note,status, tracking_url
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `;
  
      const values = [
        data.Adv_name,
        data.campaign_name,
        data.Vertical || null,
        data.geo || null,
        data.state_city || null,
        data.os || null,
        data.payable_event || null,
        data.mmp_tracker || null,
        data.adv_payout || null,
        data.preview_url || null,
        data.kpi || null,
        data.adv_d || null,
        data.campaign_id || null,
        data.category || null,
        data.Target || null,
        data.achieve_number || null,
        data.adv_note || null,
        data.status || null,
        data.tracking_url || null,


      ];
  
      // ✅ Await Promise result
      const [result] = await db.query(sql, values);
  
      console.log("✅ Campaign inserted with ID:", result.insertId);
      return res.status(201).json({
        message: "Campaign created successfully",
        id: result.insertId,
      });
    } catch (error) {
      console.error("❌ Error inserting campaign:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  };



//router.post("/campaignsnew", CampaignDatanew);  

exports.CampaignDatanew = async (req, res) => {
  console.log("📥 [POST] /api/campaigns - Create request received");

  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
   const data = req.body;
   let insertedIds = [];

   // -------------------------------------------
   // GEO NORMALIZATION
   // -------------------------------------------
   const geoArr = Array.isArray(data.geo) ? data.geo : [data.geo];

   // -------------------------------------------
   // 🔒 PAYOUT–EVENT PAIR NORMALIZATION (CORE LOGIC)
   // -------------------------------------------
   const normalizePairs = (payoutInput, eventInput) => {
     const payouts = Array.isArray(payoutInput)
       ? payoutInput.flat()
       : [payoutInput];

     const events = Array.isArray(eventInput)
       ? eventInput.flat()
       : [eventInput];

     if (payouts.length !== events.length) {
       throw new Error(
         "adv_payout and payable_event length mismatch"
       );
     }

     return payouts.map((payout, index) => ({
       payout,
       event: events[index],
     }));
   };

   const payoutEventPairs = normalizePairs(
     data.adv_payout,
     data.payable_event
   );

   // -------------------------------------------
   // OS NORMALIZATION (WITH DEDUPLICATION)
   // -------------------------------------------
   let osArr = [];
   const inputOS = Array.isArray(data.os) ? data.os : [data.os];

   inputOS.forEach((os) => {
     if (!os) return;
     os = String(os)
     if (os === "both") {
       osArr.push("Android", "iOS");
     } else {
       osArr.push(os);
     }
   });

   // default OS
   if (osArr.length === 0) osArr.push("Android");

   // remove duplicate OS
   osArr = [...new Set(osArr)];

   // -------------------------------------------
   // INSERT LOGIC (PAIR × OS)
   // -------------------------------------------
   for (let i = 0; i < payoutEventPairs.length; i++) {
     const { payout, event } = payoutEventPairs[i];
     const selectedGeo = geoArr[i] || geoArr[0];

     for (const os of osArr) {
       let previewUrl = null;
       if (data.preview_url && typeof data.preview_url === "object") {
         if (os === "iOS") previewUrl = data.preview_url.ios || null;
         else if (os === "Android") previewUrl = data.preview_url.android || null;
         else if (os === "Web") previewUrl = data.preview_url.web || null;
       } else {
         previewUrl = data.preview_url || null;
       }
       const sql = `
         INSERT INTO campaign_data (
           Adv_name, campaign_name, sub_campaign_id, Vertical, geo, state_city, os,
           payable_event, mmp_tracker, adv_payout, preview_url,
           adv_d, campaign_id, category, Target, achieve_number,
           adv_note, status, tracking_url,advertiser_impression_url, kpi, da, user_id
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       `;

       const values = [
         data.Adv_name || null,
         data.campaign_name || null,
         data.sub_campaign_id || null,
         data.Vertical || null,
         JSON.stringify(selectedGeo),
         data.state_city || null,
         os,
         event,
         data.mmp_tracker || null,
         payout,
         previewUrl,
         data.adv_d || null,
         data.campaign_id || null,
         data.category || null,
         data.Target || null,
         data.achieve_number || null,
         data.adv_note || null,
         data.status || null,
         data.tracking_url || null,
           data.advertiser_impression_url || null,

         data.kpi || null,
         data.da || null,
         data.user_id || null
       ];

       const [result] = await connection.query(sql, values);
       insertedIds.push(result.insertId);
     }
   }

   if (insertedIds.length === 0) {
     await connection.rollback();
     return res.status(400).json({
       success: false,
       message: "No campaign_data rows were created",
     });
   }

   await connection.commit();

   return res.status(201).json({
     success: true,
     message: "Campaign(s) created successfully",
     campaign_id: data.campaign_id || insertedIds[0],
     inserted_ids: insertedIds,
   });

  } catch (err) {
   await connection.rollback();
   console.error("❌ Error inserting campaign:", err.message);
   return res.status(500).json({ error: err.message });
  } finally {
   connection. Release();
  }
};










exports.CuuuampaignDatanew = async (req, res) => {
  console.log("📥 [POST] /api/campaigns - Create request received");

  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    const data = req.body;
    let insertedIds = [];

    // -------------------------------------------
    // GEO NORMALIZATION
    // -------------------------------------------
    const geoArr = Array.isArray(data.geo) ? data.geo : [data.geo];

    // -------------------------------------------
    // 🔒 PAYOUT–EVENT PAIR NORMALIZATION (CORE LOGIC)
    // -------------------------------------------
    const normalizePairs = (payoutInput, eventInput) => {
      const payouts = Array.isArray(payoutInput)
        ? payoutInput.flat()
        : [payoutInput];

      const events = Array.isArray(eventInput)
        ? eventInput.flat()
        : [eventInput];

      if (payouts.length !== events.length) {
        throw new Error(
          "adv_payout and payable_event length mismatch"
        );
      }

      return payouts.map((payout, index) => ({
        payout,
        event: events[index],
      }));
    };

    const payoutEventPairs = normalizePairs(
      data.adv_payout,
      data.payable_event
    );

    // -------------------------------------------
    // OS NORMALIZATION (WITH DEDUPLICATION)
    // -------------------------------------------
    let osArr = [];
    const inputOS = Array.isArray(data.os) ? data.os : [data.os];

    inputOS.forEach((os) => {
      if (!os) return;
      os = String(os)
      if (os === "both") {
        osArr.push("Android", "iOS");
      } else {
        osArr.push(os);
      }
    });

    // default OS
    if (osArr.length === 0) osArr.push("Android");

    // remove duplicate OS
    osArr = [...new Set(osArr)];

    // -------------------------------------------
    // INSERT LOGIC (PAIR × OS)
    // -------------------------------------------
    for (let i = 0; i < payoutEventPairs.length; i++) {
      const { payout, event } = payoutEventPairs[i];
      const selectedGeo = geoArr[i] || geoArr[0];

      for (const os of osArr) {
        const sql = `
          INSERT INTO campaign_data (
            Adv_name, campaign_name, Vertical, geo, state_city, os,
            payable_event, mmp_tracker, adv_payout, preview_url,
            adv_d, campaign_id, category, Target, achieve_number,
            adv_note, status, tracking_url, kpi, da, user_id
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        `;

        const values = [
          data.Adv_name || null,
          data.campaign_name || null,
          data.Vertical || null,
          JSON.stringify(selectedGeo),
          data.state_city || null,
          os,
          event,
          data.mmp_tracker || null,
          payout,
          data.preview_url || null,
          data.adv_d || null,
          data.campaign_id || null,
          data.category || null,
          data.Target || null,
          data.achieve_number || null,
          data.adv_note || null,
          data.status || null,
          data.tracking_url || null,
          data.kpi || null,
          data.da || null,
          data.user_id || null
        ];

        const [result] = await connection.query(sql, values);
        insertedIds.push(result.insertId);
      }
    }

    if (insertedIds.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "No campaign_data rows were created",
      });
    }

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: "Campaign(s) created successfully",
      campaign_id: data.campaign_id || insertedIds[0],
      inserted_ids: insertedIds,
    });

  } catch (err) {
    await connection.rollback();
    console.error("❌ Error inserting campaign:", err.message);
    return res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
};


//remnove 
exports.Ca = async (req, res) => {
  console.log("📥 [POST] /api/campaigns - Create request received");

  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    const data = req.body;
    let insertedIds = [];

    // -------------------------------------------
    // Normalize Arrays
    // -------------------------------------------

    // GEO
    const geoArr = Array.isArray(data.geo) ? data.geo : [data.geo];

    // PAYOUT
    const payoutArr = Array.isArray(data.adv_payout)
      ? data.adv_payout
      : [data.adv_payout];

    // PAYABLE EVENT
const uniqueArray = (arr) => [...new Set(arr)];

const eventArr = Array.isArray(data.payable_event)
  ? data.payable_event.map(ev =>
      Array.isArray(ev) ? uniqueArray(ev) : [ev]
    )
  : [[data.payable_event]];
    //const eventArr = Array.isArray(data.payable_event)
    //  ? data.payable_event
      //: [data.payable_event];

    // -------------------------------------------
    // ✅ FIXED OS LOGIC (Your Exact Requirement)
    // -------------------------------------------
    let osArr = [];
    let inputOS = Array.isArray(data.os) ? data.os : [data.os];

    inputOS.forEach((os) => {
      if (!os) return;
      os = String(os).toLowerCase();
      if (os === "both") {
        osArr.push("android");
        osArr.push("ios");
      } else {
        osArr.push(os);
      }
    });

    // if no os provided, default to android
    if (osArr.length === 0) osArr.push("android");

    // -------------------------------------------
    // Loop payout-wise and insert rows
    // -------------------------------------------
    for (let i = 0; i < payoutArr.length; i++) {
      // payoutArr items are expected as arrays like [payout]
      const payout = Array.isArray(payoutArr[i]) ? payoutArr[i][0] : payoutArr[i];
      const selectedGeo = geoArr[i] || geoArr[0];
      const selectedEvents = eventArr[i] || eventArr[0] || [];

      // ensure selectedEvents is array
      const eventsArray = Array.isArray(selectedEvents) ? selectedEvents : [selectedEvents];

      // For this payout → use full expanded OS array
      const payoutOS = osArr;

      for (const os of payoutOS) {
        for (const event of eventsArray) {
          const sql = `
            INSERT INTO campaign_data (
              Adv_name, campaign_name, Vertical, geo, state_city, os,
              payable_event, mmp_tracker, adv_payout, preview_url,
              adv_d, campaign_id, category, Target, achieve_number,
              adv_note, status, tracking_url, kpi, da, user_id
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          `;
          const values = [
            data.Adv_name || null,
            data.campaign_name || null,
            data.Vertical || null,
            JSON.stringify(selectedGeo) || null,
            data.state_city || null,
            os,
            event || null,
            data.mmp_tracker || null,
            payout || null,
            data.preview_url || null,
            data.adv_d || null,
            data.campaign_id || null, // Keep existing behaviour if caller passed campaign_id
            data.category || null,
            data.Target || null,
            data.achieve_number || null,
            data.adv_note || null,
            data.status || null,
            data.tracking_url || null,
            data.kpi || null,
            data.da || null,
            data.user_id || null
          ];

          const [result] = await connection.query(sql, values);
          insertedIds.push(result.insertId);

          console.log(
            `✔ campaign_data created → OS:${os}, Payout:${payout}, Event:${event}, ID:${result.insertId}`
          );
        }
      }
    }

    // If nothing was inserted, respond with error
    if (insertedIds.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "No campaign_data rows were created",
      });
    }

    await connection.commit();

    // Choose campaign_id to return:
    // - If caller provided data.campaign_id use that
    // - Otherwise use the first inserted campaign_data id as campaign_id
    const returnedCampaignId = data.campaign_id || insertedIds[0];

    return res.status(201).json({
      success: true,
      message: "Campaign(s) created successfully",
      campaign_id: returnedCampaignId,   // <-- frontend can use this
      inserted_ids: insertedIds,
    });

  } catch (err) {
    await connection.rollback();
    console.error("❌ Error inserting campaign:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  } finally {
    connection.release();
  }
};



    



exports.Campaig = async (req, res) => {
  console.log("📥 [POST] /api/campaigns - Create request received");

  try {
    const data = req.body;
    let insertedIds = [];

    // -------------------------------------------
    // Normalize Arrays
    // -------------------------------------------
    const geoArr = Array.isArray(data.geo) ? data.geo : [data.geo];
    const payoutArr = Array.isArray(data.adv_payout) ? data.adv_payout : [data.adv_payout];
    const osArr = Array.isArray(data.os[0]) ? data.os : [data.os];
    const eventArr = Array.isArray(data.payable_event[0])
      ? data.payable_event
      : [data.payable_event];

    // -------------------------------------------
    // Loop payout-wise
    // -------------------------------------------
    for (let i = 0; i < payoutArr.length; i++) {
      const payout = payoutArr[i][0];
      const selectedGeo = geoArr[i] || geoArr[0];
      const selectedEvents = eventArr[i] || eventArr[0];

      // Resolve OS for this payout
      let payoutOS = osArr[0];

      if (payoutOS.includes("both")) {
        payoutOS = ["android", "ios"];
      } else {
        payoutOS = payoutOS;
      }

      // -----------------------------------------
      // Create entry per OS and per event
      // -----------------------------------------
      for (const os of payoutOS) {
        for (const event of selectedEvents) {
          const sql = `
            INSERT INTO campaign_data (
              Adv_name, campaign_name, Vertical, geo, state_city, os,
              payable_event, mmp_tracker, adv_payout, preview_url,
              adv_d, campaign_id, category, Target, achieve_number,
              adv_note, status, tracking_url, kpi, da, user_id
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          `;

          const values = [
            data.Adv_name,
            data.campaign_name,
            data.Vertical || null,
            JSON.stringify(selectedGeo),
            data.state_city || null,
            os,
            event,
            data.mmp_tracker || null,
            payout,
            data.preview_url || null,
            data.adv_d || null,
            data.campaign_id || null,
            data.category || null,
            data.Target || null,
            data.achieve_number || null,
            data.adv_note || null,
            data.status || null,
            data.tracking_url || null,
            data.kpi || null,
            data.da || null,
             data.user_id || null,
         ];

          const [result] = await db.query(sql, values);
          insertedIds.push(result.insertId);

          console.log(`✔ Created → OS:${os}, Payout:${payout}, Event:${event}, GEO:${JSON.stringify(selectedGeo)} → ID:${result.insertId}`);
        }
      }
    }

    return res.status(201).json({
      success: true,
      message: "Campaign(s) created successfully",
      inserted_ids: insertedIds,
    });

  } catch (err) {
    console.error("❌ Error inserting campaign:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};





// 📋 GET Campaign Data (All or Single by ID)
exports.getCampaignData = async (req, res) => {
  try {
    const { id } = req.params;      // campaign_id (optional)
    const { user_id } = req.query;  // logged-in user ID (required)

    if (!user_id) {
      return res.status(400).json({ success: false, message: "user_id is required" });
    }

    // 1️⃣ FETCH USER DETAILS
    const [userRows] = await db.query(
      `SELECT id, role, username FROM login WHERE id = ?`,
      [user_id]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ success: false, message: "Invalid user_id" });
    }

    const role = userRows[0].role;
    const username = userRows[0].username;

    // 2️⃣ CHECK HIERARCHY TOGGLE
    const [settingRows] = await db.query(
      "SELECT value FROM settings WHERE setting_key='camhierarchy_view'"
    );
    const isHierarchyEnabled = settingRows[0]?.value == "1";

    console.log("⚙️ Hierarchy Enabled:", isHierarchyEnabled);


    // 3️⃣ BUILD BASE QUERY
    let whereClause = "";
    let params = [];

    // If fetch specific campaign
    if (id) {
      whereClause = "WHERE cd.id = ?";
      params.push(id);
    }

    // -------------------------------------------------------
    // 4️⃣ HIERARCHY LOGIC (publisher & publisher_manager unrestricted)
    // -------------------------------------------------------

    if (role === "admin") {
      // admin sees everything - no restriction
    }

   
          else if (role === "publisher" || role === "publisher_manager") {
      // ⭐ publishers ALWAYS see all campaigns - no restriction (your rule)
    }

    

    // -------------------------------------------------------
    // 🔥 Advertiser Hierarchy (Enabled via Toggle)
    // -------------------------------------------------------
    //else if (role === "advertiser_manager") {
      //if (isHierarchyEnabled) {
        // Manager sees advertiser + own campaigns
        //whereClause += whereClause ? " AND" : " WHERE";
        //whereClause += ` (cd.user_id IN (SELECT id FROM login WHERE role='advertiser') OR cd.user_id = ?)`;
       // params.push(user_id);
     // }
      // If toggle off → they see ALL → skip restriction
   // }

if (role === "advertiser_manager") {
  if (isHierarchyEnabled && user_id) {
    whereClause += whereClause ? " AND" : " WHERE";

    whereClause += `
    (
      cd.user_id = ?

      OR cd.user_id IN (

        WITH RECURSIVE hierarchy AS (

          SELECT sub_admin_id
          FROM manager_subadmins
          WHERE manager_id = ?

          UNION ALL

          SELECT ms.sub_admin_id
          FROM manager_subadmins ms
          INNER JOIN hierarchy h
            ON ms.manager_id = h.sub_admin_id
        )

        SELECT sub_admin_id FROM hierarchy
      )

      OR EXISTS (
        SELECT 1
        FROM advids a
                WHERE a.adv_id = cd.adv_d
        AND (a.assign_id = ? OR a.user_id = ?)
      )
    )
  `;
   // whereClause += `
     // (
       // cd.user_id = ?
       // OR cd.user_id IN (
         // SELECT sub_admin_id 
         // FROM manager_subadmins 
        //  WHERE manager_id = ?
       // )
      //  OR adv.assign_id = ?
    //  )
  //  `;

    params.push(user_id, user_id, user_id, user_id);
  }
}

// -------------------------------------------------------
// ROLE: ADVERTISER
// -------------------------------------------------------
else if (role === "advertiser") {
  if (isHierarchyEnabled) {
    whereClause += whereClause ? " AND" : " WHERE";

    whereClause += `
    (
      cd.user_id = ?

      OR EXISTS (
        SELECT 1
        FROM advids a
        WHERE a.adv_id = cd.adv_d
        AND a.assign_id = ?
      )

      OR cd.user_id IN (
        SELECT sub_admin_id
        FROM manager_subadmins
        WHERE manager_id = ?
      )
    )
    `;

    params.push(user_id, user_id, user_id);
  }
}


//else if (role === "advertiser") {
//  if (isHierarchyEnabled) {
    //whereClause += whereClause ? " AND" : " WHERE";

    //whereClause += `
     // (
        //cd.user_id = ?
       // OR adv.assign_id = ?
     // )
    //`;

  //  params.push(user_id, user_id);
 // }
//}


else if (role === "adv_executive") {
  if (isHierarchyEnabled) {
    whereClause += whereClause ? " AND" : " WHERE";

    whereClause += `
      (
        cd.user_id = ?
        OR adv.assign_id = ?
      )
    `;

    params.push(user_id, user_id);
  }
}
// -------------------------------------------------------
// ROLE: OPERATIONS (NEW)
// -------------------------------------------------------
else if (role === "operations") {
  whereClause += whereClause ? " AND" : " WHERE";

  whereClause += `
    adv.assign_id = ?
  `;

  params.push(user_id);
}

const sql = `
  SELECT 
    cd.*,
    CONCAT(cd.Adv_name, '(', cd.adv_d, ')') AS adv_full,
    l.username AS adv_am
  FROM campaign_data cd
  LEFT JOIN login l ON cd.user_id = l.id
  LEFT JOIN advids adv ON adv.adv_id = cd.adv_d
  ${whereClause}
  ORDER BY cd.created_at DESC
`;    

    console.log("📌 FINAL SQL:", sql, params);

    const [results] = await db.query(sql, params);

    if (id && results.length === 0) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    return res.status(200).json({
      success: true,
      count: results.length,
      data: results
    });

  } catch (error) {
    console.error("❌ Server error while fetching campaigns:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};


    
  

// ✏️ UPDATE Campaign Data
// ✏️ UPDATE advertiser_links Table with preview_url
const updateAdvertiserLink = async (campaignId, previewUrl) => {
  try {
console.log("done", campaignId,previewUrl)
    const sql = `
      UPDATE advertiser_links
      SET advertiser_link = ?
      WHERE campaign_id = ?
    `;

    await db.query(sql, [previewUrl, campaignId]); 
 } catch (error) {
    console.error("❌ Error updating advertiser_links:", error);
    throw error; // so main function can catch it
  }
};


// ✏️ UPDATE Campaign Data
exports.updateCampaign = async (req, res) => {
    try {
      const { id } = req.params;
      const data = req.body;
  
      if (!id) return res.status(400).json({ error: "Campaign ID is required" });
  
      const sql = `
        UPDATE campaign_data SET 
          Adv_name = ?, campaign_name = ?, Vertical = ?, geo = ?, state_city = ?, os = ?,
          payable_event = ?, mmp_tracker = ?, adv_payout = ?, kpi = ?, pid = ?, adv_d = ?,
          campaign_id = ?, category = ?, Target = ?, achieve_number = ?, adv_note = ?,status = ?,
          updated_at = NOW()
        WHERE id = ?
      `;
  
      const values = [
        data.Adv_name,
        data.campaign_name,
        data.Vertical,
        data.geo,
        data.state_city,
        data.os,
        data.payable_event,
        data.mmp_tracker,
        data.adv_payout,
        data.kpi,
        data.pid,
        data.adv_d,
        data.campaign_id,
        data.category,
        data.Target,
        data.achieve_number,
        data.adv_note,
        data.status,

        id,
      ];
  
      // ✅ Promise-based query
      const [result] = await db.query(sql, values);
  
      if (result.affectedRows === 0)
        return res.status(404).json({ message: "Campaign not found" });
  
        // ✅ Call advertiser_links update
    if (data.preview_url && data.campaign_id) {
      await updateAdvertiserLink(data.campaign_id, data.preview_url);
    }

      res.status(200).json({ message: "Campaign updated successfully" });
    } catch (error) {
      console.error("❌ Server error while updating campaign:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  };
  

  // 📋 GET Only Campaign IDs and Names
exports.getCampaignList = async (req, res) => {
    try {
      const sql = "SELECT id, campaign_name,os,Adv_name,adv_d,sub_campaign_id  FROM campaign_data ORDER BY created_at DESC";
  
      const [results] = await db.query(sql);
  console.log(results);
      if (results.length === 0) {
        return res.status(404).json({ message: "No campaigns found" });
      }
  
      return res.status(200).json(results);
    } catch (error) {
      console.error("❌ Server error while fetching campaign list:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  };
  


  // 📦 COPY Campaign Data to adv_data Table
exports.copyCampaignToAdvData = async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, pid, pub_id, pub_name,pay_out } = req.body;

    // ---------------- VALIDATION ----------------
    if (!id) return res.status(400).json({ error: "Campaign ID is required" });
    if (!user_id) return res.status(400).json({ error: "User ID is required" });
    if (!pid) return res.status(400).json({ error: "PID is required" });
    if (!pub_id) return res.status(400).json({ error: "Publisher ID is required" });
    if (!pub_name) return res.status(400).json({ error: "Publisher name is required" });
    if (!pay_out) return res.status(400).json({ error: "Publisher payout is required" });

    // Today's date: YYYY-MM-DD
    const shared_date = new Date().toISOString().slice(0, 10);

    // ---------------- FETCH CAMPAIGN ----------------
    const [campaignRows] = await db.query(
      "SELECT * FROM campaign_data WHERE id = ?",
      [id]
    );

    if (campaignRows.length === 0) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    const campaign = campaignRows[0];

    // ---------------- INSERT INTO adv_data ----------------
    const insertAdvSQL = `
      INSERT INTO adv_data (
        campaign_name, Vertical, geo, city, os,
        payable_event, mmp_tracker, adv_payout,
        pid, adv_id, campaign_id, user_id,pay_out,
        pub_id, pub_name, shared_date
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const advValues = [
      campaign.campaign_name,
      campaign.Vertical,
      campaign.geo,
      campaign.state_city,
      campaign.os,
      campaign.payable_event,
      campaign.mmp_tracker,
      campaign.adv_payout,
      pid, 
      campaign.adv_d,
      campaign.id,
      user_id,
      pay_out,
      pub_id,
      pub_name,
      shared_date
    ];

    const insertSQL1 = `
      INSERT INTO pubidata (campaign_id)
      VALUES (?)
    `;

   
    const values1 = [campaign.id];

    const [result] = await db.query(insertAdvSQL, advValues);
    const [result1] = await db.query(insertSQL1, values1);

    // Step 3: Response
    res.status(201).json({
      success: true,
      message: "✅ Campaign data copied to adv_data successfully",
      new_adv_data_id: result.insertId,
      pubidata_id: result1.insertId,
    });

  } catch (error) {
    console.error("❌ Error copying campaign data:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};




exports.copyCampaignToAdvDatanew = async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, pid, pub_id, pub_name, pay_out } = req.body;

    // ---------------- VALIDATION ----------------
    if (!id) return res.status(400).json({ error: "Campaign ID is required" });
    if (!user_id) return res.status(400).json({ error: "User ID is required" });
    if (!pid) return res.status(400).json({ error: "PID is required" });
    if (!pub_id) return res.status(400).json({ error: "Publisher ID is required" });
    if (!pub_name) return res.status(400).json({ error: "Publisher name is required" });
console.log("pubname",pub_name)
    const shared_date = new Date().toISOString().slice(0, 10);

    // ---------------- FETCH CAMPAIGN ----------------
    const [campaignRows] = await db.query(
      "SELECT * FROM campaign_data WHERE id = ?",
      [id]
    );

    if (campaignRows.length === 0) {
      return res.status(404).json({ error: "Campaign not found" });
    }

    const campaign = campaignRows[0];

    // ---------------- GEO CLEANING ----------------
    // If geo is ["IN","BD","LK"] or ["IN"], convert to "IN,BD,LK"
    let cleanedGeo = campaign.geo;

    try {
      const parsedGeo = JSON.parse(campaign.geo); 
      if (Array.isArray(parsedGeo)) {
        cleanedGeo = parsedGeo.join(",");
      }
    } catch (e) {
      // If not JSON array, use raw string
      cleanedGeo = campaign.geo;
    }

    // ---------------- INSERT INTO adv_data ----------------
    const insertAdvSQL = `
      INSERT INTO adv_data (
        campaign_name, Vertical, geo, city, os,
        payable_event, mmp_tracker, adv_payout,
        pid, adv_id, campaign_id, user_id,pay_out,da,
        pub_id, pub_name, shared_date
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const advValues = [
      campaign.campaign_name,
      campaign.Vertical,
      cleanedGeo,                // 🔥 SAVING CLEANED GEO HERE
      campaign.state_city,
      campaign.os,
      campaign.payable_event,
      campaign.mmp_tracker,
      campaign.adv_payout,
      pid,
      campaign.adv_d,
      campaign.id,
      campaign.user_id,
      pay_out,
      campaign.da,
      pub_id,
      pub_name,
      shared_date
    ];

    const insertSQL1 = `
      INSERT INTO pubidata (campaign_id)
      VALUES (?)
    `;

    const values1 = [campaign.id];

    const [result] = await db.query(insertAdvSQL, advValues);
    const [result1] = await db.query(insertSQL1, values1);

    res.status(201).json({
      success: true,
      message: "✅ Campaign data copied to adv_data successfully",
      new_adv_id: result.insertId,
      pubidata_id: result1.insertId,
      geo_saved_as: cleanedGeo
    });

  } catch (error) {
    console.error("❌ Error copying campaign data:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// Get Live + Paused PIDs by Campaign Name & OS
exports.getPidStatus = async (req, res) => {
  try {
    let { campaign_id, os } = req.body;

    // ---------------------------------
    // VALIDATION
    // ---------------------------------
    if (!campaign_id || !os) {
      return res.status(400).json({
        message: "campaign_id and os are required"
      });
    }

    // Trim unwanted spaces
    campaign_id = campaign_id.toString().trim();
    os = os.toString().trim();

    // ---------------------------------
    // LIVE PIDs
    // ---------------------------------
 const [live] = await db.query(
  `
  SELECT ad.*
  FROM adv_data ad
  JOIN (
    SELECT pid, MAX(id) as max_id
    FROM adv_data
    WHERE campaign_id = ?
    AND os = ?
    AND (paused_date IS NULL OR paused_date = '')
    GROUP BY pid
  ) t ON ad.id = t.max_id
  `,
  [campaign_id, os]
);

const [paused] = await db.query(
  `
  SELECT ad.*
  FROM adv_data ad
  JOIN (
    SELECT pid, MAX(id) as max_id
    FROM adv_data
    WHERE campaign_id = ?
    AND os = ?
    AND paused_date IS NOT NULL
    AND paused_date != ''
    AND pid NOT IN (
      SELECT pid
      FROM adv_data
      WHERE campaign_id = ?
      AND os = ?
      AND (paused_date IS NULL OR paused_date = '')
    )
    GROUP BY pid
  ) t ON ad.id = t.max_id
  `,
  [campaign_id, os, campaign_id, os]
);

    return res.json({
      success: true,
      campaign_id,
      os,
      live_pids: live,
      paused_pids: paused,
    });

  } catch (error) {
    console.error("getPidStatus Error:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
    



async function cloneAdvDataForResume(connection, advDataId, sharedDate) {
  const sql = `
    INSERT INTO adv_data (
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
      user_id,
      campaign_id,
      da,
      vertical,

      shared_date,
      paused_date,

      adv_total_no,
      adv_deductions,
      adv_approved_no,
      pay_out,
      pub_Apno,
      flag,
      note,
      fp,
      fa,
      fa1,

      created_at,
      updated_at
    )
    SELECT
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
      user_id,
      campaign_id,
      da,
      vertical,

      ?,            -- new shared_date
      NULL,         -- paused_date reset

      null,            -- adv_total_no
      null,            -- adv_deductions
      null,            -- adv_approved_no
      pay_out,         -- pay_out
      NULL,         -- pub_Apno
      1,            -- flag (live)
      NULL,         -- note
      NULL,         -- fp
      NULL,         -- fa
      NULL,         -- fa1

      NOW(),        -- created_at
      NOW()         -- updated_at
    FROM adv_data
    WHERE id = ?
  `;

  await connection.query(sql, [sharedDate, advDataId]);
}



const formatDate = (date) => date.toISOString().slice(0, 10);

// to make a pid live
exports.updatePidStatus = async (req, res) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    const { data } = req.body;
    const date = formatDate(new Date());

    for (const item of data) {
      if (item.status === "live") {
        // ✅ Create NEW clean row
        await cloneAdvDataForResume(connection, item.id, date);

        // 🧊 Keep old row as history
        await connection.query(
          `UPDATE adv_data SET paused_date = ? WHERE id = ?`,
          [date, item.id]
        );
      }

      if (item.status === "pause") {
        await connection.query(
          `UPDATE adv_data
           SET paused_date = ?, flag = 0
           WHERE id = ?`,
          [date, item.id]
        );
      }
    }

    await connection.commit();

    res.json({
      message: "PID statuses updated with history support"
    });

  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ message: "Internal Server Error" });
  } finally {
    connection.release();
  }
};

    

// ✏️ UPDATE Campaign Data Dynamically
exports.updahjkg = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const { id, os_old, os_new, advertiser_link, tracking_url,advertiser_impression_url, preview_url, ...fieldsToUpdate } = req.body;

      // fallback mapping
const finalAdvertiserLink = advertiser_link || tracking_url;
console.log(advertiser_impression_url,"hh",)

console.log("advertiser_link:", advertiser_link);
console.log("tracking_url:", req.body.tracking_url);
// ✅ FIX: include tracking_url in campaign_data update
if (tracking_url) {
  fieldsToUpdate.tracking_url = tracking_url;
}

// ✅ FIX: preview_url mapping
if (preview_url) {
  fieldsToUpdate.preview_url = preview_url;
}
// fix for adv impression 
if (advertiser_impression_url) {
  fieldsToUpdate.advertiser_impression_url = advertiser_impression_url;
}

    if (!id || !os_old || !os_new) {
      return res.status(400).json({
        message: "id, os_old and os_new are required"
      });
    }

    await connection.beginTransaction();

    // ✅ Clean GEO → flat JSON array
    if (Array.isArray(fieldsToUpdate.geo)) {
      fieldsToUpdate.geo = JSON.stringify(
        fieldsToUpdate.geo.flat().map(String)
      );
    }

    // ✅ Clean state_city → flat JSON array
    if (Array.isArray(fieldsToUpdate.state_city)) {
      fieldsToUpdate.state_city = JSON.stringify(
        fieldsToUpdate.state_city.flat().map(String)
      );
    }

    // 🔥 OS update
    fieldsToUpdate.os = os_new;
    fieldsToUpdate.updated_at = new Date();

    if (Object.keys(fieldsToUpdate).length === 0 && !finalAdvertiserLink) {
      return res.status(400).json({
        message: "No fields provided to update"
      });
    }

    // -------------------------------
    // 1️⃣ UPDATE campaign_data
    // -------------------------------
    if (Object.keys(fieldsToUpdate).length > 0) {
      const columns = Object.keys(fieldsToUpdate)
        .map(key => `${key} = ?`)
        .join(", ");

      const values = Object.values(fieldsToUpdate);

      const [campResult] = await connection.query(
        `
        UPDATE campaign_data
        SET ${columns}
        WHERE id = ? AND os = ?
        `,
        [...values, id, os_old]
      );

      if (campResult.affectedRows === 0) {
        throw new Error("Campaign not found or OS mismatch");
      }
    }

    // -------------------------------
    // 2️⃣ UPDATE advertiser_links
    // -------------------------------


console.log(advertiser_link,"Update Request Received:", req.body);

    if (finalAdvertiserLink) {
      console.log(`Updating advertiser_links for campaign_id ${id} with new link: ${finalAdvertiserLink}`);

      await connection.query(
        `
        UPDATE advertiser_links
        SET advertiser_link = ?, advertiser_impression_url= ?, updated_at = NOW()
        WHERE campaign_id = ?
        `,
        [finalAdvertiserLink,advertiser_impression_url, id]
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
      advertiser_impression_url :advertiser_impression_url

    });

  } catch (error) {
    await connection.rollback();
    console.error("❌ updateCampData Error:", error);

    res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error"
    });
  } finally {
    connection.release();
  }
};



exports.updateCampData = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const { id, os_old, os_new, advertiser_link, tracking_url,advertiser_impression_url, preview_url, ...fieldsToUpdate } = req.body;

      // fallback mapping
const finalAdvertiserLink = advertiser_link || tracking_url;
console.log(advertiser_impression_url,"hh",)

console.log("advertiser_link:", advertiser_link);
console.log("tracking_url:", req.body.tracking_url);
if (tracking_url !== undefined) {
  fieldsToUpdate.tracking_url = tracking_url || null;
}

if (preview_url !== undefined) {
  fieldsToUpdate.preview_url = preview_url || null;
}

if (advertiser_impression_url !== undefined) {
  fieldsToUpdate.advertiser_impression_url = advertiser_impression_url || null;
}

    if (!id || !os_old || !os_new) {
      return res.status(400).json({
        message: "id, os_old and os_new are required"
      });
    }

    await connection.beginTransaction();

    // ✅ Clean GEO → flat JSON array
    if (Array.isArray(fieldsToUpdate.geo)) {
      fieldsToUpdate.geo = JSON.stringify(
        fieldsToUpdate.geo.flat().map(String)
      );
    }

    // ✅ Clean state_city → flat JSON array
    if (Array.isArray(fieldsToUpdate.state_city)) {
      fieldsToUpdate.state_city = JSON.stringify(
        fieldsToUpdate.state_city.flat().map(String)
      );
    }

    // 🔥 OS update
    fieldsToUpdate.os = os_new;
    fieldsToUpdate.updated_at = new Date();

    if (Object.keys(fieldsToUpdate).length === 0 && !finalAdvertiserLink) {
      return res.status(400).json({
        message: "No fields provided to update"
      });
    }

    // -------------------------------
    // 1️⃣ UPDATE campaign_data
    // -------------------------------
    if (Object.keys(fieldsToUpdate).length > 0) {
      const columns = Object.keys(fieldsToUpdate)
        .map(key => `${key} = ?`)
        .join(", ");

      const values = Object.values(fieldsToUpdate);

      const [campResult] = await connection.query(
        `
        UPDATE campaign_data
        SET ${columns}
        WHERE id = ? AND os = ?
        `,
        [...values, id, os_old]
      );

      if (campResult.affectedRows === 0) {
        throw new Error("Campaign not found or OS mismatch");
      }
    }

    // -------------------------------
    // 2️⃣ UPDATE advertiser_links
    // -------------------------------


console.log(advertiser_link,"Update Request Received:", req.body);

    if (finalAdvertiserLink) {
      console.log(`Updating advertiser_links for campaign_id ${id} with new link: ${finalAdvertiserLink}`);

      await connection.query(
        `
        UPDATE advertiser_links
        SET advertiser_link = ?, advertiser_impression_url= ?, updated_at = NOW()
        WHERE campaign_id = ?
        `,
        [finalAdvertiserLink,advertiser_impression_url, id]
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
      advertiser_impression_url :advertiser_impression_url

    });

  } catch (error) {
    await connection.rollback();
    console.error("❌ updateCampData Error:", error);

    res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error"
    });
  } finally {
    connection.release();
  }
};
