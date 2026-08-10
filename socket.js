const { Server } = require("socket.io");

const io = new Server({
    cors: {
        origin: "*",
    }
});

io.on("connection", (socket) => {
    console.log("New client connected", socket.id);
    
    socket.on("disconnect", () => {
        console.log("Client disconnected", socket.id);
    });
});

module.exports = io;
