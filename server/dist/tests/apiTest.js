"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = require("../database/db");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const auth_1 = require("../middleware/auth");
async function runTests() {
    console.log('🧪 Starting SocialFlow Backend Test Suite...');
    let passedCount = 0;
    let failedCount = 0;
    function assert(condition, message) {
        if (condition) {
            console.log(` ✅ PASS: ${message}`);
            passedCount++;
        }
        else {
            console.error(` ❌ FAIL: ${message}`);
            failedCount++;
        }
    }
    try {
        // Test 1: User database CRUD
        console.log('\n--- Test 1: Database CRUD & Operators ---');
        // Clear test records
        await db_1.db.users.deleteMany({ email: 'test_runner@socialflow.ai' });
        // Create
        const user = await db_1.db.users.create({
            email: 'test_runner@socialflow.ai',
            passwordHash: 'hashed_pw',
            fullName: 'Test Suite Runner'
        });
        assert(!!user._id, 'User should be created with an auto-generated _id');
        assert(user.email === 'test_runner@socialflow.ai', 'User fields should match input');
        // Find One
        const fetched = await db_1.db.users.findOne({ email: 'test_runner@socialflow.ai' });
        assert(fetched?._id === user._id, 'findOne should retrieve the document by email');
        // Update with $set
        await db_1.db.users.updateOne({ _id: user._id }, { $set: { fullName: 'Updated Runner Name' } });
        const updated = await db_1.db.users.findById(user._id);
        assert(updated?.fullName === 'Updated Runner Name', 'updateOne with $set should modify fields');
        // Test query operator $lte and $gte
        console.log('\n--- Test 2: Query Operators ($lte, $in) ---');
        await db_1.db.posts.deleteMany({ userId: 'test_user_id' });
        const post1 = await db_1.db.posts.create({
            userId: 'test_user_id',
            platforms: ['twitter'],
            content: 'Post 1',
            status: 'scheduled',
            scheduledAt: '2026-06-01T10:00:00.000Z'
        });
        const post2 = await db_1.db.posts.create({
            userId: 'test_user_id',
            platforms: ['linkedin'],
            content: 'Post 2',
            status: 'scheduled',
            scheduledAt: '2026-06-15T10:00:00.000Z'
        });
        const scheduledBeforeJune10 = await db_1.db.posts.find({
            userId: 'test_user_id',
            scheduledAt: { $lte: '2026-06-10T00:00:00.000Z' }
        });
        assert(scheduledBeforeJune10.length === 1 && scheduledBeforeJune10[0]._id === post1._id, '$lte operator should filter date fields correctly');
        const checkInQuery = await db_1.db.posts.find({
            userId: 'test_user_id',
            platforms: 'twitter' // string in array check
        });
        assert(checkInQuery.length === 1 && checkInQuery[0]._id === post1._id, 'querying a primitive should match if array field contains it');
        // Clean up posts
        await db_1.db.posts.deleteMany({ userId: 'test_user_id' });
        // Test 3: JWT and Cryptography
        console.log('\n--- Test 3: Token Operations & Cryptography ---');
        const salt = await bcryptjs_1.default.genSalt(5);
        const hash = await bcryptjs_1.default.hash('secret_password', salt);
        const match = await bcryptjs_1.default.compare('secret_password', hash);
        assert(match, 'bcrypt hashes should match the correct password');
        const tokenPayload = { id: 'usr_123', email: 'hello@socialflow.ai' };
        const accessToken = (0, auth_1.generateAccessToken)(tokenPayload);
        const refreshToken = (0, auth_1.generateRefreshToken)(tokenPayload);
        assert(!!accessToken, 'generateAccessToken should return a token string');
        assert(!!refreshToken, 'generateRefreshToken should return a token string');
        const decodedRefresh = (0, auth_1.verifyRefreshToken)(refreshToken);
        assert(decodedRefresh?.id === 'usr_123' && decodedRefresh.email === 'hello@socialflow.ai', 'verifyRefreshToken should decode and return payload');
        // Cleanup Test 1 user
        await db_1.db.users.deleteOne({ _id: user._id });
        console.log(`\n🎉 Tests completed. Passed: ${passedCount}, Failed: ${failedCount}`);
        if (failedCount > 0) {
            process.exit(1);
        }
    }
    catch (error) {
        console.error('Test runner threw an unhandled error:', error);
        process.exit(1);
    }
}
runTests();
