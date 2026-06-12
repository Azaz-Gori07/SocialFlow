import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { 
  Calendar, 
  Plus, 
  Upload, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  FileText
} from 'lucide-react';

export const Scheduler: React.FC = () => {
  const [posts, setPosts] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  // New Post Form
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [platforms, setPlatforms] = useState<string[]>(['twitter']);
  const [content, setContent] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('12:00');

  // Bulk Scheduler Form
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [csvContent, setCsvContent] = useState('');
  const [bulkStatus, setBulkStatus] = useState('');

  const loadPosts = async () => {
    setLoading(true);
    try {
      const data = await api.posts.list(filter === 'all' ? undefined : filter);
      setPosts(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPosts();
  }, [filter]);

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (platforms.length === 0 || !content) return;

    try {
      const targetDate = scheduleDate ? new Date(`${scheduleDate}T${scheduleTime}:00`) : undefined;
      
      await api.posts.create({
        platforms,
        content,
        scheduledAt: targetDate ? targetDate.toISOString() : undefined
      });

      setShowCreateModal(false);
      setContent('');
      setScheduleDate('');
      loadPosts();
    } catch (err) {
      console.error(err);
      alert('Failed to schedule post.');
    }
  };

  const handleDeletePost = async (id: string) => {
    if (!confirm('Are you sure you want to cancel and delete this post?')) return;
    try {
      await api.posts.delete(id);
      loadPosts();
    } catch (err) {
      console.error(err);
    }
  };

  // Bulk scheduler simulation
  const handleBulkSchedule = async () => {
    if (!csvContent.trim()) return;
    setBulkStatus('Processing CSV rows...');

    try {
      // Parse CSV rows: platforms,content,scheduledAt
      // Example row: "twitter|linkedin,My First Product Launch Post,2026-06-15T14:30:00.000Z"
      const lines = csvContent.split('\n');
      const payload: any[] = [];
      
      let count = 0;
      for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.split('|');
        if (parts.length >= 3) {
          const plats = parts[0].split(',').map(p => p.trim());
          const text = parts[1].trim();
          const time = parts[2].trim();
          
          payload.push({
            platforms: plats,
            content: text,
            scheduledAt: time
          });
          count++;
        }
      }

      if (payload.length === 0) {
        setBulkStatus('Error: Invalid format. Please use: platforms|content|ISOtime');
        return;
      }

      await api.posts.bulkSchedule(payload);
      setBulkStatus(`Successfully queued ${count} posts!`);
      
      setTimeout(() => {
        setShowBulkModal(false);
        setCsvContent('');
        setBulkStatus('');
        loadPosts();
      }, 2000);

    } catch (err: any) {
      console.error(err);
      setBulkStatus(`Bulk scheduling failed: ${err.message}`);
    }
  };

  // Pre-fill bulk schedule text with 50+ posts example
  const loadExampleCsv = () => {
    let exampleText = '';
    const today = new Date();
    
    // Generate 50 items
    for (let i = 1; i <= 52; i++) {
      const scheduledTime = new Date(today.getTime() + (i * 4 * 60 * 60 * 1000)); // Every 4 hours
      const p = i % 2 === 0 ? 'twitter,linkedin' : 'instagram,facebook';
      exampleText += `${p}|🚀 Bulk Automated Post #${i}: Streamlining content operations!|${scheduledTime.toISOString()}\n`;
    }
    setCsvContent(exampleText);
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'published': return <CheckCircle2 size={16} style={{ color: '#10b981' }} />;
      case 'scheduled': return <Clock size={16} style={{ color: '#f59e0b' }} />;
      case 'failed': return <AlertCircle size={16} style={{ color: '#ef4444' }} />;
      default: return <Clock size={16} style={{ color: 'hsl(var(--text-muted))' }} />;
    }
  };

  const formatDateTime = (isoString?: string) => {
    if (!isoString) return 'Immediate';
    const d = new Date(isoString);
    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="animate-fade-in" style={{ position: 'relative' }}>
      <div className="glow-blur" />

      {/* Header */}
      <div className="header-bar">
        <div>
          <h1 className="page-title">Post Scheduler</h1>
          <p style={{ color: 'hsl(var(--text-secondary))', marginTop: '4px', fontSize: '0.95rem' }}>
            Coordinate your publishing schedule, manage queues, and upload bulk campaigns.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button 
            onClick={() => setShowBulkModal(true)} 
            className="btn btn-secondary"
            style={{ gap: '8px' }}
          >
            <Upload size={16} />
            <span>Bulk CSV Scheduler</span>
          </button>
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="btn btn-primary"
            style={{ gap: '8px' }}
          >
            <Plus size={16} />
            <span>Schedule Post</span>
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '12px', overflowX: 'auto', whiteSpace: 'nowrap' }}>
        {[
          { id: 'all', label: 'All Content' },
          { id: 'scheduled', label: 'Scheduled Queue' },
          { id: 'published', label: 'Published Archive' },
          { id: 'failed', label: 'Failed Alerts' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            style={{
              padding: '8px 16px',
              background: filter === tab.id ? 'rgba(255,255,255,0.06)' : 'transparent',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              color: filter === tab.id ? 'white' : 'hsl(var(--text-secondary))',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: filter === tab.id ? 600 : 400,
              transition: 'background 0.2s',
              flexShrink: 0
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Grid or List Queue */}
      {loading ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'hsl(var(--text-secondary))' }}>
          Loading queue...
        </div>
      ) : posts.length === 0 ? (
        <div style={{ padding: '80px 40px', textAlign: 'center', background: 'rgba(255,255,255,0.01)', border: '1px dashed var(--border-glass)', borderRadius: 'var(--radius-lg)' }}>
          <Calendar size={48} style={{ color: 'hsl(var(--text-muted))', margin: '0 auto 16px auto', opacity: 0.3 }} />
          <h4 style={{ fontSize: '1rem', color: 'white', marginBottom: '8px' }}>Queue is Empty</h4>
          <p style={{ fontSize: '0.85rem', color: 'hsl(var(--text-muted))', maxWidth: '380px', margin: '0 auto 20px auto' }}>
            No posts found matching the selected filter. Click "Schedule Post" or launch our AI Content Studio to queue copies.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {posts.map((post: any) => (
            <div 
              key={post._id} 
              className="glass-card scheduled-card" 
              style={{ 
                padding: '20px', 
                borderLeft: `3px solid ${post.status === 'published' ? '#10b981' : post.status === 'failed' ? '#ef4444' : '#f59e0b'}` 
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flexGrow: 1, marginRight: '30px' }}>
                
                {/* Meta details (platforms, date, status) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {post.platforms.map((p: string) => (
                      <span key={p} title={p} style={{ background: 'rgba(255,255,255,0.04)', padding: '4px', borderRadius: '6px', display: 'inline-flex' }}>
                        {getPlatformIcon(p)}
                      </span>
                    ))}
                  </div>
                  
                  <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {getStatusIcon(post.status)}
                    <span style={{ textTransform: 'capitalize' }}>{post.status}</span>
                  </span>

                  <span style={{ fontSize: '0.75rem', color: 'hsl(var(--text-secondary))', fontWeight: 500 }}>
                    Date: {formatDateTime(post.scheduledAt || post.publishedAt)}
                  </span>
                </div>

                {/* Content preview */}
                <p style={{ fontSize: '0.9rem', color: 'white', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                  {post.content}
                </p>

                {post.failedReason && (
                  <div style={{ fontSize: '0.75rem', color: '#ef4444', background: 'rgba(239, 68, 68, 0.08)', padding: '6px 12px', borderRadius: '4px' }}>
                    Failure log: {post.failedReason}
                  </div>
                )}
              </div>

              {/* Actions (Delete/Cancel) */}
              {post.status !== 'published' && (
                <button
                  onClick={() => handleDeletePost(post._id)}
                  style={{ background: 'none', border: 'none', color: 'hsl(var(--text-muted))', cursor: 'pointer', padding: '8px' }}
                  className="delete-hover"
                  title="Cancel and Delete"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Manual Creation Modal */}
      {showCreateModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <form onSubmit={handleCreatePost} className="glass-card animate-fade-in responsive-modal" style={{ maxWidth: '500px' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Create Scheduled Post</h3>
            
            {/* Target platform selection */}
            <div>
              <label className="form-label">Publishing Channels</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                {['twitter', 'linkedin', 'instagram', 'facebook'].map(plat => {
                  const isChecked = platforms.includes(plat);
                  return (
                    <button
                      key={plat}
                      type="button"
                      onClick={() => {
                        if (isChecked) {
                          setPlatforms(platforms.filter(p => p !== plat));
                        } else {
                          setPlatforms([...platforms, plat]);
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 12px',
                        background: isChecked ? 'hsl(var(--primary) / 0.1)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${isChecked ? 'hsl(var(--primary))' : 'var(--border-glass)'}`,
                        borderRadius: 'var(--radius-md)',
                        color: isChecked ? 'white' : 'hsl(var(--text-secondary))',
                        cursor: 'pointer',
                        fontSize: '0.8rem'
                      }}
                    >
                      {getPlatformIcon(plat, 12)}
                      <span style={{ textTransform: 'capitalize' }}>{plat === 'twitter' ? 'X' : plat}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Post copy */}
            <div>
              <label className="form-label">Post Copy</label>
              <textarea
                className="form-input"
                style={{ minHeight: '120px', resize: 'vertical' }}
                placeholder="What would you like to share with your audience?"
                value={content}
                onChange={e => setContent(e.target.value)}
                required
              />
            </div>

            {/* Timing */}
            <div className="responsive-grid-1-1">
              <div>
                <label className="form-label">Post Date (Optional)</label>
                <input
                  type="date"
                  className="form-input"
                  min={new Date().toISOString().split('T')[0]}
                  value={scheduleDate}
                  onChange={e => setScheduleDate(e.target.value)}
                />
              </div>
              <div>
                <label className="form-label">Post Time</label>
                <input
                  type="time"
                  className="form-input"
                  value={scheduleTime}
                  onChange={e => setScheduleTime(e.target.value)}
                  disabled={!scheduleDate}
                />
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  setContent('');
                  setScheduleDate('');
                }}
                className="btn btn-secondary"
                style={{ flexGrow: 1 }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ flexGrow: 1 }}
                disabled={platforms.length === 0 || !content}
              >
                {scheduleDate ? 'Schedule Queue' : 'Post Now'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bulk Scheduler Modal */}
      {showBulkModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="glass-card animate-fade-in responsive-modal" style={{ maxWidth: '640px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Bulk Campaign Queue (CSV)</h3>
              <button 
                onClick={loadExampleCsv} 
                className="btn btn-secondary"
                style={{ fontSize: '0.75rem', padding: '4px 10px', gap: '4px' }}
              >
                <FileText size={12} />
                <span>Load 50+ Post Simulator</span>
              </button>
            </div>

            <p style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))', lineHeight: '1.4' }}>
              Paste your posts in the following delimiter format: <code>platforms|content|scheduledAt</code>.<br />
              Example: <code>twitter,linkedin|We are launching a new product!|2026-06-15T14:30:00Z</code>
            </p>

            <textarea
              className="form-input"
              style={{ minHeight: '220px', resize: 'vertical', fontFamily: 'monospace', fontSize: '0.8rem' }}
              placeholder="twitter|My first scheduled post!|2026-06-12T10:00:00.000Z&#10;instagram,facebook|Visual layout teaser|2026-06-12T16:00:00.000Z"
              value={csvContent}
              onChange={e => setCsvContent(e.target.value)}
            />

            {bulkStatus && (
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: bulkStatus.includes('Error') || bulkStatus.includes('failed') ? '#ef4444' : '#10b981', textAlign: 'center' }}>
                {bulkStatus}
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => {
                  setShowBulkModal(false);
                  setCsvContent('');
                  setBulkStatus('');
                }}
                className="btn btn-secondary"
                style={{ flexGrow: 1 }}
              >
                Cancel
              </button>
              <button
                onClick={handleBulkSchedule}
                className="btn btn-primary"
                style={{ flexGrow: 1 }}
                disabled={!csvContent.trim()}
              >
                Upload & Schedule Queue
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .delete-hover:hover {
          color: #ef4444 !important;
        }
      `}</style>
    </div>
  );
};
