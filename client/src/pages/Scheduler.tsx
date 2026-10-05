import React, { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { 
  Calendar, 
  Plus, 
  Upload, 
  Trash2, 
  Clock, 
  Search, 
  Share2, 
  ChevronDown
} from 'lucide-react';
import { PlatformBadge } from '../components/SocialIcons';
import { AccountTargetPicker } from '../components/AccountTargetPicker';
import { useAuth } from '../context/AuthContext';

export const Scheduler: React.FC = () => {
  const [posts, setPosts] = useState<any[]>([]);
  const [filter, setFilter] = useState<'scheduled' | 'published' | 'failed'>('scheduled');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChannel, setSelectedChannel] = useState('all');
  const [showChannelDropdown, setShowChannelDropdown] = useState(false);
  const [selectedTimeFilter, setSelectedTimeFilter] = useState('upcoming');
  const [showTimeDropdown, setShowTimeDropdown] = useState(false);
  const [loading, setLoading] = useState(true);

  // New Post Form
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [platforms, setPlatforms] = useState<string[]>(['twitter']);
  const [content, setContent] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('12:00');
  const [timeError, setTimeError] = useState('');
  const [creating, setCreating] = useState(false);
  // Synchronous guard: React state alone is stale for a second click in the
  // same tick (both handlers would pass the check before the re-render).
  const creatingRef = useRef(false);
  // Account-level targeting for the create flow
  const [createTargets, setCreateTargets] = useState<string[]>([]);
  const [createFanoutOk, setCreateFanoutOk] = useState(true);
  const { workspace } = useAuth();

  // Clear time validation error when inputs change
  const onDateChange = (val: string) => { setScheduleDate(val); setTimeError(''); };
  const onTimeChange = (val: string) => { setScheduleTime(val); setTimeError(''); };

  // Bulk Scheduler Form
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [csvContent, setCsvContent] = useState('');
  const [bulkStatus, setBulkStatus] = useState('');

  // Account metadata for the per-account delivery status matrix.
  const [accountMap, setAccountMap] = useState<Record<string, any>>({});
  const [showAllDeliveries, setShowAllDeliveries] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    api.social.getAccounts()
      .then(list => {
        if (!alive) return;
        const m: Record<string, any> = {};
        (list || []).forEach((a: any) => { m[a._id] = a; });
        setAccountMap(m);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const loadPosts = async () => {
    setLoading(true);
    try {
      const data = await api.posts.list(filter);
      setPosts(data || []);
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

    setTimeError('');
    const targetDate = scheduleDate ? new Date(`${scheduleDate}T${scheduleTime}:00`) : undefined;

    if (targetDate && targetDate.getTime() <= Date.now()) {
      setTimeError('Selected date and time is in the past. Please choose a future time.');
      return;
    }

    // Double-click guard: one in-flight create per modal session.
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    try {
      await api.posts.create({
        platforms,
        content,
        scheduledAt: targetDate ? targetDate.toISOString() : undefined,
        targetAccountIds: createTargets,
        workspaceId: workspace?.id,
        confirmFanout: createFanoutOk,
        ...(targetDate ? { status: 'scheduled' } : {})
      });

      setShowCreateModal(false);
      setContent('');
      setScheduleDate('');
      setTimeError('');
      loadPosts();
    } catch (err) {
      console.error(err);
      alert('Failed to schedule post.');
    } finally {
      creatingRef.current = false;
      setCreating(false);
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

  const handleBulkSchedule = async () => {
    if (!csvContent.trim()) return;
    setBulkStatus('Processing CSV rows...');

    try {
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
          const handles = (parts[3] || '').trim();

          payload.push({
            platforms: plats,
            content: text,
            scheduledAt: time,
            // CSV provenance: never fabricated, set only by this flow.
            source: 'csv',
            ...(handles
              ? { accountHandles: handles.split(',').map(h => h.trim()).filter(Boolean) }
              : {})
          });
          count++;
        }
      }

      if (payload.length === 0) {
        setBulkStatus('Error: Invalid format. Please use: platforms|content|ISOtime|account_handle(optional)');
        return;
      }

      await api.posts.bulkSchedule(payload, workspace?.id);
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

  const loadExampleCsv = () => {
    let exampleText = '';
    const today = new Date();
    for (let i = 1; i <= 10; i++) {
      const scheduledTime = new Date(today.getTime() + (i * 4 * 60 * 60 * 1000));
      const p = i % 2 === 0 ? 'twitter,linkedin' : 'instagram,facebook';
      exampleText += `${p}|🚀 Automated Post #${i}: Omnichannel release with SocialFlow!|${scheduledTime.toISOString()}\n`;
    }
    setCsvContent(exampleText);
  };

  const formatDateTime = (isoString?: string) => {
    if (!isoString) return 'Immediate';
    const d = new Date(isoString);
    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const filteredPosts = posts.filter(post => {
    if (searchQuery.trim() && !post.content.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (selectedChannel !== 'all' && !post.platforms.includes(selectedChannel)) {
      return false;
    }
    return true;
  });

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '26px' }}>
      
      {/* 1. Header Banner */}
      <div style={{
        position: 'relative',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '14px 20px',
        borderRadius: '16px',
        overflow: 'hidden',
        minHeight: '145px'
      }}>
        {/* Desk Calendar Scene Graphic filling 100% of header height on the right */}
        <div style={{
          position: 'absolute',
          right: '10px',
          top: 0,
          bottom: 0,
          width: '420px',
          height: '100%',
          backgroundImage: "url('/scheduler-calendar-scene.png')",
          backgroundPosition: 'right center',
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'contain',
          pointerEvents: 'none'
        }} />

        {/* Left Heading & Fast Actions */}
        <div style={{ position: 'relative', zIndex: 2, maxWidth: '620px' }}>
          <div style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            letterSpacing: '0.1em',
            color: '#6b7280',
            textTransform: 'uppercase',
            marginBottom: '6px'
          }}>
            SCHEDULER
          </div>
          <h1 style={{
            fontSize: '2.4rem',
            fontWeight: 700,
            color: '#111827',
            letterSpacing: '-0.03em',
            marginBottom: '8px',
            lineHeight: 1.15
          }}>
            Post Scheduler
          </h1>
          <p style={{ fontSize: '0.95rem', color: '#6b7280', lineHeight: 1.5, marginBottom: '20px' }}>
            Coordinate your publishing schedule, manage queues, and upload bulk campaigns.
          </p>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button 
              type="button"
              onClick={() => { setCreateTargets([]); setCreateFanoutOk(true); setShowCreateModal(true); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                background: '#18181b',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.12)',
                transition: 'all 0.15s ease'
              }}
            >
              <Plus size={15} />
              <span>Schedule Post</span>
            </button>

            <button 
              type="button"
              onClick={() => setShowBulkModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: '#374151',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#d1d5db')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#e5e7eb')}
            >
              <Upload size={15} />
              <span>Bulk CSV Scheduler</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Segmented Navigation Tabs (Spacious & Clean) */}
      <div style={{
        display: 'flex',
        gap: '32px',
        borderBottom: '1px solid #e5e7eb',
        paddingBottom: '2px',
        width: 'fit-content'
      }}>
        {[
          { id: 'scheduled', label: 'Scheduled Queue' },
          { id: 'published', label: 'Published Archive' },
          { id: 'failed', label: 'Failed Alerts' }
        ].map(tab => {
          const isActive = filter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id as any)}
              style={{
                padding: '10px 4px 12px',
                background: 'transparent',
                border: 'none',
                fontSize: '0.925rem',
                fontWeight: isActive ? 600 : 500,
                color: isActive ? '#111827' : '#6b7280',
                cursor: 'pointer',
                position: 'relative',
                transition: 'color 0.15s ease'
              }}
            >
              {tab.label}
              {isActive && (
                <span style={{
                  position: 'absolute',
                  bottom: '-1px',
                  left: 0,
                  right: 0,
                  height: '2px',
                  background: '#18181b',
                  borderRadius: '2px'
                }} />
              )}
            </button>
          );
        })}
      </div>

      {/* 3. Main Card: Scheduled Posts (Generous & Large) */}
      <div className="card" style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', minHeight: '480px' }}>
        
        {/* Card Header Row with Search & Filters */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '28px'
        }}>
          {/* Left Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: '#ffedd5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <Calendar size={22} style={{ color: '#c2410c' }} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#111827', margin: '0 0 2px 0' }}>
                Scheduled Posts
              </h2>
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: 0 }}>
                Manage and monitor your upcoming scheduled content.
              </p>
            </div>
          </div>

          {/* Right Controls: Search + Channel Filter + Time Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            
            {/* Search Input */}
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
              <input
                type="text"
                placeholder="Search scheduled posts..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  height: '40px',
                  paddingLeft: '38px',
                  paddingRight: '14px',
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '9px',
                  fontSize: '0.875rem',
                  color: '#111827',
                  outline: 'none',
                  minWidth: '220px',
                  boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.02)'
                }}
              />
            </div>

            {/* Channel Filter Dropdown */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setShowChannelDropdown(!showChannelDropdown)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  height: '40px',
                  padding: '0 14px',
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '9px',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#374151',
                  cursor: 'pointer'
                }}
              >
                <Share2 size={14} style={{ color: '#6b7280' }} />
                <span style={{ textTransform: 'capitalize' }}>{selectedChannel === 'all' ? 'All Channels' : selectedChannel}</span>
                <ChevronDown size={14} style={{ color: '#9ca3af' }} />
              </button>

              {showChannelDropdown && (
                <div style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  right: 0,
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08)',
                  zIndex: 30,
                  minWidth: '150px',
                  padding: '4px'
                }}>
                  {['all', 'twitter', 'linkedin', 'instagram', 'facebook', 'youtube', 'threads'].map(ch => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => {
                        setSelectedChannel(ch);
                        setShowChannelDropdown(false);
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 12px',
                        background: selectedChannel === ch ? '#f3f4f6' : 'transparent',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '0.825rem',
                        color: '#111827',
                        cursor: 'pointer',
                        textTransform: 'capitalize'
                      }}
                    >
                      {ch === 'all' ? 'All Channels' : ch}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Time Filter Dropdown */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setShowTimeDropdown(!showTimeDropdown)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  height: '40px',
                  padding: '0 14px',
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '9px',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#374151',
                  cursor: 'pointer'
                }}
              >
                <Calendar size={14} style={{ color: '#6b7280' }} />
                <span style={{ textTransform: 'capitalize' }}>{selectedTimeFilter}</span>
                <ChevronDown size={14} style={{ color: '#9ca3af' }} />
              </button>

              {showTimeDropdown && (
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
                  {['upcoming', 'today', 'this week', 'this month'].map(tf => (
                    <button
                      key={tf}
                      type="button"
                      onClick={() => {
                        setSelectedTimeFilter(tf);
                        setShowTimeDropdown(false);
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 12px',
                        background: selectedTimeFilter === tf ? '#f3f4f6' : 'transparent',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '0.825rem',
                        color: '#111827',
                        cursor: 'pointer',
                        textTransform: 'capitalize'
                      }}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Card Body: Empty State or Populated Posts List */}
        {loading ? (
          <div style={{ display: 'flex', flexGrow: 1, alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '0.875rem' }}>
            Loading queue...
          </div>
        ) : filteredPosts.length === 0 ? (
          /* Exact 100% Empty State matching the screenshot (Large & Centered) */
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            flexGrow: 1,
            padding: '50px 20px 60px'
          }}>
            {/* Soft Organic Blob Background with Calendar & Clock icon */}
            <div style={{
              width: '100px',
              height: '88px',
              borderRadius: '38% 62% 63% 37% / 41% 44% 56% 59%',
              background: '#fbf5eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px',
              position: 'relative'
            }}>
              <div style={{ position: 'relative' }}>
                <Calendar size={38} style={{ color: '#9a3412', strokeWidth: 1.8 }} />
                <Clock size={19} style={{ position: 'absolute', right: '-4px', bottom: '-4px', color: '#9a3412', background: '#fbf5eb', borderRadius: '50%', strokeWidth: 2 }} />
              </div>
            </div>

            <h3 style={{
              fontSize: '1.15rem',
              fontWeight: 700,
              color: '#111827',
              marginBottom: '6px'
            }}>
              No scheduled posts yet
            </h3>

            <p style={{
              fontSize: '0.9rem',
              color: '#6b7280',
              textAlign: 'center',
              maxWidth: '460px',
              lineHeight: 1.6,
              marginBottom: '22px'
            }}>
              Schedule your first post to get started. You can also bulk upload multiple posts using CSV.
            </p>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="button"
                onClick={() => { setCreateTargets([]); setCreateFanoutOk(true); setShowCreateModal(true); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                  padding: '10px 20px',
                  background: '#18181b',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                }}
              >
                <Plus size={15} />
                <span>Schedule Post</span>
              </button>

              <button
                type="button"
                onClick={() => setShowBulkModal(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '7px',
                  padding: '10px 20px',
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  color: '#374151',
                  cursor: 'pointer',
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)'
                }}
              >
                <Upload size={15} />
                <span>Upload CSV</span>
              </button>
            </div>
          </div>
        ) : (
          /* Populated Scheduled Posts Listing */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {filteredPosts.map((post: any) => (
              <div 
                key={post._id}
                style={{
                  padding: '18px 22px',
                  background: '#fafaf9',
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '16px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexGrow: 1 }}>
                  {/* Channels Badge list */}
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {post.platforms.map((p: string) => (
                      <PlatformBadge key={p} platform={p} size={28} iconSize={14} />
                    ))}
                  </div>

                  {/* Content Preview */}
                  <div style={{ flexGrow: 1 }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#111827', marginBottom: '4px' }}>
                      {post.content.length > 90 ? `${post.content.substring(0, 90)}...` : post.content}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '0.78rem', color: '#6b7280' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={13} />
                        <span>{formatDateTime(post.scheduledAt)}</span>
                      </span>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        textTransform: 'capitalize',
                        background: post.status === 'published' ? '#ecfdf5' : post.status === 'failed' ? '#fef2f2' : post.status === 'partial_failure' ? '#fffbeb' : '#fef3c7',
                        color: post.status === 'published' ? '#10b981' : post.status === 'failed' ? '#ef4444' : post.status === 'partial_failure' ? '#d97706' : '#b45309'
                      }}>
                        {post.status === 'partial_failure' ? 'partial failure' : (post.status || 'scheduled')}
                      </span>
                    </div>

                    {/* Account-level delivery matrix: one chip per target account */}
                    {Array.isArray(post.deliveries) && post.deliveries.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }} data-testid="delivery-matrix">
                        {(showAllDeliveries[post._id] ? post.deliveries : post.deliveries.slice(0, 8)).map((d: any) => {
                          const acc = accountMap[d.socialAccountId];
                          const willRetry = !d.deadLettered && d.nextRetryAt && (d.status === 'failed' || d.status === 'pending');
                          const label =
                            d.status === 'published' ? 'Published' :
                            d.status === 'publishing' ? 'Publishing' :
                            d.status === 'failed' ? (willRetry ? 'Retrying' : 'Failed') :
                            willRetry ? 'Retrying' : 'Queued';
                          const tone =
                            label === 'Published' ? ['#ecfdf5', '#047857'] :
                            label === 'Failed' ? ['#fef2f2', '#dc2626'] :
                            label === 'Retrying' ? ['#fffbeb', '#b45309'] :
                            label === 'Publishing' ? ['#eff6ff', '#1d4ed8'] :
                            ['#f3f4f6', '#4b5563'];
                          return (
                            <span
                              key={d.socialAccountId}
                              data-testid="delivery-chip"
                              title={d.lastError || (acc ? `@${acc.username}` : d.socialAccountId)}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: '5px',
                                padding: '2px 8px', borderRadius: '9999px',
                                fontSize: '0.68rem', fontWeight: 600,
                                background: tone[0], color: tone[1],
                                border: `1px solid ${tone[1]}22`
                              }}
                            >
                              {acc ? `@${acc.username}` : `…${d.socialAccountId.slice(-5)}`}
                              <span style={{ opacity: 0.75 }}>→ {label}{d.attempts > 1 ? ` · ${d.attempts}` : ''}</span>
                            </span>
                          );
                        })}
                        {post.deliveries.length > 8 && (
                          <button
                            type="button"
                            onClick={() => setShowAllDeliveries(prev => ({ ...prev, [post._id]: !prev[post._id] }))}
                            style={{
                              padding: '2px 8px', borderRadius: '9999px', border: '1px dashed #d1d5db',
                              fontSize: '0.68rem', fontWeight: 600, color: '#6b7280',
                              background: '#ffffff', cursor: 'pointer'
                            }}
                          >
                            {showAllDeliveries[post._id]
                              ? 'Show less'
                              : `+${post.deliveries.length - 8} more`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <button
                  type="button"
                  onClick={() => handleDeletePost(post._id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#9ca3af',
                    cursor: 'pointer',
                    padding: '6px',
                    borderRadius: '6px'
                  }}
                  title="Delete post"
                  onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#9ca3af')}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* 4. Schedule Post Modal */}
      {showCreateModal && (
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
          <div className="card" style={{ maxWidth: '520px', width: '92%', padding: '28px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#111827', margin: 0 }}>
              Schedule New Post
            </h3>
            
            <form onSubmit={handleCreatePost} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>
                  Target Channels
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {['twitter', 'linkedin', 'instagram', 'facebook', 'youtube', 'threads'].map(plat => (
                    <label key={plat} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      background: '#f9fafb',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '0.825rem'
                    }}>
                      <input
                        type="checkbox"
                        checked={platforms.includes(plat)}
                        onChange={e => {
                          if (e.target.checked) setPlatforms(prev => [...prev, plat]);
                          else setPlatforms(prev => prev.filter(p => p !== plat));
                        }}
                      />
                      <PlatformBadge platform={plat} size={20} iconSize={12} />
                      <span style={{ textTransform: 'capitalize' }}>{plat === 'twitter' ? 'X' : plat}</span>
                    </label>
                  ))}
                </div>
              </div>

              <AccountTargetPicker
                platforms={platforms}
                selected={createTargets}
                onChange={(ids, fanoutOk) => { setCreateTargets(ids); setCreateFanoutOk(fanoutOk); }}
              />

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                  Post Content
                </label>
                <textarea
                  className="form-input"
                  style={{ minHeight: '90px', resize: 'vertical' }}
                  placeholder="Share updates, releases, or developer notes..."
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Schedule Date</label>
                  <input
                    type="date"
                    className="form-input"
                    value={scheduleDate}
                    onChange={e => onDateChange(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Schedule Time</label>
                  <input
                    type="time"
                    className="form-input"
                    value={scheduleTime}
                    onChange={e => onTimeChange(e.target.value)}
                  />
                </div>
              </div>

              {timeError && (
                <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', color: '#b91c1c', fontSize: '0.8rem' }}>
                  {timeError}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={creating || platforms.length === 0 || !content.trim() || createTargets.length === 0 || !createFanoutOk}
                >
                  {creating ? 'Scheduling…' : 'Confirm & Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Bulk CSV Modal */}
      {showBulkModal && (
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
          <div className="card" style={{ maxWidth: '580px', width: '92%', padding: '28px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#111827', margin: 0 }}>
                Bulk CSV Post Scheduler
              </h3>
              <button
                type="button"
                onClick={loadExampleCsv}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#4f47ee',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Load 10 Posts Sample
              </button>
            </div>

            <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>
              Format: <code>platforms|content|ISOtime|account_handle</code> (one post per line; the 4th column is optional — one handle, or several separated by commas, e.g. <code>handle1,handle2</code>). Rows naming an unknown or disconnected handle are rejected with a row-level error — they never fall back to every account.
            </p>

            <textarea
              className="form-input"
              style={{ minHeight: '150px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', resize: 'vertical' }}
              placeholder="twitter,linkedin|Announcing our new feature!|2026-10-15T14:00:00.000Z"
              value={csvContent}
              onChange={e => setCsvContent(e.target.value)}
            />

            {bulkStatus && (
              <div style={{
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                background: bulkStatus.includes('failed') || bulkStatus.includes('Error') ? '#fef2f2' : '#ecfdf5',
                color: bulkStatus.includes('failed') || bulkStatus.includes('Error') ? '#ef4444' : '#10b981'
              }}>
                {bulkStatus}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowBulkModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleBulkSchedule}
                disabled={!csvContent.trim()}
              >
                Upload & Queue Batch
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
