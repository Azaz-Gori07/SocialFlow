"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommentRepository = void 0;
const comment_model_1 = __importDefault(require("./comment.model"));
class CommentRepository {
    async findCommentsByAccountIds(accountIds, filters) {
        const query = { accountId: { $in: accountIds } };
        if (filters.platform) {
            query.platform = filters.platform;
        }
        if (filters.status) {
            query.status = filters.status;
        }
        if (filters.assignedTo) {
            query.assignedTo = filters.assignedTo;
        }
        // Sort newest first
        return comment_model_1.default.find(query).sort({ createdAt: -1 }).exec();
    }
    async findCommentById(id) {
        return comment_model_1.default.findById(id).exec();
    }
    async updateComment(id, updateData) {
        return comment_model_1.default.findByIdAndUpdate(id, { $set: updateData }, { new: true }).exec();
    }
    async pushReply(commentId, reply) {
        return comment_model_1.default.findByIdAndUpdate(commentId, {
            $push: { replies: reply },
            $set: { status: 'resolved' } // auto resolve upon reply
        }, { new: true }).exec();
    }
}
exports.CommentRepository = CommentRepository;
exports.default = CommentRepository;
