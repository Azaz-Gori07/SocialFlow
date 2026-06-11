import { IUser } from './user.model';

export interface UserResponseDto {
  id: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
  createdAt: string;
}

export class UserDto {
  static toResponse(user: IUser): UserResponseDto {
    return {
      id: user._id.toString(),
      email: user.email,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt.toISOString()
    };
  }
}
