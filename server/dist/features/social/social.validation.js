"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.accountIdSchema = exports.callbackSchema = exports.connectPlatformSchema = void 0;
const zod_1 = require("zod");
const platformEnum = zod_1.z.enum(['twitter', 'x', 'linkedin', 'youtube', 'google'], {
    message: "Platform must be one of: 'twitter', 'x', 'linkedin', or 'youtube'"
});
exports.connectPlatformSchema = zod_1.z.object({
    platform: platformEnum
});
exports.callbackSchema = zod_1.z.object({
    code: zod_1.z.string().min(1, 'Authorization code is required'),
    state: zod_1.z.string().min(1, 'OAuth state is required')
});
exports.accountIdSchema = zod_1.z.object({
    id: zod_1.z.string().min(1, 'Social account ID is required')
});
