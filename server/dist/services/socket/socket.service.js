"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSocketIO = initSocketIO;
exports.getIO = getIO;
exports.sendNotification = sendNotification;
exports.sendUnreadCount = sendUnreadCount;
const socket_io_1 = require("socket.io");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret_socialflow_token_key_123!';
let io = null;
function initSocketIO(httpServer) {
    io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
            credentials: true,
        },
        pingTimeout: 60000,
        pingInterval: 25000,
    });
    // Authentication middleware for Socket.IO
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token || socket.handshake.query?.token;
        if (!token) {
            return next(new Error('Authentication token required'));
        }
        try {
            const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
            socket.userId = decoded.id;
            next();
        }
        catch (err) {
            return next(new Error('Invalid or expired token'));
        }
    });
    io.on('connection', (socket) => {
        console.log(`🔌 Socket connected: user=${socket.userId}, socketId=${socket.id}`);
        // Join a room specific to the user for targeted notifications
        if (socket.userId) {
            socket.join(`user:${socket.userId}`);
        }
        // Handle client-side read acknowledgement
        socket.on('notification:read', (data) => {
            if (socket.userId) {
                io?.to(`user:${socket.userId}`).emit('notification:read', data);
            }
        });
        socket.on('notification:readAll', () => {
            if (socket.userId) {
                io?.to(`user:${socket.userId}`).emit('notification:readAll', { userId: socket.userId });
            }
        });
        socket.on('disconnect', (reason) => {
            console.log(`🔌 Socket disconnected: user=${socket.userId}, socketId=${socket.id}, reason=${reason}`);
        });
    });
    return io;
}
function getIO() {
    if (!io) {
        throw new Error('Socket.IO not initialized. Call initSocketIO first.');
    }
    return io;
}
/**
 * Send a real-time notification to a specific user.
 * If the user is offline, the notification will be stored in the database
 * and delivered when they reconnect (offline recovery).
 */
function sendNotification(userId, notification) {
    if (!io) {
        console.warn('⚠️ Socket.IO not initialized. Cannot send notification.');
        return;
    }
    io.to(`user:${userId}`).emit('notification', notification);
    io.to(`user:${userId}`).emit('notifications:unread_count', { count: 1 });
}
/**
 * Send updated unread count to a user.
 */
function sendUnreadCount(userId, count) {
    if (!io) {
        return;
    }
    io.to(`user:${userId}`).emit('notifications:unread_count', { count });
}
