const db = require('../db/Connection');
const { io } = require("../index"); // Import Socket.IO instance

// Function to fetch the latest balance (No Transaction, No Update)
const getUpdatedBalance = async (userId) => {
    try {
        // Fetch the current balance from the Wallet table
        const [balanceResult] = await db.query("SELECT balance FROM Wallet WHERE user_id = ?", [userId]);

        if (balanceResult.length === 0) {
            return { success: false, error: "Wallet not found" };
        }

        const balance = balanceResult[0].balance;

        // Emit a real-time balance update event to the frontend
        io.to(userId).emit("balanceUpdated", { balance });

        return { success: true, balance };
    } catch (error) {
        console.error("Error fetching balance:", error);
        return { success: false, error: "Failed to fetch balance" };
    }
};

// Export function for use in other files
module.exports = { getUpdatedBalance };
