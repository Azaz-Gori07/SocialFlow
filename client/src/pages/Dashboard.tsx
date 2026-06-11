import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { 
  Users, 
  TrendingUp, 
  Eye, 
  Share2, 
  Clock, 
  MousePointerClick, 
  Percent,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer
} from 'recharts';

export const Dashboard: React.FC = () => {
  const [overview, setOverview] = useState<any>(null);
  const [growthData, setGrowthData] = useState<any[]>([]);
  const [platformsData, setPlatformsData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<any[]>([]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [ov, gr, pl, ins] = await Promise.all([
          api.dashboard.getOverview(),
          api.dashboard.getGrowth(),
          api.dashboard.getPlatforms(),
          api.ai.getInsights()
        ]);
        setOverview(ov);
        setGrowthData(gr);
        setPlatformsData(pl);
        setInsights(ins);
      } catch (err) {
        console.error('Failed to load dashboard data', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexGrow: 1, alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <div className="animate-pulse" style={{ fontSize: '1.1rem', color: 'hsl(var(--text-secondary))' }}>Analyzing channel metrics...</div>
      </div>
    );
  }

  const statCards = [
    { title: 'Followers', value: overview?.totalFollowers || 0, change: overview?.growth?.followers || 0, icon: Users, format: true },
    { title: 'Reach', value: overview?.totalReach || 0, change: overview?.growth?.reach || 0, icon: TrendingUp, format: true },
    { title: 'Impressions', value: overview?.totalImpressions || 0, change: overview?.growth?.impressions || 0, icon: Eye, format: true },
    { title: 'Engagement', value: overview?.totalEngagement || 0, change: overview?.growth?.engagement || 0, icon: Share2, format: true },
    { title: 'Watch Time', value: Math.round((overview?.totalWatchTime || 0) / 3600), suffix: ' hrs', icon: Clock, format: false },
    { title: 'Clicks', value: overview?.totalClicks || 0, icon: MousePointerClick, format: true },
    { title: 'CTR', value: ((overview?.averageCtr || 0) * 100).toFixed(2) + '%', icon: Percent, format: false }
  ];

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'twitter': return <span style={{ color: '#1DA1F2', fontWeight: 'bold' }}>X</span>;
      case 'instagram': return <span style={{ color: '#E1306C', fontWeight: 'bold' }}>IG</span>;
      case 'facebook': return <span style={{ color: '#1877F2', fontWeight: 'bold' }}>FB</span>;
      case 'linkedin': return <span style={{ color: '#0077B5', fontWeight: 'bold' }}>LN</span>;
      case 'youtube': return <span style={{ color: '#FF0000', fontWeight: 'bold' }}>YT</span>;
      case 'tiktok': return <span style={{ color: '#00F2FE', fontWeight: 'bold' }}>TT</span>;
      default: return null;
    }
  };

  return (
    <div className="animate-fade-in" style={{ position: 'relative' }}>
      <div className="glow-blur" />
      
      {/* Header */}
      <div className="header-bar">
        <div>
          <h1 className="page-title">Unified Dashboard</h1>
          <p style={{ color: 'hsl(var(--text-secondary))', marginTop: '4px', fontSize: '0.95rem' }}>
            Real-time operations across all connected channels.
          </p>
        </div>
      </div>

      {/* Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '20px', marginBottom: '32px' }}>
        {statCards.map((card, i) => {
          const Icon = card.icon;
          const isPositive = card.change && card.change >= 0;
          return (
            <div key={i} className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: 'hsl(var(--text-secondary))', fontWeight: 500 }}>{card.title}</span>
                <div style={{ background: 'rgba(255, 255, 255, 0.04)', borderRadius: '8px', padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={16} style={{ color: 'hsl(var(--primary))' }} />
                </div>
              </div>
              <div>
                <h3 style={{ fontSize: '1.8rem', fontWeight: 700, fontFamily: 'var(--font-display)', display: 'inline-block' }}>
                  {card.format && typeof card.value === 'number' ? formatNumber(card.value) : card.value}
                </h3>
                {card.suffix && <span style={{ fontSize: '1rem', color: 'hsl(var(--text-secondary))' }}>{card.suffix}</span>}
              </div>
              {card.change !== undefined && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 600, color: isPositive ? '#10b981' : '#ef4444' }}>
                  {isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  <span>{Math.abs(card.change)}%</span>
                  <span style={{ color: 'hsl(var(--text-muted))', fontWeight: 400 }}>vs prev day</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Charts section */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '30px', marginBottom: '32px' }}>
        {/* Growth Graph */}
        <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 600 }}>Audience Reach Trend</h3>
              <p style={{ fontSize: '0.8rem', color: 'hsl(var(--text-secondary))' }}>Combined impressions and reach over the past 14 days</p>
            </div>
          </div>
          <div style={{ width: '100%', height: '320px' }}>
            {growthData.length === 0 ? (
              <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'hsl(var(--text-muted))' }}>
                Connect an account in Settings to populate growth analytics
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={growthData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorReach" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorImpressions" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00F2FE" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#00F2FE" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" stroke="hsl(var(--text-muted))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--text-muted))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(tick) => formatNumber(tick)} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--bg-card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                    labelClassName="text-white"
                  />
                  <Area type="monotone" dataKey="impressions" stroke="#00F2FE" strokeWidth={2} fillOpacity={1} fill="url(#colorImpressions)" name="Impressions" />
                  <Area type="monotone" dataKey="reach" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#colorReach)" name="Reach" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Platform Breakdown */}
        <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '20px' }}>Platform Distribution</h3>
          {platformsData.length === 0 ? (
            <div style={{ display: 'flex', flexGrow: 1, alignItems: 'center', justifyContent: 'center', color: 'hsl(var(--text-muted))' }}>
              No platform data available
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flexGrow: 1, justifyContent: 'center' }}>
              {platformsData.map((plat, i) => {
                const totalFollowers = platformsData.reduce((sum, p) => sum + p.followers, 0);
                const percent = totalFollowers > 0 ? ((plat.followers / totalFollowers) * 100).toFixed(0) : 0;
                
                // Set platform brand color
                let color = 'hsl(var(--primary))';
                if (plat.platform === 'twitter') color = '#1DA1F2';
                else if (plat.platform === 'instagram') color = '#E1306C';
                else if (plat.platform === 'facebook') color = '#1877F2';
                else if (plat.platform === 'linkedin') color = '#0077B5';
                else if (plat.platform === 'youtube') color = '#FF0000';
                else if (plat.platform === 'tiktok') color = '#00F2FE';

                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {getPlatformIcon(plat.platform)}
                        <span style={{ textTransform: 'capitalize', fontWeight: 500 }}>{plat.platform === 'twitter' ? 'X (Twitter)' : plat.platform}</span>
                      </div>
                      <span style={{ fontWeight: 600, color: 'white' }}>{formatNumber(plat.followers)} ({percent}%)</span>
                    </div>
                    {/* Progress Bar */}
                    <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.04)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${percent}%`, height: '100%', background: color, borderRadius: '4px' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* AI Growth Recommendations Panel */}
      <div className="glass-card" style={{ padding: '24px', background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.06), rgba(0, 242, 254, 0.02))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <div style={{ background: 'rgba(139, 92, 246, 0.15)', padding: '6px', borderRadius: '8px', display: 'flex' }}>
            <Sparkles size={18} style={{ color: 'hsl(var(--primary))' }} />
          </div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 600 }}>AI Growth Recommendations</h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          {insights.length === 0 ? (
            <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.9rem' }}>Generating recommendations... Connect channels and schedule posts to enable AI analytics.</p>
          ) : (
            insights.slice(0, 3).map((insight, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-md)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'white' }}>{insight.title}</span>
                  {insight.platform && (
                    <span style={{ fontSize: '0.7rem', padding: '2px 8px', background: 'rgba(255,255,255,0.06)', borderRadius: '12px', textTransform: 'capitalize' }}>
                      {insight.platform}
                    </span>
                  )}
                </div>
                <p style={{ fontSize: '0.8rem', color: 'hsl(var(--text-secondary))', lineHeight: '1.4' }}>{insight.recommendation}</p>
                {insight.metricImpact && (
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'hsl(var(--secondary))', marginTop: '4px' }}>
                    Impact: {insight.metricImpact}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
