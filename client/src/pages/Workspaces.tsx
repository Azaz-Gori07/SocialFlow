import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { 
  Users, 
  UserPlus, 
  Trash2, 
  Plus,
  Share2,
  Clock,
  MoreHorizontal,
  Mail,
  ChevronDown,
  X
} from 'lucide-react';
import { PlatformBadge } from '../components/SocialIcons';

export const Workspaces: React.FC = () => {
  const { user, workspace, workspaces, switchWorkspace, refreshWorkspaces } = useAuth();
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Create WS Modal & Form
  const [showCreateWsModal, setShowCreateWsModal] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  // Invite Form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('editor');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMessage, setInviteMessage] = useState('');

  // Dropdown menus
  const [showWsMenu, setShowWsMenu] = useState(false);

  const loadMembers = async () => {
    if (!workspace) return;
    try {
      const list = await api.workspaces.members(workspace.id);
      setMembers(list || []);
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
      setShowCreateWsModal(false);
    } catch (err) {
      console.error(err);
      alert('Failed to create workspace.');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspace || !inviteEmail.trim()) return;

    setInviteLoading(true);
    setInviteMessage('');
    try {
      await api.workspaces.invite(workspace.id, inviteEmail, inviteRole);
      setInviteMessage('User invited successfully! They have been added to the member list.');
      setInviteEmail('');
      await loadMembers();
    } catch (err: any) {
      console.error(err);
      setInviteMessage(err.message || 'Invitation failed.');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRemoveMember = async (memberUserId: string) => {
    if (!workspace) return;
    if (!confirm('Are you sure you want to remove this member from the workspace?')) return;

    try {
      await api.workspaces.removeMember(workspace.id, memberUserId);
      await loadMembers();
    } catch (err: any) {
      alert(err.message || 'Failed to remove member.');
    }
  };

  const isOwnerOrAdmin = workspace?.role === 'owner' || workspace?.role === 'admin';
  const workspaceDisplayName = workspace?.name || (user?.fullName ? `${user.fullName}'s Workspace` : "azaz's Workspace");
  const memberCount = members.length > 0 ? members.length : 1;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      
      {/* 1. Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{
            fontSize: '0.6875rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: '#6b7280',
            textTransform: 'uppercase',
            marginBottom: '3px'
          }}>
            WORKSPACES
          </div>
          <h1 style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: '2.4rem',
            fontWeight: 700,
            color: '#111827',
            letterSpacing: '-0.02em',
            marginBottom: '4px',
            lineHeight: 1.15
          }}>
            Workspaces
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', lineHeight: 1.4 }}>
            Manage teams, roles, and shared publishing access.
          </p>
        </div>

        <button 
          onClick={() => setShowCreateWsModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
            padding: '9px 18px',
            background: '#18181b',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
          }}
        >
          <Plus size={15} />
          <span>New Workspace</span>
        </button>
      </div>

      {/* 2. Top Active Workspace Banner Card */}
      <div className="card" style={{
        padding: '20px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '20px'
      }}>
        
        {/* Workspace Identity Block */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: '320px' }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            background: '#f5efe6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <Users size={22} style={{ color: '#8c7355' }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '3px' }}>
              <span style={{ fontSize: '1rem', fontWeight: 700, color: '#111827' }}>
                {workspaceDisplayName}
              </span>
              <span style={{
                background: '#ecfdf5',
                color: '#059669',
                fontSize: '0.72rem',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '9999px',
                border: '1px solid #d1fae5'
              }}>
                Current
              </span>
            </div>
            <p style={{ fontSize: '0.825rem', color: '#6b7280', margin: 0 }}>
              Personal workspace for content creation and publishing.
            </p>
          </div>
        </div>

        {/* Member Count Block */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Users size={16} style={{ color: '#6b7280' }} />
          <div>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#111827', lineHeight: 1.1 }}>
              {memberCount}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
              {memberCount === 1 ? 'Member' : 'Members'}
            </div>
          </div>
        </div>

        {/* Connected Channels Cluster */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Share2 size={16} style={{ color: '#6b7280' }} />
          <div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '2px' }}>
              <PlatformBadge platform="twitter" size={18} iconSize={12} />
              <PlatformBadge platform="linkedin" size={18} iconSize={12} />
              <PlatformBadge platform="instagram" size={18} iconSize={12} />
              <PlatformBadge platform="facebook" size={18} iconSize={12} />
            </div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
              4 channels connected
            </div>
          </div>
        </div>

        {/* Last Activity Block */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Clock size={16} style={{ color: '#6b7280' }} />
          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111827', lineHeight: 1.1 }}>
              Oct 2, 2026
            </div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
              Last activity
            </div>
          </div>
        </div>

        {/* More Options Trigger */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setShowWsMenu(!showWsMenu)}
            style={{
              padding: '6px 12px',
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              color: '#6b7280',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)'
            }}
            title="Workspace options"
          >
            <MoreHorizontal size={18} />
          </button>

          {showWsMenu && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              right: 0,
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08)',
              zIndex: 30,
              minWidth: '180px',
              padding: '4px'
            }}>
              <div style={{ padding: '6px 12px', fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>
                Switch Workspace
              </div>
              {workspaces.map((w: any) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => {
                    switchWorkspace(w.id);
                    setShowWsMenu(false);
                  }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 12px',
                    background: w.id === workspace?.id ? '#f3f4f6' : 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.825rem',
                    color: '#111827',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</span>
                  <span style={{ fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase' }}>{w.role}</span>
                </button>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* 3. Middle Section: Members Table Card */}
      <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
        
        {/* Card Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '22px' }}>
          <Users size={20} style={{ color: '#111827' }} />
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', margin: 0 }}>
              Members ({memberCount})
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>
              Manage workspace members and their roles.
            </p>
          </div>
        </div>

        {/* Members Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f3f4f6', color: '#6b7280', fontSize: '0.8rem', fontWeight: 600 }}>
                <th style={{ padding: '10px 14px', width: '38%' }}>Member</th>
                <th style={{ padding: '10px 14px', width: '18%' }}>Role</th>
                <th style={{ padding: '10px 14px', width: '18%' }}>Status</th>
                <th style={{ padding: '10px 14px', width: '18%' }}>Joined</th>
                <th style={{ padding: '10px 14px', width: '8%', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem' }}>
                    Loading members...
                  </td>
                </tr>
              ) : members.length === 0 ? (
                /* Fallback single owner row matching the screenshot */
                <tr style={{ borderBottom: '1px solid #f9fafb' }}>
                  <td style={{ padding: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        background: '#78716c',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 600,
                        fontSize: '0.9rem',
                        flexShrink: 0
                      }}>
                        {user?.fullName ? user.fullName[0].toUpperCase() : 'A'}
                      </div>
                      <div>
                        <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#111827' }}>
                          {user?.fullName || 'azaz'}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                          {user?.email || 'azazgori76@gmail.com'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '14px' }}>
                    <span style={{
                      background: '#fef3c7',
                      color: '#92400e',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      padding: '3px 10px',
                      borderRadius: '6px'
                    }}>
                      Owner
                    </span>
                  </td>
                  <td style={{ padding: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.825rem', color: '#111827', fontWeight: 500 }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
                      <span>Active</span>
                    </div>
                  </td>
                  <td style={{ padding: '14px', fontSize: '0.825rem', color: '#374151' }}>
                    Oct 2, 2026
                  </td>
                  <td style={{ padding: '14px', textAlign: 'right', color: '#9ca3af', fontSize: '0.85rem' }}>
                    —
                  </td>
                </tr>
              ) : (
                members.map((member: any) => {
                  const initial = member.fullName ? member.fullName[0].toUpperCase() : 'U';
                  const isOwner = member.role === 'owner';
                  return (
                    <tr key={member.userId} style={{ borderBottom: '1px solid #f9fafb' }}>
                      <td style={{ padding: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            background: '#78716c',
                            color: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 600,
                            fontSize: '0.9rem',
                            flexShrink: 0
                          }}>
                            {initial}
                          </div>
                          <div>
                            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#111827' }}>
                              {member.fullName}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                              {member.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '14px' }}>
                        <span style={{
                          background: isOwner ? '#fef3c7' : '#f3f4f6',
                          color: isOwner ? '#92400e' : '#374151',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          padding: '3px 10px',
                          borderRadius: '6px',
                          textTransform: 'capitalize'
                        }}>
                          {member.role}
                        </span>
                      </td>
                      <td style={{ padding: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.825rem', color: '#111827', fontWeight: 500 }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
                          <span>Active</span>
                        </div>
                      </td>
                      <td style={{ padding: '14px', fontSize: '0.825rem', color: '#374151' }}>
                        Oct 2, 2026
                      </td>
                      <td style={{ padding: '14px', textAlign: 'right' }}>
                        {isOwnerOrAdmin && !isOwner ? (
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(member.userId)}
                            style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: '4px' }}
                            title="Remove Member"
                            onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                            onMouseLeave={e => (e.currentTarget.style.color = '#9ca3af')}
                          >
                            <Trash2 size={15} />
                          </button>
                        ) : (
                          <span style={{ color: '#9ca3af', fontSize: '0.85rem' }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

      </div>

      {/* 4. Bottom Section: Invite Team Member Card */}
      <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
        
        {/* Card Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <UserPlus size={20} style={{ color: '#111827' }} />
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', margin: 0 }}>
              Invite Team Member
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>
              Invite a new member to your workspace.
            </p>
          </div>
        </div>

        {/* Invite Form */}
        <form onSubmit={handleInvite} style={{
          display: 'grid',
          gridTemplateColumns: '1.5fr 1fr auto',
          gap: '16px',
          alignItems: 'flex-end'
        }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
              Email Address
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={15} style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
              <input
                type="email"
                placeholder="partner@agency.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                required
                style={{
                  width: '100%',
                  height: '44px',
                  paddingLeft: '38px',
                  paddingRight: '14px',
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  color: '#111827',
                  outline: 'none',
                  boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.02)'
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
              Role
            </label>
            <div style={{ position: 'relative' }}>
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value)}
                style={{
                  width: '100%',
                  height: '44px',
                  paddingLeft: '14px',
                  paddingRight: '36px',
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  color: '#374151',
                  cursor: 'pointer',
                  outline: 'none',
                  appearance: 'none',
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)'
                }}
              >
                <option value="editor">Editor (Publish & Edit)</option>
                <option value="admin">Admin (Full Control)</option>
                <option value="viewer">Viewer (Read-only Analytics)</option>
              </select>
              <ChevronDown size={14} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
            </div>
          </div>

          <button
            type="submit"
            disabled={inviteLoading || !inviteEmail.trim()}
            style={{
              height: '44px',
              padding: '0 24px',
              background: '#18181b',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: inviteLoading || !inviteEmail.trim() ? 'not-allowed' : 'pointer',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
              flexShrink: 0
            }}
          >
            {inviteLoading ? 'Sending...' : 'Send Invitation'}
          </button>
        </form>

        {inviteMessage && (
          <div style={{
            marginTop: '14px',
            padding: '10px 14px',
            borderRadius: '8px',
            fontSize: '0.825rem',
            background: inviteMessage.includes('fail') ? '#fef2f2' : '#ecfdf5',
            color: inviteMessage.includes('fail') ? '#ef4444' : '#10b981'
          }}>
            {inviteMessage}
          </div>
        )}

      </div>

      {/* 5. Create New Workspace Modal */}
      {showCreateWsModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100
        }}>
          <div className="card" style={{ maxWidth: '440px', width: '90%', padding: '28px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#111827', margin: 0 }}>
                Create Workspace
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateWsModal(false)}
                style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '4px' }}
              >
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: '0.825rem', color: '#6b7280', margin: 0 }}>
              Workspaces help you organize distinct brands, teams, or client accounts with isolated permissions.
            </p>

            <form onSubmit={handleCreateWorkspace} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                  Workspace Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Acme Media or DevStudio"
                  value={newWsName}
                  onChange={e => setNewWsName(e.target.value)}
                  required
                  autoFocus
                  style={{
                    width: '100%',
                    height: '42px',
                    padding: '0 14px',
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    color: '#111827',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateWsModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading || !newWsName.trim()}
                  style={{
                    height: '38px',
                    padding: '0 18px',
                    background: '#18181b',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: createLoading || !newWsName.trim() ? 'not-allowed' : 'pointer'
                  }}
                >
                  {createLoading ? 'Creating...' : 'Create Workspace'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
