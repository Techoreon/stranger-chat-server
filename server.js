const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // In production, restrict this to your frontend's domain
        methods: ["GET", "POST"]
    }
});

let waitingUser = null;

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Logic for finding a partner
    socket.on('findPartner', () => {
        console.log(`User ${socket.id} is looking for a partner.`);
        socket.emit('status', 'Looking for a stranger...');

        if (waitingUser) {
            const partner = waitingUser;
            waitingUser = null;

            const roomName = socket.id + '#' + partner.id;
            socket.join(roomName);
            partner.join(roomName);

            console.log(`Paired ${socket.id} and ${partner.id} in room ${roomName}`);
            
            // **IMPROVEMENT:** Explicitly tell the new user to be the initiator.
            socket.emit('chatStart', { message: "You are now connected. Starting video...", initiator: true });
            partner.emit('chatStart', { message: "You are now connected. Starting video...", initiator: false });

        } else {
            waitingUser = socket;
            socket.emit('status', 'Waiting for a stranger to connect...');
        }
    });

    // Handle text messages
    socket.on('sendMessage', (data) => {
        const room = findUserRoom(socket);
        if (room) {
            socket.to(room).emit('receiveMessage', { message: data.message });
        }
    });

    // Handle typing indicators
    socket.on('typing', () => {
        const room = findUserRoom(socket);
        if (room) {
            socket.to(room).emit('partnerTyping');
        }
    });

    // --- WebRTC Signaling Relays ---
    // The server just passes these messages between the two clients in a room.
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

    // Handle leaving a chat or disconnecting
    socket.on('leaveChat', () => {
        handleDisconnect(socket);
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        handleDisconnect(socket);
    });
});

function findUserRoom(socket) {
    const rooms = Array.from(socket.rooms);
    return rooms.find(room => room !== socket.id);
}

function handleDisconnect(socket) {
    if (waitingUser === socket) {
        waitingUser = null;
        return;
    }

    const room = findUserRoom(socket);
    if (room) {
        console.log(`User ${socket.id} left room ${room}`);
        socket.to(room).emit('chatEnd', { message: "Your partner has disconnected. Find a new chat?" });
        
        // Ensure the partner is also removed from the room state on the server
        const partnerSocketId = room.split('#').find(id => id !== socket.id);
        const partnerSocket = io.sockets.sockets.get(partnerSocketId);
        if (partnerSocket) {
            partnerSocket.leave(room);
        }
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
