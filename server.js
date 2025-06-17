const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow requests from any frontend (like InfinityFree)
        methods: ["GET", "POST"]
    }
});

// --- Core Chat Logic ---

let waitingUser = null;

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // 1. Logic for finding a partner
    socket.on('findPartner', () => {
        console.log(`User ${socket.id} is looking for a partner.`);
        socket.emit('status', 'Looking for a stranger...');

        if (waitingUser) {
            const partner = waitingUser;
            waitingUser = null;

            const roomName = socket.id + '#' + partner.id;
            socket.join(roomName);
            partner.join(roomName);

            io.to(roomName).emit('chatStart', { message: "You are now connected to a stranger. Say hi!" });
            console.log(`Paired ${socket.id} and ${partner.id} in room ${roomName}`);
        } else {
            waitingUser = socket;
            socket.emit('status', 'Waiting for a stranger to connect...');
        }
    });

    // 2. Message passing
    socket.on('sendMessage', (data) => {
        const room = findUserRoom(socket);
        if (room) {
            socket.to(room).emit('receiveMessage', { message: data.message });
        }
    });

    // 3. Typing indication
    socket.on('typing', () => {
        const room = findUserRoom(socket);
        if (room) {
            socket.to(room).emit('partnerTyping');
        }
    });

    // 4. Manual leave
    socket.on('leaveChat', () => {
        handleDisconnect(socket);
    });

    // 5. WebRTC signaling
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

    // 6. Handle disconnection
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
        socket.to(room).emit('chatEnd', { message: "Your partner has disconnected. Find a new chat?" });
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
