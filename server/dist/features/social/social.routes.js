"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.socialRepository = exports.socialService = exports.socialController = void 0;
const express_1 = require("express");
const social_controller_1 = require("./social.controller");
const social_service_1 = require("./social.service");
const social_repository_1 = require("./social.repository");
const validate_middleware_1 = require("../../shared/middleware/validate.middleware");
const rbac_middleware_1 = require("../../shared/middleware/rbac.middleware");
const social_validation_1 = require("./social.validation");
const router = (0, express_1.Router)();
// Instantiate dependency graph
const socialRepository = new social_repository_1.SocialRepository();
exports.socialRepository = socialRepository;
const socialService = new social_service_1.SocialService(socialRepository);
exports.socialService = socialService;
const socialController = new social_controller_1.SocialController(socialService);
exports.socialController = socialController;
// GET /api/social/connect/:platform - Initiate OAuth connection
router.get('/connect/:platform', rbac_middleware_1.authenticate, (0, validate_middleware_1.validate)({ params: social_validation_1.connectPlatformSchema }), socialController.connect);
// GET /api/social/callback/:platform - Receive OAuth redirection
router.get('/callback/:platform', (0, validate_middleware_1.validate)({
    params: social_validation_1.connectPlatformSchema
}), socialController.callback);
// GET /api/social/accounts - Retrieve connected accounts list
router.get('/accounts', rbac_middleware_1.authenticate, socialController.listAccounts);
// DELETE /api/social/accounts/:id - Disconnect account
router.delete('/accounts/:id', rbac_middleware_1.authenticate, (0, validate_middleware_1.validate)({ params: social_validation_1.accountIdSchema }), socialController.disconnect);
exports.default = router;
