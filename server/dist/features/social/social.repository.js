"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocialRepository = void 0;
const social_model_1 = __importDefault(require("./social.model"));
const mongoose_1 = __importDefault(require("mongoose"));
class SocialRepository {
    async findAccountsByUserId(userId) {
        return social_model_1.default.find({ userId }).exec();
    }
    async findAccountById(id) {
        return social_model_1.default.findById(id).exec();
    }
    async findAccountByPlatformUsername(userId, platform, username) {
        return social_model_1.default.findOne({ userId, platform, username }).exec();
    }
    async findAccountByPlatformAndAccountId(userId, platform, accountId) {
        return social_model_1.default.findOne({ userId, platform, accountId }).exec();
    }
    async createAccount(accountData) {
        const account = new social_model_1.default(accountData);
        return account.save();
    }
    async updateAccount(id, accountData) {
        return social_model_1.default.findByIdAndUpdate(id, { $set: accountData }, { new: true }).exec();
    }
    async deleteAccount(id) {
        const result = await social_model_1.default.findByIdAndDelete(id).exec();
        return !!result;
    }
    /**
     * Deletes all associated comments and analytics records for an account
     */
    async deleteCascadeData(accountId) {
        try {
            const AnalyticsModel = mongoose_1.default.models.AnalyticsMetric || mongoose_1.default.model('AnalyticsMetric');
            const CommentModel = mongoose_1.default.models.Comment || mongoose_1.default.model('Comment');
            await AnalyticsModel.deleteMany({ accountId }).exec();
            await CommentModel.deleteMany({ accountId }).exec();
        }
        catch (error) {
            console.error(`[SocialRepository] Cascade delete failed for account ${accountId}:`, error);
        }
    }
}
exports.SocialRepository = SocialRepository;
exports.default = SocialRepository;
