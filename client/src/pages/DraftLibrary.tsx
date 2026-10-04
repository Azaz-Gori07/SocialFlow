import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import {
  FileText,
  Plus,
  Trash2,
  Archive,
  Edit3,
  Image,
  Video,
  File,
  X,
  Check,
  Clock,
  AlertCircle,
  Send,
  RotateCcw,
  RefreshCw,
  ExternalLink,
  History,
  ChevronDown,
  ShieldCheck
} from 'lucide-react';
import { PlatformBadge } from '../components/SocialIcons';

type DraftPlatform = 'instagram' | 'facebook' | 'linkedin' | 'twitter' | 'youtube' | 'threads';
type DraftStatus = 'draft' | 'ready' | 'publishing' | 'archived' | 'published' | 'failed';

interface MediaRef {
  url: string;
  type: 'image' | 'video' | 'document';
  name: string;
  size?: number;
}

interface PlatformResponse {
  postId?: string;
  url?: string;
  platform: string;
  raw?: any;
}

interface Draft {
  _id: string;
  userId: string;
  platform: DraftPlatform;
  contentType: 'post' | 'story' | 'reel' | 'video' | 'carousel' | 'thread';
  media: MediaRef[];
  caption?: string;
  status: DraftStatus;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  retryCount: number;
  failedReason?: string;
  platformResponse?: PlatformResponse;
  lastAttemptAt?: string;
  errorMessage?: string;
  scheduledAt?: string;
}

const PLATFORMS: { key: DraftPlatform; label: string; color: string }[] = [
  { key: 'instagram', label: 'Instagram', color: '#E1306C' },
  { key: 'facebook', label: 'Facebook', color: '#1877F2' },
  { key: 'linkedin', label: 'LinkedIn', color: '#0077B5' },
  { key: 'twitter', label: 'X (Twitter)', color: '#1DA1F2' },
  { key: 'youtube', label: 'YouTube', color: '#FF0000' },
  { key: 'threads', label: 'Threads', color: '#000000' }
];

const STATUS_OPTIONS: { id: DraftStatus | ''; label: string; color?: string }[] = [
  { id: '', label: 'All Statuses' },
  { id: 'draft', label: 'Draft', color: '#3b82f6' },
  { id: 'ready', label: 'Ready', color: '#8b5cf6' },
  { id: 'publishing', label: 'Publishing', color: '#f59e0b' },
  { id: 'published', label: 'Published', color: '#10b981' },
  { id: 'archived', label: 'Archived', color: '#6b7280' },
  { id: 'failed', label: 'Failed', color: '#ef4444' }
];

const CONTENT_TYPES = ['post', 'story', 'reel', 'video', 'carousel', 'thread'] as const;

const getMediaIcon = (type: string) => {
  switch (type) {
    case 'image': return <Image size={14} />;
    case 'video': return <Video size={14} />;
    default: return <File size={14} />;
  }
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const DraftLibrary: React.FC = () => {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishingIds, setPublishingIds] = useState<Set<string>>(new Set());
  const [selectedPlatform, setSelectedPlatform] = useState<DraftPlatform | ''>('');
  const [selectedStatus, setSelectedStatus] = useState<DraftStatus | ''>('');
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingDraft, setEditingDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [_historyDraftId, setHistoryDraftId] = useState<string | null>(null);
  const [publishHistory, setPublishHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const limit = 20;

  const [createForm, setCreateForm] = useState({
    platform: '' as DraftPlatform | '',
    contentType: 'post' as string,
    caption: '',
    mediaUrl: '',
    mediaType: 'image' as 'image' | 'video' | 'document',
    mediaName: ''
  });

  const [editForm, setEditForm] = useState({
    contentType: 'post' as string,
    caption: '',
    status: 'draft' as DraftStatus
  });

  const fetchDrafts = useCallback(async (resetPage = false) => {
    setLoading(true);
    try {
      const currentPage = resetPage ? 0 : page;
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(currentPage * limit));
      if (selectedPlatform) params.set('platform', selectedPlatform);
      if (selectedStatus) params.set('status', selectedStatus);

      const result = await api.drafts.list(params.toString());
      setDrafts(result.items || []);
      setTotal(result.total || 0);
      setHasMore(result.hasMore || false);
      if (resetPage) setPage(0);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to load drafts' });
    } finally {
      setLoading(false);
    }
  }, [selectedPlatform, selectedStatus, page, limit]);

  useEffect(() => {
    fetchDrafts(true);
  }, [selectedPlatform, selectedStatus]);

  const handleCreate = async () => {
    if (!createForm.platform) {
      setMessage({ type: 'error', text: 'Please select a platform' });
      return;
    }
    try {
      const media: MediaRef[] = [];
      if (createForm.mediaUrl && createForm.mediaName) {
        media.push({ url: createForm.mediaUrl, type: createForm.mediaType, name: createForm.mediaName });
      }
      await api.drafts.create({
        platform: createForm.platform,
        contentType: createForm.contentType,
        caption: createForm.caption || undefined,
        media: media.length > 0 ? media : undefined
      });
      setMessage({ type: 'success', text: 'Draft created successfully' });
      setShowCreateModal(false);
      setCreateForm({ platform: '', contentType: 'post', caption: '', mediaUrl: '', mediaType: 'image', mediaName: '' });
      fetchDrafts(true);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to create draft' });
    }
  };

  const handleEdit = async () => {
    if (!editingDraft) return;
    try {
      await api.drafts.update(editingDraft._id, {
        contentType: editForm.contentType,
        caption: editForm.caption || undefined,
        status: editForm.status
      });
      setMessage({ type: 'success', text: 'Draft updated successfully' });
      setShowEditModal(false);
      setEditingDraft(null);
      fetchDrafts(true);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to update draft' });
    }
  };

  const handleArchive = async (draft: Draft) => {
    if (!window.confirm(`Archive this ${draft.platform} draft?`)) return;
    try {
      await api.drafts.archive(draft._id);
      setMessage({ type: 'success', text: 'Draft archived successfully' });
      fetchDrafts(true);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to archive draft' });
    }
  };

  const handleDelete = async (draft: Draft) => {
    if (!window.confirm(`Permanently delete this ${draft.platform} draft?`)) return;
    try {
      await api.drafts.delete(draft._id);
      setMessage({ type: 'success', text: 'Draft deleted successfully' });
      fetchDrafts(true);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to delete draft' });
    }
  };

  // Phase 2: Publish actions
  const handlePublish = async (draft: Draft) => {
    if (!window.confirm(`Publish this ${draft.platform} draft now?`)) return;
    setPublishingIds(prev => new Set(prev).add(draft._id));
    try {
      const result = await api.drafts.publish(draft._id);
      setMessage({
        type: result.status === 'published' ? 'success' : 'error',
        text: result.status === 'published'
          ? `Draft published successfully to ${draft.platform}!`
          : `Publishing failed: ${result.errorMessage || result.failedReason || 'Unknown error'}`
      });
      fetchDrafts(true);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to publish draft' });
      fetchDrafts(true);
    } finally {
      setPublishingIds(prev => {
        const next = new Set(prev);
        next.delete(draft._id);
        return next;
      });
    }
  };

  const handleQueue = async (draft: Draft) => {
    try {
      await api.drafts.queue(draft._id);
      setMessage({ type: 'success', text: 'Draft queued for publishing. Scheduler will process it shortly.' });
      fetchDrafts(true);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to queue draft' });
    }
  };

  const handleRetry = async (draft: Draft) => {
    if (!window.confirm(`Retry publishing this ${draft.platform} draft?`)) return;
    setPublishingIds(prev => new Set(prev).add(draft._id));
    try {
      const result = await api.drafts.retry(draft._id);
      setMessage({
        type: result.status === 'published' ? 'success' : 'error',
        text: result.status === 'published'
          ? `Draft published successfully on retry!`
          : `Retry failed: ${result.errorMessage || 'Unknown error'}`
      });
      fetchDrafts(true);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to retry draft' });
      fetchDrafts(true);
    } finally {
      setPublishingIds(prev => {
        const next = new Set(prev);
        next.delete(draft._id);
        return next;
      });
    }
  };

  const openEditModal = (draft: Draft) => {
    setEditingDraft(draft);
    setEditForm({
      contentType: draft.contentType,
      caption: draft.caption || '',
      status: draft.status === 'published' || draft.status === 'publishing' ? 'draft' : draft.status
    });
    setShowEditModal(true);
  };

  const openHistoryModal = async (draft: Draft) => {
    setHistoryDraftId(draft._id);
    setShowHistoryModal(true);
    setLoadingHistory(true);
    try {
      const data = await api.drafts.history(draft._id);
      setPublishHistory(data || []);
    } catch (err: any) {
      setPublishHistory([]);
      setMessage({ type: 'error', text: err.message || 'Failed to load publish history' });
    } finally {
      setLoadingHistory(false);
    }
  };

  const getStatusBadge = (status: DraftStatus) => {
    const styles: Record<DraftStatus, { bg: string; color: string; label: string }> = {
      draft: { bg: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', label: 'Draft' },
      ready: { bg: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6', label: 'Ready' },
      publishing: { bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', label: 'Publishing' },
      archived: { bg: 'rgba(107, 114, 128, 0.15)', color: '#6b7280', label: 'Archived' },
      published: { bg: 'rgba(16, 185, 129, 0.15)', color: '#10b981', label: 'Published' },
      failed: { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', label: 'Failed' }
    };
    const s = styles[status];
    return (
      <span style={{ background: s.bg, color: s.color, padding: '2px 8px', borderRadius: '99px', fontSize: '0.7rem', fontWeight: 600 }}>
        {s.label}
      </span>
    );
  };

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
            DRAFTS
          </div>
          <h1 style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: '2.35rem',
            fontWeight: 700,
            color: '#111827',
            letterSpacing: '-0.02em',
            marginBottom: '4px',
            lineHeight: 1.15
          }}>
            Draft Library
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', lineHeight: 1.4 }}>
            Platform-isolated draft queues. Publish directly or queue for background processing.
          </p>
        </div>

        <button 
          onClick={() => setShowCreateModal(true)} 
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
          <span>New Draft</span>
        </button>
      </div>

      {message && (
        <div style={{
          padding: '12px 16px', borderRadius: 'var(--radius-md)',
          background: message.type === 'success' ? '#ecfdf5' : '#fef2f2',
          border: `1px solid ${message.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
          color: message.type === 'success' ? '#10b981' : '#b91c1c',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.875rem'
        }}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '2px' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* 2. Filter Bar */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.85rem', color: '#374151', fontWeight: 500, marginRight: '4px' }}>Filter:</span>
        
        <button 
          onClick={() => { setSelectedPlatform(''); setSelectedStatus(''); }}
          style={{
            padding: '7px 16px',
            fontSize: '0.825rem',
            fontWeight: !selectedPlatform && !selectedStatus ? 600 : 500,
            background: !selectedPlatform && !selectedStatus ? '#e5e1dc' : '#ffffff',
            color: '#111827',
            border: !selectedPlatform && !selectedStatus ? 'none' : '1px solid #e5e7eb',
            borderRadius: '8px',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          All Drafts
        </button>

        {PLATFORMS.map(p => {
          const isSelected = selectedPlatform === p.key;
          return (
            <button 
              key={p.key} 
              onClick={() => setSelectedPlatform(isSelected ? '' : p.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                fontSize: '0.825rem',
                fontWeight: isSelected ? 600 : 500,
                background: isSelected ? '#e5e1dc' : '#ffffff',
                color: '#374151',
                border: isSelected ? 'none' : '1px solid #e5e7eb',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)'
              }}
            >
              <PlatformBadge platform={p.key} size={16} iconSize={11} />
              <span>{p.label}</span>
            </button>
          );
        })}

        <div style={{ flexGrow: 1 }} />

        {/* Status Dropdown on the right */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setShowStatusDropdown(!showStatusDropdown)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              height: '38px',
              padding: '0 14px',
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '9px',
              color: '#374151',
              fontSize: '0.825rem',
              fontWeight: 500,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = '#d1d5db')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = '#e5e7eb')}
          >
            {selectedStatus ? (
              <span style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: STATUS_OPTIONS.find(s => s.id === selectedStatus)?.color || '#10b981'
              }} />
            ) : (
              <ShieldCheck size={15} style={{ color: '#6b7280' }} />
            )}
            <span>{STATUS_OPTIONS.find(s => s.id === selectedStatus)?.label || 'All Statuses'}</span>
            <ChevronDown size={14} style={{ color: '#9ca3af', transform: showStatusDropdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
          </button>

          {showStatusDropdown && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              right: 0,
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '10px',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
              zIndex: 40,
              minWidth: '170px',
              padding: '5px'
            }}>
              {STATUS_OPTIONS.map(opt => {
                const isSelected = selectedStatus === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setSelectedStatus(opt.id);
                      setShowStatusDropdown(false);
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      background: isSelected ? '#f3f4f6' : 'transparent',
                      border: 'none',
                      borderRadius: '6px',
                      color: isSelected ? '#111827' : '#4b5563',
                      fontSize: '0.825rem',
                      fontWeight: isSelected ? 600 : 500,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 0.15s ease'
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) e.currentTarget.style.background = '#f9fafb';
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    {opt.color ? (
                      <span style={{
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        background: opt.color,
                        flexShrink: 0
                      }} />
                    ) : (
                      <span style={{ width: '7px', height: '7px' }} />
                    )}
                    <span style={{ flexGrow: 1 }}>{opt.label}</span>
                    {isSelected && <Check size={14} style={{ color: '#111827' }} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 3. Main Card with Empty State or Populated List */}
      <div className="card" style={{ padding: '28px', minHeight: '520px', display: 'flex', flexDirection: 'column' }}>
        {loading ? (
          <div style={{ display: 'flex', flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: '60px', color: '#9ca3af', fontSize: '0.875rem' }}>
            Loading draft library...
          </div>
        ) : drafts.length === 0 ? (
          /* Exact 100% Empty State matching the screenshot */
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flexGrow: 1,
            padding: '60px 20px 80px'
          }}>
            {/* Centered Soft Circle with FileText icon */}
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
              <FileText size={34} style={{ color: '#8c7355', strokeWidth: 1.8 }} />
            </div>

            <h3 style={{
              fontFamily: "Georgia, 'Times New Roman', serif",
              fontSize: '1.65rem',
              fontWeight: 600,
              color: '#111827',
              marginBottom: '6px'
            }}>
              No drafts yet
            </h3>

            <p style={{
              fontSize: '0.875rem',
              color: '#6b7280',
              textAlign: 'center',
              maxWidth: '440px',
              lineHeight: 1.6,
              marginBottom: '22px'
            }}>
              Create your first draft to start planning, refining and publishing content across your connected channels.
            </p>

            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                padding: '10px 22px',
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
              <span>Create Draft</span>
            </button>
          </div>
        ) : (
          /* Populated Drafts Listing */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {drafts.map(draft => (
              <div key={draft._id} style={{
                padding: '18px 22px',
                background: '#fafaf9',
                border: '1px solid #e5e7eb',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '16px'
              }}>
                <PlatformBadge platform={draft.platform} size={36} iconSize={18} />

                <div style={{ flexGrow: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, textTransform: 'capitalize', color: '#111827' }}>
                      {draft.contentType}
                    </span>
                    {getStatusBadge(draft.status)}
                    {draft.retryCount > 0 && (
                      <span style={{ fontSize: '0.72rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <AlertCircle size={11} /> Retry #{draft.retryCount}
                      </span>
                    )}
                  </div>

                  {draft.caption && (
                    <p style={{ fontSize: '0.875rem', color: '#374151', marginBottom: '8px', lineHeight: 1.5, maxHeight: '2.8em', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {draft.caption}
                    </p>
                  )}

                  {draft.media.length > 0 && (
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                      {draft.media.map((m, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', background: '#f3f4f6', borderRadius: '4px', fontSize: '0.7rem', color: '#4b5563' }}>
                          {getMediaIcon(m.type)}
                          <span style={{ maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '16px', fontSize: '0.72rem', color: '#9ca3af', flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={12} /> Created {formatDate(draft.createdAt)}
                    </span>
                    {draft.publishedAt && <span>Published {formatDate(draft.publishedAt)}</span>}
                    {draft.lastAttemptAt && <span>Last attempt {formatDate(draft.lastAttemptAt)}</span>}
                    {draft.platformResponse?.postId && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <ExternalLink size={12} /> Post ID: {draft.platformResponse.postId.substring(0, 12)}...
                      </span>
                    )}
                    {draft.errorMessage && <span style={{ color: '#ef4444' }}>Error: {draft.errorMessage}</span>}
                    {draft.failedReason && !draft.errorMessage && <span style={{ color: '#ef4444' }}>Reason: {draft.failedReason}</span>}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap' }}>
                  {(draft.status === 'draft' || draft.status === 'failed') && (
                    <>
                      <button onClick={() => handleQueue(draft)} className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '0.75rem' }} title="Queue for Publishing">
                        <RefreshCw size={14} />
                      </button>
                      <button onClick={() => handlePublish(draft)} className="btn btn-primary" style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                        disabled={publishingIds.has(draft._id)} title="Publish Now">
                        {publishingIds.has(draft._id) ? <RotateCcw size={14} className="animate-spin" /> : <Send size={14} />}
                      </button>
                    </>
                  )}
                  {draft.status === 'failed' && (
                    <button onClick={() => handleRetry(draft)} className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '0.75rem', color: '#f59e0b' }}
                      disabled={publishingIds.has(draft._id)} title="Retry Draft">
                      <RefreshCw size={14} />
                    </button>
                  )}
                  {draft.status === 'ready' && (
                    <button onClick={() => handlePublish(draft)} className="btn btn-primary" style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                      disabled={publishingIds.has(draft._id)} title="Publish Now">
                      {publishingIds.has(draft._id) ? <RotateCcw size={14} className="animate-spin" /> : <Send size={14} />}
                    </button>
                  )}
                  {draft.status !== 'published' && draft.status !== 'publishing' && (
                    <button onClick={() => openEditModal(draft)} className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '0.75rem' }} title="Edit Draft">
                      <Edit3 size={14} />
                    </button>
                  )}
                  {draft.status !== 'archived' && draft.status !== 'published' && (
                    <button onClick={() => handleArchive(draft)} className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '0.75rem' }} title="Archive Draft">
                      <Archive size={14} />
                    </button>
                  )}
                  <button onClick={() => openHistoryModal(draft)} className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '0.75rem' }} title="Publish History">
                    <History size={14} />
                  </button>
                  <button onClick={() => handleDelete(draft)} className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '0.75rem', color: '#ef4444' }} title="Delete Draft">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', padding: '16px' }}>
              <button onClick={() => { setPage(p => Math.max(0, p - 1)); fetchDrafts(); }} className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: '0.8rem' }} disabled={page === 0}>
                Previous
              </button>
              <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>Page {page + 1} · {total} total</span>
              <button onClick={() => { setPage(p => p + 1); fetchDrafts(); }} className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: '0.8rem' }} disabled={!hasMore}>
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {showCreateModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="glass-card animate-fade-in responsive-modal" style={{ maxWidth: '520px', width: '90%', padding: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Create New Draft</h3>
              <button onClick={() => setShowCreateModal(false)} className="btn btn-secondary" style={{ padding: '6px', border: 'none' }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="form-label">Platform *</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: '8px', marginTop: '6px' }}>
                  {PLATFORMS.map(p => (
                    <button key={p.key} onClick={() => setCreateForm(f => ({ ...f, platform: p.key }))} style={{ padding: '10px 8px', background: createForm.platform === p.key ? `${p.color}20` : 'rgba(255,255,255,0.02)', border: `1px solid ${createForm.platform === p.key ? p.color : 'var(--border-glass)'}`, borderRadius: 'var(--radius-md)', color: createForm.platform === p.key ? p.color : 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: createForm.platform === p.key ? 600 : 400, textAlign: 'center' }}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="form-label">Content Type</label>
                <select value={createForm.contentType} onChange={e => setCreateForm(f => ({ ...f, contentType: e.target.value }))} className="form-input">
                  {CONTENT_TYPES.map(ct => (<option key={ct} value={ct}>{ct.charAt(0).toUpperCase() + ct.slice(1)}</option>))}
                </select>
              </div>
              <div>
                <label className="form-label">Caption</label>
                <textarea className="form-input" style={{ minHeight: '80px', resize: 'vertical' }} placeholder="Enter draft caption..." value={createForm.caption} onChange={e => setCreateForm(f => ({ ...f, caption: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Media Reference</label>
                <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input className="form-input" style={{ flexGrow: 1 }} placeholder="Media URL" value={createForm.mediaUrl} onChange={e => setCreateForm(f => ({ ...f, mediaUrl: e.target.value }))} />
                    <select value={createForm.mediaType} onChange={e => setCreateForm(f => ({ ...f, mediaType: e.target.value as any }))} className="form-input" style={{ width: '100px' }}>
                      <option value="image">Image</option>
                      <option value="video">Video</option>
                      <option value="document">Document</option>
                    </select>
                  </div>
                  <input className="form-input" placeholder="Media name (e.g. banner.jpg)" value={createForm.mediaName} onChange={e => setCreateForm(f => ({ ...f, mediaName: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button onClick={() => setShowCreateModal(false)} className="btn btn-secondary" style={{ flexGrow: 1 }}>Cancel</button>
                <button onClick={handleCreate} className="btn btn-primary" style={{ flexGrow: 1 }} disabled={!createForm.platform}>
                  <Check size={16} /><span>Create Draft</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEditModal && editingDraft && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="glass-card animate-fade-in responsive-modal" style={{ maxWidth: '520px', width: '90%', padding: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Edit {editingDraft.platform} Draft</h3>
              <button onClick={() => { setShowEditModal(false); setEditingDraft(null); }} className="btn btn-secondary" style={{ padding: '6px', border: 'none' }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="form-label">Content Type</label>
                <select value={editForm.contentType} onChange={e => setEditForm(f => ({ ...f, contentType: e.target.value }))} className="form-input">
                  {CONTENT_TYPES.map(ct => (<option key={ct} value={ct}>{ct.charAt(0).toUpperCase() + ct.slice(1)}</option>))}
                </select>
              </div>
              <div>
                <label className="form-label">Caption</label>
                <textarea className="form-input" style={{ minHeight: '80px', resize: 'vertical' }} value={editForm.caption} onChange={e => setEditForm(f => ({ ...f, caption: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Status</label>
                <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value as DraftStatus }))} className="form-input">
                  <option value="draft">Draft</option>
                  <option value="ready">Ready</option>
                  <option value="archived">Archived</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button onClick={() => { setShowEditModal(false); setEditingDraft(null); }} className="btn btn-secondary" style={{ flexGrow: 1 }}>Cancel</button>
                <button onClick={handleEdit} className="btn btn-primary" style={{ flexGrow: 1 }}>
                  <Check size={16} /><span>Save Changes</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showHistoryModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="glass-card animate-fade-in responsive-modal" style={{ maxWidth: '640px', width: '90%', padding: '28px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Publish History</h3>
              <button onClick={() => { setShowHistoryModal(false); setHistoryDraftId(null); }} className="btn btn-secondary" style={{ padding: '6px', border: 'none' }}>
                <X size={16} />
              </button>
            </div>
            {loadingHistory ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading history...</div>
            ) : publishHistory.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No publish attempts recorded for this draft.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {publishHistory.map((entry: any, idx: number) => (
                  <div key={idx} style={{ padding: '12px', background: entry.outcome === 'success' ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)', border: `1px solid ${entry.outcome === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`, borderRadius: 'var(--radius-md)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.85rem', color: entry.outcome === 'success' ? '#10b981' : '#ef4444' }}>
                        Attempt #{entry.attemptNumber} — {entry.outcome === 'success' ? 'SUCCESS' : 'FAILED'}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {formatDate(entry.createdAt)}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <span>{entry.statusBefore} → {entry.statusAfter}</span>
                      {entry.platformResponse?.postId && <span>Post ID: {entry.platformResponse.postId}</span>}
                      {entry.errorMessage && <span style={{ color: '#ef4444' }}>Error: {entry.errorMessage}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DraftLibrary;