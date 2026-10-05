import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { 
  Sparkles, 
  BookOpen, 
  Copy, 
  Check, 
  Calendar, 
  RefreshCw,
  FileEdit,
  FileText,
  Paperclip,
  Image as ImageIcon,
  ChevronDown,
  Link2,
  PlayCircle,
  AlignLeft,
  Info,
  Hash,
  Clock,
  RotateCcw
} from 'lucide-react';
import { PlatformBadge } from '../components/SocialIcons';
import { AccountTargetPicker } from '../components/AccountTargetPicker';
import { useAuth } from '../context/AuthContext';

export const ContentStudio: React.FC = () => {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState('');
  const [repurposeType, setRepurposeType] = useState<'video' | 'blog' | 'text'>('video');
  const [repurposeUrl, setRepurposeUrl] = useState('');
  const [rawText, setRawText] = useState('');
  const [tone, setTone] = useState<'Default' | 'Professional' | 'Casual' | 'Visionary' | 'Technical'>('Default');
  const [showToneMenu, setShowToneMenu] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'twitter' | 'linkedin' | 'instagram' | 'facebook'>('twitter');
  const [copied, setCopied] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<any>(null);

  // Scheduling Modal State
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [platformsToSchedule, setPlatformsToSchedule] = useState<string[]>(['twitter']);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('12:00');
  const [schedulerMessage, setSchedulerMessage] = useState('');
  const [scheduling, setScheduling] = useState(false);
  // Synchronous guard: React state alone is stale for a second click in the
  // same tick (both handlers would pass the check before the re-render).
  const schedulingRef = useRef(false);
  // Account-level targeting for the schedule flow
  const [scheduleTargets, setScheduleTargets] = useState<string[]>([]);
  const [scheduleFanoutOk, setScheduleFanoutOk] = useState(true);
  const { workspace } = useAuth();

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setGeneratedContent(null);
    try {
      const finalPrompt = tone !== 'Default' ? `[Tone: ${tone}] ${prompt}` : prompt;
      const data = await api.ai.generatePost(finalPrompt);
      setGeneratedContent(data);
      setPlatformsToSchedule(Object.keys(data.outputs));
    } catch (err) {
      console.error(err);
      alert('AI generation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRepurposeSubmit = async () => {
    if (repurposeType === 'video' && !repurposeUrl.trim()) return;
    if (repurposeType === 'blog' && !repurposeUrl.trim()) return;
    if (repurposeType === 'text' && !rawText.trim()) return;

    setLoading(true);
    setGeneratedContent(null);
    try {
      let data: any;
      if (repurposeType === 'video') {
        data = await api.ai.repurposeYoutube(repurposeUrl);
      } else if (repurposeType === 'blog') {
        data = await api.ai.repurposeBlog(repurposeUrl);
      } else {
        data = await api.ai.generatePost(`Summarize and repurpose this content into platform releases: ${rawText}`);
      }
      setGeneratedContent(data);
      setPlatformsToSchedule(Object.keys(data.outputs));
    } catch (err) {
      console.error(err);
      alert('Repurposing failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async (platform: string) => {
    if (!generatedContent) return;
    
    setLoading(true);
    try {
      const res = await api.ai.regenerate(generatedContent.prompt, platform);
      setGeneratedContent((prev: any) => ({
        ...prev,
        outputs: {
          ...prev.outputs,
          [platform]: res.content
        }
      }));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSchedulePost = async () => {
    if (!generatedContent) return;

    // Double-click guard: one in-flight create per modal session.
    if (schedulingRef.current) return;
    schedulingRef.current = true;
    setScheduling(true);
    setSchedulerMessage('');
    try {
      const targetDate = new Date(`${scheduleDate}T${scheduleTime}:00`);
      
      await api.posts.create({
        platforms: platformsToSchedule,
        content: generatedContent.outputs[activeTab] || generatedContent.prompt,
        platformContent: generatedContent.outputs,
        scheduledAt: scheduleDate ? targetDate.toISOString() : undefined,
        targetAccountIds: scheduleTargets,
        workspaceId: workspace?.id,
        confirmFanout: scheduleFanoutOk,
        // Provenance: this flow only exists when generatedContent came from AI.
        source: 'ai'
      });

      setSchedulerMessage(scheduleDate ? 'Post scheduled successfully!' : 'Post published immediately!');
      setTimeout(() => {
        setShowScheduleModal(false);
        setSchedulerMessage('');
      }, 2000);
    } catch (err: any) {
      console.error(err);
      setSchedulerMessage(err.message || 'Scheduling failed.');
    } finally {
      schedulingRef.current = false;
      setScheduling(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '26px' }}>
      
      {/* 1. Header Banner */}
      <div style={{
        position: 'relative',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '14px 18px',
        borderRadius: '16px',
        overflow: 'hidden',
        minHeight: '140px'
      }}>
        {/* Pure Zen Stones Graphic filling 100% of header height on the right */}
        <div style={{
          position: 'absolute',
          right: '10px',
          top: 0,
          bottom: 0,
          width: '360px',
          height: '100%',
          backgroundImage: "url('/studio-zen-stones.png')",
          backgroundPosition: 'right center',
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'contain',
          pointerEvents: 'none'
        }} />

        {/* Left Heading */}
        <div style={{ position: 'relative', zIndex: 2, maxWidth: '620px' }}>
          <div style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            letterSpacing: '0.1em',
            color: '#6b7280',
            textTransform: 'uppercase',
            marginBottom: '6px'
          }}>
            AI CONTENT STUDIO
          </div>
          <h1 style={{
            fontSize: '2.4rem',
            fontWeight: 700,
            color: '#111827',
            letterSpacing: '-0.03em',
            marginBottom: '8px',
            lineHeight: 1.15
          }}>
            AI Content Studio
          </h1>
          <p style={{ fontSize: '0.95rem', color: '#6b7280', lineHeight: 1.5 }}>
            Generate platform-optimized copy and repurpose multimedia into omnichannel releases.
          </p>
        </div>
      </div>

      {/* 2. Card 1: Post Studio (Generous & Large) */}
      <div className="card" style={{ padding: '28px 30px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        
        {/* Header Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: '#fef3c7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <FileEdit size={22} style={{ color: '#b45309' }} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#111827', margin: '0 0 2px 0' }}>
                Post Studio
              </h2>
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: 0 }}>
                Write, refine and optimize content for your connected channels.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate('/drafts')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 18px',
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
            <FileText size={16} style={{ color: '#6b7280' }} />
            <span>Use from Draft</span>
          </button>
        </div>

        {/* Textarea Input (Large & Spacious) */}
        <form onSubmit={handleGenerate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Share your idea, update, announcement or context..."
            rows={5}
            style={{
              width: '100%',
              minHeight: '145px',
              padding: '16px 18px',
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '12px',
              fontSize: '0.95rem',
              color: '#111827',
              outline: 'none',
              resize: 'vertical',
              fontFamily: 'var(--font-sans)',
              lineHeight: 1.6,
              transition: 'border-color 0.15s ease, box-shadow 0.15s ease'
            }}
            onFocus={e => {
              e.target.style.borderColor = '#18181b';
              e.target.style.boxShadow = '0 0 0 2px rgba(24, 24, 27, 0.08)';
            }}
            onBlur={e => {
              e.target.style.borderColor = '#e5e7eb';
              e.target.style.boxShadow = 'none';
            }}
          />

          {/* Action Toolbar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            
            {/* Left Icons: Paperclip & Image */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '9px',
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#6b7280',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                title="Attach file"
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = '#d1d5db';
                  e.currentTarget.style.color = '#111827';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = '#e5e7eb';
                  e.currentTarget.style.color = '#6b7280';
                }}
              >
                <Paperclip size={18} />
              </button>
              <button
                type="button"
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '9px',
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#6b7280',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                title="Add media"
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = '#d1d5db';
                  e.currentTarget.style.color = '#111827';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = '#e5e7eb';
                  e.currentTarget.style.color = '#6b7280';
                }}
              >
                <ImageIcon size={18} />
              </button>
            </div>

            {/* Right Controls: Platform Tone & Generate Button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative' }}>
              
              {/* Platform Tone Dropdown Trigger */}
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setShowToneMenu(!showToneMenu)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 16px',
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
                  <Sparkles size={15} style={{ color: '#6b7280' }} />
                  <span>{tone === 'Default' ? 'Platform Tone' : tone}</span>
                  <ChevronDown size={14} style={{ color: '#9ca3af' }} />
                </button>

                {showToneMenu && (
                  <>
                    <div 
                      onClick={() => setShowToneMenu(false)}
                      style={{ position: 'fixed', inset: 0, zIndex: 39 }}
                    />
                    <div style={{
                      position: 'absolute',
                      top: 'calc(100% + 6px)',
                      right: 0,
                      background: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '10px',
                      boxShadow: '0 10px 28px rgba(0, 0, 0, 0.08)',
                      zIndex: 40,
                      minWidth: '160px',
                      padding: '5px'
                    }}>
                    {(['Default', 'Professional', 'Casual', 'Visionary', 'Technical'] as const).map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setTone(t);
                          setShowToneMenu(false);
                        }}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '8px 14px',
                          background: tone === t ? '#f3f4f6' : 'transparent',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '0.825rem',
                          color: '#111827',
                          cursor: 'pointer'
                        }}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  </>
                )}
              </div>

              {/* Generate Platform Copies Primary Button */}
              <button
                type="submit"
                disabled={loading || !prompt.trim()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 22px',
                  background: '#18181b',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: loading || !prompt.trim() ? 'not-allowed' : 'pointer',
                  opacity: !prompt.trim() ? 0.7 : 1,
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.12)',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>✦</span>
                <span>{loading ? 'Synthesizing...' : 'Generate Platform Copies'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* 3. Card 2: Content Repurposer (Generous & Large) */}
      <div className="card" style={{ padding: '28px 30px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        
        {/* Header Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
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
              <Link2 size={22} style={{ color: '#c2410c' }} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#111827', margin: '0 0 2px 0' }}>
                Content Repurposer
              </h2>
              <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: 0 }}>
                Turn existing content into platform-ready posts.
              </p>
            </div>
          </div>

          {/* 3-Option Segmented Switcher Pill */}
          <div style={{
            display: 'flex',
            background: '#f3f4f6',
            border: '1px solid #e5e7eb',
            borderRadius: '9px',
            padding: '4px',
            gap: '3px'
          }}>
            <button
              type="button"
              onClick={() => setRepurposeType('video')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                padding: '7px 14px',
                background: repurposeType === 'video' ? '#ffffff' : 'transparent',
                border: repurposeType === 'video' ? '1px solid #e5e7eb' : '1px solid transparent',
                borderRadius: '7px',
                fontSize: '0.85rem',
                fontWeight: repurposeType === 'video' ? 600 : 500,
                color: repurposeType === 'video' ? '#111827' : '#6b7280',
                cursor: 'pointer',
                boxShadow: repurposeType === 'video' ? '0 1px 2px rgba(0, 0, 0, 0.04)' : 'none'
              }}
            >
              <PlayCircle size={15} style={{ color: repurposeType === 'video' ? '#111827' : '#6b7280' }} />
              <span>Video URL</span>
            </button>

            <button
              type="button"
              onClick={() => setRepurposeType('blog')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                padding: '7px 14px',
                background: repurposeType === 'blog' ? '#ffffff' : 'transparent',
                border: repurposeType === 'blog' ? '1px solid #e5e7eb' : '1px solid transparent',
                borderRadius: '7px',
                fontSize: '0.85rem',
                fontWeight: repurposeType === 'blog' ? 600 : 500,
                color: repurposeType === 'blog' ? '#111827' : '#6b7280',
                cursor: 'pointer',
                boxShadow: repurposeType === 'blog' ? '0 1px 2px rgba(0, 0, 0, 0.04)' : 'none'
              }}
            >
              <BookOpen size={15} style={{ color: repurposeType === 'blog' ? '#111827' : '#6b7280' }} />
              <span>Blog URL</span>
            </button>

            <button
              type="button"
              onClick={() => setRepurposeType('text')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                padding: '7px 14px',
                background: repurposeType === 'text' ? '#ffffff' : 'transparent',
                border: repurposeType === 'text' ? '1px solid #e5e7eb' : '1px solid transparent',
                borderRadius: '7px',
                fontSize: '0.85rem',
                fontWeight: repurposeType === 'text' ? 600 : 500,
                color: repurposeType === 'text' ? '#111827' : '#6b7280',
                cursor: 'pointer',
                boxShadow: repurposeType === 'text' ? '0 1px 2px rgba(0, 0, 0, 0.04)' : 'none'
              }}
            >
              <AlignLeft size={15} style={{ color: repurposeType === 'text' ? '#111827' : '#6b7280' }} />
              <span>Paste Text</span>
            </button>
          </div>
        </div>

        {/* Input Row (Large height & clean proportions) */}
        <div>
          <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: '#374151', marginBottom: '8px' }}>
            {repurposeType === 'video' ? 'YouTube Video URL' : repurposeType === 'blog' ? 'Blog Post URL' : 'Paste Markdown / Raw Content'}
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {repurposeType === 'video' && (
              <PlatformBadge platform="youtube" size={36} iconSize={18} />
            )}
            {repurposeType === 'blog' && (
              <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <BookOpen size={18} style={{ color: '#2563eb' }} />
              </div>
            )}
            {repurposeType === 'text' && (
              <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AlignLeft size={18} style={{ color: '#4b5563' }} />
              </div>
            )}

            {repurposeType === 'text' ? (
              <input
                type="text"
                placeholder="Paste paragraph or notes..."
                value={rawText}
                onChange={e => setRawText(e.target.value)}
                style={{
                  flexGrow: 1,
                  height: '46px',
                  padding: '0 16px',
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  fontSize: '0.9rem',
                  color: '#111827',
                  outline: 'none',
                  boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.02)'
                }}
              />
            ) : (
              <input
                type="url"
                placeholder={repurposeType === 'video' ? 'https://www.youtube.com/watch?v=...' : 'https://example.com/blog/release-announcement'}
                value={repurposeUrl}
                onChange={e => setRepurposeUrl(e.target.value)}
                style={{
                  flexGrow: 1,
                  height: '46px',
                  padding: '0 16px',
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  fontSize: '0.9rem',
                  color: '#111827',
                  outline: 'none',
                  boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.02)'
                }}
              />
            )}

            <button
              type="button"
              onClick={handleRepurposeSubmit}
              disabled={loading || (repurposeType !== 'text' ? !repurposeUrl.trim() : !rawText.trim())}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                height: '46px',
                padding: '0 22px',
                background: '#18181b',
                color: '#ffffff',
                border: 'none',
                borderRadius: '9px',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                flexShrink: 0
              }}
            >
              <RotateCcw size={15} className={loading ? 'animate-spin' : ''} />
              <span>Repurpose Content</span>
            </button>
          </div>
        </div>

        {/* Info Note Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '12px 16px',
          background: '#f9fafb',
          border: '1px solid #f3f4f6',
          borderRadius: '10px',
          fontSize: '0.825rem',
          color: '#6b7280'
        }}>
          <Info size={16} style={{ color: '#6b7280', flexShrink: 0 }} />
          <span>The AI will create optimized copies for X (Twitter), LinkedIn, Instagram, and Facebook based on the video content.</span>
        </div>

      </div>

      {/* 4. Card 3: What you'll get */}
      <div className="card" style={{ padding: '24px 30px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '18px' }}>
          <Sparkles size={18} style={{ color: '#111827' }} />
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827', margin: 0 }}>
            What you’ll get
          </h3>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '20px',
          alignItems: 'center'
        }}>
          {/* Feature 1 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: '#fef3c7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <FileText size={20} style={{ color: '#b45309' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#111827' }}>Platform-optimized copies</div>
              <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>Tailored for each social network</div>
            </div>
          </div>

          {/* Feature 2 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', borderLeft: '1px solid #e5e7eb', paddingLeft: '20px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: '#fef3c7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <Hash size={20} style={{ color: '#b45309' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#111827' }}>Relevant hashtags</div>
              <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>Increase reach and discoverability</div>
            </div>
          </div>

          {/* Feature 3 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', borderLeft: '1px solid #e5e7eb', paddingLeft: '20px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: '#fef3c7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <ImageIcon size={20} style={{ color: '#b45309' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#111827' }}>Media suggestions</div>
              <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>Visual ideas and formats</div>
            </div>
          </div>

          {/* Feature 4 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', borderLeft: '1px solid #e5e7eb', paddingLeft: '20px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: '#fef3c7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <Clock size={20} style={{ color: '#b45309' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#111827' }}>Save to drafts</div>
              <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>Review, edit and schedule</div>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Generated Results Console (when output is generated) */}
      {generatedContent && (
        <div className="card" style={{ padding: '26px 30px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e5e7eb', paddingBottom: '16px' }}>
            <div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827' }}>Generated Multichannel Copies</div>
              <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Prompt: "{generatedContent.prompt?.substring(0, 50)}..."</div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => copyToClipboard(generatedContent.outputs[activeTab])}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '7px',
                  fontSize: '0.825rem',
                  fontWeight: 500,
                  color: '#374151',
                  cursor: 'pointer'
                }}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
              <button
                type="button"
                onClick={() => handleRegenerate(activeTab)}
                disabled={loading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '7px',
                  fontSize: '0.825rem',
                  fontWeight: 500,
                  color: '#374151',
                  cursor: 'pointer'
                }}
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                <span>Regen</span>
              </button>
            </div>
          </div>

          {/* Social Platform Tabs */}
          <div style={{ display: 'flex', gap: '8px', background: '#f3f4f6', padding: '5px', borderRadius: '10px' }}>
            {(['twitter', 'linkedin', 'instagram', 'facebook'] as const).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '9px 0',
                  background: activeTab === tab ? '#ffffff' : 'transparent',
                  border: activeTab === tab ? '1px solid #e5e7eb' : '1px solid transparent',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: activeTab === tab ? 600 : 500,
                  color: activeTab === tab ? '#111827' : '#6b7280',
                  boxShadow: activeTab === tab ? '0 1px 2px rgba(0, 0, 0, 0.04)' : 'none'
                }}
              >
                <PlatformBadge platform={tab} size={20} iconSize={14} />
                <span style={{ textTransform: 'capitalize' }}>{tab === 'twitter' ? 'X (Twitter)' : tab}</span>
              </button>
            ))}
          </div>

          {/* Output Display Box */}
          <div style={{
            background: '#fafafa',
            border: '1px solid #e5e7eb',
            borderRadius: '10px',
            padding: '18px 20px',
            fontSize: '0.925rem',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            color: '#111827',
            minHeight: '160px'
          }}>
            {generatedContent.outputs[activeTab] || 'No copy generated for this channel.'}
          </div>

          {/* Primary Action Button */}
          <button
            type="button"
            onClick={() => { setScheduleTargets([]); setScheduleFanoutOk(true); setShowScheduleModal(true); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '11px 18px',
              background: '#18181b',
              color: '#ffffff',
              border: 'none',
              borderRadius: '9px',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
            }}
          >
            <Calendar size={17} />
            <span>Send to Post Scheduler</span>
          </button>
        </div>
      )}

      {/* Scheduler Modal */}
      {showScheduleModal && (
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
          <div className="card" style={{ maxWidth: '480px', width: '90%', padding: '28px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#111827' }}>Configure Post Schedule</h3>
            
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>
                Select Channels to Publish To
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {['twitter', 'linkedin', 'instagram', 'facebook'].map(plat => (
                  <label key={plat} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    background: '#f9fafb',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.825rem'
                  }}>
                    <input
                      type="checkbox"
                      checked={platformsToSchedule.includes(plat)}
                      onChange={e => {
                        if (e.target.checked) setPlatformsToSchedule(prev => [...prev, plat]);
                        else setPlatformsToSchedule(prev => prev.filter(p => p !== plat));
                      }}
                    />
                    <PlatformBadge platform={plat} size={18} iconSize={12} />
                    <span style={{ textTransform: 'capitalize' }}>{plat === 'twitter' ? 'X' : plat}</span>
                  </label>
                ))}
              </div>
            </div>

            <AccountTargetPicker
              platforms={platformsToSchedule}
              selected={scheduleTargets}
              onChange={(ids, fanoutOk) => { setScheduleTargets(ids); setScheduleFanoutOk(fanoutOk); }}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Date</label>
                <input
                  type="date"
                  className="form-input"
                  value={scheduleDate}
                  onChange={e => setScheduleDate(e.target.value)}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Time</label>
                <input
                  type="time"
                  className="form-input"
                  value={scheduleTime}
                  onChange={e => setScheduleTime(e.target.value)}
                />
              </div>
            </div>

            {schedulerMessage && (
              <div style={{
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                background: schedulerMessage.includes('failed') ? '#fef2f2' : '#ecfdf5',
                color: schedulerMessage.includes('failed') ? '#ef4444' : '#10b981'
              }}>
                {schedulerMessage}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowScheduleModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSchedulePost}
                disabled={scheduling || platformsToSchedule.length === 0 || scheduleTargets.length === 0 || !scheduleFanoutOk}
              >
                {scheduling ? 'Scheduling…' : 'Confirm & Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
