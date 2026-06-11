"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiResponse = void 0;
class ApiResponse {
    static success(res, data, message = 'Request completed successfully', statusCode = 200) {
        const responseBody = {
            success: true,
            message,
            data,
            errors: null,
            timestamp: new Date().toISOString()
        };
        return res.status(statusCode).json(responseBody);
    }
    static error(res, message = 'An error occurred', errors = null, statusCode = 500) {
        const responseBody = {
            success: false,
            message,
            data: null,
            errors,
            timestamp: new Date().toISOString()
        };
        return res.status(statusCode).json(responseBody);
    }
}
exports.ApiResponse = ApiResponse;
