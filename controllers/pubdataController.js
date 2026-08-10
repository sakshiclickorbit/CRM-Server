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




// ✅ Add new pub_data entry
exports.addPubData = async (req, res) => {
    try {
        console.log("🟢 Add Pub Data Request Received:", req.body);

        const { 
            adv_name, campaign_name, geo, city, os, payable_event, 
            mmp_tracker, pub_id, p_id, pub_payout, shared_date, paused_date, 
            review, pub_total_numbers, pub_deductions, pub_approved_numbers,user_id
        } = req.body;

        // ✅ Insert Data into Database
        const [result] = await db.query(
            `INSERT INTO pub_data 
            (adv_name, campaign_name, geo, city, os, payable_event, 
            mmp_tracker, pub_id, p_id, pub_payout, shared_date, paused_date, 
            review, pub_total_numbers, pub_deductions, pub_approved_numbers,user_id) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?)`,
            [
                adv_name, campaign_name, geo, city, os, payable_event, 
                mmp_tracker, pub_id, p_id, pub_payout, shared_date, paused_date, 
                review, pub_total_numbers, pub_deductions, pub_approved_numbers,user_id
            ]
        );

        console.log("✅ Pub Data Added Successfully");
        res.status(201).json({ 
            success: true, 
            message: "Pub data added successfully", 
            id: result.insertId 
        });

    } catch (error) {
        console.error("❌ Server Error:", error);
        res.status(500).json({ message: "Internal server error", details: error.message });
    }
};

// ✅ Get all pub_data with username from login table
exports.getAllPubData = async (req, res) => {
    try {
        console.log("🟢 Fetching All Pub Data with Username...");

        const query = `
            SELECT pub_data.*, login.username 
            FROM pub_data 
            LEFT JOIN login ON pub_data.user_id = login.id
        `;

        const [results] = await db.query(query);

        // ✅ Check if data exists
        if (!results.length) {
            return res.status(404).json({
                success: false,
                message: "No pub data found."
            });
        }

        console.log("✅ Data Retrieved Successfully");
        res.status(200).json({
            success: true,
            data: results
        });

    } catch (error) {
        console.error("❌ Server Error:", error);

        // ✅ Check for specific database errors
        if (error.code === "ER_NO_SUCH_TABLE") {
            return res.status(500).json({
                success: false,
                message: "Database table not found.",
                error: error.message
            });
        } else if (error.code === "ER_BAD_FIELD_ERROR") {
            return res.status(500).json({
                success: false,
                message: "Invalid column name in query.",
                error: error.message
            });
        }

        // ✅ Generic server error
        res.status(500).json({
            success: false,
            message: "Internal server error.",
            error: error.message
        });
    }
};


exports.getPubDataByUserId = async (req, res) => {
    try {
        console.log("🟢 Fetching Pub Data for User ID:", req.params.id);

        const [results] = await db.query(`SELECT * FROM pub_data WHERE user_id = ?`, [req.params.id]);

        if (results.length === 0) {
            console.warn("⚠️ No Pub Data Found for User ID:", req.params.id);
            return res.status(404).json({ message: "No pub data found for this user" });
        }

        console.log(`✅ Retrieved ${results.length} records for User ID:`, req.params.id);
        res.status(200).json(results);

    } catch (error) {
        console.error("❌ Server Error:", error);
        res.status(500).json({ message: "Internal server error", details: error.message });
    }
};


// ✅ Update pub_data by ID
exports.updatePubData = async (req, res) => {
    try {
        console.log("🟢 Updating Pub Data:", req.params.id, req.body);

        const { 
            adv_name, campaign_name, geo, city, os, payable_event, 
            mmp_tracker, pub_id, p_id, pub_payout, shared_date, paused_date, 
            review, pub_total_numbers, pub_deductions, pub_approved_numbers 
        } = req.body;

        const [result] = await db.query(
            `UPDATE pub_data SET 
            adv_name = ?, campaign_name = ?, geo = ?, city = ?, os = ?, 
            payable_event = ?, mmp_tracker = ?, pub_id = ?, p_id = ?, pub_payout = ?, 
            shared_date = ?, paused_date = ?, review = ?, pub_total_numbers = ?, 
            pub_deductions = ?, pub_approved_numbers = ? 
            WHERE id = ?`,
            [
                adv_name, campaign_name, geo, city, os, payable_event, 
                mmp_tracker, pub_id, p_id, pub_payout, shared_date, paused_date, 
                review, pub_total_numbers, pub_deductions, pub_approved_numbers, req.params.id
            ]
        );

        if (result.affectedRows === 0) {
            console.warn("⚠️ No Data Found to Update");
            return res.status(404).json({ message: "Pub data not found" });
        }

        console.log("✅ Pub Data Updated Successfully");
        res.status(200).json({ success: true, message: "Pub data updated successfully" });

    } catch (error) {
        console.error("❌ Server Error:", error);
        res.status(500).json({ message: "Internal server error", details: error.message });
    }
};

// ✅ Delete pub_data by ID
exports.deletePubData = async (req, res) => {
    try {
        console.log("🟢 Deleting Pub Data:", req.params.id);

        const [result] = await db.query(`DELETE FROM pub_data WHERE id = ?`, [req.params.id]);

        if (result.affectedRows === 0) {
            console.warn("⚠️ No Data Found to Delete");
            return res.status(404).json({ message: "Pub data not found" });
        }

        console.log("✅ Pub Data Deleted Successfully");
        res.status(200).json({ success: true, message: "Pub data deleted successfully" });

    } catch (error) {
        console.error("❌ Server Error:", error);
        res.status(500).json({ message: "Internal server error", details: error.message });
    }
};


// // Add new pub request entry to pub_req table
// exports.addPubRequest = async (req, res) => {
//     try {
//         console.log("🟢 Add Pub Request Received:", req.body);

//         const { adv_name, campaign_name, payout, os } = req.body;

//         // ✅ Insert data into pub_req table
//         const [result] = await db.query(
//             `INSERT INTO pub_req (adv_name, campaign_name, payout, os) VALUES (?, ?, ?, ?)`,
//             [adv_name, campaign_name, payout, os]
//         );

//         console.log("✅ Pub Request Added Successfully");

//         res.status(201).json({
//             success: true,
//             message: "Pub request added successfully",
//             id: result.insertId
//         });

//     } catch (error) {
//         console.error("❌ Error in addPubRequest:", error);
//         res.status(500).json({ success: false, message: "Internal server error", error: error.message });
//     }
// };

// // Update adv_res in pub_req table
// exports.updateAdvRes = async (req, res) => {
//     try {
//         console.log("🟡 Update adv_res Request Received:", req.body);

//         const { id, adv_res } = req.body;

//         if (!id || adv_res === undefined) {
//             return res.status(400).json({
//                 success: false,
//                 message: "ID and adv_res are required"
//             });
//         }

//         const [result] = await db.query(
//             `UPDATE pub_req SET adv_res = ? WHERE id = ?`,
//             [adv_res, id]
//         );

//         if (result.affectedRows === 0) {
//             return res.status(404).json({
//                 success: false,
//                 message: "No pub request found with the given ID"
//             });
//         }

//         console.log("✅ adv_res Updated Successfully");

//         res.status(200).json({
//             success: true,
//             message: "adv_res updated successfully"
//         });

//     } catch (error) {
//         console.error("❌ Error in updateAdvRes:", error);
//         res.status(500).json({ success: false, message: "Internal server error", error: error.message });
//     }
// };

// // Get all entries from pub_req table
// exports.getAllPubRequests = async (req, res) => {
//     try {
//         console.log("🔵 Get All Pub Requests Received");

//         const [rows] = await db.query(`SELECT * FROM pub_req`);

//         if (rows.length === 0) {
//             return res.status(404).json({
//                 success: false,
//                 message: "No pub requests found"
//             });
//         }

//         console.log(`✅ Fetched ${rows.length} Pub Requests`);

//         res.status(200).json({
//             success: true,
//             data: rows
//         });

//     } catch (error) {
//         console.error("❌ Error in getAllPubRequests:", error);
//         res.status(500).json({ success: false, message: "Internal server error", error: error.message });
//     }
// };
// controllers/pubdataController.js




// // Add new pub request entry to pub_req table
// exports.addPubRequest = async (req, res) => {
//     try {
//         console.log("🟢 Add Pub Request Received:", req.body);

//         const { adv_name, campaign_name, payout, os } = req.body;

//         const [result] = await db.query(
//             `INSERT INTO pub_req (adv_name, campaign_name, payout, os) VALUES (?, ?, ?, ?)`,
//             [adv_name, campaign_name, payout, os]
//         );

//         console.log("✅ Pub Request Added Successfully");

//         // ✅ Emit event
//         const io = req.app.get('io');
//         io.emit('pub_request_added', {
//             id: result.insertId,
//             adv_name,
//             campaign_name,
//             payout,
//             os
//         });

//         res.status(201).json({
//             success: true,
//             message: "Pub request added successfully",
//             id: result.insertId
//         });

//     } catch (error) {
//         console.error("❌ Error in addPubRequest:", error);
//         res.status(500).json({ success: false, message: "Internal server error", error: error.message });
//     }
// };

// // Update adv_res in pub_req table
// exports.updateAdvRes = async (req, res) => {
//     try {
//         console.log("🟡 Update adv_res Request Received:", req.body);

//         const { id, adv_res } = req.body;

//         if (!id || adv_res === undefined) {
//             return res.status(400).json({
//                 success: false,
//                 message: "ID and adv_res are required"
//             });
//         }

//         const [result] = await db.query(
//             `UPDATE pub_req SET adv_res = ? WHERE id = ?`,
//             [adv_res, id]
//         );

//         if (result.affectedRows === 0) {
//             return res.status(404).json({
//                 success: false,
//                 message: "No pub request found with the given ID"
//             });
//         }

//         console.log("✅ adv_res Updated Successfully");

//         // ✅ Emit event
//         const io = req.app.get('io');
//         io.emit('adv_res_updated', { id, adv_res });

//         res.status(200).json({
//             success: true,
//             message: "adv_res updated successfully"
//         });

//     } catch (error) {
//         console.error("❌ Error in updateAdvRes:", error);
//         res.status(500).json({ success: false, message: "Internal server error", error: error.message });
//     }
// };

// // No socket needed for GET API unless you want to emit on demand
// exports.getAllPubRequests = async (req, res) => {
//     try {
//         console.log("🔵 Get All Pub Requests Received");

//         const [rows] = await db.query(`SELECT * FROM pub_req`);

//         if (rows.length === 0) {
//             return res.status(404).json({
//                 success: false,
//                 message: "No pub requests found"
//             });
//         }

//         console.log(`✅ Fetched ${rows.length} Pub Requests`);

//         res.status(200).json({
//             success: true,
//             data: rows
//         });

//     } catch (error) {
//         console.error("❌ Error in getAllPubRequests:", error);
//         res.status(500).json({ success: false, message: "Internal server error", error: error.message });
//     }
// };



// Send message from Publisher to Advertiser (no DB, just acknowledge)
exports.sendPubMessage = async (req, res) => {
    try {
        console.log("📩 Message from Publisher to Advertiser received");

        const { publisherId, advertiserId, message } = req.body;

        if (!publisherId || !advertiserId || !message) {
            return res.status(400).json({
                success: false,
                message: "publisherId, advertiserId, and message are required."
            });
        }

        // Simulate sending/receiving notification
        console.log(`🟢 Publisher ${publisherId} sent to Advertiser ${advertiserId}: "${message}"`);

        res.status(200).json({
            success: true,
            message: "Message received by advertiser."
        });

    } catch (error) {
        console.error("❌ Error in sendPubMessage:", error);
        res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message
        });
    }
};
