import cron from "node-cron";
import axios from "axios";

let isRunning = false;

console.log("🚀 Cron Worker Started");

cron.schedule("*/1 * * * *", async () => {
  if (isRunning) {
    console.log("⏳ Previous cron still running... skipping");
    return;
  }

  isRunning = true;

  try {
    console.log("⏳ Cron: Calling getAllAdvData API...");

    const response = await axios.get(
      "https://api.pidmetric.com/api/get-advdata",
      { timeout: 5000 }
    );

    console.log(
      `✅ Cron Success: ${response.data?.data?.length || 0} records fetched`
    );
  } catch (err) {
    console.error("❌ Cron API Error:", err.message);
  }

  isRunning = false;
});

