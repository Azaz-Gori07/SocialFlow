import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { 
  Eye, 
  Heart, 
  Users, 
  MousePointer, 
  BarChart2, 
  Layers, 
  Calendar, 
  FileText, 
  ChevronDown, 
  ChevronRight, 
  Info, 
  ArrowRight,
  Upload
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  CartesianGrid,
  BarChart as RechartsBarChart,
  Bar
} from 'recharts';
import { PlatformBadge } from '../components/SocialIcons';

export const Analytics: React.FC = () => {
  const navigate = useNavigate();
  const [growthData, setGrowthData] = useState<any[]>([]);
  const [platformsData, setPlatformsData] = useState<any[]>([]);
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);
  
  // Dropdown states
  const [timeRange, setTimeRange] = useState('Last 28 days');
  const [showTimeRangeMenu, setShowTimeRangeMenu] = useState(false);
  const [chartMetric, setChartMetric] = useState<'impressions' | 'reach'>('impressions');
  const [showChartMetricMenu, setShowChartMetricMenu] = useState(false);
  const [ctrChannel, setCtrChannel] = useState('All Channels');
  const [showCtrChannelMenu, setShowCtrChannelMenu] = useState(false);
  const [platformMetric, setPlatformMetric] = useState('All Metrics');
  const [showPlatformMetricMenu, setShowPlatformMetricMenu] = useState(false);

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
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '360px', color: '#9ca3af', fontSize: '0.875rem' }}>
        Loading analytics hub...
      </div>
    );
  }

  const handleExport = (type: 'csv' | 'pdf') => {
    setExporting(type);
    setTimeout(() => {
      setExporting(null);
      const header = 'Date,Platform,Followers,Reach,Impressions,Engagement,Clicks,CTR\n';
      const rows = growthData.map(d => 
        `${d.date},All,${d.followers},${d.reach},${d.impressions},${d.engagement},${d.clicks},${(d.clicks/d.impressions || 0).toFixed(4)}`
      ).join('\n');
      
      const blob = new Blob([header + rows], { type: type === 'csv' ? 'text/csv' : 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.setAttribute('href', url);
      a.setAttribute('download', `SocialFlow_Analytics_Report_${new Date().toISOString().split('T')[0]}.${type}`);
      a.click();
    }, 1200);
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const hasData = growthData.length > 0 && growthData.some((d: any) => d.reach > 0 || d.impressions > 0);
  const hasAccounts = platformsData.length > 0;

  // Mock timeline dates for empty graph matching the exact visual
  const emptyTimelineDates = [
    { date: 'Oct 5', val: 0, ctr: 0 },
    { date: 'Oct 8', val: 0, ctr: 0 },
    { date: 'Oct 11', val: 0, ctr: 0 },
    { date: 'Oct 14', val: 0, ctr: 0 },
    { date: 'Oct 17', val: 0, ctr: 0 },
    { date: 'Oct 20', val: 0, ctr: 0 },
    { date: 'Oct 23', val: 0, ctr: 0 },
    { date: 'Oct 26', val: 0, ctr: 0 },
    { date: 'Oct 29', val: 0, ctr: 0 },
    { date: 'Nov 1', val: 0, ctr: 0 }
  ];

  const getPlatformAccountData = (platformId: string) => {
    return platformsData.find((p: any) => p.platform === platformId);
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      
      {/* 1. Header Banner with Mountain Watermark Background */}
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
        {/* Mountain Line-art Watermark spanning smoothly from right edge */}
        <div style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: '55%',
          height: '100%',
          backgroundImage: "url('/mountain-illustration.png')",
          backgroundPosition: 'right center',
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'contain',
          pointerEvents: 'none'
        }} />

        {/* Left Heading */}
        <div style={{ position: 'relative', zIndex: 2, maxWidth: '580px' }}>
          <div style={{
            fontSize: '0.6875rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: '#6b7280',
            textTransform: 'uppercase',
            marginBottom: '3px'
          }}>
            ANALYTICS
          </div>
          <h1 style={{
            fontSize: '2.35rem',
            fontWeight: 700,
            color: '#111827',
            letterSpacing: '-0.025em',
            marginBottom: '4px',
            lineHeight: 1.15
          }}>
            Analytics Hub
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', lineHeight: 1.4 }}>
            Deep-dive metrics audit, click-through trends, and verified report export.
          </p>
        </div>

        {/* Right Header Controls (Time Range + Export Buttons) */}
        <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: '10px' }}>
          
          {/* Time Range Selector */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setShowTimeRangeMenu(!showTimeRangeMenu)}
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
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)'
              }}
            >
              <Calendar size={14} style={{ color: '#6b7280' }} />
              <span>{timeRange}</span>
              <ChevronDown size={14} style={{ color: '#9ca3af' }} />
            </button>

            {showTimeRangeMenu && (
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
                {['Last 7 days', 'Last 14 days', 'Last 28 days', 'Last 90 days', 'All time'].map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setTimeRange(r);
                      setShowTimeRangeMenu(false);
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '7px 12px',
                      background: timeRange === r ? '#f3f4f6' : 'transparent',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      color: '#111827',
                      cursor: 'pointer'
                    }}
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Export CSV Button */}
          <button
            type="button"
            onClick={() => handleExport('csv')}
            disabled={!!exporting}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              height: '36px',
              padding: '0 14px',
              background: '#ffffff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '0.825rem',
              fontWeight: 500,
              color: '#374151',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)'
            }}
          >
            <Upload size={14} style={{ color: '#6b7280' }} />
            <span>{exporting === 'csv' ? 'Exporting...' : 'Export CSV'}</span>
          </button>

          {/* Export PDF Button */}
          <button
            type="button"
            onClick={() => handleExport('pdf')}
            disabled={!!exporting}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              height: '36px',
              padding: '0 16px',
              background: '#18181b',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.825rem',
              fontWeight: 600,
              color: '#ffffff',
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
            }}
          >
            <FileText size={14} />
            <span>{exporting === 'pdf' ? 'Exporting...' : 'Export PDF'}</span>
          </button>
        </div>
      </div>

      {/* 2. Row of 4 KPI Metric Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '16px'
      }} className="responsive-stat-grid">
        
        {/* Card 1: Reach & Impressions */}
        <div className="card" style={{ padding: '18px 20px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '9px',
            background: '#f4f4f5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <Eye size={18} style={{ color: '#3f3f46' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.825rem', fontWeight: 600, color: '#111827', marginBottom: '4px' }}>
              Reach & Impressions
            </span>
            <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', lineHeight: 1.1, marginBottom: '4px' }}>
              {hasData ? formatNumber(overview?.totalReach || 0) : '—'}
            </span>
            <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
              {hasData ? `${formatNumber(overview?.totalImpressions || 0)} views` : 'Connect accounts to view data'}
            </span>
          </div>
        </div>

        {/* Card 2: Engagement */}
        <div className="card" style={{ padding: '18px 20px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '9px',
            background: '#fef3c7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <Heart size={18} style={{ color: '#b45309' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.825rem', fontWeight: 600, color: '#111827', marginBottom: '4px' }}>
              Engagement
            </span>
            <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', lineHeight: 1.1, marginBottom: '4px' }}>
              {hasData ? formatNumber(overview?.totalEngagement || 0) : '—'}
            </span>
            <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
              {hasData ? `${overview?.growth?.engagement || 0}% velocity` : 'Connect accounts to view data'}
            </span>
          </div>
        </div>

        {/* Card 3: Followers / Audience */}
        <div className="card" style={{ padding: '18px 20px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '9px',
            background: '#ecfdf5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <Users size={18} style={{ color: '#10b981' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.825rem', fontWeight: 600, color: '#111827', marginBottom: '4px' }}>
              Followers / Audience
            </span>
            <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', lineHeight: 1.1, marginBottom: '4px' }}>
              {hasData ? formatNumber(overview?.totalFollowers || 0) : '—'}
            </span>
            <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
              {hasData ? `${platformsData.length} active channels` : 'Connect accounts to view data'}
            </span>
          </div>
        </div>

        {/* Card 4: Link Click-Through Rate */}
        <div className="card" style={{ padding: '18px 20px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '9px',
            background: '#eff6ff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <MousePointer size={18} style={{ color: '#2563eb' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.825rem', fontWeight: 600, color: '#111827', marginBottom: '4px' }}>
              Link Click-Through Rate
            </span>
            <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', lineHeight: 1.1, marginBottom: '4px' }}>
              {hasData ? `${((overview?.averageCtr || 0) * 100).toFixed(2)}%` : '—'}
            </span>
            <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
              {hasData ? `${overview?.totalClicks || 0} outbound clicks` : 'Connect accounts to view data'}
            </span>
          </div>
        </div>

      </div>

      {/* 3. Middle Section: Two Charts Side-by-Side */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '20px'
      }} className="responsive-grid-1-1">
        
        {/* Left Card: Growth & Impressions Trend */}
        <div className="card" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <BarChart2 size={18} style={{ color: '#111827' }} />
              <div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827', margin: 0 }}>
                  Growth & Impressions Trend
                </h3>
                <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: 0 }}>
                  Reach and impressions across your connected channels.
                </p>
              </div>
            </div>

            {/* Dropdown Metric Filter */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setShowChartMetricMenu(!showChartMetricMenu)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 12px',
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  color: '#374151',
                  cursor: 'pointer'
                }}
              >
                <span style={{ textTransform: 'capitalize' }}>{chartMetric}</span>
                <ChevronDown size={13} style={{ color: '#9ca3af' }} />
              </button>

              {showChartMetricMenu && (
                <div style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  right: 0,
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08)',
                  zIndex: 30,
                  minWidth: '130px',
                  padding: '4px'
                }}>
                  {['impressions', 'reach'].map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setChartMetric(m as any);
                        setShowChartMetricMenu(false);
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '6px 12px',
                        background: chartMetric === m ? '#f3f4f6' : 'transparent',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '0.8rem',
                        color: '#111827',
                        cursor: 'pointer',
                        textTransform: 'capitalize'
                      }}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Area Chart Container */}
          <div style={{ position: 'relative', width: '100%', height: '280px' }}>
            <ResponsiveContainer width="100%" height={280} minWidth={0} minHeight={280}>
              <AreaChart data={hasData ? growthData : emptyTimelineDates} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="growthChartGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="date" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={{ stroke: '#f3f4f6' }} />
                <YAxis stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} domain={[0, 1000]} ticks={[0, 250, 500, 750, 1000]} tickFormatter={v => v === 1000 ? '1K' : v.toString()} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                  labelStyle={{ color: '#111827', fontWeight: 600 }}
                />
                {hasData && (
                  <Area type="monotone" dataKey={chartMetric} stroke="#4f46e5" strokeWidth={2} fillOpacity={1} fill="url(#growthChartGrad)" name={chartMetric} />
                )}
              </AreaChart>
            </ResponsiveContainer>

            {/* Empty State Overlay */}
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
                  width: '44px',
                  height: '44px',
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
                  Connect your accounts to see analytics
                </div>
                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '14px', textAlign: 'center' }}>
                  Once you connect your social accounts, your reach and impressions will appear here.
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/connected-accounts')}
                  style={{
                    padding: '8px 16px',
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

        {/* Right Card: Link Click-Through Rate (CTR) */}
        <div className="card" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <MousePointer size={18} style={{ color: '#111827' }} />
              <div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827', margin: 0 }}>
                  Link Click-Through Rate (CTR)
                </h3>
                <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: 0 }}>
                  Outbound link performance across all channels.
                </p>
              </div>
            </div>

            {/* Dropdown Channel Filter */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setShowCtrChannelMenu(!showCtrChannelMenu)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 12px',
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                  color: '#374151',
                  cursor: 'pointer'
                }}
              >
                <span>{ctrChannel}</span>
                <ChevronDown size={13} style={{ color: '#9ca3af' }} />
              </button>

              {showCtrChannelMenu && (
                <div style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  right: 0,
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08)',
                  zIndex: 30,
                  minWidth: '130px',
                  padding: '4px'
                }}>
                  {['All Channels', 'X (Twitter)', 'LinkedIn', 'Instagram', 'Facebook'].map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        setCtrChannel(c);
                        setShowCtrChannelMenu(false);
                      }}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '6px 12px',
                        background: ctrChannel === c ? '#f3f4f6' : 'transparent',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '0.8rem',
                        color: '#111827',
                        cursor: 'pointer'
                      }}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Bar Chart Container */}
          <div style={{ position: 'relative', width: '100%', height: '280px' }}>
            <ResponsiveContainer width="100%" height={280} minWidth={0} minHeight={280}>
              <RechartsBarChart data={hasData ? growthData : emptyTimelineDates} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="date" stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={{ stroke: '#f3f4f6' }} />
                <YAxis stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false} domain={[0, 0.1]} ticks={[0, 0.02, 0.04, 0.06, 0.08, 0.1]} tickFormatter={v => `${(v * 100).toFixed(0)}%`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                  formatter={(val: any) => `${(val * 100).toFixed(2)}%`}
                />
                {hasData && (
                  <Bar dataKey="clicks" fill="#18181b" radius={[4, 4, 0, 0]} name="CTR" />
                )}
              </RechartsBarChart>
            </ResponsiveContainer>

            {/* Empty State Overlay */}
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
                  width: '44px',
                  height: '44px',
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
                  Connect your accounts to see CTR data
                </div>
                <div style={{ fontSize: '0.8rem', color: '#6b7280', textAlign: 'center' }}>
                  Track how your content drives clicks across platforms.
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* 4. Bottom Section: Platform Performance */}
      <div className="card" style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        
        {/* Header Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Layers size={18} style={{ color: '#111827' }} />
            <div>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827', margin: 0 }}>
                Platform Performance
              </h3>
              <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: 0 }}>
                Compare key metrics across your connected channels.
              </p>
            </div>
          </div>

          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setShowPlatformMetricMenu(!showPlatformMetricMenu)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 500,
                color: '#374151',
                cursor: 'pointer'
              }}
            >
              <span>{platformMetric}</span>
              <ChevronDown size={13} style={{ color: '#9ca3af' }} />
            </button>

            {showPlatformMetricMenu && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                right: 0,
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08)',
                zIndex: 30,
                minWidth: '130px',
                padding: '4px'
              }}>
                {['All Metrics', 'Followers', 'Reach', 'Impressions', 'Engagement'].map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setPlatformMetric(m);
                      setShowPlatformMetricMenu(false);
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '6px 12px',
                      background: platformMetric === m ? '#f3f4f6' : 'transparent',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '0.8rem',
                      color: '#111827',
                      cursor: 'pointer'
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 6 Platform Cards in a Row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gap: '12px'
        }}>
          {[
            { id: 'linkedin', label: 'LinkedIn', platform: 'linkedin' },
            { id: 'twitter', label: 'X (Twitter)', platform: 'twitter' },
            { id: 'instagram', label: 'Instagram', platform: 'instagram' },
            { id: 'facebook', label: 'Facebook', platform: 'facebook' },
            { id: 'threads', label: 'Threads', platform: 'threads' },
            { id: 'youtube', label: 'YouTube', platform: 'youtube' }
          ].map(ch => {
            const data = getPlatformAccountData(ch.id);
            return (
              <div
                key={ch.id}
                style={{
                  padding: '14px 16px',
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onClick={() => navigate('/connected-accounts')}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#d1d5db')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '#e5e7eb')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                  <PlatformBadge platform={ch.platform} size={28} iconSize={14} />
                  <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <span style={{ fontSize: '0.825rem', fontWeight: 600, color: '#111827', whiteSpace: 'nowrap' }}>
                      {ch.label}
                    </span>
                    <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827', lineHeight: 1.2 }}>
                      {data ? formatNumber(data.followers) : '—'}
                    </span>
                    <span style={{ fontSize: '0.68rem', color: '#6b7280' }}>
                      {data ? 'Connected' : 'Connect account'}
                    </span>
                  </div>
                </div>
                <ChevronRight size={15} style={{ color: '#9ca3af', flexShrink: 0 }} />
              </div>
            );
          })}
        </div>

        {/* Bottom Callout Banner */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          background: '#f9fafb',
          border: '1px solid #f3f4f6',
          borderRadius: '10px',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              background: '#f3f4f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <Info size={16} style={{ color: '#6b7280' }} />
            </div>
            <div>
              <span style={{ fontSize: '0.825rem', fontWeight: 600, color: '#111827' }}>
                {hasAccounts ? 'Real-time telemetry connected' : 'No connected accounts'}
              </span>
              <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: 0 }}>
                {hasAccounts
                  ? 'Your channels are transmitting live audience, impression and CTR data.'
                  : 'Connect your social accounts to start seeing real analytics, track performance, and export reports.'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate('/connected-accounts')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 18px',
              background: '#18181b',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.825rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
            }}
          >
            <span>Connect Social Accounts</span>
            <ArrowRight size={14} />
          </button>
        </div>

      </div>

    </div>
  );
};
