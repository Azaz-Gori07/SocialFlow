"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationService = exports.notificationController = void 0;
const express_1 = require("express");
const notification_controller_1 = require("./notification.controller");
const notification_service_1 = require("./notification.service");
const rbac_middleware_1 = require("../../shared/middleware/rbac.middleware");
const router = (0, express_1.Router)();
// Instantiate dependency graph
const notificationService = new notification_service_1.NotificationService();
exports.notificationService = notificationService;
const notificationController = new notification_controller_1.NotificationController(notificationService);
exports.notificationController = notificationController;
// GET /api/notifications - List all notifications for the authenticated user
router.get('/', rbac_middleware_1.authenticate, notificationController.list);
// GET /api/notifications/unread-count - Get unread notification count
router.get('/unread-count', rbac_middleware_1.authenticate, notificationController.getUnreadCount);
// PUT /api/notifications/read-all - Mark all notifications as read
router.put('/read-all', rbac_middleware_1.authenticate, notificationController.markAllRead);
// PUT /api/notifications/:id/read - Mark a single notification as read
router.put('/:id/read', rbac_middleware_1.authenticate, notificationController.markRead);
// DELETE /api/notifications/:id - Delete a single notification
router.delete('/:id', rbac_middleware_1.authenticate, notificationController.delete);
// Notification Preferences
// GET /api/notifications/preferences - Get notification preferences
router.get('/preferences', rbac_middleware_1.authenticate, notificationController.getPreferences);
// PUT /api/notifications/preferences - Update notification preferences
router.put('/preferences', rbac_middleware_1.authenticate, notificationController.updatePreferences);
exports.default = router;
