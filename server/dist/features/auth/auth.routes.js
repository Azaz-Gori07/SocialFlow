"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRepository = exports.authService = exports.authController = void 0;
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const auth_controller_1 = require("./auth.controller");
const auth_service_1 = require("./auth.service");
const otp_service_1 = require("./otp.service");
const otp_repository_1 = require("./otp.repository");
const zenuxs_oauth_service_1 = require("./zenuxs-oauth.service");
const user_repository_1 = require("../user/user.repository");
const workspace_service_1 = require("../workspace/workspace.service");
const workspace_repository_1 = require("../workspace/workspace.repository");
const validate_middleware_1 = require("../../shared/middleware/validate.middleware");
const rbac_middleware_1 = require("../../shared/middleware/rbac.middleware");
const auth_validation_1 = require("./auth.validation");
const router = (0, express_1.Router)();
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test' ? 100 : 5,
    message: { message: 'Too many auth requests, please try again later.' }
});
const authLimiterHandler = authLimiter;
const userRepository = new user_repository_1.UserRepository();
exports.userRepository = userRepository;
const workspaceRepository = new workspace_repository_1.WorkspaceRepository();
const workspaceService = new workspace_service_1.WorkspaceService(workspaceRepository, userRepository);
const otpRepository = new otp_repository_1.OtpRepository();
const otpService = new otp_service_1.OtpService(otpRepository);
const zenuxsOAuthService = new zenuxs_oauth_service_1.ZenuxsOAuthService(userRepository);
const authService = new auth_service_1.AuthService(userRepository, otpService, async (userId, name) => {
    return workspaceService.createWorkspace(name, userId);
});
exports.authService = authService;
const authController = new auth_controller_1.AuthController(authService, zenuxsOAuthService);
exports.authController = authController;
router.post('/register', authLimiterHandler, (0, validate_middleware_1.validate)({ body: auth_validation_1.registerSchema }), authController.register);
router.post('/verify-otp', authLimiterHandler, (0, validate_middleware_1.validate)({ body: auth_validation_1.verifyOtpSchema }), authController.verifyOtp);
router.post('/login', authLimiterHandler, (0, validate_middleware_1.validate)({ body: auth_validation_1.loginSchema }), authController.login);
router.post('/refresh', authLimiterHandler, (0, validate_middleware_1.validate)({ body: auth_validation_1.refreshSchema }), authController.refresh);
router.post('/logout', authController.logout);
router.get('/oauth/zenuxs/:provider', authController.oauthRedirect);
router.get('/oauth/zenuxs/:provider/callback', authController.oauthCallback);
router.get('/me', rbac_middleware_1.authenticate, authController.me);
exports.default = router;
