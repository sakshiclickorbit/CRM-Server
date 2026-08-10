const db = require('../db/Connection');
const jwt = require('jsonwebtoken');
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
require('dotenv').config();
const multer = require("multer");
const path = require("path");

const cron = require('node-cron');
const axios = require('axios');
const { transactionUtils } = require("../routes/transactionUtils"); // Import function

// const { sendNotification } = require("../socket"); // Import the function from socket.js


// Secret key for J
// WT (store this securely, e.g., in environment variables)
const JWT_SECRET = process.env.VITE_API_JWT_SECRET;

console.log("JWT_SECRET",JWT_SECRET)
// const JWT_SECRET = 'gurdeep0111';
dotenv.config();




// Create MMP Tracker Entry
exports.createMMPTracker = async (req, res) => {
    try {
        const { user_id, mmptext } = req.body;

        if (!user_id || !mmptext) {
            return res.status(400).json({ message: "User ID and MMP text are required" });
        }

        await db.query(
            "INSERT INTO mmptracker (user_id, mmptext, created_at) VALUES (?, ?, NOW())",
            [user_id, mmptext]
        );

        res.status(201).json({ success: true, message: "MMP Tracker entry created successfully" });
    } catch (error) {
        console.error("❌ Server Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Get MMP Tracker Entries by User ID
exports.getMMPTrackerByUserId = async (req, res) => {
    try {
        // const { user_id } = req.params;

        // if (!user_id) {
        //     return res.status(400).json({ message: "User ID is required" });
        // }

        const [entries] = await db.query("SELECT * FROM mmptracker");

        res.status(200).json({ success: true, data: entries });
    } catch (error) {
        console.error("❌ Server Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Edit MMP Tracker Entry
exports.editMMPTracker = async (req, res) => {
    try {
        const { id } = req.params;
        const { mmptext } = req.body;

        if (!id || !mmptext) {
            return res.status(400).json({ message: "ID and MMP text are required" });
        }

        await db.query(
            "UPDATE mmptracker SET mmptext = ? WHERE id = ?",
            [mmptext, id]
        );

        res.status(200).json({ success: true, message: "MMP Tracker entry updated successfully" });
    } catch (error) {
        console.error("❌ Server Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

