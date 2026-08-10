const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const db = require("./db/Connection"); // Assuming you have a db file for MySQL connection
const axios = require("axios");

const { v4: uuidv4 } = require("uuid");

const Excel = require('exceljs');
//const csv = require('fast-csv');
const { parse } = require("fast-csv"); // ✅ use fast-csv correctly

const os = require('os');
const fsp = require('fs/promises');
const cron = require("node-cron");
const updateLevelsJob = require("./cron-job/Rating");

// File: backend/index.js
const multer = require("multer");

const xlsx = require("xlsx");
const exceljs = require("exceljs");
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

const app = express();
app.use(express.json()); // ✅ must be before routes

// ✅ CORS for Express (HTTP API)
app.use(cors({ origin: ["http://localhost:5173","http://160.153.172.237:5371","https://crm.clickorbits.in","http://localhost:3000","https://pidmetric.com"],
  methods: "GET,POST,PUT,DELETE", 
credentials: true }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "http://160.153.172.237:5371", "https://crm.clickorbits.in","http://localhost:3000","https://pidmetric.com"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  },
});



// Store connected users
const onlineUsers = new Map();

// ✅ Socket.IO connection
io.on("connection", (socket) => {
  const userId = socket.handshake.query.userId;

  if (userId) {
    socket.join(`user_${userId}`);
    console.log(`🟢 User ${userId} joined room user_${userId}`);
  }

  // ✅ Mark as read
  socket.on("mark_read", async ({ userId, notificationId }) => {
    try {
      await db.query(`UPDATE notifications SET is_read = 1 WHERE id = ?`, [
        notificationId,
      ]);

      io.to(`user_${userId}`).emit("notification_read", { notificationId });
      console.log(`📘 Notification ${notificationId} marked as read`);
    } catch (err) {
      console.error("Error updating read state:", err);
    }
  });

  socket.on("disconnect", () => {
    console.log(`🔴 Disconnected: ${socket.id}`);
  });
});

// ✅ Create notification
app.post("/createNotification", async (req, res) => {
  const { sender_id, receiver_id, type, message, url } = req.body;

  if (!sender_id || !receiver_id) {
    console.warn("⚠️ Missing sender_id or receiver_id");
    return res
      .status(400)
      .json({ success: false, error: "Missing sender_id or receiver_id" });
  }

  try {
    const [result] = await db.query(
      `INSERT INTO notifications (sender_id, receiver_id, type, message, url)
       VALUES (?, ?, ?, ?, ?)`,
      [sender_id, receiver_id, type, message, url]
    );

    const newNotification = {
      id: result.insertId,
      sender_id,
      receiver_id,
      type,
      message,
      url,
      is_read: false,
      created_at: new Date(),
    };

    // ✅ Emit to user's room instead of single socket
    io.to(`user_${receiver_id}`).emit("new_notification", newNotification);
    console.log(`📨 Sent notification to user_${receiver_id}`);

    res.json({ success: true, newNotification });
  } catch (err) {
    console.error("Error creating notification:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});


// ✅ Fetch notifications
app.get("/getNotifications/:userId", async (req, res) => {
  const { userId } = req.params;
  const [rows] = await db.query(
    `SELECT * FROM notifications WHERE receiver_id = ? ORDER BY created_at DESC`,
    [userId]
  );
  res.json(rows);
});
     
// --- Cron job will auto-run every 1 minute ---

// Run once immediately when server starts
(async () => {
  console.log("🚀 Running updateLevelsJob immediately on server start...");
  await updateLevelsJob();
})();

// --- Cron job will auto-run every 1 minute ---
cron.schedule("* * * * *", () => {
  console.log("⏳ Running updateLevelsJob via CRON...");
  updateLevelsJob();
});
// Store the io instance in app.locals for later use
app.locals.io = io;

// Middleware setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.resolve(__dirname, "uploads")));


const upload = multer({ dest: "uploads/" });

  // app.use("/uploads", express.static(path.resolve(__dirname, "uploads")));
  //  ^|^e Enable JSON parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  //const upload = multer({ dest: "/" });
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, path.join(__dirname, 'uploads'));
    },
    filename: function (req, file, cb) {
      cb(null, Date.now() + '-' + file.originalname);
    }
  });





  const scaleValues = (arr) => {
    const result = [];
  
    // Helper to calculate percent safely
    const getPercent = (first, second) => {
      const sum = first + second;
      if (sum === 0) {
        return [0, 0]; // If both are 0, push 0, 0
      }
      const firstPercent = Math.round((first / sum) * 100);
      const secondPercent = 100 - firstPercent; // Force exactly 100 total
      return [firstPercent, secondPercent];
    };
  
    // Install comparison
    const [installSecondLast, installLast] = getPercent(arr[0] || 0, arr[3] || 0);
  
    // Realtime comparison
    const [realtimeSecondLast, realtimeLast] = getPercent(arr[1] || 0, arr[4] || 0);
  
    // P360 comparison
    const [p360SecondLast, p360Last] = getPercent(arr[2] || 0, arr[5] || 0);
  
    // Push values in the desired order
    result.push(
      installSecondLast,
      realtimeSecondLast,
      p360SecondLast,
      installLast,
      realtimeLast,
      p360Last
    );
  
    return result;
  };
  
  

// POST /process-excel
// -----------------------------------------------------------------------------

 
app.post("/process-excel", upload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Excel file is required" });
    }
 
    const { sheetName } = req.body;
 
    // ───────────────────────────────────────────────────────────────────────────
    // 1. Read workbook / sheet
    // ───────────────────────────────────────────────────────────────────────────
   // const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
  const fileData = fs.readFileSync(req.file.path);
const workbook = xlsx.read(fileData, { type: "buffer" });    
const selectedSheet = sheetName?.trim() || workbook.SheetNames[0];
    const ws = workbook.Sheets[selectedSheet];
 
    if (!ws) {
      return res
        .status(400)
        .json({ error: `Sheet \"${selectedSheet}\" not found` });
    }
 
    const rawData = xlsx.utils.sheet_to_json(ws, { header: 1 });
    if (rawData.length === 0) {
      return res.status(400).json({ error: "Empty file" });
    }
 
    // ───────────────────────────────────────────────────────────────────────────
    // 2. Identify header positions
    // ───────────────────────────────────────────────────────────────────────────
    const headers = rawData[0];
    const dataRows = rawData.slice(1);
 
    const dateIndices = headers
      .map((h, i) => (String(h).toLowerCase() === "date" ? i : -1))
      .filter((i) => i !== -1);
 
    if (dateIndices.length < 2) {
      return res
        .status(400)
        .json({ error: "Need at least 2 'Date' blocks to compare" });
    }
 
    const secondLastIndex = dateIndices[dateIndices.length - 2];
    const lastIndex = dateIndices[dateIndices.length - 1];
    const pidIndex = headers.indexOf("PID");
    const pubidIndex = headers.indexOf("PUBID");
 
    // ───────────────────────────────────────────────────────────────────────────
    // 3. Helper to slice out a metric block
    // ───────────────────────────────────────────────────────────────────────────
    const extractMetrics = (rows, dateIdx, metricStartIdx, keys) =>
      rows.map((row) => ({
        pid: row[pidIndex] || "Unknown",
        pubid: row[pubidIndex] || "Unknown",
        date: row[dateIdx] || "Unknown",
        ...Object.fromEntries(
          keys.map((key, i) => [
            key.toLowerCase(),
            parseInt(row[metricStartIdx + i], 10) || 0,
          ])
        ),
      }));
 
    // Column layout (offsets from Date column):
    //  +0  Date
    //  +1  Install            ← originalKeys[0]
    //  +2  Realtime           ← originalKeys[1]
    //  +3  P360               ← originalKeys[2]
    //  +4  Event              ← newKeys[0]
    //  +5  Realtime (events)  ← newKeys[1]
    //  +6  P360    (events)   ← newKeys[2]
 
    const EVENT_OFFSET = 6; // distance from Date to Event column
 
    const originalKeys = ["Install", "Realtime", "P360"];
    const newKeys = ["Event", "Realtime", "P360"];
 
    // ── Old metric blocks ─────────────────────────────────────────────────────
    const secondLastBlockData = extractMetrics(
      dataRows,
      secondLastIndex,
      secondLastIndex + 1, // Install column starts Date+1
      originalKeys
    );
 
    const lastBlockData = extractMetrics(
      dataRows,
      lastIndex,
      lastIndex + 1,
      originalKeys
    );
 
    // ── New metric blocks (Event/Realtime/P360) ───────────────────────────────
    const secondLastNewData = extractMetrics(
      dataRows,
      secondLastIndex,
      secondLastIndex + EVENT_OFFSET,
      newKeys
    );
 
    const lastNewData = extractMetrics(
      dataRows,
      lastIndex,
      lastIndex + EVENT_OFFSET,
      newKeys
    );
 
    // ───────────────────────────────────────────────────────────────────────────
    // 4. Group data by PID
    // ───────────────────────────────────────────────────────────────────────────
    const groupedData = {}; // Install / Realtime / P360
    const groupedNewData = {}; // Event / Realtime / P360 (events)
 
    // ----- classic metrics ----------------------------------------------------
    [...secondLastBlockData, ...lastBlockData].forEach((d) => {
      groupedData[d.pid] ||= {
        pubid: d.pubid,
        secondLast: { install: 0, realtime: 0, p360: 0 },
        last: { install: 0, realtime: 0, p360: 0 },
      };
 
      if (d.date === secondLastBlockData[0].date) {
        groupedData[d.pid].secondLast = {
          install: d.install,
          realtime: d.realtime,
          p360: d.p360,
        };
      } else if (d.date === lastBlockData[0].date) {
        groupedData[d.pid].last = {
          install: d.install,
          realtime: d.realtime,
          p360: d.p360,
        };
      }
    });
 
    // ----- event metrics (no date check needed – arrays are pre‑segmented) ----
    secondLastNewData.forEach((d) => {
      groupedNewData[d.pid] ||= {
        pubid: d.pubid,
        secondLast: { event: 0, realtime: 0, p360: 0 },
        last: { event: 0, realtime: 0, p360: 0 },
      };
      groupedNewData[d.pid].secondLast = {
        event: d.event,
        realtime: d.realtime,
        p360: d.p360,
      };
    });
 
    lastNewData.forEach((d) => {
      groupedNewData[d.pid] ||= {
        secondLast: { event: 0, realtime: 0, p360: 0 },
        last: { event: 0, realtime: 0, p360: 0 },
      };
      groupedNewData[d.pid].last = {
        event: d.event,
        realtime: d.realtime,
        p360: d.p360,
      };
    });
 
    // ───────────────────────────────────────────────────────────────────────────
    // 5. Prepare chart payload
    // ───────────────────────────────────────────────────────────────────────────
    const secondDate = secondLastBlockData[0]?.date || "Second Last";
    const lastDate = lastBlockData[0]?.date || "Last";
 
    const charts = [];
 
    // -- Install / Realtime / P360 (classic) -----------------------------------
    Object.keys(groupedData).forEach((pid) => {
      const d = groupedData[pid];
      const allValues = [
        d.secondLast.install,
        d.secondLast.realtime,
        d.secondLast.p360,
        d.last.install,
        d.last.realtime,
        d.last.p360,
      ];
      const scaled = scaleValues(allValues);
 
      charts.push({
        pid,
        pubid: d.pubid,
        type: "install",
        labels: ["Install", "Realtime", "P360"],
        secondDate,
        lastDate,
        datasets: [
          {
            label: `${pid} - ${secondDate}`,
            data: scaled.slice(0, 3),
            actualValues: [
              d.secondLast.install,
              d.secondLast.realtime,
              d.secondLast.p360,
            ],
            backgroundColor: "rgba(54, 162, 235, 0.6)",
          },
          {
            label: `${pid} - ${lastDate}`,
            data: scaled.slice(3, 6),
            actualValues: [d.last.install, d.last.realtime, d.last.p360],
            backgroundColor: "rgba(255, 99, 132, 0.6)",
          },
        ],
      });
    });
 
    // -- Event / Realtime / P360 (event metrics) --------------------------------
    Object.keys(groupedNewData).forEach((pid) => {
      const d = groupedNewData[pid];
      const allValues = [
        d.secondLast.event,
        d.secondLast.realtime,
        d.secondLast.p360,
        d.last.event,
        d.last.realtime,
        d.last.p360,
      ];
      const scaled = scaleValues(allValues);
 
      charts.push({
        pid,
        pubid: d.pubid,
        type: "event",
        labels: ["Event", "Realtime", "P360"],
        secondDate,
        lastDate,
        datasets: [
          {
            label: `${pid} - ${secondDate}`,
            data: scaled.slice(0, 3),
            actualValues: [
              d.secondLast.event,
              d.secondLast.realtime,
              d.secondLast.p360,
            ],
            backgroundColor: "rgba(153, 102, 255, 0.6)",
          },
          {
            label: `${pid} - ${lastDate}`,
            data: scaled.slice(3, 6),
            actualValues: [d.last.event, d.last.realtime, d.last.p360],
            backgroundColor: "rgba(255, 206, 86, 0.6)",
          },
        ],
      });
    });
 
    // ───────────────────────────────────────────────────────────────────────────
    // 6. Send response + cleanup
    // ───────────────────────────────────────────────────────────────────────────
    res.json({ charts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  } finally {
    // Always delete uploaded temp file
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
  }
});    



      

  
  const fileToTabMap = {
      "detection": "P.A_install",
      "blocked-installs": "realtime_install",
      "blocked-in-app-events": "realtime_event",
      "fraud-post-inapps": "P.A_event",
      "in-app-events": "Payble_event"
    };
    
  const MAX_ZIP_SIZE = 500 * 1024 * 1024; // 100MB

  app.post("/upload", upload.array("files"), async (req, res) => {
  try {
    const files = req.files;
    const column = req.body.column;
    const campaignName = req.body.campaign_name; // ✅ new addition

    if (!files || files.length === 0 || !column || !campaignName) {
      return res.status(400).send("Files, column name, and campaign name are required.");
    }

    const tempOutput = path.join(__dirname, "output");
    fs.mkdirSync(tempOutput, { recursive: true });

    const zipFiles = [];
    let archive = null;
    let archiveStream = null;
    let currentZipSize = 0;
    let zipIndex = 1;

    const startNewZip = () => {
      if (archive) archive.finalize();
      const zipName = `grouped_data_${zipIndex++}.zip`;
      const zipPath = path.join(tempOutput, zipName);
      archiveStream = fs.createWriteStream(zipPath);
      archive = archiver("zip", { zlib: { level: 9 } });
      archive.pipe(archiveStream);
      zipFiles.push(zipPath);
      currentZipSize = 0;
    };

   // console.log("📂 Step 1: Collecting all PIDs from uploaded files...");

    const allPIDs = new Set();

    // --- Extract all PIDs ---
    for (const file of files) {
      const ext = path.extname(file.originalname).toLowerCase();

      if (ext === ".csv") {
        const stream = fs.createReadStream(file.path).pipe(parse({ headers: false }));
        let headers = null;
        for await (const row of stream) {
          const values = Object.values(row);
          if (!headers) {
            headers = values;
            continue;
          }
          const idx = headers.indexOf(column);
          if (idx >= 0 && values[idx]) {
            const pid = values[idx].toString().replace(/\s+/g, "").trim().toLowerCase();
            if (pid) allPIDs.add(pid);
          }
        }
      } else {
        const workbookReader = new exceljs.stream.xlsx.WorkbookReader(file.path, {
          entries: "emit",
          sharedStrings: "cache",
          styles: "cache",
          hyperlinks: "ignore",
          worksheets: "emit",
        });

        for await (const worksheetReader of workbookReader) {
          let headers = null;
          for await (const row of worksheetReader) {
            const rowArray = row.values.slice(1);
            if (row.number === 1) {
              headers = rowArray;
              continue;
            }
            const idx = headers.indexOf(column);
            if (idx >= 0 && rowArray[idx]) {
              const pid = rowArray[idx].toString().replace(/\s+/g, "").trim().toLowerCase();
              if (pid) allPIDs.add(pid);
            }
          }
        }
      }
    }

    //console.log(`🧾 Found ${allPIDs.size} unique PIDs.`);

    // --- Step 2: Fetch pub_name, pub_id, pid for this campaign ---
    const pidArray = Array.from(allPIDs).filter(Boolean);
    const pidMap = new Map();
    
    if (Array.isArray(pidArray) && pidArray.length > 0) {
      //console.log(`🔍 Fetching publisher details for campaign "${campaignName}"...`);
    
      // ✅ safely create placeholders
      const placeholders = pidArray.map(() => "?").join(",");
    
      // ✅ build query string
      const sql = `
        SELECT pub_name, pub_id, pid
        FROM adv_data
        WHERE LOWER(REGEXP_REPLACE(campaign_name, '[[:space:]]+', '')) = LOWER(REGEXP_REPLACE(?, '[[:space:]]+', ''))

          AND LOWER(REPLACE(TRIM(pid), ' ', '')) IN (${placeholders})
      `;
    
     // console.log("🧠 Running Query:", sql);
      //console.log("🧩 Params:", [campaignName.trim(), ...pidArray]);
    
      const [rows] = await db.query(sql, [campaignName.trim(), ...pidArray]);

//       const missingPIDs = pidArray.filter(pid => !pidMap.has(pid));
// if (missingPIDs.length > 0) {
//   console.log("🕵️ Checking missing PIDs one by one...");
//   for (const pid of missingPIDs) {
//     const [checkRows] = await db.query(
//       `SELECT pid, campaign_name FROM adv_data 
//        WHERE LOWER(REPLACE(TRIM(pid), ' ', '')) = LOWER(REPLACE(?, ' ', ''))`,
//       [pid]
//     );
//     if (checkRows.length > 0) {
//       console.log(`⚠️ PID "${pid}" exists in DB but under campaign(s):`, checkRows.map(r => r.campaign_name));
//     } else {
//       console.log(`❌ PID "${pid}" truly not found in DB.`);
//     }
//   }
// }

    
      //console.log(`✅ Found ${rows.length} PID matches for campaign "${campaignName}".`);
    
      for (const r of rows) {
        const cleanedPid = r.pid.toString().replace(/\s+/g, "").trim().toLowerCase();
        pidMap.set(cleanedPid, {
          pub_name: r.pub_name,
          pub_id: r.pub_id,
          pid: r.pid,
        });
      }
    } else {
      console.warn("⚠️ No PIDs found or pidArray is not an array:", pidArray);
    }
    

    function getPublisherDetails(pid) {
      if (!pid) return null;
      const cleanPid = pid.toString().replace(/\s+/g, "").trim().toLowerCase();
      return pidMap.get(cleanPid) || null;
    }

    // --- Step 3: Process files ---
    //console.log("📦 Step 3: Processing files and generating grouped Excel files...");
    startNewZip();

    const groupWorkbooks = new Map();

    const getOrCreateWorkbook = async (groupKey) => {
      let cleanKey = (groupKey || "").toString().trim();
      if (!cleanKey || cleanKey.toLowerCase() === "undefined") cleanKey = "Undefined";

      if (!groupWorkbooks.has(cleanKey)) {
        const pubDetails = getPublisherDetails(cleanKey);
        let pubName = "Unknown";
        let pubId = "NA";

        if (pubDetails) {
          pubName = pubDetails.pub_name ? pubDetails.pub_name.replace(/\s+/g, "_") : "Unknown";
          pubId = pubDetails.pub_id || "NA";
         // console.log(`[PID HIT] "${cleanKey}" → ${pubDetails.pub_name} (${pubDetails.pub_id})`);
        } else {
          console.warn(`[PID MISS] No match for PID: "${cleanKey}"`);
        }

        const fileName = `${cleanKey}_${pubName}_${pubId}.xlsx`;
        const outPath = path.join(tempOutput, fileName);
        const wb = new exceljs.stream.xlsx.WorkbookWriter({ filename: outPath });
        groupWorkbooks.set(cleanKey, { wb, fileName, filePath: outPath, sheets: new Map() });
      }

      return groupWorkbooks.get(cleanKey);
    };

    const processSheetStream = async (rowsAsync, tabName, column) => {
      let headers = null;

      for await (const rowData of rowsAsync) {
        if (!headers) {
          headers = rowData;
          continue;
        }

        const rowObj = {};
        headers.forEach((h, i) => (rowObj[h] = rowData[i] || ""));
        const key = rowObj[column] || "Undefined";
        const group = await getOrCreateWorkbook(key);

        if (!group.sheets.has(tabName)) {
          const ws = group.wb.addWorksheet(tabName.slice(0, 31));
          ws.addRow(headers).commit();
          group.sheets.set(tabName, ws);
        }

        const ws = group.sheets.get(tabName);
        ws.addRow(headers.map(h => rowObj[h])).commit();
      }
    };

    for (const file of files) {
      const ext = path.extname(file.originalname).toLowerCase();
      const fileNameWithoutExt = path.parse(file.originalname).name;
      const parts = fileNameWithoutExt.split("_");
      const tabName = parts.slice(1).join("-") || "Sheet1";

      if (ext === ".csv") {
        const rows = [];
        const stream = fs.createReadStream(file.path).pipe(parse({ headers: false }));
        for await (const row of stream) rows.push(Object.values(row));
        async function* rowGenerator() {
          for (const r of rows) yield r;
        }
        await processSheetStream(rowGenerator(), tabName, column);
      } else {
        const workbookReader = new exceljs.stream.xlsx.WorkbookReader(file.path, {
          entries: "emit",
          sharedStrings: "cache",
          styles: "cache",
          hyperlinks: "ignore",
          worksheets: "emit",
        });

        for await (const worksheetReader of workbookReader) {
          let headers = null;
          for await (const row of worksheetReader) {
            const rowArray = row.values.slice(1);
            if (row.number === 1) {
              headers = rowArray;
              continue;
            }

            const rowData = {};
            headers.forEach((h, i) => (rowData[h] = rowArray[i] || ""));
            const key = rowData[column] || "Undefined";
            const group = await getOrCreateWorkbook(key);

            if (!group.sheets.has(tabName)) {
              const ws = group.wb.addWorksheet(tabName.slice(0, 31));
              ws.addRow(headers).commit();
              group.sheets.set(tabName, ws);
            }

            const ws = group.sheets.get(tabName);
            ws.addRow(headers.map(h => rowData[h])).commit();
          }
        }
      }

      fs.unlinkSync(file.path);
    }

    for (const { wb, filePath, fileName } of groupWorkbooks.values()) {
      await wb.commit();
      const stats = fs.statSync(filePath);
      if (currentZipSize + stats.size > 400 * 1024 * 1024) {
        archive.finalize();
        startNewZip();
      }
      archive.file(filePath, { name: fileName });
      currentZipSize += stats.size;
    }

    archive.finalize();
    archiveStream.on("close", () => {
      console.log("✅ All zip files created successfully.");
      res.status(200).json({
        message: "Upload and processing successful.",
        zips: zipFiles.map(f => path.basename(f)),
      });
    });
  } catch (err) {
    console.error("❌ Error during file processing:", err);
    res.status(500).send("An error occurred while processing the files.");
  }
});



    app.get("/download/:file", (req, res) => {
      const file = req.params.file;
      const filePath = path.join(__dirname, "output", file);
      if (fs.existsSync(filePath)) {
        res.download(filePath);
      } else {
        res.status(404).send("File not found");
      }
    });



// Get All adv Pub Requests API
app.get('/PrmadvRequests', async (req, res) => {
  try {
    console.log("🔵 Get All Pub Requests Received");

    const [rows] = await db.query(
      `SELECT * 
       FROM pub_req 
       
       `
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "No pub requests found" });
    }

    res.status(200).json({ success: true, data: rows });

  } catch (error) {
    console.error("❌ Error fetching pub requests:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// Get All adv Pub Requests API
app.get('/getPrmadvRequests', async (req, res) => {
  try {
    console.log("🔵 Get All Pub Requests Received");

    const [rows] = await db.query(
      `SELECT * 
       FROM pub_req 
       WHERE (priority IS NOT NULL AND priority != '') 
       AND prm = 1`
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "No pub requests found" });
    }

    res.status(200).json({ success: true, data: rows });

  } catch (error) {
    console.error("❌ Error fetching pub requests:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});



app.post('/addPubRequest', async (req, res) => {
  try {
    const {
      adv_name,
      campaign_name,
      payout,
      os,
      pub_name,
      pub_id,
      pid,
      geo,
      note
    } = req.body;

    const io = req.app.locals.io;
    let insertedIds = [];

    // -------------------------------------------------
    // 1️⃣ Normalize OS (FULL FIX)
    // -------------------------------------------------
    let osArr = [];

    if (Array.isArray(os)) {
      // Case: ["both"]
      if (os.length === 1 && os[0] === "both") {
        osArr = ["Android", "iOS"];
      } else {
        osArr = os;
      }
    } else {
      // Case: "both"
      if (os === "both") {
        osArr = ["Android", "iOS"];
      } else {
        osArr = [os];
      }
    }

    // -------------------------------------------------
    // 2️⃣ Normalize payout & geo
    // -------------------------------------------------
    const payoutArr = Array.isArray(payout) ? payout : [payout];
    const geoArr = Array.isArray(geo) ? geo : [geo];

    // -------------------------------------------------
    // 3️⃣ Create entries per OS
    // -------------------------------------------------
    for (let index = 0; index < osArr.length; index++) {

      const singleOS = osArr[index];
      const singlePayout = payoutArr[index] || payoutArr[0];

      let singleGeo = geoArr[index] || geoArr[0];
      if (!Array.isArray(singleGeo)) singleGeo = [singleGeo];

      const [result] = await db.query(
        `INSERT INTO pub_req 
        (adv_name, campaign_name, payout, os, pub_name, pub_id, pid, geo, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          adv_name,
          campaign_name,
          singlePayout,
          singleOS,
          pub_name,
          pub_id,
          pid,
          JSON.stringify(singleGeo),
          note
        ]
      );

      insertedIds.push(result.insertId);

      io.emit("pub_request_added", {
        id: result.insertId,
        adv_name,
        campaign_name,
        payout: singlePayout,
        os: singleOS,
        pub_name,
        pub_id,
        pid,
        geo: singleGeo,
        note
      });
    }

    return res.status(201).json({
      success: true,
      message: "Pub request processed successfully",
      inserted_ids: insertedIds
    });

  } catch (error) {
    console.error("❌ Error in addPubRequest:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
});

//add pub req new
 app.post('/addPubRequestnew', async (req, res) => {
  try {
    const {
      adv_name,
      campaign_name,
      payout,
      os,
      pub_name,
      pub_id,
      pid,
      geo,
      note,
      adv_am,
    } = req.body;
 
    const io = req.app.locals.io;
    let insertedIds = [];
 
    // Normalize arrays
    const payoutArr = Array.isArray(payout) ? payout : [payout];
    const geoArr = Array.isArray(geo) ? geo : [geo];
    const osArr = Array.isArray(os) ? os : [os];
 
    // Look up adv_name in login table once — used for campaign_ids lookup below
    const [[loginRow]] = await db.query(
      'SELECT id FROM login WHERE username = ? LIMIT 1',
      [adv_am]
    );
    const advUserId = loginRow?.id || null;
 
    // We loop based on payout/geo length (main rows)
    for (let i = 0; i < payoutArr.length; i++) {
 
      // ----- Normalize OS for this row -----
      let thisOS = osArr[i] || osArr[0];
      let rowOsList = [];
 
      if (thisOS === "both") {
        rowOsList = ["Android", "iOS"];
      } else if (Array.isArray(thisOS)) {
        rowOsList = thisOS;
      } else {
        rowOsList = [thisOS];
      }
 
      // ----- Normalize GEO for this row -----
      let thisGeo = geoArr[i] || geoArr[0];
      if (!Array.isArray(thisGeo)) thisGeo = [thisGeo];
 
      let thisPayout = payoutArr[i] || payoutArr[0];
 
      // Now create entries for each OS of this row
      for (let j = 0; j < rowOsList.length; j++) {
        const finalOS = rowOsList[j];
 
        // Find matching campaign IDs from campaign_data
        // finalOS is always a single value here ("Android"/"iOS") since "both" is already expanded above
        let campaignIds = [];
        if (advUserId) {
          const [campaigns] = await db.query(
            `SELECT id FROM campaign_data WHERE campaign_name = ? AND os = ? AND user_id = ?`,
            [campaign_name, finalOS, advUserId]
          );
          campaignIds = campaigns.map(c => c.id);
        }
 
        // Fallback: if no campaign found via login, search advids by adv_name → assign_id → campaign_data
        if (campaignIds.length === 0) {
          const [[advRow]] = await db.query(
            `SELECT assign_id FROM advids WHERE adv_name = ? LIMIT 1`,
            [adv_name]
          );
          if (advRow?.assign_id) {
            const [fallbackCampaigns] = await db.query(
              `SELECT id FROM campaign_data WHERE campaign_name = ? AND os = ? AND user_id = ?`,
              [campaign_name, finalOS, advRow.assign_id]
            );
            campaignIds = fallbackCampaigns.map(c => c.id);
          }
        }
 
        const [result] = await db.query(
          `INSERT INTO pub_req
          (adv_name, campaign_name, payout, os, pub_name, pub_id, pid, geo, note, campaign_ids)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            adv_name,
            campaign_name,
            thisPayout,
            finalOS,
            pub_name,
            pub_id,
            pid,
            JSON.stringify(thisGeo),
            note,
            JSON.stringify(campaignIds)
          ]
        );
 
        insertedIds.push(result.insertId);
 
        // Real-time Emit
        io.emit("pub_request_added", {
          id: result.insertId,
          adv_name,
          campaign_name,
          payout: thisPayout,
          os: finalOS,
          pub_name,
          pub_id,
          pid,
          geo: thisGeo,
          note
        });
      }
    }
 
    return res.status(201).json({
      success: true,
      message: "Pub request processed successfully",
      inserted_ids: insertedIds
    });
 
  } catch (error) {
    console.error("❌ Error in addPubRequest:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
});

  


// Update Adv Res API
app.put('/updateAdvRes', async (req, res) => {
  try {
    console.log("🟡 Update adv_res Request Received:", req.body);

    const { id, adv_res } = req.body;

    if (!id || adv_res === undefined) {
      return res.status(400).json({
        success: false,
        message: "ID and adv_res are required"
      });
    }

    const [result] = await db.query(
      `UPDATE pub_req SET adv_res = ? WHERE id = ?`,
      [adv_res, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "No pub request found with the given ID"
      });
    }

    console.log("✅ adv_res Updated Successfully");

    // Emit event
    const io = req.app.locals.io;
    io.emit('adv_res_updated', { id, adv_res });

    res.status(200).json({
      success: true,
      message: "adv_res updated successfully"
    });

  } catch (error) {
    console.error("❌ Error in updateAdvRes:", error);
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
});

// Get All Pub Requests API
app.get('/AllPubRequests12', async (req, res) => {
  try {
    console.log("🔵 Get All Pub Requests Received");

    const { startDate, endDate } = req.query;
    console.log("📅 Date Filter:", startDate, endDate);

    // Dynamic date filter for main records (optional)
    let dateCondition = '';
    const params = [];

    if (startDate && endDate) {
      dateCondition = 'WHERE DATE(pr.created_at) BETWEEN ? AND ?';
      params.push(startDate, endDate);
    } else if (startDate) {
      dateCondition = 'WHERE DATE(pr.created_at) >= ?';
      params.push(startDate);
    } else if (endDate) {
      dateCondition = 'WHERE DATE(pr.created_at) <= ?';
      params.push(endDate);
    }

    // Main query
    const [rows] = await db.query(
      `
      SELECT 
        pr.*,
        (
          SELECT 
            GROUP_CONCAT(p.priority ORDER BY p.priority)
          FROM (
            SELECT 1 AS priority UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION 
            SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10 UNION 
            SELECT 11 UNION SELECT 12 UNION SELECT 13 UNION SELECT 14 UNION SELECT 15
          ) p
          WHERE p.priority NOT IN (
            -- exclude priorities already used in last 24 hours for this campaign
            SELECT priority
            FROM pub_req
            WHERE campaign_name = pr.campaign_name
              AND created_at >= NOW() - INTERVAL 24 HOUR
          )
          AND p.priority NOT IN (
            -- exclude priorities with prm = 0 for same pid (blocked)
            SELECT priority
            FROM pub_req
            WHERE campaign_name = pr.campaign_name
              AND pid = pr.pid
              AND prm = 0
          )
        ) AS available_priorities
      FROM pub_req pr
      ${dateCondition}
      ORDER BY pr.created_at DESC
      `,
      params
    );

    // Handle empty dataset
    if (rows.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        message: "No pub requests found — showing all priorities available."
      });
    }

    // Transform to array and fallback if empty
    const updatedRows = rows.map(r => {
      const available = r.available_priorities
        ? r.available_priorities.split(',').map(Number)
        : [];

      // 🧩 If campaign has no record in last 24h, give all 15 priorities
      const allPriorities = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15];
      const finalPriorities = available.length > 0 ? available : allPriorities;

      return {
        ...r,
        available_priorities: finalPriorities
      };
    });

    console.log(`✅ ${updatedRows.length} Pub Requests fetched successfully`);
    res.status(200).json({ success: true, data: updatedRows });

  } catch (error) {
    console.error("❌ Error in getAllPubRequests12:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
});



app.get('/getAllPubRequests12', async (req, res) => {
  try {
    console.log("\n\n==============================");
    console.log("🔵 NEW REQUEST: Get All Pub Requests");
    console.log("==============================");
 
    const { startDate, endDate, id } = req.query;
 
    console.log("📥 Query Received:", req.query);
 
    if (!id) {
      console.log("❌ Missing ID");
      return res.status(400).json({ success: false, message: "user_id is required" });
    }
 
    console.log("📅 Date Filter:", { startDate, endDate });
 
    // 1️⃣ GET USER DATA
    console.log("🔍 Fetching user info...");
    const [userRows] = await db.query(
      "SELECT id, role, username FROM login WHERE id = ?",
      [id]
    );
 
    console.log("👤 User Query Result:", userRows);
 
    if (userRows.length === 0) {
      console.log("❌ Invalid user_id (No user found)");
      return res.status(404).json({ success: false, message: "Invalid user_id" });
    }
 
    const role = userRows[0].role;
    const username = userRows[0].username;
 
    console.log("👤 User Role:", role, "| Username:", username);
 
    // 2️⃣ CHECK SETTINGS
    console.log("🔍 Checking hierarchy setting...");
    const [settingRows] = await db.query(
      "SELECT value FROM settings WHERE setting_key='reqhierarchy_view'"
    );
 
    console.log("⚙️ Setting Rows:", settingRows);
 
    const isHierarchyEnabled = settingRows[0]?.value == "1";
 
    console.log("⚙️ Hierarchy Enabled:", isHierarchyEnabled);
 
    // 3️⃣ BUILD DATE FILTER
   let dateCondition = "WHERE 1=1";
const params = [];
 
if (startDate && endDate) {
  dateCondition += " AND DATE(pr.created_at) BETWEEN ? AND ?";
  params.push(startDate, endDate);
} else if (startDate) {
  dateCondition += " AND DATE(pr.created_at) >= ?";
  params.push(startDate);
} else if (endDate) {
  dateCondition += " AND DATE(pr.created_at) <= ?";
  params.push(endDate);
}
 
 
    console.log("📌 Date Condition SQL:", dateCondition);
    console.log("📌 Date Params:", params);
 
    // 4️⃣ HIERARCHY LOGIC
//     let roleCondition = "";
//     console.log("🔍 Evaluating hierarchy rules...");
 
//     if (isHierarchyEnabled && (role === "publisher" || role === "publisher_manager" || role === "pub_executive")) {
//       console.log("🟠 Applying publisher hierarchy logic...");
 
//       if (role === "publisher_manager") {
//         roleCondition = `
       
 
//           AND (
//   pr.pub_name IN (
//     SELECT username
//     FROM login
//     WHERE role IN ('publisher', 'pub_executive', 'publisher_manager')
//   )
// )
//         `;
//       } else {
//         roleCondition = ` AND pr.pub_name = '${username}' `;
//       }
//     } else {
//       console.log("🟢 No hierarchy applied.");
//     }
 
const { getAccessibleUserIds } = require('./utils/accessControl'); // adjust path
 
// 4️⃣ HIERARCHY LOGIC (UPDATED WITH CENTRALIZED FUNCTION)
let roleCondition = "";
console.log("🔍 Evaluating hierarchy rules...");
 
if (isHierarchyEnabled && (role === "publisher" || role === "publisher_manager" || role === "pub_executive")) {
  console.log("🟠 Applying publisher hierarchy logic (CENTRALIZED)...");
 
  // 🔥 1️⃣ Get accessible user IDs
  const accessibleIds = await getAccessibleUserIds(db, id);
 
  console.log("✅ Accessible User IDs:", accessibleIds);
 
  let usernames = [];
  if (accessibleIds.length > 0) {
    // 🔥 2️⃣ Convert IDs → usernames
    const placeholders = accessibleIds.map(() => '?').join(',');
 
    const [users] = await db.query(
      `SELECT username FROM login WHERE id IN (${placeholders})`,
      accessibleIds
    );
 
    usernames = users.map(u => u.username);
    console.log("✅ Accessible Usernames:", usernames);
  }
 
  if (role === "publisher" || role === "pub_executive") {
    // 🔥 3️⃣ Also fetch campaign IDs mapped to this user in campaign_publisher_map
    const [mapRows] = await db.query(
      `SELECT campaign_id FROM campaign_publisher_map WHERE userid = ?`,
      [id]
    );
    const mappedCampaignIds = mapRows.map(r => r.campaign_id);
    console.log("✅ Mapped Campaign IDs from campaign_publisher_map:", mappedCampaignIds);
 
    const hasPubNames  = usernames.length > 0;
    const hasMappedIds = mappedCampaignIds.length > 0;
 
    if (hasPubNames && hasMappedIds) {
      const usernamePlaceholders = usernames.map(() => '?').join(',');
      roleCondition = ` AND (pr.pub_name IN (${usernamePlaceholders}) OR JSON_OVERLAPS(pr.campaign_ids, ?)) `;
      params.push(...usernames, JSON.stringify(mappedCampaignIds));
    } else if (hasPubNames) {
      const usernamePlaceholders = usernames.map(() => '?').join(',');
      roleCondition = ` AND pr.pub_name IN (${usernamePlaceholders}) `;
      params.push(...usernames);
    } else if (hasMappedIds) {
      roleCondition = ` AND JSON_OVERLAPS(pr.campaign_ids, ?) `;
      params.push(JSON.stringify(mappedCampaignIds));
    } else {
      roleCondition = ` AND 1=0 `;
    }
 
  } else {
    if (usernames.length > 0) {
      const usernamePlaceholders = usernames.map(() => '?').join(',');
      roleCondition = ` AND pr.pub_name IN (${usernamePlaceholders}) `;
      params.push(...usernames);
    } else {
      roleCondition = ` AND 1=0 `;
    }
  }
 
} else {
  console.log("🟢 No hierarchy applied.");
}
 
    console.log("📌 Role Condition SQL:", roleCondition);
 
    // -------------------------------------------
    // 5️⃣ MAIN QUERY
    // -------------------------------------------
    const finalSQL = `
      SELECT
        pr.*,
        (
          SELECT GROUP_CONCAT(p.priority ORDER BY p.priority)
          FROM (
            SELECT 1 AS priority UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION
            SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10 UNION
            SELECT 11 UNION SELECT 12 UNION SELECT 13 UNION SELECT 14 UNION SELECT 15
          ) p
          WHERE p.priority NOT IN (
            SELECT priority
            FROM pub_req
            WHERE campaign_name = pr.campaign_name
              AND created_at >= NOW() - INTERVAL 24 HOUR
          )
          AND p.priority NOT IN (
            SELECT priority
            FROM pub_req
            WHERE campaign_name = pr.campaign_name
              AND pid = pr.pid
              AND prm = 0
          )
        ) AS available_priorities
      FROM pub_req pr
      ${dateCondition}
      ${roleCondition}
      ORDER BY pr.created_at DESC
    `;
 
  
 
    // const [rows] = await db.query(finalSQL, params);
 
    const [rows] = await db.query(finalSQL, params);
 
    // -------------------------------------------
    // 6️⃣ PRIORITY PROCESS
    // -------------------------------------------
    const updatedRows = rows.map(r => {
      const available = r.available_priorities
        ? r.available_priorities.split(',').map(Number)
        : [];
 
      const allPriorities = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15];
      return { ...r, available_priorities: available.length ? available : allPriorities };
    });
 
   
 
    if (updatedRows.length === 0) {
      console.log("⚠️ No data found for this user/date/hierarchy.");
    }
 
    res.status(200).json({ success: true, data: updatedRows });
 
  } catch (error) {
    console.error("❌ ERROR in getAllPubRequests12:");
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});


app.get('/fffgetAllPubRequests12', async (req, res) => {
  try {
    console.log("\n\n==============================");
    console.log("🔵 NEW REQUEST: Get All Pub Requests");
    console.log("==============================");

    const { startDate, endDate, id } = req.query;

    console.log("📥 Query Received:", req.query);

    if (!id) {
      console.log("❌ Missing ID");
      return res.status(400).json({ success: false, message: "user_id is required" });
    }

    console.log("📅 Date Filter:", { startDate, endDate });

    // 1️⃣ GET USER DATA
    console.log("🔍 Fetching user info...");
    const [userRows] = await db.query(
      "SELECT id, role, username FROM login WHERE id = ?",
      [id]
    );

    console.log("👤 User Query Result:", userRows);

    if (userRows.length === 0) {
      console.log("❌ Invalid user_id (No user found)");
      return res.status(404).json({ success: false, message: "Invalid user_id" });
    }

    const role = userRows[0].role;
    const username = userRows[0].username;

    console.log("👤 User Role:", role, "| Username:", username);

    // 2️⃣ CHECK SETTINGS
    console.log("🔍 Checking hierarchy setting...");
    const [settingRows] = await db.query(
      "SELECT value FROM settings WHERE setting_key='reqhierarchy_view'"
    );

    console.log("⚙️ Setting Rows:", settingRows);

    const isHierarchyEnabled = settingRows[0]?.value == "1";

    console.log("⚙️ Hierarchy Enabled:", isHierarchyEnabled);

    // 3️⃣ BUILD DATE FILTER
    let dateCondition = "";
    const params = [];

    if (startDate && endDate) {
      dateCondition = "WHERE DATE(pr.created_at) BETWEEN ? AND ?";
      params.push(startDate, endDate);
    } else if (startDate) {
      dateCondition = "WHERE DATE(pr.created_at) >= ?";
      params.push(startDate);
    } else if (endDate) {
      dateCondition = "WHERE DATE(pr.created_at) <= ?";
      params.push(endDate);
    }

    console.log("📌 Date Condition SQL:", dateCondition);
    console.log("📌 Date Params:", params);

    // 4️⃣ HIERARCHY LOGIC
    let roleCondition = "";
    console.log("🔍 Evaluating hierarchy rules...");

    if (isHierarchyEnabled && (role === "publisher" || role === "publisher_manager" || role === "pub_executive")) {
      console.log("🟠 Applying publisher hierarchy logic...");

      if (role === "publisher_manager") {
        roleCondition = `
                 AND (
  pr.pub_name IN (
    SELECT username 
    FROM login 
    WHERE role IN ('publisher', 'pub_executive', 'publisher_manager')
  )
)
        `;
      } else {
        roleCondition = ` AND pr.pub_name = '${username}' `;
      }
    } else {
      console.log("🟢 No hierarchy applied.");
    }

    console.log("📌 Role Condition SQL:", roleCondition);

    // -------------------------------------------
    // 5️⃣ MAIN QUERY
    // -------------------------------------------
    const finalSQL = `
      SELECT 
        pr.*,
        (
          SELECT GROUP_CONCAT(p.priority ORDER BY p.priority)
          FROM (
            SELECT 1 AS priority UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION 
            SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10 UNION 
            SELECT 11 UNION SELECT 12 UNION SELECT 13 UNION SELECT 14 UNION SELECT 15
          ) p
          WHERE p.priority NOT IN (
            SELECT priority
            FROM pub_req
            WHERE campaign_name = pr.campaign_name
              AND created_at >= NOW() - INTERVAL 24 HOUR
          )
          AND p.priority NOT IN (
            SELECT priority
            FROM pub_req
            WHERE campaign_name = pr.campaign_name
              AND pid = pr.pid
              AND prm = 0
          )
        ) AS available_priorities
      FROM pub_req pr
      ${dateCondition}
      ${roleCondition}
      ORDER BY pr.created_at DESC
    `;

  

    const [rows] = await db.query(finalSQL, params);

   

    // -------------------------------------------
    // 6️⃣ PRIORITY PROCESS
    // -------------------------------------------
    const updatedRows = rows.map(r => {
      const available = r.available_priorities
        ? r.available_priorities.split(',').map(Number)
        : [];

      const allPriorities = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15];
      return { ...r, available_priorities: available.length ? available : allPriorities };
    });

   

    if (updatedRows.length === 0) {
      console.log("⚠️ No data found for this user/date/hierarchy.");
    }

    res.status(200).json({ success: true, data: updatedRows });

  } catch (error) {
    console.error("❌ ERROR in getAllPubRequests12:");
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Pub Request by ID API
app.get('/getPubRequest/:pub_name', async (req, res) => {
  const pub_name = req.params.pub_name;

  try {
    console.log(`🔵 Get Pub Request Received for ID: ${pub_name}`);

    const [rows] = await db.query(`SELECT * FROM pub_req WHERE pub_name = ?`, [pub_name]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No pub request found with ID ${pub_name}`
      });
    }

    console.log(`✅ Pub Request found for ID ${pub_name}`);

    res.status(200).json({
      success: true,
      data: rows
    });

  } catch (error) {
    console.error(`❌ Error in getPubRequestById for ID ${pub_name}:`, error);
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
});

// Get Pub Request by ID API
app.get('/getPubRequestss/:adv_name', async (req, res) => {
  const adv_name = req.params.adv_name;

  try {
    console.log(`🔵 Get Pub Request Received for ID: ${adv_name}`);

    // Added condition prm = 1
    const [rows] = await db.query(
      `SELECT * FROM pub_req WHERE adv_name = ? AND prm = 1`,
      [adv_name]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No pub request found with name ${adv_name} and prm = 1`
      });
    }

    console.log(`✅ Pub Request found for name ${adv_name} with prm = 1`);

    res.status(200).json({
      success: true,
      data: rows
    });

  } catch (error) {
    console.error(`❌ Error in getPubRequestById for ID ${adv_name}:`, error);
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
});

// Update Pub Request API
// Update Pub Request API
app.put('/updatePubprm', async (req, res) => {
  try {
   

    const { id, campaign_name, pid, priority, prm } = req.body;

    if (!id || !campaign_name) {
      return res.status(400).json({
        success: false,
        message: "ID, campaign_name are required"
      });
    }
    console.log(`🟡 Update Pub Request Received for ID: ${id} | Campaign: ${campaign_name} | PID: ${pid} | Priority: ${priority} | PRM: ${prm}`);

    // 1️⃣ Check if same priority exists for this campaign
    const [existing] = await db.query(
      `SELECT id, prm, created_at 
       FROM pub_req 
       WHERE campaign_name = ? 
         AND priority = ? 
         AND id != ?`,
      [campaign_name, priority, id]
    );

//     if (existing.length > 0) {
//       const conflict = existing[0];

//       // Check age of conflicting record
//       // const createdAt = new Date(conflict.created_at);
//       const createdAtStr = conflict.created_at;

// if (!createdAtStr) {
//   console.log("⚠️ Missing created_at:", conflict);
//   // continue;
// }

// const createdAt = new Date(createdAtStr.replace(' ', 'T'));

// if (isNaN(createdAt)) {
//   console.log("❌ Invalid date:", createdAtStr);
//   // continue;
// }
//       const now = new Date();
//       const diffHours = (now - createdAt) / (1000 * 60 * 60);

//       if (conflict.prm === 0) {
//         // ❌ If not approved → still blocking
//         return res.status(400).json({
//           success: false,
//           message: `Priority ${priority} already assigned to another PID (not approved yet)`
//         });
//       }

//       if (conflict.prm === 1 && diffHours < 24) {
//         // ❌ If approved but within 48h → still blocking
//         return res.status(400).json({
//           success: false,
//           message: `Priority ${priority} is in use and cannot be reused until 48h have passed`
//         });
//       }

//       // ✅ If prm=1 and older than 48h → we can reuse this priority
//     }

    // 2️⃣ Update record
    
    console.log("🔍 Checking conflicts:", {
      campaign_name,
      priority,
      totalConflicts: existing.length
    });
    if (existing.length > 0) {
      const now = new Date();
    
      for (let conflict of existing) {
        const createdAtStr = conflict.created_at;
    
        if (!createdAtStr) {
          console.log("⚠️ Missing created_at:", conflict);
          continue;
        }
    
        // const createdAt = new Date(createdAtStr.replace(' ', 'T'));
        let createdAt;

if (createdAtStr instanceof Date) {
  // ✅ Already a Date object (your current case)
  createdAt = createdAtStr;
} 
else if (typeof createdAtStr === "string") {
  // ✅ Convert string safely
  createdAt = new Date(createdAtStr.replace(' ', 'T'));
} 
else {
  console.log("❌ Invalid created_at format:", createdAtStr);
  continue;
}

if (isNaN(createdAt)) {
  console.log("❌ Invalid date after parsing:", createdAtStr);
  continue;
}
    
        if (isNaN(createdAt)) {
          console.log("❌ Invalid date:", createdAtStr);
          continue;
        }
    
        const diffHours = (now - createdAt) / (1000 * 60 * 60);
    
        // ❌ Block if not approved
        // if (conflict.prm === 0) {
        //   return res.status(400).json({
        //     success: false,
        //     message: `Priority ${priority} already assigned (not approved)`
        //   });
        // }

        if (diffHours < 24) {
          return res.status(400).json({
            success: false,
            message: `Priority ${priority} is locked for 24 hours`
          });
        }
    
        // ❌ Block if approved but within time limit
        // if (conflict.prm === 1 && diffHours < 24) {
        //   return res.status(400).json({
        //     success: false,
        //     message: `Priority ${priority} locked for 24 hours`
        //   });
        // }
      }
    }
    const [result] = await db.query(
      `UPDATE pub_req 
       SET pid = ?, priority = ?, prm = ?
       WHERE id = ?`,
      [pid, priority, prm, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "No pub request found with the given ID"
      });
    }

    console.log("✅ Pub Request Updated Successfully");

    // Emit event
    const io = req.app.locals.io;
    io.emit('pub_request_updated', { id });

    res.status(200).json({
      success: true,
      message: "Pub request updated successfully"
    });

  } catch (error) {
    console.error("❌ Error in updatePubRequest:", error);
    res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
});


// ✅ Import routes
//const userRoutes = require("./routes/userRoutes");
//app.use("/api", userRoutes);

// ✅ Import routes
const userRoutes = require("./routes/userRoutes");
const emailRoute  = require("./routes/email");
// Import routes
const countRoutes = require("./routes/counts.routes");

// Mount routes
app.use("/api", countRoutes);

app.use("/api", userRoutes);
app.use("/api/email", emailRoute);
// Socket.io connection
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);
  socket.emit("welcome", "Connected to notification system");

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});




const PORT = 5200;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
