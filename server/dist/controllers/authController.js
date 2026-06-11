"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_1 = require("../database/db");
const auth_1 = require("../middleware/auth");
exports.AuthController = {
    register: async (req, res) => {
        try {
            const { email, password, fullName } = req.body;
            if (!email || !password || !fullName) {
                return res.status(400).json({ message: 'All fields are required' });
            }
            // Check if user exists
            const existingUser = await db_1.db.users.findOne({ email: email.toLowerCase() });
            if (existingUser) {
                return res.status(400).json({ message: 'User with this email already exists' });
            }
            // Hash password
            const salt = await bcryptjs_1.default.genSalt(10);
            const passwordHash = await bcryptjs_1.default.hash(password, salt);
            // Create user
            const user = await db_1.db.users.create({
                email: email.toLowerCase(),
                passwordHash,
                fullName,
                avatarUrl: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(fullName)}`
            });
            // Automatically create a default workspace for the user
            const workspace = await db_1.db.workspaces.create({
                name: `${fullName}'s Workspace`,
                ownerId: user._id
            });
            // Add user as Owner to the workspace
            await db_1.db.workspaceMembers.create({
                workspaceId: workspace._id,
                userId: user._id,
                role: 'owner'
            });
            // Generate tokens
            const payload = { id: user._id, email: user.email };
            const accessToken = (0, auth_1.generateAccessToken)(payload);
            const refreshToken = (0, auth_1.generateRefreshToken)(payload);
            return res.status(201).json({
                message: 'Registration successful',
                accessToken,
                refreshToken,
                user: {
                    id: user._id,
                    email: user.email,
                    fullName: user.fullName,
                    avatarUrl: user.avatarUrl
                },
                workspace: {
                    id: workspace._id,
                    name: workspace.name,
                    role: 'owner'
                }
            });
        }
        catch (error) {
            console.error('Registration error', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    },
    login: async (req, res) => {
        try {
            const { email, password } = req.body;
            if (!email || !password) {
                return res.status(400).json({ message: 'Email and password are required' });
            }
            const user = await db_1.db.users.findOne({ email: email.toLowerCase() });
            if (!user) {
                return res.status(400).json({ message: 'Invalid email or password' });
            }
            const isMatch = await bcryptjs_1.default.compare(password, user.passwordHash);
            if (!isMatch) {
                return res.status(400).json({ message: 'Invalid email or password' });
            }
            // Fetch primary/first workspace
            const memberRecord = await db_1.db.workspaceMembers.findOne({ userId: user._id });
            let workspace = null;
            if (memberRecord) {
                workspace = await db_1.db.workspaces.findById(memberRecord.workspaceId);
            }
            const payload = { id: user._id, email: user.email };
            const accessToken = (0, auth_1.generateAccessToken)(payload);
            const refreshToken = (0, auth_1.generateRefreshToken)(payload);
            return res.json({
                message: 'Login successful',
                accessToken,
                refreshToken,
                user: {
                    id: user._id,
                    email: user.email,
                    fullName: user.fullName,
                    avatarUrl: user.avatarUrl
                },
                workspace: workspace ? {
                    id: workspace._id,
                    name: workspace.name,
                    role: memberRecord?.role || 'viewer'
                } : null
            });
        }
        catch (error) {
            console.error('Login error', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    },
    refresh: async (req, res) => {
        try {
            const { refreshToken } = req.body;
            if (!refreshToken) {
                return res.status(400).json({ message: 'Refresh token is required' });
            }
            const decoded = (0, auth_1.verifyRefreshToken)(refreshToken);
            if (!decoded) {
                return res.status(401).json({ message: 'Invalid or expired refresh token' });
            }
            const user = await db_1.db.users.findById(decoded.id);
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }
            const payload = { id: user._id, email: user.email };
            const newAccessToken = (0, auth_1.generateAccessToken)(payload);
            const newRefreshToken = (0, auth_1.generateRefreshToken)(payload);
            return res.json({
                accessToken: newAccessToken,
                refreshToken: newRefreshToken
            });
        }
        catch (error) {
            console.error('Token refresh error', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    },
    logout: async (req, res) => {
        // Statelss JWT logout, client will clear token locally
        return res.json({ message: 'Logged out successfully' });
    },
    me: async (req, res) => {
        try {
            if (!req.user) {
                return res.status(401).json({ message: 'Unauthorized' });
            }
            const user = await db_1.db.users.findById(req.user.id);
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }
            return res.json({
                id: user._id,
                email: user.email,
                fullName: user.fullName,
                avatarUrl: user.avatarUrl
            });
        }
        catch (error) {
            console.error('Me endpoint error', error);
            return res.status(500).json({ message: 'Internal server error' });
        }
    }
};
