import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { 
  MessageSquare, 
  Sparkles, 
  UserPlus, 
  CheckCircle,
  Send,
  LayoutGrid,
  Search,
  ChevronDown,
  SlidersHorizontal,
  ArrowDownUp
} from 'lucide-react';
import { PlatformBadge } from '../components/SocialIcons';

export const Comments: React.FC = () => {
  const { workspace } = useAuth();
  const [comments, setComments] = useState<any[]>([]);
  const [selectedComment, setSelectedComment] = useState<any>(null);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPlatform, setFilterPlatform] = useState<string>('all');
  const [inboxTab, setInboxTab] = useState<'unresolved' | 'assigned' | 'resolved'>('unresolved');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [showSortMenu, setShowSortMenu] = useState(false);
  
  // Reply box
  const [replyMessage, setReplyMessage] = useState('');
  
  // AI suggestions
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const loadComments = async () => {
    try {
      if (!workspace?.id) {
        setComments([]);
        setLoading(false);
        return;
      }
      const list = await api.comments.list(
        workspace.id,
        filterPlatform === 'all' ? undefined : filterPlatform,
        inboxTab
      );
      setComments(list || []);
      
      const isMobileViewport = window.innerWidth <= 1024;
      if (list && list.length > 0 && !selectedComment) {
        if (!isMobileViewport) {
          setSelectedComment(list[0]);
        }
      } else if (!list || list.length === 0) {
        setSelectedComment(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadTeam = async () => {
    if (!workspace) return;
    try {
      const list = await api.workspaces.members(workspace.id);
      setTeamMembers(list || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([loadComments(), loadTeam()]).then(() => setLoading(false));
  }, [filterPlatform, inboxTab, workspace]);

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
      await api.comments.reply(workspace.id, selectedComment._id, replyMessage);
      setReplyMessage('');
      setAiSuggestions([]);
      await loadComments();
    } catch (err) {
      console.error(err);
      alert('Failed to send reply.');
    }
  };

  const handleResolveComment = async (id: string) => {
    try {
      await api.comments.resolve(workspace.id, id, 'resolved');
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
      await api.comments.assign(workspace.id, commentId, memberUserId);
      await loadComments();
    } catch (err) {
      console.error(err);
    }
  };

  const formatDateTime = (isoString?: string) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const filteredComments = comments.filter(c => {
    if (searchQuery.trim() && !c.message?.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    return true;
  });

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      
      {/* 1. Header Banner */}
      <div>
        <div style={{
          fontSize: '0.6875rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          color: '#6b7280',
          textTransform: 'uppercase',
          marginBottom: '3px'
        }}>
          COMMENTS
        </div>
        <h1 style={{
          fontSize: '2.35rem',
          fontWeight: 700,
          color: '#111827',
          letterSpacing: '-0.025em',
          marginBottom: '4px',
          lineHeight: 1.15
        }}>
          Comment Inbox
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#6b7280', lineHeight: 1.4 }}>
          A unified interface to reply, assign, and resolve discussions across all channels.
        </p>
      </div>

      {/* 2. Channel & Filter Toolbar Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
        
        {/* Left Channel Filter Pills */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* All Channels Button */}
          <button
            type="button"
            onClick={() => setFilterPlatform('all')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '7px 16px',
              background: filterPlatform === 'all' ? '#18181b' : '#ffffff',
              color: filterPlatform === 'all' ? '#ffffff' : '#374151',
              border: filterPlatform === 'all' ? 'none' : '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '0.825rem',
              fontWeight: filterPlatform === 'all' ? 600 : 500,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)',
              transition: 'all 0.15s ease'
            }}
          >
            <LayoutGrid size={14} style={{ color: filterPlatform === 'all' ? '#ffffff' : '#6b7280' }} />
            <span>All Channels</span>
          </button>

          {/* X (Twitter) */}
          <button
            type="button"
            onClick={() => setFilterPlatform(filterPlatform === 'twitter' ? 'all' : 'twitter')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              background: filterPlatform === 'twitter' ? '#e5e1dc' : '#ffffff',
              color: '#374151',
              border: filterPlatform === 'twitter' ? 'none' : '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '0.825rem',
              fontWeight: filterPlatform === 'twitter' ? 600 : 500,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)',
              transition: 'all 0.15s ease'
            }}
          >
            <PlatformBadge platform="twitter" size={16} iconSize={11} />
            <span>X (Twitter)</span>
          </button>

          {/* LinkedIn */}
          <button
            type="button"
            onClick={() => setFilterPlatform(filterPlatform === 'linkedin' ? 'all' : 'linkedin')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              background: filterPlatform === 'linkedin' ? '#e5e1dc' : '#ffffff',
              color: '#374151',
              border: filterPlatform === 'linkedin' ? 'none' : '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '0.825rem',
              fontWeight: filterPlatform === 'linkedin' ? 600 : 500,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)',
              transition: 'all 0.15s ease'
            }}
          >
            <PlatformBadge platform="linkedin" size={16} iconSize={11} />
            <span>LinkedIn</span>
          </button>

          {/* Instagram */}
          <button
            type="button"
            onClick={() => setFilterPlatform(filterPlatform === 'instagram' ? 'all' : 'instagram')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              background: filterPlatform === 'instagram' ? '#e5e1dc' : '#ffffff',
              color: '#374151',
              border: filterPlatform === 'instagram' ? 'none' : '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '0.825rem',
              fontWeight: filterPlatform === 'instagram' ? 600 : 500,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)',
              transition: 'all 0.15s ease'
            }}
          >
            <PlatformBadge platform="instagram" size={16} iconSize={11} />
            <span>Instagram</span>
          </button>

          {/* Facebook */}
          <button
            type="button"
            onClick={() => setFilterPlatform(filterPlatform === 'facebook' ? 'all' : 'facebook')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              background: filterPlatform === 'facebook' ? '#e5e1dc' : '#ffffff',
              color: '#374151',
              border: filterPlatform === 'facebook' ? 'none' : '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '0.825rem',
              fontWeight: filterPlatform === 'facebook' ? 600 : 500,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)',
              transition: 'all 0.15s ease'
            }}
          >
            <PlatformBadge platform="facebook" size={16} iconSize={11} />
            <span>Facebook</span>
          </button>
        </div>

        {/* Right Search & Status Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          
          {/* Search Box */}
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input
              type="text"
              placeholder="Search comments..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                height: '36px',
                paddingLeft: '34px',
                paddingRight: '12px',
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '0.825rem',
                color: '#111827',
                outline: 'none',
                minWidth: '190px'
              }}
            />
          </div>

          {/* All Statuses Dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setShowStatusDropdown(!showStatusDropdown)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                height: '36px',
                padding: '0 14px',
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '0.825rem',
                fontWeight: 500,
                color: '#374151',
                cursor: 'pointer'
              }}
            >
              <span style={{ textTransform: 'capitalize' }}>{statusFilter === 'all' ? 'All Statuses' : statusFilter}</span>
              <ChevronDown size={14} style={{ color: '#9ca3af' }} />
            </button>

            {showStatusDropdown && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                right: 0,
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08)',
                zIndex: 30,
                minWidth: '140px',
                padding: '4px'
              }}>
                {[
                  { id: 'all', label: 'All Statuses' },
                  { id: 'open', label: 'Open' },
                  { id: 'closed', label: 'Closed' }
                ].map(st => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => {
                      setStatusFilter(st.id as any);
                      setShowStatusDropdown(false);
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '7px 12px',
                      background: statusFilter === st.id ? '#f3f4f6' : 'transparent',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      color: '#111827',
                      cursor: 'pointer'
                    }}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Filter Icon Button */}
          <button
            type="button"
            style={{
              width: '36px',
              height: '36px',
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#374151',
              cursor: 'pointer'
            }}
            title="Filter settings"
          >
            <SlidersHorizontal size={15} />
          </button>
        </div>
      </div>

      {/* 3. Master-Detail Two Column View */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '20px',
        alignItems: 'stretch',
        minHeight: '560px'
      }} className="responsive-comments-grid">
        
        {/* Left Column - Comments Master Queue Card */}
        <div className="card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', minHeight: '560px' }}>
          
          {/* Top Sub-Bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '20px',
            borderBottom: '1px solid #f3f4f6',
            paddingBottom: '14px'
          }}>
            {/* Left Checkbox & Segmented Pill Switcher */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <input
                type="checkbox"
                style={{ width: '16px', height: '16px', borderRadius: '4px', cursor: 'pointer' }}
                title="Select all"
              />

              <div style={{
                display: 'flex',
                background: '#f3f4f6',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '3px',
                gap: '2px'
              }}>
                {(['unresolved', 'assigned', 'resolved'] as const).map(tab => {
                  const isActive = inboxTab === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setInboxTab(tab)}
                      style={{
                        padding: '6px 14px',
                        background: isActive ? '#dedad5' : 'transparent',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: isActive ? 600 : 500,
                        color: isActive ? '#111827' : '#6b7280',
                        cursor: 'pointer',
                        textTransform: 'capitalize',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {tab}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right Sort Trigger */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setShowSortMenu(!showSortMenu)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'transparent',
                  border: 'none',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  color: '#374151',
                  cursor: 'pointer'
                }}
              >
                <ArrowDownUp size={13} style={{ color: '#6b7280' }} />
                <span>{sortOrder === 'newest' ? 'Newest' : 'Oldest'}</span>
                <ChevronDown size={13} style={{ color: '#9ca3af' }} />
              </button>

              {showSortMenu && (
                <div style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  right: 0,
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08)',
                  zIndex: 30,
                  minWidth: '120px',
                  padding: '4px'
                }}>
                  {(['newest', 'oldest'] as const).map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setSortOrder(s);
                        setShowSortMenu(false);
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '7px 12px',
                        background: sortOrder === s ? '#f3f4f6' : 'transparent',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        color: '#111827',
                        cursor: 'pointer',
                        textTransform: 'capitalize'
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Master List Body */}
          {loading ? (
            <div style={{ display: 'flex', flexGrow: 1, alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '0.875rem' }}>
              Loading discussions...
            </div>
          ) : filteredComments.length === 0 ? (
            /* Exact Empty State matching screenshot */
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flexGrow: 1,
              padding: '60px 20px 80px'
            }}>
              <div style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                background: '#f5efe6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px'
              }}>
                <MessageSquare size={34} style={{ color: '#8c7355', strokeWidth: 1.8 }} />
              </div>

              <h3 style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: '#111827',
                marginBottom: '6px'
              }}>
                No comments yet
              </h3>

              <p style={{
                fontSize: '0.825rem',
                color: '#6b7280',
                textAlign: 'center',
                maxWidth: '360px',
                lineHeight: 1.5
              }}>
                When your connected accounts receive comments, they will appear here. Reply, assign, or use AI to get suggested responses.
              </p>
            </div>
          ) : (
            /* Populated Comments Listing */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', flexGrow: 1 }}>
              {filteredComments.map((comment: any) => {
                const isSelected = selectedComment?._id === comment._id;
                return (
                  <div
                    key={comment._id}
                    onClick={() => {
                      setSelectedComment(comment);
                      setReplyMessage('');
                      setAiSuggestions([]);
                    }}
                    style={{
                      padding: '12px 14px',
                      background: isSelected ? '#f5efe6' : '#ffffff',
                      border: '1px solid',
                      borderColor: isSelected ? '#e0d5c5' : '#e5e7eb',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <PlatformBadge platform={comment.platform} size={18} iconSize={12} />
                        <span style={{ fontSize: '0.825rem', fontWeight: 600, color: '#111827' }}>
                          @{comment.author?.username || 'user'}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                        {formatDateTime(comment.createdAt)}
                      </span>
                    </div>

                    <p style={{
                      fontSize: '0.825rem',
                      color: '#4b5563',
                      margin: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {comment.message}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column - Active Discussion or Select Empty State */}
        <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', minHeight: '560px' }}>
          {!selectedComment ? (
            /* Exact Unselected State matching screenshot */
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flexGrow: 1,
              padding: '60px 20px 80px'
            }}>
              <div style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                background: '#f5efe6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px'
              }}>
                <Send size={32} style={{ color: '#8c7355', strokeWidth: 1.8, transform: 'rotate(-25deg) translate(2px, -2px)' }} />
              </div>

              <h3 style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: '#111827',
                marginBottom: '6px'
              }}>
                Select a comment
              </h3>

              <p style={{
                fontSize: '0.825rem',
                color: '#6b7280',
                textAlign: 'center',
                maxWidth: '320px',
                lineHeight: 1.5
              }}>
                Choose a comment from the list to view details, reply, or assign.
              </p>
            </div>
          ) : (
            /* Active Discussion Thread */
            <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'hidden' }}>
              
              {/* Header of Active Thread */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingBottom: '16px',
                borderBottom: '1px solid #e5e7eb',
                marginBottom: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <img
                    src={selectedComment.author?.avatarUrl || '/favicon.svg'}
                    alt=""
                    style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#f3f4f6' }}
                  />
                  <div>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827', margin: 0 }}>
                      {selectedComment.author?.displayName || `@${selectedComment.author?.username}`}
                    </h3>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      @{selectedComment.author?.username} on {selectedComment.platform}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {/* Assignee Selector */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    padding: '4px 8px'
                  }}>
                    <UserPlus size={13} style={{ color: '#6b7280' }} />
                    <select
                      value={selectedComment.assignedTo || ''}
                      onChange={e => handleAssignComment(selectedComment._id, e.target.value)}
                      style={{ background: 'none', border: 'none', color: '#374151', fontSize: '0.75rem', cursor: 'pointer', outline: 'none' }}
                    >
                      <option value="">Assign Member</option>
                      {teamMembers.map(m => (
                        <option key={m.userId} value={m.userId}>{m.fullName}</option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={() => handleResolveComment(selectedComment._id)}
                    className="btn btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '0.75rem', gap: '4px' }}
                  >
                    <CheckCircle size={14} style={{ color: '#10b981' }} />
                    <span>Resolve</span>
                  </button>
                </div>
              </div>

              {/* Discussion History Stream */}
              <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '10px', background: '#f9fafb', border: '1px solid #e5e7eb', padding: '14px', borderRadius: '10px' }}>
                  <img src={selectedComment.author?.avatarUrl || '/favicon.svg'} alt="" style={{ width: '28px', height: '28px', borderRadius: '50%' }} />
                  <div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'baseline', marginBottom: '4px' }}>
                      <span style={{ fontSize: '0.825rem', fontWeight: 600, color: '#111827' }}>{selectedComment.author?.displayName}</span>
                      <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{formatDateTime(selectedComment.createdAt)}</span>
                    </div>
                    <p style={{ fontSize: '0.85rem', color: '#374151', lineHeight: 1.5, margin: 0 }}>{selectedComment.message}</p>
                  </div>
                </div>

                {selectedComment.replies && selectedComment.replies.map((r: any) => (
                  <div key={r._id} style={{ display: 'flex', gap: '10px', marginLeft: '24px', background: '#eff6ff', border: '1px solid #dbeafe', padding: '12px', borderRadius: '10px' }}>
                    <img src={r.author?.avatarUrl || '/favicon.svg'} alt="" style={{ width: '24px', height: '24px', borderRadius: '50%' }} />
                    <div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'baseline', marginBottom: '4px' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#111827' }}>{r.author?.displayName}</span>
                        <span style={{ fontSize: '0.68rem', color: '#6b7280' }}>{formatDateTime(r.createdAt)}</span>
                      </div>
                      <p style={{ fontSize: '0.825rem', color: '#1e293b', lineHeight: 1.5, margin: 0 }}>{r.message}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* AI Suggested Replies */}
              <div style={{ marginBottom: '12px', borderTop: '1px solid #e5e7eb', paddingTop: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#111827', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Sparkles size={14} style={{ color: '#4f47ee' }} />
                    <span>AI Engagement Assistant</span>
                  </span>
                  <button
                    onClick={handleSuggestReply}
                    className="btn btn-secondary"
                    style={{ padding: '4px 10px', fontSize: '0.72rem' }}
                    disabled={loadingSuggestions}
                  >
                    {loadingSuggestions ? 'Analyzing...' : 'Suggest Replies'}
                  </button>
                </div>

                {aiSuggestions.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '120px', overflowY: 'auto' }}>
                    {aiSuggestions.map((sug, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setReplyMessage(sug)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          background: '#f9fafb',
                          border: '1px solid #e5e7eb',
                          borderRadius: '6px',
                          padding: '8px 12px',
                          color: '#374151',
                          fontSize: '0.78rem',
                          cursor: 'pointer',
                          lineHeight: 1.4
                        }}
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
                  placeholder="Type your reply for user approval..."
                  value={replyMessage}
                  onChange={e => setReplyMessage(e.target.value)}
                  required
                  style={{
                    flexGrow: 1,
                    height: '42px',
                    padding: '0 14px',
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    color: '#111827',
                    outline: 'none'
                  }}
                />
                <button
                  type="submit"
                  disabled={!replyMessage.trim()}
                  style={{
                    height: '42px',
                    padding: '0 18px',
                    background: '#18181b',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: replyMessage.trim() ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Send size={14} />
                  <span>Reply</span>
                </button>
              </form>
            </div>
          )}
        </div>

      </div>

    </div>
  );
};
