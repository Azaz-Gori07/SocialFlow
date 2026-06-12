import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { 
  Users, 
  UserPlus, 
  Trash2, 
  Plus
} from 'lucide-react';

export const Workspaces: React.FC = () => {
  const { workspace, workspaces, switchWorkspace, refreshWorkspaces } = useAuth();
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Create WS Form
  const [newWsName, setNewWsName] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  // Invite Form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('editor');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMessage, setInviteMessage] = useState('');

  const loadMembers = async () => {
    if (!workspace) return;
    try {
      const list = await api.workspaces.members(workspace.id);
      setMembers(list);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await loadMembers();
      setLoading(false);
    };
    init();
  }, [workspace]);

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim()) return;

    setCreateLoading(true);
    try {
      const newWs = await api.workspaces.create(newWsName);
      await refreshWorkspaces();
      switchWorkspace(newWs.id);
      setNewWsName('');
    } catch (err) {
      console.error(err);
      alert('Failed to create workspace.');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspace || !inviteEmail) return;

    setInviteLoading(true);
    setInviteMessage('');
    try {
      await api.workspaces.invite(workspace.id, inviteEmail, inviteRole);
      setInviteMessage('User invited successfully! They have been added to the member list.');
      setInviteEmail('');
      loadMembers();
    } catch (err: any) {
      console.error(err);
      setInviteMessage(err.message || 'Invitation failed.');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRoleChange = async (memberUserId: string, newRole: string) => {
    if (!workspace) return;
    try {
      await api.workspaces.updateRole(workspace.id, memberUserId, newRole);
      loadMembers();
    } catch (err: any) {
      alert(err.message || 'Failed to update member role.');
    }
  };

  const handleRemoveMember = async (memberUserId: string) => {
    if (!workspace) return;
    if (!confirm('Are you sure you want to remove this member from the workspace?')) return;

    try {
      await api.workspaces.removeMember(workspace.id, memberUserId);
      loadMembers();
    } catch (err: any) {
      alert(err.message || 'Failed to remove member.');
    }
  };

  const isOwnerOrAdmin = workspace?.role === 'owner' || workspace?.role === 'admin';

  return (
    <div className="animate-fade-in" style={{ position: 'relative' }}>
      <div className="glow-blur" />

      {/* Header */}
      <div className="header-bar">
        <div>
          <h1 className="page-title">Collaboration Hub</h1>
          <p style={{ color: 'hsl(var(--text-secondary))', marginTop: '4px', fontSize: '0.95rem' }}>
            Configure shared organizational workspaces and audit team member roles.
          </p>
        </div>
      </div>

      <div className="responsive-grid-175-1">
        
        {/* Left Column - Active Workspace & Member Roster */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Workspace Switcher Card */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '16px' }}>Manage Workspace Profiles</h3>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {workspaces.map((w: any) => (
                <button
                  key={w.id}
                  onClick={() => switchWorkspace(w.id)}
                  style={{
                    padding: '12px 18px',
                    background: w.id === workspace?.id ? 'linear-gradient(135deg, hsl(var(--primary) / 0.1), hsl(var(--primary) / 0.05))' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${w.id === workspace?.id ? 'hsl(var(--primary))' : 'var(--border-glass)'}`,
                    borderRadius: 'var(--radius-md)',
                    color: w.id === workspace?.id ? 'white' : 'hsl(var(--text-secondary))',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: w.id === workspace?.id ? 600 : 400,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    transition: 'all 0.2s'
                  }}
                >
                  <Users size={16} style={{ color: w.id === workspace?.id ? 'hsl(var(--primary))' : 'hsl(var(--text-secondary))' }} />
                  <span>{w.name}</span>
                  <span style={{ fontSize: '0.65rem', padding: '2px 6px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', textTransform: 'uppercase' }}>
                    {w.role}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Members List */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Users size={18} style={{ color: 'hsl(var(--primary))' }} />
              <span>Workspace Members ({members.length})</span>
            </h3>

            {loading ? (
              <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.9rem' }}>Loading roster...</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {members.map((member: any) => (
                  <div 
                    key={member.userId} 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      background: 'rgba(255,255,255,0.01)',
                      border: '1px solid var(--border-glass)',
                      borderRadius: 'var(--radius-md)',
                      padding: '12px 16px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <img src={member.avatarUrl} alt="" style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'white' }}>{member.fullName}</span>
                        <span style={{ fontSize: '0.7rem', color: 'hsl(var(--text-muted))' }}>{member.email}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      {/* Role selection dropdown (only visible to owner/admins, and only for non-owners) */}
                      {isOwnerOrAdmin && member.role !== 'owner' ? (
                        <select
                          value={member.role}
                          onChange={e => handleRoleChange(member.userId, e.target.value)}
                          style={{
                            background: 'rgba(0,0,0,0.2)',
                            border: '1px solid var(--border-glass)',
                            borderRadius: '6px',
                            color: 'hsl(var(--text-secondary))',
                            fontSize: '0.75rem',
                            padding: '4px 8px',
                            outline: 'none',
                            cursor: 'pointer'
                          }}
                        >
                          <option value="admin">Admin</option>
                          <option value="editor">Editor</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      ) : (
                        <span style={{ fontSize: '0.75rem', textTransform: 'capitalize', color: 'hsl(var(--text-secondary))', background: 'rgba(255,255,255,0.04)', padding: '2px 8px', borderRadius: '12px' }}>
                          {member.role}
                        </span>
                      )}

                      {/* Remove button */}
                      {isOwnerOrAdmin && member.role !== 'owner' && (
                        <button
                          onClick={() => handleRemoveMember(member.userId)}
                          style={{ background: 'none', border: 'none', color: 'hsl(var(--text-muted))', cursor: 'pointer', display: 'flex' }}
                          title="Remove Member"
                          className="delete-hover"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Invites & Workspace Creation */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Invite Member Card */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <UserPlus size={16} style={{ color: 'hsl(var(--secondary))' }} />
              <span>Invite Team Member</span>
            </h3>

            {isOwnerOrAdmin ? (
              <form onSubmit={handleInvite} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label className="form-label">Email Address</label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="partner@agency.com"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="form-label">Role Assignment</label>
                  <select
                    value={inviteRole}
                    onChange={e => setInviteRole(e.target.value)}
                    className="form-input"
                    style={{ cursor: 'pointer' }}
                  >
                    <option value="admin">Admin (Full Control)</option>
                    <option value="editor">Editor (Publish & Edit)</option>
                    <option value="viewer">Viewer (Read-only analytics)</option>
                  </select>
                </div>

                {inviteMessage && (
                  <div style={{ fontSize: '0.75rem', fontWeight: 500, color: inviteMessage.includes('fail') ? '#ef4444' : '#10b981' }}>
                    {inviteMessage}
                  </div>
                )}

                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', marginTop: '6px' }}
                  disabled={inviteLoading || !inviteEmail}
                >
                  {inviteLoading ? 'Sending Invite...' : 'Send Invitation'}
                </button>
              </form>
            ) : (
              <p style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))', lineHeight: '1.4' }}>
                Only workspace Owners or Admins are authorized to invite team members. Please ask your administrator to grant permission.
              </p>
            )}
          </div>

          {/* Create New Workspace Card */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={16} style={{ color: 'hsl(var(--primary))' }} />
              <span>Create New Workspace</span>
            </h3>
            <form onSubmit={handleCreateWorkspace} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label className="form-label">Workspace Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Acme Marketing Group"
                  value={newWsName}
                  onChange={e => setNewWsName(e.target.value)}
                  required
                />
              </div>
              <button
                type="submit"
                className="btn btn-secondary"
                style={{ width: '100%', marginTop: '6px' }}
                disabled={createLoading || !newWsName.trim()}
              >
                {createLoading ? 'Provisioning...' : 'Create Workspace'}
              </button>
            </form>
          </div>

        </div>

      </div>

      <style>{`
        .delete-hover:hover {
          color: #ef4444 !important;
        }
      `}</style>
    </div>
  );
};
