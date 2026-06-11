"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PREFERENCES = exports.NotificationType = void 0;
var NotificationType;
(function (NotificationType) {
    NotificationType["POST_PUBLISHED"] = "post_published";
    NotificationType["POST_FAILED"] = "post_failed";
    NotificationType["NEW_COMMENT"] = "new_comment";
    NotificationType["WORKSPACE_INVITE"] = "workspace_invite";
    NotificationType["SUBSCRIPTION_UPDATE"] = "subscription_update";
    NotificationType["ANALYTICS_ALERT"] = "analytics_alert";
})(NotificationType || (exports.NotificationType = NotificationType = {}));
exports.DEFAULT_PREFERENCES = {
    email: {
        enabled: true,
        types: Object.values(NotificationType),
    },
    push: {
        enabled: true,
        types: Object.values(NotificationType),
    },
    inApp: {
        enabled: true,
        types: Object.values(NotificationType),
    },
};
