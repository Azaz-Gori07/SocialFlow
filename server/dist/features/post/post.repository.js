"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostRepository = void 0;
const post_model_1 = __importDefault(require("./post.model"));
class PostRepository {
    async findPostById(id) {
        return post_model_1.default.findById(id).exec();
    }
    async findPostsByUserId(userId) {
        return post_model_1.default.find({ userId }).exec();
    }
    /**
     * P1.7: Paginated posts query.
     * Returns items + total count for client-side pagination.
     */
    async findPostsByUserIdPaginated(userId, options) {
        const query = { userId };
        if (options.status) {
            query.status = options.status;
        }
        const [items, total] = await Promise.all([
            post_model_1.default.find(query)
                .sort({ createdAt: -1 })
                .skip(options.offset)
                .limit(options.limit)
                .exec(),
            post_model_1.default.countDocuments(query).exec()
        ]);
        return {
            items,
            total,
            limit: options.limit,
            offset: options.offset
        };
    }
    async createPost(postData) {
        const post = new post_model_1.default(postData);
        return post.save();
    }
    async updatePost(id, postData) {
        return post_model_1.default.findByIdAndUpdate(id, { $set: postData }, { new: true }).exec();
    }
    async deletePost(id) {
        const result = await post_model_1.default.findByIdAndDelete(id).exec();
        return !!result;
    }
}
exports.PostRepository = PostRepository;
exports.default = PostRepository;
