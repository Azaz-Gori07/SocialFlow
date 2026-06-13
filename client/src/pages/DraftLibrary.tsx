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
  History
} from 'lucide-react';

type DraftPlatform = 'instagram' | 'facebook' | 'linkedin' | 'twitter' | 'youtube';
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
  { key: 'youtube', label: 'YouTube', color: '#FF0000' }
];

const CONTENT_TYPES = ['post', 'story', 'reel', 'video', 'carousel', 'thread'] as const;

const getPlatformColor = (platform: DraftPlatform): string => {
  const p = PLATFORMS.find(p => p.key === platform);
  return p?.color || 'hsl(var(--text-secondary))';
};

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
    <div className="animate-fade-in" style={{ position: 'relative' }}>
      <div className="glow-blur" />

      <div className="header-bar">
        <div>
          <h1 className="page-title">Draft Library</h1>
          <p style={{ color: 'hsl(var(--text-secondary))', marginTop: '4px', fontSize: '0.95rem' }}>
            Platform-isolated draft queues. Publish directly or queue for background processing.
          </p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn btn-primary" style={{ gap: '6px', whiteSpace: 'nowrap' }}>
          <Plus size={16} />
          <span>New Draft</span>
        </button>
      </div>

      {message && (
        <div style={{
          padding: '12px 16px', borderRadius: 'var(--radius-md)',
          background: message.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
          border: `1px solid ${message.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
          color: message.type === 'success' ? '#10b981' : '#ef4444',
          marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.9rem'
        }}>
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '2px' }}>
            <X size={14} />
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))', fontWeight: 600 }}>Filter:</span>
        <button onClick={() => { setSelectedPlatform(''); setSelectedStatus(''); }}
          className="btn btn-secondary"
          style={{ padding: '6px 12px', fontSize: '0.8rem', background: !selectedPlatform && !selectedStatus ? 'hsl(var(--primary) / 0.15)' : undefined, color: !selectedPlatform && !selectedStatus ? 'white' : undefined }}>
          All Drafts
        </button>
        {PLATFORMS.map(p => (
          <button key={p.key} onClick={() => setSelectedPlatform(selectedPlatform === p.key ? '' : p.key)}
            className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem', background: selectedPlatform === p.key ? `${p.color}20` : undefined, color: selectedPlatform === p.key ? p.color : undefined, borderColor: selectedPlatform === p.key ? p.color : undefined }}>
            {p.label}
          </button>
        ))}
        <div style={{ flexGrow: 1 }} />
        <select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value as DraftStatus | '')}
          className="form-input" style={{ width: 'auto', padding: '6px 12px', fontSize: '0.8rem' }}>
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="ready">Ready</option>
          <option value="publishing">Publishing</option>
          <option value="archived">Archived</option>
          <option value="published">Published</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid rgba(255,255,255,0.05)', borderTopColor: 'hsl(var(--primary))', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        </div>
      ) : drafts.length === 0 ? (
        <div className="glass-card" style={{ padding: '60px', textAlign: 'center' }}>
          <FileText size={40} style={{ color: 'hsl(var(--text-muted) / 0.4)', marginBottom: '12px' }} />
          <h3 style={{ fontSize: '1.1rem', color: 'hsl(var(--text-secondary))', marginBottom: '8px' }}>No Drafts Found</h3>
          <p style={{ fontSize: '0.85rem', color: 'hsl(var(--text-muted))' }}>
            {selectedPlatform
              ? `No ${PLATFORMS.find(p => p.key === selectedPlatform)?.label} drafts ${selectedStatus ? `with status "${selectedStatus}"` : ''}.`
              : 'Create your first draft to get started.'}
          </p>
          {!selectedPlatform && (
            <button onClick={() => setShowCreateModal(true)} className="btn btn-primary" style={{ marginTop: '16px', gap: '6px' }}>
              <Plus size={16} />
              <span>Create Draft</span>
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {drafts.map(draft => (
            <div key={draft._id} className="glass-card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', background: `${getPlatformColor(draft.platform)}15`, border: `1px solid ${getPlatformColor(draft.platform)}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.7rem', color: getPlatformColor(draft.platform), flexShrink: 0 }}>
                {draft.platform === 'twitter' ? 'X' : draft.platform.charAt(0).toUpperCase() + draft.platform.slice(1, 2)}
              </div>

              <div style={{ flexGrow: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'capitalize', color: 'white' }}>{draft.contentType}</span>
                  {getStatusBadge(draft.status)}
                  {draft.retryCount > 0 && (
                    <span style={{ fontSize: '0.7rem', color: 'hsl(var(--text-muted))', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <AlertCircle size={11} /> Retry #{draft.retryCount}
                    </span>
                  )}
                </div>

                {draft.caption && (
                  <p style={{ fontSize: '0.85rem', color: 'hsl(var(--text-secondary))', marginBottom: '6px', lineHeight: '1.4', maxHeight: '2.8em', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {draft.caption}
                  </p>
                )}

                {draft.media.length > 0 && (
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '6px', flexWrap: 'wrap' }}>
                    {draft.media.map((m, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px', background: 'rgba(255,255,255,0.04)', borderRadius: '4px', fontSize: '0.7rem', color: 'hsl(var(--text-muted))' }}>
                        {getMediaIcon(m.type)}
                        <span style={{ maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '16px', fontSize: '0.7rem', color: 'hsl(var(--text-muted))', flexWrap: 'wrap' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={11} /> Created {formatDate(draft.createdAt)}
                  </span>
                  {draft.publishedAt && <span>Published {formatDate(draft.publishedAt)}</span>}
                  {draft.lastAttemptAt && <span>Last attempt {formatDate(draft.lastAttemptAt)}</span>}
                  {draft.platformResponse?.postId && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <ExternalLink size={11} /> Post: {draft.platformResponse.postId.substring(0, 12)}...
                    </span>
                  )}
                  {draft.errorMessage && <span style={{ color: '#ef4444' }}>Error: {draft.errorMessage}</span>}
                  {draft.failedReason && !draft.errorMessage && <span style={{ color: '#ef4444' }}>Reason: {draft.failedReason}</span>}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap' }}>
                {/* Phase 2: Publish actions */}
                {(draft.status === 'draft' || draft.status === 'failed') && (
                  <>
                    <button onClick={() => handleQueue(draft)} className="btn btn-secondary" style={{ padding: '6px', fontSize: '0.75rem' }} title="Queue for Publishing">
                      <RefreshCw size={14} />
                    </button>
                    <button onClick={() => handlePublish(draft)} className="btn btn-primary" style={{ padding: '6px', fontSize: '0.75rem', background: draft.status === 'failed' ? '#ef444420' : undefined, borderColor: draft.status === 'failed' ? '#ef4444' : undefined, color: draft.status === 'failed' ? '#ef4444' : undefined }}
                      disabled={publishingIds.has(draft._id)} title={draft.status === 'failed' ? 'Retry Publish' : 'Publish Now'}>
                      {publishingIds.has(draft._id) ? <RotateCcw size={14} className="animate-spin" /> : <Send size={14} />}
                    </button>
                  </>
                )}
                {draft.status === 'ready' && (
                  <button onClick={() => handlePublish(draft)} className="btn btn-primary" style={{ padding: '6px', fontSize: '0.75rem' }}
                    disabled={publishingIds.has(draft._id)} title="Publish Now">
                    {publishingIds.has(draft._id) ? <RotateCcw size={14} className="animate-spin" /> : <Send size={14} />}
                  </button>
                )}
                {draft.status === 'failed' && draft.retryCount < 3 && (
                  <button onClick={() => handleRetry(draft)} className="btn btn-secondary" style={{ padding: '6px', fontSize: '0.75rem', color: '#f59e0b' }}
                    disabled={publishingIds.has(draft._id)} title="Retry">
                    <RefreshCw size={14} />
                  </button>
                )}
                {draft.status !== 'published' && draft.status !== 'publishing' && (
                  <button onClick={() => openEditModal(draft)} className="btn btn-secondary" style={{ padding: '6px', fontSize: '0.75rem' }} title="Edit Draft">
                    <Edit3 size={14} />
                  </button>
                )}
                {draft.status !== 'archived' && draft.status !== 'published' && (
                  <button onClick={() => handleArchive(draft)} className="btn btn-secondary" style={{ padding: '6px', fontSize: '0.75rem' }} title="Archive Draft">
                    <Archive size={14} />
                  </button>
                )}
                <button onClick={() => openHistoryModal(draft)} className="btn btn-secondary" style={{ padding: '6px', fontSize: '0.75rem' }} title="Publish History">
                  <History size={14} />
                </button>
                <button onClick={() => handleDelete(draft)} className="btn btn-secondary" style={{ padding: '6px', fontSize: '0.75rem', color: '#ef4444' }} title="Delete Draft">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}

          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', padding: '16px' }}>
            <button onClick={() => { setPage(p => Math.max(0, p - 1)); fetchDrafts(); }} className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: '0.8rem' }} disabled={page === 0}>
              Previous
            </button>
            <span style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>Page {page + 1} · {total} total</span>
            <button onClick={() => { setPage(p => p + 1); fetchDrafts(); }} className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: '0.8rem' }} disabled={!hasMore}>
              Next
            </button>
          </div>
        </div>
      )}

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
                    <button key={p.key} onClick={() => setCreateForm(f => ({ ...f, platform: p.key }))} style={{ padding: '10px 8px', background: createForm.platform === p.key ? `${p.color}20` : 'rgba(255,255,255,0.02)', border: `1px solid ${createForm.platform === p.key ? p.color : 'var(--border-glass)'}`, borderRadius: 'var(--radius-md)', color: createForm.platform === p.key ? p.color : 'hsl(var(--text-secondary))', cursor: 'pointer', fontSize: '0.8rem', fontWeight: createForm.platform === p.key ? 600 : 400, textAlign: 'center' }}>
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
              <div style={{ textAlign: 'center', padding: '40px', color: 'hsl(var(--text-muted))' }}>Loading history...</div>
            ) : publishHistory.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'hsl(var(--text-muted))' }}>No publish attempts recorded for this draft.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {publishHistory.map((entry: any, idx: number) => (
                  <div key={idx} style={{ padding: '12px', background: entry.outcome === 'success' ? 'rgba(16, 185, 129, 0.05)' : 'rgba(239, 68, 68, 0.05)', border: `1px solid ${entry.outcome === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`, borderRadius: 'var(--radius-md)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.85rem', color: entry.outcome === 'success' ? '#10b981' : '#ef4444' }}>
                        Attempt #{entry.attemptNumber} — {entry.outcome === 'success' ? 'SUCCESS' : 'FAILED'}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>
                        {formatDate(entry.createdAt)}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'hsl(var(--text-secondary))', display: 'flex', flexDirection: 'column', gap: '3px' }}>
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