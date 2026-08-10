const fs = require("fs");

const LOG_FILE =
  process.argv[2] || "/root/.pm2/logs/s2s-error.log";

const ALLOWED_CAMPAIGNS = new Set([
  2665,
  2662,
  2666,
  2664,
  2667,
  2663,
  2668
]);

const logContent = fs.readFileSync(LOG_FILE, "utf8");

const conversions = new Map();

const regex =
/VALUES\s*\(\s*(\d+),\s*'([^']+)',\s*'(ADV-[^']+)',\s*NULL,\s*'([^']*)',\s*(\d+),\s*([^,]+),\s*([^,]+),\s*'received',\s*'([^']+)'/g;

let match;

while ((match = regex.exec(logContent)) !== null) {

  const campaign_id = Number(match[1]);

  if (!ALLOWED_CAMPAIGNS.has(campaign_id)) {
    continue;
  }

  const click_id = match[2];
  const advertiser_click_id = match[3];
  const payout = match[4];
  const publisher_id = Number(match[5]);

  let event_goal = match[6];
  let event = match[7];

  event_goal =
    event_goal && event_goal !== "NULL"
      ? event_goal.replace(/'/g, "")
      : null;

  event =
    event && event !== "NULL"
      ? event.replace(/'/g, "")
      : "install";

  const incomingUrl = match[8];

  if (!conversions.has(advertiser_click_id)) {

    conversions.set(advertiser_click_id, {
      campaign_id,
      click_id,
      advertiser_click_id,
      payout,
      publisher_id,
      event,
      event_goal,
      incomingUrl
    });

  }
}

const results = [...conversions.values()];

fs.writeFileSync(
  "/tmp/failed_conversions_filtered.json",
 
// "failed_conversions_filtered.json",
  JSON.stringify(results, null, 2)
);

console.log("\n================================");
console.log("FAILED CONVERSION REPORT");
console.log("================================");
console.log(
  `Total Unique Failed Conversions: ${results.length}`
);

const campaignStats = {};

for (const row of results) {

  campaignStats[row.campaign_id] =
    (campaignStats[row.campaign_id] || 0) + 1;
}

console.log("\nCampaign Breakdown:");

Object.entries(campaignStats)
  .sort((a, b) => a[0] - b[0])
  .forEach(([campaign, count]) => {
    console.log(
      `Campaign ${campaign}: ${count}`
    );
  });

const eventStats = {};

for (const row of results) {

  const evt = row.event || "install";

  eventStats[evt] =
    (eventStats[evt] || 0) + 1;
}

console.log("\nEvent Breakdown:");

Object.entries(eventStats)
  .sort((a, b) => b[1] - a[1])
  .forEach(([event, count]) => {
    console.log(
      `${event}: ${count}`
    );
  });

console.log(
  "\nJSON exported -> failed_conversions_filtered.json"
);
