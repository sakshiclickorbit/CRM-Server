const db = require('../db/Connection');

// CREATE
exports.createCampaignData = async (req, res) => {
  try {
    const {
      input_user, pub_name, pubid, campaign_name,
      geo, city, os, tracker, adv_id, adv_payout,
      share_date, pause_date, clicks, spend, cpc
    } = req.body;

    if (!input_user || !pubid || !campaign_name) {
      return res.status(400).json({ message: "Required fields missing" });
    }

    const sql = `
      INSERT INTO mediadata 
      (input_user, pub_name, pubid, campaign_name, geo, city, os, tracker, adv_id, adv_payout, share_date, pause_date, clicks, spend, cpc, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    await db.query(sql, [
      input_user, pub_name, pubid, campaign_name, geo, city, os, tracker,
      adv_id, adv_payout, share_date, pause_date, clicks, spend, cpc
    ]);

    res.status(201).json({ success: true, message: "Campaign data created successfully" });
  } catch (error) {
    console.error("❌ Create Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// READ
exports.getAllCampaignData = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM mediadata ORDER BY id DESC");
    res.json(rows);
  } catch (error) {
    console.error("❌ Fetch Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// UPDATE
exports.updateCampaignData = async (req, res) => {
  try {
    const id = req.params.id;
    const {
      input_user, pub_name, pubid, campaign_name,
      geo, city, os, tracker, adv_id, adv_payout,
      share_date, pause_date, clicks, spend, cpc
    } = req.body;

    const sql = `
      UPDATE mediadata SET 
      input_user = ?, pub_name = ?, pubid = ?, campaign_name = ?, geo = ?, city = ?, os = ?, tracker = ?, 
      adv_id = ?, adv_payout = ?, share_date = ?, pause_date = ?, clicks = ?, spend = ?, cpc = ?
      WHERE id = ?
    `;

    await db.query(sql, [
      input_user, pub_name, pubid, campaign_name, geo, city, os, tracker,
      adv_id, adv_payout, share_date, pause_date, clicks, spend, cpc, id
    ]);

    res.json({ success: true, message: "Campaign data updated successfully" });
  } catch (error) {
    console.error("❌ Update Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

