"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserDto = void 0;
class UserDto {
    static toResponse(user) {
        return {
            id: user._id.toString(),
            email: user.email,
            fullName: user.fullName,
            avatarUrl: user.avatarUrl,
            createdAt: user.createdAt.toISOString()
        };
    }
}
exports.UserDto = UserDto;
