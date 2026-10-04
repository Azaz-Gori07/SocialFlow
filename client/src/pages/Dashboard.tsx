import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { 
  Users, 
  Eye, 
  MessageSquare, 
  MousePointer, 
  BarChart2, 
  Share2, 
  MoreVertical, 
  Calendar, 
  Sparkles, 
  ArrowRight, 
  ChevronRight, 
  ChevronDown
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  CartesianGrid
} from 'recharts';
import { PlatformBadge } from '../components/SocialIcons';
import { DashboardSkeleton } from '../components/Skeleton';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [overview, setOverview] = useState<any>(null);
  const [growthData, setGrowthData] = useState<any[]>([]);
  const [platformsData, setPlatformsData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState({ date: 'Fri, Oct 2', time: '3:47 PM' });

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      setCurrentTime({ date: dateStr, time: timeStr });
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [ov, gr, pl] = await Promise.all([
          api.dashboard.getOverview(),
          api.dashboard.getGrowth(),
          api.dashboard.getPlatforms()
        ]);
        setOverview(ov);
        setGrowthData(gr || []);
        setPlatformsData(pl || []);
      } catch (err) {
        console.error('Failed to load dashboard data', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  if (loading) {
    return <DashboardSkeleton />;
  }

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const totalFollowers = overview?.totalFollowers || 0;
  const followersGrowth = overview?.growth?.followers || 0;
  const totalImpressions = overview?.totalImpressions || 0;
  const impressionsGrowth = overview?.growth?.impressions || 0;
  const totalEngagement = overview?.totalEngagement || 0;
  const engagementGrowth = overview?.growth?.engagement || 0;
  const averageCtr = ((overview?.averageCtr || 0) * 100).toFixed(2);

  // Platform lookup helper
  const getPlatformFollowers = (platId: string) => {
    const p = platformsData.find((item: any) => item.platform === platId);
    return p ? p.followers : 0;
  };

  const totalSubsAll = platformsData.reduce((sum: number, p: any) => sum + (p.followers || 0), 0);
  const getPlatformPercent = (platId: string) => {
    if (totalSubsAll <= 0) return 0;
    const f = getPlatformFollowers(platId);
    return Math.round((f / totalSubsAll) * 100);
  };

  // Mock timeline dates for empty graph matching the exact visual
  const emptyTimelineDates = [
    { date: 'Oct 5', val: 0 },
    { date: 'Oct 8', val: 0 },
    { date: 'Oct 11', val: 0 },
    { date: 'Oct 14', val: 0 },
    { date: 'Oct 17', val: 0 },
    { date: 'Oct 20', val: 0 },
    { date: 'Oct 23', val: 0 },
    { date: 'Oct 26', val: 0 },
    { date: 'Oct 29', val: 0 },
    { date: 'Nov 1', val: 0 }
  ];

  const hasData = growthData.length > 0 && growthData.some((d: any) => d.reach > 0 || d.impressions > 0);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      
      {/* 1. Hero Greeting Banner */}
      <div style={{
        position: 'relative',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 20px',
        borderRadius: '16px',
        overflow: 'hidden',
        minHeight: '145px'
      }}>
        {/* Mountain Line-art Watermark spanning smoothly from right edge */}
        <div style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: '64%',
          height: '100%',
          backgroundImage: "url('/mountain-illustration.png')",
          backgroundPosition: 'right center',
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'contain',
          pointerEvents: 'none'
        }} />

        {/* Left Greeting Text */}
        <div style={{ position: 'relative', zIndex: 2, maxWidth: '580px' }}>
          <div style={{ fontSize: '0.925rem', color: '#6b7280', marginBottom: '2px', fontWeight: 400 }}>
            Good morning,
          </div>
          <h1 style={{
            fontSize: '1.75rem',
            fontWeight: 700,
            color: '#111827',
            letterSpacing: '-0.025em',
            marginBottom: '6px',
            lineHeight: 1.2
          }}>
            Here’s your content at a glance
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', lineHeight: 1.4 }}>
            Create, schedule and publish developer content across all your connected social channels.
          </p>
        </div>

        {/* Right Date & Time Status */}
        <div style={{ position: 'relative', zIndex: 2, textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <div style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 500 }}>
            {currentTime.date}
          </div>
          <div style={{
            fontSize: '1.5rem',
            fontWeight: 700,
            color: '#111827',
            letterSpacing: '-0.02em',
            lineHeight: 1.2,
            margin: '1px 0'
          }}>
            {currentTime.time}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#111827', fontWeight: 500 }}>
            <span>All systems operational</span>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
          </div>
        </div>
      </div>

      {/* 2. Four Stat Cards (Row of 4) */}
      <div className="responsive-stat-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '16px'
      }}>
        
        {/* Card 1: Total Audience */}
        <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: '#ecfdf5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Users size={18} style={{ color: '#10b981' }} />
              </div>
              <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#374151' }}>
                Total Audience
              </span>
            </div>
            <MoreVertical size={16} style={{ color: '#9ca3af', cursor: 'pointer' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginTop: '6px' }}>
            <span style={{ fontSize: '2rem', fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {formatNumber(totalFollowers)}
            </span>
            <span style={{ fontSize: '0.825rem', fontWeight: 600, color: '#10b981' }}>
              ↗ {followersGrowth}%
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '2px' }}>
            Across all connected channels
          </div>
        </div>

        {/* Card 2: Total Impressions */}
        <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: '#fef3c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Eye size={18} style={{ color: '#d97706' }} />
              </div>
              <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#374151' }}>
                Total Impressions
              </span>
            </div>
            <MoreVertical size={16} style={{ color: '#9ca3af', cursor: 'pointer' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginTop: '6px' }}>
            <span style={{ fontSize: '2rem', fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {formatNumber(totalImpressions)}
            </span>
            <span style={{ fontSize: '0.825rem', fontWeight: 600, color: '#10b981' }}>
              ↗ {impressionsGrowth}%
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '2px' }}>
            Content views across all platforms
          </div>
        </div>

        {/* Card 3: Total Engagement */}
        <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: '#ffe4e6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <MessageSquare size={18} style={{ color: '#e11d48' }} />
              </div>
              <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#374151' }}>
                Total Engagement
              </span>
            </div>
            <MoreVertical size={16} style={{ color: '#9ca3af', cursor: 'pointer' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginTop: '6px' }}>
            <span style={{ fontSize: '2rem', fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {formatNumber(totalEngagement)}
            </span>
            <span style={{ fontSize: '0.825rem', fontWeight: 600, color: '#10b981' }}>
              ↗ {engagementGrowth}%
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '2px' }}>
            Likes, comments, reposts & reactions
          </div>
        </div>

        {/* Card 4: CTR Efficiency */}
        <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: '#eff6ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <MousePointer size={18} style={{ color: '#2563eb' }} />
              </div>
              <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#374151' }}>
                CTR Efficiency
              </span>
            </div>
            <MoreVertical size={16} style={{ color: '#9ca3af', cursor: 'pointer' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginTop: '6px' }}>
            <span style={{ fontSize: '2rem', fontWeight: 700, color: '#111827', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {averageCtr}%
            </span>
            <span style={{ fontSize: '0.825rem', fontWeight: 600, color: '#10b981' }}>
              ↗ 0%
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '2px' }}>
            Average outbound link conversion
          </div>
        </div>

      </div>

      {/* 3. Middle Section: Content Performance Chart (Left) + Connected Channels (Right) */}
      <div className="responsive-grid-2-1" style={{
        display: 'grid',
        gridTemplateColumns: '1.8fr 1.2fr',
        gap: '20px'
      }}>
        
        {/* Left: Content Performance */}
        <div className="card" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <BarChart2 size={20} style={{ color: '#111827' }} />
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827' }}>Content Performance</h3>
                <p style={{ fontSize: '0.78rem', color: '#6b7280' }}>Your reach and impressions over the last 14 days</p>
              </div>
            </div>
            <button
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '0.825rem',
                fontWeight: 500,
                color: '#374151',
                cursor: 'pointer'
              }}
            >
              <span>Reach</span>
              <ChevronDown size={14} style={{ color: '#6b7280' }} />
            </button>
          </div>

          {/* Chart Display Area with Axis & Empty State Backdrop */}
          <div style={{ position: 'relative', width: '100%', height: '310px' }}>
            
            {/* Chart Area */}
            <ResponsiveContainer width="100%" height={300} minWidth={0} minHeight={300}>
              <AreaChart data={hasData ? growthData : emptyTimelineDates} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="performanceGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="date" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={{ stroke: '#f3f4f6' }} />
                <YAxis stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} domain={[0, 1000]} ticks={[0, 250, 500, 750, 1000]} tickFormatter={v => v === 1000 ? '1K' : v.toString()} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}
                  labelStyle={{ color: '#111827', fontWeight: 600 }}
                />
                {hasData && (
                  <Area type="monotone" dataKey="reach" stroke="#4f46e5" strokeWidth={2} fillOpacity={1} fill="url(#performanceGrad)" name="Reach" />
                )}
              </AreaChart>
            </ResponsiveContainer>

            {/* Centered Empty State Overlay (Exactly as in screenshot when no data) */}
            {!hasData && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: '24px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none'
              }}>
                <div style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '10px',
                  background: '#f4f4f5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '10px'
                }}>
                  <BarChart2 size={22} style={{ color: '#71717a' }} />
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827', marginBottom: '4px' }}>
                  No data yet
                </div>
                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '16px' }}>
                  Connect your social accounts to see performance analytics.
                </div>
                <button
                  onClick={() => navigate('/connected-accounts')}
                  style={{
                    padding: '8px 18px',
                    background: '#18181b',
                    color: '#ffffff',
                    fontSize: '0.825rem',
                    fontWeight: 600,
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    pointerEvents: 'auto',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                  }}
                >
                  Connect Accounts
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: Connected Channels Card */}
        <div className="card" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Share2 size={18} style={{ color: '#111827' }} />
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827' }}>Connected Channels</h3>
            </div>
            <button
              style={{
                padding: '3px 12px',
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontWeight: 600,
                color: '#111827',
                cursor: 'pointer'
              }}
            >
              Connect
            </button>
          </div>

          {/* Channels List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flexGrow: 1, justifyContent: 'center' }}>
            
            {/* 1. LinkedIn */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <PlatformBadge platform="linkedin" size={32} iconSize={16} />
              <div style={{ width: '90px' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827' }}>Linkedin</div>
                <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{getPlatformFollowers('linkedin')} followers</div>
              </div>
              <div style={{ flexGrow: 1, height: '8px', background: '#f3f4f6', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${getPlatformPercent('linkedin')}%`, height: '100%', background: '#0A66C2', borderRadius: '4px' }} />
              </div>
              <span style={{ fontSize: '0.78rem', color: '#6b7280', width: '32px', textAlign: 'right' }}>
                {getPlatformPercent('linkedin')}%
              </span>
              <ChevronRight size={15} style={{ color: '#9ca3af', flexShrink: 0 }} />
            </div>

            {/* 2. X (Twitter) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <PlatformBadge platform="twitter" size={32} iconSize={15} />
              <div style={{ width: '90px' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827' }}>X (Twitter)</div>
                <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{getPlatformFollowers('twitter')} followers</div>
              </div>
              <div style={{ flexGrow: 1, height: '8px', background: '#f3f4f6', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${getPlatformPercent('twitter')}%`, height: '100%', background: '#000000', borderRadius: '4px' }} />
              </div>
              <span style={{ fontSize: '0.78rem', color: '#6b7280', width: '32px', textAlign: 'right' }}>
                {getPlatformPercent('twitter')}%
              </span>
              <ChevronRight size={15} style={{ color: '#9ca3af', flexShrink: 0 }} />
            </div>

            {/* 3. Instagram */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <PlatformBadge platform="instagram" size={32} iconSize={16} />
              <div style={{ width: '90px' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827' }}>Instagram</div>
                <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{getPlatformFollowers('instagram')} followers</div>
              </div>
              <div style={{ flexGrow: 1, height: '8px', background: '#f3f4f6', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${getPlatformPercent('instagram')}%`, height: '100%', background: '#E1306C', borderRadius: '4px' }} />
              </div>
              <span style={{ fontSize: '0.78rem', color: '#6b7280', width: '32px', textAlign: 'right' }}>
                {getPlatformPercent('instagram')}%
              </span>
              <ChevronRight size={15} style={{ color: '#9ca3af', flexShrink: 0 }} />
            </div>

            {/* 4. Threads */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <PlatformBadge platform="threads" size={32} iconSize={16} />
              <div style={{ width: '90px' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827' }}>Threads</div>
                <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{getPlatformFollowers('threads')} followers</div>
              </div>
              <div style={{ flexGrow: 1, height: '8px', background: '#f3f4f6', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${getPlatformPercent('threads')}%`, height: '100%', background: '#000000', borderRadius: '4px' }} />
              </div>
              <span style={{ fontSize: '0.78rem', color: '#6b7280', width: '32px', textAlign: 'right' }}>
                {getPlatformPercent('threads')}%
              </span>
              <ChevronRight size={15} style={{ color: '#9ca3af', flexShrink: 0 }} />
            </div>

            {/* 5. YouTube */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <PlatformBadge platform="youtube" size={32} iconSize={16} />
              <div style={{ width: '90px' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827' }}>YouTube</div>
                <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{getPlatformFollowers('youtube')} subscribers</div>
              </div>
              <div style={{ flexGrow: 1, height: '8px', background: '#f3f4f6', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${getPlatformPercent('youtube')}%`, height: '100%', background: '#FF0000', borderRadius: '4px' }} />
              </div>
              <span style={{ fontSize: '0.78rem', color: '#6b7280', width: '32px', textAlign: 'right' }}>
                {getPlatformPercent('youtube')}%
              </span>
              <ChevronRight size={15} style={{ color: '#9ca3af', flexShrink: 0 }} />
            </div>

          </div>
        </div>

      </div>

      {/* 4. Bottom Three Quick Action Cards (Row of 3) */}
      <div className="responsive-grid-3-col" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '16px'
      }}>
        
        {/* Card 1: Create New Content */}
        <div 
          className="card"
          style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer'
          }}
          onClick={() => navigate('/studio')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: '#fef3c7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Share2 size={18} style={{ color: '#b45309' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#111827' }}>
                Create New Content
              </div>
              <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                Start with AI or create manually
              </div>
            </div>
          </div>
          <ArrowRight size={16} style={{ color: '#9ca3af' }} />
        </div>

        {/* Card 2: View Scheduler */}
        <div 
          className="card"
          style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer'
          }}
          onClick={() => navigate('/scheduler')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: '#ffedd5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Calendar size={18} style={{ color: '#c2410c' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#111827' }}>
                View Scheduler
              </div>
              <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                Manage your upcoming posts
              </div>
            </div>
          </div>
          <ArrowRight size={16} style={{ color: '#9ca3af' }} />
        </div>

        {/* Card 3: AI Studio */}
        <div 
          className="card"
          style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer'
          }}
          onClick={() => navigate('/studio')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: '#f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Sparkles size={18} style={{ color: '#475569' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#111827' }}>
                AI Studio
              </div>
              <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                Generate developer content
              </div>
            </div>
          </div>
          <ArrowRight size={16} style={{ color: '#9ca3af' }} />
        </div>

      </div>

    </div>
  );
};
