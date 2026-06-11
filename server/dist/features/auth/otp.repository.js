"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OtpRepository = void 0;
const otp_model_1 = __importDefault(require("./otp.model"));
class OtpRepository {
    async create(userId, codeHash, purpose, expiresAt) {
        const otp = new otp_model_1.default({ userId, codeHash, purpose, expiresAt });
        return otp.save();
    }
    async findLatestByUserId(userId, purpose) {
        return otp_model_1.default.findOne({ userId, purpose, expiresAt: { $gt: new Date() }, used: false })
            .sort({ createdAt: -1 })
            .exec();
    }
    async markUsed(id) {
        await otp_model_1.default.findByIdAndUpdate(id, { $set: { used: true } }).exec();
    }
    async incrementAttempts(id) {
        await otp_model_1.default.findByIdAndUpdate(id, { $inc: { attempts: 1 } }).exec();
    }
    async invalidateAllForUser(userId, purpose) {
        await otp_model_1.default.updateMany({ userId, purpose, used: false }, { $set: { used: true } }).exec();
    }
}
exports.OtpRepository = OtpRepository;
exports.default = OtpRepository;
