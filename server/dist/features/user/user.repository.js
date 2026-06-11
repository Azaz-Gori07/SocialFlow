"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserRepository = void 0;
const user_model_1 = __importDefault(require("./user.model"));
const mongoose_1 = __importDefault(require("mongoose"));
class UserRepository {
    async findByEmail(email) {
        return user_model_1.default.findOne({ email: email.toLowerCase().trim() }).exec();
    }
    async findById(id) {
        return user_model_1.default.findById(id).exec();
    }
    async findByOAuthProvider(provider, oauthProviderId) {
        return user_model_1.default.findOne({ provider, oauthProviderId }).exec();
    }
    async create(user) {
        const newUser = new user_model_1.default(user);
        return newUser.save();
    }
    async update(id, user) {
        return user_model_1.default.findByIdAndUpdate(id, { $set: user }, { new: true }).exec();
    }
    async delete(id) {
        const result = await user_model_1.default.findByIdAndDelete(id).exec();
        return !!result;
    }
    static isConnected() {
        return mongoose_1.default.connection.readyState === 1;
    }
}
exports.UserRepository = UserRepository;
exports.default = UserRepository;
