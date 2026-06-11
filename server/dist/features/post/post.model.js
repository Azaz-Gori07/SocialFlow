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
exports.PostModel = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const PostSchema = new mongoose_1.Schema({
    userId: { type: String, required: true, index: true },
    platforms: { type: [String], required: true },
    content: { type: String, required: true },
    platformContent: { type: mongoose_1.Schema.Types.Mixed, default: {} },
    media: { type: [String], default: [] },
    status: {
        type: String,
        required: true,
        enum: ['draft', 'scheduled', 'published', 'failed'],
        default: 'draft'
    },
    scheduledAt: { type: String },
    publishedAt: { type: String },
    failedReason: { type: String },
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
// Indexes
PostSchema.index({ userId: 1, status: 1 });
PostSchema.index({ status: 1, scheduledAt: 1 });
PostSchema.index({ userId: 1, createdAt: -1 });
exports.PostModel = mongoose_1.default.models.Post || (0, mongoose_1.model)('Post', PostSchema);
exports.default = exports.PostModel;
