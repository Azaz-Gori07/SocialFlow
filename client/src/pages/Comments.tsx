import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { 
  MessageSquare, 
  Sparkles, 
  UserPlus, 
  CheckCircle,
  Send,
  ArrowLeft
} from 'lucide-react';

export const Comments: React.FC = () => {
  const { workspace } = useAuth();
  const [comments, setComments] = useState<any[]>([]);
  const [selectedComment, setSelectedComment] = useState<any>(null);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPlatform, setFilterPlatform] = useState<string>('all');
  
  // Reply box
  const [replyMessage, setReplyMessage] = useState('');
  
  // AI suggestions
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const loadComments = async () => {
    try {
      const list = await api.comments.list(
        filterPlatform === 'all' ? undefined : filterPlatform,
        'unresolved'
      );
      setComments(list);
      
      const isMobileViewport = window.innerWidth <= 768;

      // Auto-select first comment if none is selected (only on desktop/tablet)
      if (list.length > 0 && !selectedComment) {
        if (!isMobileViewport) {
          setSelectedComment(list[0]);
        }
      } else if (list.length === 0) {
        setSelectedComment(null);
      } else if (selectedComment) {
        // Refresh active comment
        const active = list.find((c: any) => c._id === selectedComment._id);
        setSelectedComment(active || (isMobileViewport ? null : list[0]));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadTeam = async () => {
    if (!workspace) return;
    try {
      const list = await api.workspaces.members(workspace.id);
      setTeamMembers(list);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([loadComments(), loadTeam()]).then(() => setLoading(false));
  }, [filterPlatform, workspace]);

  const handleSuggestReply = async () => {
    if (!selectedComment) return;
    setLoadingSuggestions(true);
    setAiSuggestions([]);
    
    try {
      const res = await api.ai.suggestReply(selectedComment._id);
      setAiSuggestions(res.suggestions);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedComment || !replyMessage.trim()) return;

    try {
      await api.comments.reply(selectedComment._id, replyMessage);
      setReplyMessage('');
      setAiSuggestions([]);
      
      // Reload queue
      await loadComments();
    } catch (err) {
      console.error(err);
      alert('Failed to send reply.');
    }
  };

  const handleResolveComment = async (id: string) => {
    try {
      await api.comments.resolve(id, 'resolved');
      
      // De-select or shift select
      const nextIdx = comments.findIndex((c: any) => c._id === id) + 1;
      if (comments.length > 1) {
        setSelectedComment(comments[nextIdx] || comments[0]);
      } else {
        setSelectedComment(null);
      }

      await loadComments();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAssignComment = async (commentId: string, memberUserId: string) => {
    try {
      await api.comments.assign(commentId, memberUserId);
      await loadComments();
    } catch (err) {
      console.error(err);
    }
  };

  const getPlatformIcon = (plat: string, size = 14) => {
    switch (plat) {
      case 'twitter': return <span style={{ color: '#1DA1F2', fontWeight: 'bold', fontSize: `${size}px` }}>X</span>;
      case 'linkedin': return <span style={{ color: '#0077B5', fontWeight: 'bold', fontSize: `${size}px` }}>In</span>;
      case 'instagram': return <span style={{ color: '#E1306C', fontWeight: 'bold', fontSize: `${size}px` }}>Ig</span>;
      case 'facebook': return <span style={{ color: '#1877F2', fontWeight: 'bold', fontSize: `${size}px` }}>Fb</span>;
      default: return null;
    }
  };

  const getAssigneeName = (userId?: string) => {
    if (!userId) return 'Unassigned';
    const member = teamMembers.find(t => t.userId === userId);
    return member ? member.fullName : 'Assigned';
  };

  return (
    <div className="animate-fade-in" style={{ position: 'relative', display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
      <div className="glow-blur" />

      {/* Header */}
      <div className="header-bar">
        <div>
          <h1 className="page-title">Comment Inbox</h1>
          <p style={{ color: 'hsl(var(--text-secondary))', marginTop: '4px', fontSize: '0.95rem' }}>
            A unified interface to reply, assign, and resolve discussions across all channels.
          </p>
        </div>
      </div>

      <div className={`responsive-grid-1-15 responsive-comments-grid ${selectedComment ? 'show-detail' : 'show-list'}`} style={{ flexGrow: 1, alignItems: 'stretch' }}>
        
        {/* Left Column - Comments Queue */}
        <div className="glass-card comments-master-pane" style={{ padding: '20px', display: 'flex', flexDirection: 'column', maxHeight: '650px' }}>
          
          {/* Platform Filters */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '8px', whiteSpace: 'nowrap', width: '100%', flexShrink: 0 }}>
            {['all', 'twitter', 'linkedin', 'instagram', 'facebook'].map(plat => (
              <button
                key={plat}
                onClick={() => {
                  setFilterPlatform(plat);
                  setSelectedComment(null);
                }}
                style={{
                  padding: '6px 12px',
                  background: filterPlatform === plat ? 'rgba(255,255,255,0.06)' : 'transparent',
                  border: '1px solid var(--border-glass)',
                  borderRadius: '20px',
                  color: filterPlatform === plat ? 'white' : 'hsl(var(--text-secondary))',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: filterPlatform === plat ? 600 : 400,
                  textTransform: 'capitalize',
                  whiteSpace: 'nowrap',
                  flexShrink: 0
                }}
              >
                {plat === 'all' ? 'All Channels' : plat === 'twitter' ? 'X (Twitter)' : plat}
              </button>
            ))}
          </div>

          {/* List items */}
          <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {loading ? (
              <p style={{ textAlign: 'center', color: 'hsl(var(--text-secondary))', padding: '40px' }}>Loading comments...</p>
            ) : comments.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'hsl(var(--text-muted))' }}>
                <MessageSquare size={32} style={{ margin: '0 auto 12px auto', opacity: 0.2 }} />
                <p style={{ fontSize: '0.8rem' }}>No unresolved comments in the inbox</p>
              </div>
            ) : (
              comments.map((comment: any) => {
                const isSelected = selectedComment?._id === comment._id;
                return (
                  <button
                    key={comment._id}
                    onClick={() => {
                      setSelectedComment(comment);
                      setReplyMessage('');
                      setAiSuggestions([]);
                    }}
                    style={{
                      width: '100%',
                      padding: '14px',
                      background: isSelected ? 'hsl(var(--bg-card-hover))' : 'rgba(255,255,255,0.01)',
                      border: `1px solid ${isSelected ? 'hsl(var(--primary) / 0.5)' : 'var(--border-glass)'}`,
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      fontFamily: 'var(--font-sans)',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {getPlatformIcon(comment.platform)}
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'white' }}>
                          @{comment.author.username}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.65rem', color: 'hsl(var(--text-muted))' }}>
                        {new Date(comment.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                      </span>
                    </div>

                    <p style={{ fontSize: '0.8rem', color: 'hsl(var(--text-secondary))', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', width: '100%' }}>
                      {comment.message}
                    </p>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.65rem', color: 'hsl(var(--text-muted))', borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '6px', width: '100%' }}>
                      <span>Post: {comment.postTitle ? comment.postTitle.substring(0, 15) + '...' : 'Launch post'}</span>
                      <span style={{ color: comment.assignedTo ? 'hsl(var(--secondary))' : 'hsl(var(--text-muted))' }}>
                        {getAssigneeName(comment.assignedTo)}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column - Active Discussion Panel */}
        <div className="glass-card comments-detail-pane" style={{ padding: '24px', display: 'flex', flexDirection: 'column', maxHeight: '650px' }}>
          {!selectedComment ? (
            <div style={{ display: 'flex', flexGrow: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'hsl(var(--text-muted))', padding: '40px', textAlign: 'center' }}>
              <MessageSquare size={36} style={{ color: 'hsl(var(--primary) / 0.3)', marginBottom: '16px' }} />
              <h4 style={{ fontSize: '1rem', color: 'white', marginBottom: '8px' }}>Select a Conversation</h4>
              <p style={{ fontSize: '0.8rem' }}>Choose an inbox item on the left to resolve, reply, or get AI recommendations.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'hidden' }}>
              
              {/* Mobile Back Button */}
              <button 
                onClick={() => setSelectedComment(null)}
                className="mobile-back-btn"
                style={{ marginBottom: '16px', alignSelf: 'flex-start' }}
              >
                <ArrowLeft size={16} />
                <span>Back to Inbox</span>
              </button>

              {/* Active Header */}
              <div className="comments-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <img src={selectedComment.author.avatarUrl} alt="" style={{ width: '36px', height: '36px', borderRadius: '50%' }} />
                  <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>{selectedComment.author.displayName || `@${selectedComment.author.username}`}</h3>
                    <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>@{selectedComment.author.username} on {selectedComment.platform}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {/* Assignment Droplist */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-glass)', borderRadius: '6px', padding: '4px 8px' }}>
                    <UserPlus size={14} style={{ color: 'hsl(var(--text-secondary))' }} />
                    <select
                      value={selectedComment.assignedTo || ''}
                      onChange={e => handleAssignComment(selectedComment._id, e.target.value)}
                      style={{ background: 'none', border: 'none', color: 'hsl(var(--text-secondary))', fontSize: '0.75rem', cursor: 'pointer', outline: 'none' }}
                    >
                      <option value="" style={{ background: 'hsl(var(--bg-card))' }}>Assign Member</option>
                      {teamMembers.map(m => (
                        <option key={m.userId} value={m.userId} style={{ background: 'hsl(var(--bg-card))' }}>{m.fullName}</option>
                      ))}
                    </select>
                  </div>

                  {/* Resolve button */}
                  <button
                    onClick={() => handleResolveComment(selectedComment._id)}
                    className="btn btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '0.75rem', gap: '4px' }}
                    title="Mark Resolved"
                  >
                    <CheckCircle size={14} style={{ color: '#10b981' }} />
                    <span>Resolve</span>
                  </button>
                </div>
              </div>

              {/* Discussion History */}
              <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px', paddingRight: '4px' }}>
                {/* Incoming comment card */}
                <div style={{ display: 'flex', gap: '10px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-glass)', padding: '14px', borderRadius: 'var(--radius-md)' }}>
                  <img src={selectedComment.author.avatarUrl} alt="" style={{ width: '28px', height: '28px', borderRadius: '50%' }} />
                  <div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'baseline', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'white' }}>{selectedComment.author.displayName}</span>
                      <span style={{ fontSize: '0.65rem', color: 'hsl(var(--text-muted))' }}>{formatDateTime(selectedComment.createdAt)}</span>
                    </div>
                    <p style={{ fontSize: '0.85rem', color: 'hsl(var(--text-secondary))', lineHeight: '1.4' }}>{selectedComment.message}</p>
                  </div>
                </div>

                {/* Sub-replies history if any */}
                {selectedComment.replies && selectedComment.replies.map((r: any) => (
                  <div key={r._id} style={{ display: 'flex', gap: '10px', marginLeft: '30px', background: 'rgba(139, 92, 246, 0.03)', border: '1px solid hsl(var(--primary) / 0.1)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
                    <img src={r.author.avatarUrl} alt="" style={{ width: '24px', height: '24px', borderRadius: '50%' }} />
                    <div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'baseline', marginBottom: '4px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'white' }}>{r.author.displayName}</span>
                        {r.author.isSystemUser && <span style={{ fontSize: '0.55rem', background: 'hsl(var(--primary) / 0.2)', color: 'hsl(var(--primary))', padding: '1px 4px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 'bold' }}>Team</span>}
                        <span style={{ fontSize: '0.6rem', color: 'hsl(var(--text-muted))' }}>{formatDateTime(r.createdAt)}</span>
                      </div>
                      <p style={{ fontSize: '0.8rem', color: 'hsl(var(--text-secondary))', lineHeight: '1.4' }}>{r.message}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* AI Engagement Assistant - Suggested replies bar */}
              <div style={{ marginBottom: '14px', borderTop: '1px solid hsl(var(--border))', paddingTop: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'white', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Sparkles size={14} style={{ color: 'hsl(var(--primary))' }} />
                    <span>AI Engagement Assistant</span>
                  </span>
                  <button
                    onClick={handleSuggestReply}
                    className="btn btn-secondary"
                    style={{ padding: '4px 10px', fontSize: '0.7rem', border: '1px solid hsl(var(--primary) / 0.2)' }}
                    disabled={loadingSuggestions}
                  >
                    {loadingSuggestions ? 'Analyzing...' : 'Suggest Replies'}
                  </button>
                </div>

                {aiSuggestions.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '150px', overflowY: 'auto', background: 'rgba(0,0,0,0.15)', padding: '8px', borderRadius: '6px' }}>
                    {aiSuggestions.map((sug, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setReplyMessage(sug)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          background: 'rgba(255,255,255,0.02)',
                          border: '1px solid var(--border-glass)',
                          borderRadius: '4px',
                          padding: '8px 12px',
                          color: 'hsl(var(--text-secondary))',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                          fontFamily: 'var(--font-sans)',
                          lineHeight: '1.4',
                          transition: 'all 0.15s'
                        }}
                        className="suggestion-hover"
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Reply Send Form */}
              <form onSubmit={handleSendReply} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Type your reply for user approval..."
                  value={replyMessage}
                  onChange={e => setReplyMessage(e.target.value)}
                  required
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ padding: '12px 16px' }}
                  disabled={!replyMessage.trim()}
                >
                  <Send size={14} />
                </button>
              </form>

            </div>
          )}
        </div>

      </div>

      <style>{`
        .suggestion-hover:hover {
          background: hsl(var(--primary) / 0.1) !important;
          border-color: hsl(var(--primary) / 0.3) !important;
          color: white !important;
        }
      `}</style>
    </div>
  );
};

const formatDateTime = (isoString?: string) => {
  if (!isoString) return 'Just now';
  const d = new Date(isoString);
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};
