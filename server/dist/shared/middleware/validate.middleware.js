"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = validate;
const zod_1 = require("zod");
const appError_1 = require("../errors/appError");
function validate(schemas) {
    return async (req, res, next) => {
        try {
            if (schemas.body) {
                req.body = await schemas.body.parseAsync(req.body);
            }
            if (schemas.query) {
                req.query = await schemas.query.parseAsync(req.query);
            }
            if (schemas.params) {
                req.params = await schemas.params.parseAsync(req.params);
            }
            next();
        }
        catch (error) {
            if (error instanceof zod_1.ZodError) {
                // Parse validation errors
                const formattedErrors = error.issues.map(err => ({
                    field: err.path.join('.'),
                    message: err.message
                }));
                return next(appError_1.AppError.badRequest('Validation Failed', formattedErrors));
            }
            next(error);
        }
    };
}
