const db = require('../db/Connection');

const ExcelJS = require("exceljs");


exports.exportCampaignDetail = async (req, res) => {
  const { campaignId } = req.params;
  const { startDate, endDate } = req.query;
 
  if (!campaignId) {
    return res.status(400).json({ success: false, message: "campaignId is required" });
  }
 
  let dateFilter = "";
  const baseParams = [campaignId];
 
  if (startDate && endDate) {
    dateFilter = "AND c.created_at BETWEEN ? AND ?";
    baseParams.push(startDate, endDate);
  }
 
  const sql = `
    SELECT
      c.campaign_id,
      cd.campaign_name,
      c.publisher_id,
      c.click_id,
      c.source,
      c.advertiser_click_id,
      c.gaid,
      c.idfa,
      cv.payout,
      cv.event,
      cv.event_goal,
      c.p1, c.p2, c.p3, c.p4, c.p5
    FROM clicks c
    LEFT JOIN conversions cv
      ON cv.click_id = c.click_id AND cv.campaign_id = c.campaign_id
    LEFT JOIN campaign_data cd ON cd.id = c.campaign_id
    WHERE c.campaign_id = ? ${dateFilter}
    ORDER BY c.created_at DESC
    LIMIT ? OFFSET ?
  `;
 
  try {
    const [[campaignRow]] = await db.query(
      `SELECT campaign_name FROM campaign_data WHERE id = ? LIMIT 1`,
      [campaignId]
    );
 
    const campaignName = campaignRow?.campaign_name || `campaign_${campaignId}`;
    const safeFilename = campaignName.replace(/[^\w\s-]/g, "_").trim();
 
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}.xlsx"`);
 
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res });
    const sheet = workbook.addWorksheet("Clicks & Conversions");
 
    sheet.columns = [
      { header: "Campaign ID",          key: "campaign_id",          width: 14 },
      { header: "Campaign Name",        key: "campaign_name",        width: 28 },
      { header: "Publisher ID",         key: "publisher_id",         width: 16 },
      { header: "Click ID",             key: "click_id",             width: 32 },
      { header: "Source",               key: "source",               width: 15 },
      { header: "Advertiser Click ID",  key: "advertiser_click_id",  width: 32 },
      { header: "Gaid",                 key: "gaid",                 width: 32 },
      { header: "Idfa",                 key: "idfa",                 width: 32 },
      { header: "Payout",               key: "payout",               width: 10 },
      { header: "Event",                key: "event",                width: 20 },
      { header: "Event Goal",           key: "event_goal",           width: 20 },
      { header: "P1",                   key: "p1",                   width: 15 },
      { header: "P2",                   key: "p2",                   width: 15 },
      { header: "P3",                   key: "p3",                   width: 15 },
      { header: "P4",                   key: "p4",                   width: 15 },
      { header: "P5",                   key: "p5",                   width: 15 },
    ];
 
    // Bold the header row
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).commit();
 
    // Fetch in batches of 5000 to avoid loading everything into memory at once
    const BATCH = 5000;
    let offset = 0;
 
    while (true) {
      const [rows] = await db.query(sql, [...baseParams, BATCH, offset]);
 
      for (const row of rows) {
        sheet.addRow(row).commit();
      }
 
      if (rows.length < BATCH) break;
      offset += BATCH;
    }
 
    await sheet.commit();
    await workbook.commit();
 
  } catch (error) {
    console.error("❌ Export Campaign Detail error:", error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }
};
