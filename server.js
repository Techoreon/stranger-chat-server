const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // In production, restrict this to your frontend's domain
        methods: ["GET", "POST"]
    }
});

// Serve the client files
app.use(express.static(path.join(__dirname, '../client')));

// --- Core Chat Logic ---

let waitingUser = null;

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // 1. Logic for finding a partner
    socket.on('findPartner', () => {
        console.log(`User ${socket.id} is looking for a partner.`);
        socket.emit('status', 'Looking for a stranger...');

        if (waitingUser) {
            // Partner found!
            const partner = waitingUser;
            waitingUser = null;

            // Create a private room
            const roomName = socket.id + '#' + partner.id;
            socket.join(roomName);
            partner.join(roomName);

            // Notify both users they are connected
            io.to(roomName).emit('chatStart', { message: "You are now connected to a stranger. Say hi!" });
            console.log(`Paired ${socket.id} and ${partner.id} in room ${roomName}`);

        } else {
            // No one is waiting, become the waiting user
            waitingUser = socket;
            socket.emit('status', 'Waiting for a stranger to connect...');
        }
    });

    // 2. Logic for handling messages
    socket.on('sendMessage', (data) => {
        // Find the room the user is in
        const room = findUserRoom(socket);
        if (room) {
            // Send message only to the other person in the room
            socket.to(room).emit('receiveMessage', { message: data.message });
        }
    });

    // 3. Logic for typing indicators
    socket.on('typing', () => {
        const room = findUserRoom(socket);
        if (room) {
            socket.to(room).emit('partnerTyping');
        }
    });

    // 4. Logic for disconnecting / finding a new partner
    socket.on('leaveChat', () => {
        handleDisconnect(socket);
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        handleDisconnect(socket);
    });

    // 5. Logic for WebRTC Signaling
    socket.on('webrtc-offer', (data) => {
        const room = findUserRoom(socket);
        if (room) {
            socket.to(room).emit('webrtc-offer', data.sdp);
        }
    });

    socket.on('webrtc-answer', (data) => {
        const room = findUserRoom(socket);
        if (room) {
            socket.to(room).emit('webrtc-answer', data.sdp);
        }
    });

    socket.on('webrtc-ice-candidate', (data) => {
        const room = findUserRoom(socket);
        if (room) {
            socket.to(room).emit('webrtc-ice-candidate', data.candidate);
        }
    });
});

function findUserRoom(socket) {
    // A socket's rooms are stored in a Set. The first room is always its own ID.
    // The second room, if it exists, is the chat room.
    const rooms = Array.from(socket.rooms);
    return rooms.find(room => room !== socket.id);
}

function handleDisconnect(socket) {
    // If the disconnecting user was the one waiting
    if (waitingUser === socket) {
        waitingUser = null;
        console.log(`Waiting user ${socket.id} disconnected.`);
        return;
    }

    // Find the room and notify the other partner
    const room = findUserRoom(socket);
    if (room) {
        console.log(`User ${socket.id} left room ${room}`);
        socket.to(room).emit('chatEnd', { message: "Your partner has disconnected. Find a new chat?" });
        // The other user is automatically removed from the room by Socket.IO on their disconnect
        // But if they just 'left', we need to kick them too so they can search again
        const partnerSocketId = room.split('#').find(id => id !== socket.id);
        const partnerSocket = io.sockets.sockets.get(partnerSocketId);
        if (partnerSocket) {
            partnerSocket.leave(room);
        }
    }
}


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});