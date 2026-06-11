"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postIdSchema = exports.updatePostSchema = exports.createPostSchema = exports.createPostBaseSchema = void 0;
const zod_1 = require("zod");
const platformEnum = zod_1.z.enum(['twitter', 'instagram', 'facebook', 'linkedin', 'youtube', 'tiktok']);
exports.createPostBaseSchema = zod_1.z.object({
    content: zod_1.z.string().min(1, 'Post content is required'),
    platforms: zod_1.z.array(platformEnum).min(1, 'At least one social platform must be selected'),
    status: zod_1.z.enum(['draft', 'scheduled']).default('draft'),
    scheduledAt: zod_1.z.string().optional().refine((val) => {
        if (!val)
            return true;
        // Must be a future date
        return new Date(val).getTime() > Date.now();
    }, {
        message: 'Scheduled publishing date must be in the future'
    }),
    media: zod_1.z.array(zod_1.z.string()).optional().default([]),
    platformContent: zod_1.z.record(zod_1.z.string(), zod_1.z.string()).optional().default({})
});
exports.createPostSchema = exports.createPostBaseSchema.refine((data) => {
    // If status is scheduled, scheduledAt must be provided
    if (data.status === 'scheduled' && !data.scheduledAt) {
        return false;
    }
    return true;
}, {
    message: 'Scheduled publishing date is required for scheduled posts',
    path: ['scheduledAt']
});
exports.updatePostSchema = exports.createPostBaseSchema.partial();
exports.postIdSchema = zod_1.z.object({
    id: zod_1.z.string().min(1, 'Post ID is required')
});
