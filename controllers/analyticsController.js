// ==========================
// 📁 controllers/analyticsController.js
// ==========================
const service = require("../services/analyticsService");

exports.getRevenueAnalytics = async (req, res) => {
  try {
    const { user_id, role, month } = req.body;

    if (!user_id || !role || !month) {
      return res.status(400).json({ error: "user_id, role, month required" });
    }

    const pubIds = await service.getPublisherIds(user_id, role);
console.log("Publisher IDs for analytics:", pubIds);
    const [geo, vertical, os] = await Promise.all([
      service.getTopGeo(pubIds, month),
      service.getTopVertical(pubIds, month),
      service.getTopOS(pubIds, month),
    ]);

    res.json({ geo, vertical, os });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

