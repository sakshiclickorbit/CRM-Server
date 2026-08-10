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






// Create  reviews Entry
exports.createPayble = async (req, res) => {
    try {
        const { user_id, payble_event } = req.body;

        if (!user_id || !payble_event) {
            return res.status(400).json({ message: "User ID and payble event are required" });
        }

        await db.query(
            "INSERT INTO payevernts (user_id, payble_event, created_at) VALUES (?, ?, NOW())",
            [user_id, payble_event]
        );

        res.status(201).json({ success: true, message: "payble event entry created successfully" });
    } catch (error) {
        console.error("❌ Server Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};


// Get reviews Entries by User ID
exports.getPaybleevent = async (req, res) => {
    try {
        // const { user_id } = req.params;

        // if (!user_id) {
        //     return res.status(400).json({ message: "User ID is required" });
        // }

        const [entries] = await db.query("SELECT * FROM payevernts");

        res.status(200).json({ success: true, data: entries });
    } catch (error) {
        console.error("❌ Server Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Edit reviews Entry
exports.editPayble = async (req, res) => {
    try {
        const { id } = req.params;
        const { payble_event } = req.body;

        if (!id || !payble_event) {
            return res.status(400).json({ message: "ID and review text are required" });
        }

        await db.query(
            "UPDATE payevernts SET payble_event = ? WHERE id = ?",
            [payble_event, id]
        );

        res.status(200).json({ success: true, message: "payble text entry updated successfully" });
    } catch (error) {
        console.error("❌ Server Error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

