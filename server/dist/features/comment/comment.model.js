"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommentModel = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const CommentReplySchema = new mongoose_1.Schema({
    author: {
        username: { type: String, required: true },
        displayName: { type: String },
        avatarUrl: { type: String },
        isSystemUser: { type: Boolean, default: false }
    },
    message: { type: String, required: true },
    createdAt: { type: String, default: () => new Date().toISOString() }
});
const CommentSchema = new mongoose_1.Schema({
    platform: { type: String, required: true },
    accountId: { type: String, required: true, index: true },
    postId: { type: String, required: true, index: true },
    postTitle: { type: String },
    author: {
        username: { type: String, required: true },
        displayName: { type: String },
        avatarUrl: { type: String }
    },
    message: { type: String, required: true },
    status: { type: String, required: true, enum: ['unresolved', 'resolved'], default: 'unresolved' },
    assignedTo: { type: String, index: true },
    replies: { type: [CommentReplySchema], default: [] },
    createdAt: { type: String, default: () => new Date().toISOString() }
}, {
    timestamps: false,
    toJSON: {
        virtuals: true,
        transform: (doc, ret) => {
            ret._id = ret._id.toString();
            delete ret.__v;
            return ret;
        }
    },
    toObject: { virtuals: true }
});
exports.CommentModel = mongoose_1.default.models.Comment || mongoose_1.default.model('Comment', CommentSchema);
exports.default = exports.CommentModel;
