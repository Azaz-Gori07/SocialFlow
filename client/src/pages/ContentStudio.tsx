import React, { useState } from 'react';
import { api } from '../services/api';
import { 
  Sparkles, 
  BookOpen, 
  Share2, 
  Copy, 
  Check, 
  Calendar, 
  RefreshCw
} from 'lucide-react';

export const ContentStudio: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [blogUrl, setBlogUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'twitter' | 'linkedin' | 'instagram' | 'facebook'>('twitter');
  const [copied, setCopied] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<any>(null);

  // State to track if schedule modal is open
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [platformsToSchedule, setPlatformsToSchedule] = useState<string[]>(['twitter']);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('12:00');
  const [schedulerMessage, setSchedulerMessage] = useState('');

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt) return;

    setLoading(true);
    setGeneratedContent(null);
    try {
      const data = await api.ai.generatePost(prompt);
      setGeneratedContent(data);
      setPlatformsToSchedule(Object.keys(data.outputs));
    } catch (err) {
      console.error(err);
      alert('AI generation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRepurpose = async (type: 'youtube' | 'blog') => {
    const url = type === 'youtube' ? youtubeUrl : blogUrl;
    if (!url) return;

    setLoading(true);
    setGeneratedContent(null);
    try {
      const data = type === 'youtube' 
        ? await api.ai.repurposeYoutube(url)
        : await api.ai.repurposeBlog(url);
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
    
    setSchedulerMessage('');
    try {
      const targetDate = new Date(`${scheduleDate}T${scheduleTime}:00`);
      
      await api.posts.create({
        platforms: platformsToSchedule,
        content: generatedContent.outputs[activeTab] || generatedContent.prompt,
        platformContent: generatedContent.outputs,
        scheduledAt: scheduleDate ? targetDate.toISOString() : undefined
      });

      setSchedulerMessage(scheduleDate ? 'Post scheduled successfully!' : 'Post published immediately!');
      setTimeout(() => {
        setShowScheduleModal(false);
        setSchedulerMessage('');
      }, 2000);
    } catch (err: any) {
      console.error(err);
      setSchedulerMessage(err.message || 'Scheduling failed.');
    }
  };

  const getPlatformIcon = (plat: string, size = 16) => {
    switch (plat) {
      case 'twitter': return <span style={{ color: '#1DA1F2', fontWeight: 'bold', fontSize: `${size}px` }}>X</span>;
      case 'linkedin': return <span style={{ color: '#0077B5', fontWeight: 'bold', fontSize: `${size}px` }}>In</span>;
      case 'instagram': return <span style={{ color: '#E1306C', fontWeight: 'bold', fontSize: `${size}px` }}>Ig</span>;
      case 'facebook': return <span style={{ color: '#1877F2', fontWeight: 'bold', fontSize: `${size}px` }}>Fb</span>;
      default: return null;
    }
  };

  return (
    <div className="animate-fade-in" style={{ position: 'relative' }}>
      <div className="glow-blur" />
      
      {/* Header */}
      <div className="header-bar">
        <div>
          <h1 className="page-title">AI Content Studio</h1>
          <p style={{ color: 'hsl(var(--text-secondary))', marginTop: '4px', fontSize: '0.95rem' }}>
            Generate platform-optimized copy and repurpose files into social posts.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.25fr', gap: '30px' }}>
        
        {/* Left Column - Generation Forms */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Prompt Studio */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <Sparkles size={18} style={{ color: 'hsl(var(--primary))' }} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Post Studio</h3>
            </div>
            <form onSubmit={handleGenerate} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label className="form-label">What is your announcement or topic?</label>
              <textarea
                className="form-input"
                style={{ minHeight: '90px', resize: 'vertical' }}
                placeholder="Announce our new AI dashboard launch Road2Dev. It lets you automate social posts and check analytics."
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                required
              />
              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', marginTop: '6px' }}
                disabled={loading || !prompt}
              >
                {loading ? 'Synthesizing...' : 'Generate Platform Copies'}
              </button>
            </form>
          </div>

          {/* URL Repurposer */}
          <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Share2 size={18} style={{ color: 'hsl(var(--secondary))' }} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Content Repurposer</h3>
            </div>

            {/* YouTube Input */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: '#FF0000', fontWeight: 'bold', fontSize: '12px' }}>YT</span>
                <span>YouTube Video URL</span>
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={youtubeUrl}
                  onChange={e => setYoutubeUrl(e.target.value)}
                />
                <button
                  onClick={() => handleRepurpose('youtube')}
                  className="btn btn-secondary"
                  disabled={loading || !youtubeUrl}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  Repurpose
                </button>
              </div>
            </div>

            {/* Blog Input */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <BookOpen size={14} style={{ color: 'hsl(var(--secondary))' }} />
                <span>Blog Post URL</span>
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://medium.com/engineering/our-mvp-setup..."
                  value={blogUrl}
                  onChange={e => setBlogUrl(e.target.value)}
                />
                <button
                  onClick={() => handleRepurpose('blog')}
                  className="btn btn-secondary"
                  disabled={loading || !blogUrl}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  Repurpose
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* Right Column - Generation Output */}
        <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', minHeight: '400px' }}>
          {!generatedContent ? (
            <div style={{ display: 'flex', flexGrow: 1, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'hsl(var(--text-muted))', textAlign: 'center', padding: '40px' }}>
              <Sparkles size={36} style={{ color: 'hsl(var(--primary) / 0.3)', marginBottom: '16px' }} />
              <h4 style={{ fontSize: '1rem', color: 'white', marginBottom: '8px' }}>No Generated Copies Yet</h4>
              <p style={{ fontSize: '0.8rem', lineHeight: '1.4' }}>Use the Post Studio or Repurposer on the left. The AI will output optimized copies for X (Twitter), LinkedIn, Instagram, and Facebook.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid hsl(var(--border))', paddingBottom: '12px' }}>
                <span style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>
                  Prompt: "{generatedContent.prompt.substring(0, 45)}..."
                </span>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => copyToClipboard(generatedContent.outputs[activeTab])}
                    className="btn btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '0.75rem', gap: '4px' }}
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                  <button
                    onClick={() => handleRegenerate(activeTab)}
                    className="btn btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '0.75rem', gap: '4px' }}
                    disabled={loading}
                  >
                    <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                    <span>Regen</span>
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', background: 'rgba(255,255,255,0.02)', padding: '4px', borderRadius: '8px' }}>
                {(['twitter', 'linkedin', 'instagram', 'facebook'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      flexGrow: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '10px 0',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      fontFamily: 'var(--font-sans)',
                      fontWeight: activeTab === tab ? 600 : 400,
                      background: activeTab === tab ? 'hsl(var(--primary))' : 'transparent',
                      color: activeTab === tab ? 'white' : 'hsl(var(--text-secondary))',
                      transition: 'all 0.15s'
                    }}
                  >
                    {getPlatformIcon(tab, 14)}
                    <span style={{ textTransform: 'capitalize' }}>{tab === 'twitter' ? 'X' : tab}</span>
                  </button>
                ))}
              </div>

              {/* Tab Output Box */}
              <div style={{ flexGrow: 1, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-md)', padding: '20px', fontSize: '0.9rem', lineHeight: '1.6', whiteSpace: 'pre-wrap', fontFamily: 'monospace', color: 'hsl(var(--text-primary))', marginBottom: '20px', minHeight: '180px' }}>
                {generatedContent.outputs[activeTab] || 'No copy generated for this channel.'}
              </div>

              {/* Publish/Schedule Action */}
              <button
                onClick={() => setShowScheduleModal(true)}
                className="btn btn-primary"
                style={{ width: '100%', gap: '8px' }}
              >
                <Calendar size={16} />
                <span>Send to Post Scheduler</span>
              </button>
            </div>
          )}

        </div>

      </div>

      {/* Scheduler Modal */}
      {showScheduleModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="glass-card animate-fade-in" style={{ width: '100%', maxWidth: '480px', padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Configure Post Schedule</h3>
            
            {/* Platform Selection Checklist */}
            <div>
              <label className="form-label">Select Platforms to Publish To</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '6px' }}>
                {['twitter', 'linkedin', 'instagram', 'facebook'].map(plat => {
                  const isChecked = platformsToSchedule.includes(plat);
                  return (
                    <button
                      key={plat}
                      onClick={() => {
                        if (isChecked) {
                          setPlatformsToSchedule(platformsToSchedule.filter(p => p !== plat));
                        } else {
                          setPlatformsToSchedule([...platformsToSchedule, plat]);
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '10px 14px',
                        background: isChecked ? 'hsl(var(--primary) / 0.1)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${isChecked ? 'hsl(var(--primary))' : 'var(--border-glass)'}`,
                        borderRadius: 'var(--radius-md)',
                        color: isChecked ? 'white' : 'hsl(var(--text-secondary))',
                        cursor: 'pointer',
                        fontSize: '0.85rem'
                      }}
                    >
                      {getPlatformIcon(plat, 14)}
                      <span style={{ textTransform: 'capitalize' }}>{plat === 'twitter' ? 'X (Twitter)' : plat}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Date/Time Pickers */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label className="form-label">Post Date (Optional)</label>
                <input
                  type="date"
                  className="form-input"
                  min={new Date().toISOString().split('T')[0]}
                  value={scheduleDate}
                  onChange={e => setScheduleDate(e.target.value)}
                />
                <span style={{ fontSize: '0.65rem', color: 'hsl(var(--text-muted))', marginTop: '4px', display: 'block' }}>Leave empty to publish now</span>
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

            {schedulerMessage && (
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: schedulerMessage.includes('fail') ? '#ef4444' : '#10b981', textAlign: 'center' }}>
                {schedulerMessage}
              </div>
            )}

            {/* Modal Actions */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
              <button
                onClick={() => setShowScheduleModal(false)}
                className="btn btn-secondary"
                style={{ flexGrow: 1 }}
              >
                Cancel
              </button>
              <button
                onClick={handleSchedulePost}
                className="btn btn-primary"
                style={{ flexGrow: 1 }}
                disabled={platformsToSchedule.length === 0}
              >
                {scheduleDate ? 'Schedule Queue' : 'Publish Immediately'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
