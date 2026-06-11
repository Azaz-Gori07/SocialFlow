import UserModel, { IUser, AuthProvider } from './user.model';
import mongoose from 'mongoose';

export { AuthProvider };

export class UserRepository {
  async findByEmail(email: string): Promise<IUser | null> {
    return UserModel.findOne({ email: email.toLowerCase().trim() }).exec();
  }

  async findById(id: string): Promise<IUser | null> {
    return UserModel.findById(id).exec();
  }

  async findByOAuthProvider(provider: AuthProvider, oauthProviderId: string): Promise<IUser | null> {
    return UserModel.findOne({ provider, oauthProviderId }).exec();
  }

  async create(user: Partial<IUser>): Promise<IUser> {
    const newUser = new UserModel(user);
    return newUser.save();
  }

  async update(id: string, user: Partial<IUser>): Promise<IUser | null> {
    return UserModel.findByIdAndUpdate(id, { $set: user }, { new: true }).exec();
  }

  async delete(id: string): Promise<boolean> {
    const result = await UserModel.findByIdAndDelete(id).exec();
    return !!result;
  }

  static isConnected(): boolean {
    return mongoose.connection.readyState === 1;
  }
}

export default UserRepository;
