"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorMiddleware = errorMiddleware;
const appError_1 = require("../errors/appError");
const response_util_1 = require("../utils/response.util");
function errorMiddleware(err, req, res, next) {
    // If headers already sent, delegate to standard Express handler
    if (res.headersSent) {
        return next(err);
    }
    // Handle operational AppErrors
    if (err instanceof appError_1.AppError) {
        return response_util_1.ApiResponse.error(res, err.message, err.errors, err.statusCode);
    }
    // Handle mongoose validation/cast errors
    if (err.name === 'ValidationError') {
        return response_util_1.ApiResponse.error(res, 'Validation Error', err.message, 400);
    }
    if (err.name === 'CastError') {
        return response_util_1.ApiResponse.error(res, 'Resource not found or invalid format', null, 400);
    }
    // Handle default unhandled exceptions (programming bugs or database outages)
    console.error('💥 Unhandled Exception:', err);
    // Clean message for client in production-like settings
    const message = process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred on the server'
        : err.message;
    return response_util_1.ApiResponse.error(res, message, process.env.NODE_ENV === 'production' ? null : err.stack, 500);
}
