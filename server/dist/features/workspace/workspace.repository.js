"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkspaceRepository = void 0;
const workspace_model_1 = require("./workspace.model");
class WorkspaceRepository {
    async createWorkspace(name, ownerId) {
        const ws = new workspace_model_1.WorkspaceModel({ name, ownerId });
        return ws.save();
    }
    async findWorkspaceById(id) {
        return workspace_model_1.WorkspaceModel.findById(id).exec();
    }
    async findMember(workspaceId, userId) {
        return workspace_model_1.WorkspaceMemberModel.findOne({ workspaceId, userId }).exec();
    }
    async addMember(workspaceId, userId, role) {
        const member = new workspace_model_1.WorkspaceMemberModel({ workspaceId, userId, role });
        return member.save();
    }
    async listMembers(workspaceId) {
        return workspace_model_1.WorkspaceMemberModel.find({ workspaceId }).exec();
    }
    async listWorkspacesForUser(userId) {
        return workspace_model_1.WorkspaceMemberModel.find({ userId }).exec();
    }
    async updateMemberRole(workspaceId, userId, role) {
        return workspace_model_1.WorkspaceMemberModel.findOneAndUpdate({ workspaceId, userId }, { $set: { role } }, { new: true }).exec();
    }
    async removeMember(workspaceId, userId) {
        const result = await workspace_model_1.WorkspaceMemberModel.findOneAndDelete({ workspaceId, userId }).exec();
        return !!result;
    }
    async deleteWorkspace(id) {
        const ws = await workspace_model_1.WorkspaceModel.findByIdAndDelete(id).exec();
        if (ws) {
            // Clean up all members associated with workspace
            await workspace_model_1.WorkspaceMemberModel.deleteMany({ workspaceId: id }).exec();
            return true;
        }
        return false;
    }
}
exports.WorkspaceRepository = WorkspaceRepository;
exports.default = WorkspaceRepository;
