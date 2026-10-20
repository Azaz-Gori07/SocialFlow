import { WorkspaceModel, WorkspaceMemberModel, IWorkspace, IWorkspaceMember } from './workspace.model';

export class WorkspaceRepository {
  async createWorkspace(name: string, ownerId: string): Promise<IWorkspace> {
    const ws = new WorkspaceModel({ name, ownerId });
    return ws.save();
  }

  async findWorkspaceById(id: string): Promise<IWorkspace | null> {
    return WorkspaceModel.findById(id).exec();
  }

  async updateWorkspace(id: string, patch: Partial<IWorkspace>): Promise<IWorkspace | null> {
    return WorkspaceModel.findByIdAndUpdate(id, { $set: patch }, { new: true }).exec();
  }

  async findByApiKeyHash(hash: string): Promise<IWorkspace | null> {
    return WorkspaceModel.findOne({ apiKeyHash: hash }).exec();
  }

  async touchApiKeyLastUsed(id: string): Promise<void> {
    await WorkspaceModel.updateOne({ _id: id }, { $set: { apiKeyLastUsedAt: new Date() } }).exec();
  }

  async clearApiKey(id: string): Promise<void> {
    await WorkspaceModel.updateOne(
      { _id: id },
      { $unset: { apiKeyHash: 1, apiKeyPrefix: 1, apiKeyEncrypted: 1, apiKeyCreatedAt: 1, apiKeyLastUsedAt: 1 } }
    ).exec();
  }

  async findMember(workspaceId: string, userId: string): Promise<IWorkspaceMember | null> {
    return WorkspaceMemberModel.findOne({ workspaceId, userId }).exec();
  }

  async addMember(workspaceId: string, userId: string, role: 'owner' | 'admin' | 'editor' | 'viewer'): Promise<IWorkspaceMember> {
    const member = new WorkspaceMemberModel({ workspaceId, userId, role });
    return member.save();
  }

  async listMembers(workspaceId: string): Promise<IWorkspaceMember[]> {
    return WorkspaceMemberModel.find({ workspaceId }).exec();
  }

  async listWorkspacesForUser(userId: string): Promise<IWorkspaceMember[]> {
    return WorkspaceMemberModel.find({ userId }).exec();
  }

  /** Batch fetch — avoids one roundtrip per membership (N+1). */
  async findWorkspacesByIds(ids: string[]): Promise<IWorkspace[]> {
    if (ids.length === 0) return [];
    return WorkspaceModel.find({ _id: { $in: ids } } as any).exec();
  }

  async updateMemberRole(workspaceId: string, userId: string, role: 'owner' | 'admin' | 'editor' | 'viewer'): Promise<IWorkspaceMember | null> {
    return WorkspaceMemberModel.findOneAndUpdate(
      { workspaceId, userId },
      { $set: { role } },
      { new: true }
    ).exec();
  }

  async removeMember(workspaceId: string, userId: string): Promise<boolean> {
    const result = await WorkspaceMemberModel.findOneAndDelete({ workspaceId, userId }).exec();
    return !!result;
  }

  async deleteWorkspace(id: string): Promise<boolean> {
    const ws = await WorkspaceModel.findByIdAndDelete(id).exec();
    if (ws) {
      // Clean up all members associated with workspace
      await WorkspaceMemberModel.deleteMany({ workspaceId: id }).exec();
      return true;
    }
    return false;
  }
}
export default WorkspaceRepository;
