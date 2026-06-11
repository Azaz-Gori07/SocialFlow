import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { 
  BarChart3, 
  TrendingUp, 
  MousePointer, 
  FileSpreadsheet, 
  FileText 
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  BarChart as RechartsBarChart,
  Bar,
  CartesianGrid
} from 'recharts';

export const Analytics: React.FC = () => {
  const [growthData, setGrowthData] = useState<any[]>([]);
  const [platformsData, setPlatformsData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [gr, pl] = await Promise.all([
          api.dashboard.getGrowth(),
          api.dashboard.getPlatforms()
        ]);
        setGrowthData(gr);
        setPlatformsData(pl);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const handleExport = (type: 'csv' | 'pdf') => {
    setExporting(type);
    setTimeout(() => {
      setExporting(null);
      // Simulate file download trigger
      const header = 'Date,Platform,Followers,Reach,Impressions,Engagement,Clicks,CTR\n';
      const rows = growthData.map(d => 
        `${d.date},All,${d.followers},${d.reach},${d.impressions},${d.engagement},${d.clicks},${(d.clicks/d.impressions || 0).toFixed(4)}`
      ).join('\n');
      
      const blob = new Blob([header + rows], { type: type === 'csv' ? 'text/csv' : 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.setAttribute('href', url);
      a.setAttribute('download', `ViralDrift_Analytics_Report_${new Date().toISOString().split('T')[0]}.${type}`);
      a.click();
    }, 1500);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexGrow: 1, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'hsl(var(--text-secondary))' }}>Aggregating analytics data...</div>
      </div>
    );
  }

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  return (
    <div className="animate-fade-in" style={{ position: 'relative' }}>
      <div className="glow-blur" />

      {/* Header */}
      <div className="header-bar">
        <div>
          <h1 className="page-title">Analytics Hub</h1>
          <p style={{ color: 'hsl(var(--text-secondary))', marginTop: '4px', fontSize: '0.95rem' }}>
            Deep-dive metrics audit, click-through trends, and custom report exporter.
          </p>
        </div>
        
        {/* Export Dropdown */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => handleExport('csv')}
            className="btn btn-secondary"
            disabled={!!exporting}
            style={{ gap: '8px', fontSize: '0.85rem' }}
          >
            {exporting === 'csv' ? 'Exporting...' : <><FileSpreadsheet size={16} /><span>Export CSV</span></>}
          </button>
          <button
            onClick={() => handleExport('pdf')}
            className="btn btn-primary"
            disabled={!!exporting}
            style={{ gap: '8px', fontSize: '0.85rem' }}
          >
            {exporting === 'pdf' ? 'Exporting...' : <><FileText size={16} /><span>Export PDF</span></>}
          </button>
        </div>
      </div>

      {/* Growth Trends Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: '30px', marginBottom: '30px' }}>
        
        {/* Time Series Area Chart */}
        <div className="glass-card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <TrendingUp size={16} style={{ color: 'hsl(var(--primary))' }} />
            <span>Growth and Impressions Trend</span>
          </h3>
          <div style={{ width: '100%', height: '280px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={growthData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                <XAxis dataKey="date" stroke="hsl(var(--text-muted))" fontSize={11} tickLine={false} />
                <YAxis stroke="hsl(var(--text-muted))" fontSize={11} tickLine={false} tickFormatter={formatNumber} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--bg-card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                <Area type="monotone" dataKey="followers" stroke="hsl(var(--primary))" fill="rgba(139,92,246,0.1)" strokeWidth={2.5} name="Total Followers" />
                <Area type="monotone" dataKey="impressions" stroke="#00F2FE" fill="rgba(0,242,254,0.05)" strokeWidth={2} name="Impressions" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Click Through Rate (CTR) Bar Chart */}
        <div className="glass-card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <MousePointer size={16} style={{ color: 'hsl(var(--secondary))' }} />
            <span>Link Click-Through-Rate (CTR)</span>
          </h3>
          <div style={{ width: '100%', height: '280px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <RechartsBarChart data={growthData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                <XAxis dataKey="date" stroke="hsl(var(--text-muted))" fontSize={11} tickLine={false} />
                <YAxis stroke="hsl(var(--text-muted))" fontSize={11} tickLine={false} tickFormatter={(val) => `${(val * 100).toFixed(1)}%`} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--bg-card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} formatter={(val: any) => `${(val * 100).toFixed(2)}%`} />
                <Bar dataKey="clicks" fill="hsl(var(--secondary))" radius={[4, 4, 0, 0]} name="CTR Performance" />
              </RechartsBarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Platform Summary Table */}
      <div className="glass-card" style={{ padding: '24px', overflowX: 'auto' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <BarChart3 size={16} style={{ color: 'hsl(var(--primary))' }} />
          <span>Channel Audit Breakdown</span>
        </h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid hsl(var(--border))', color: 'hsl(var(--text-secondary))', fontSize: '0.85rem' }}>
              <th style={{ padding: '12px 16px' }}>Channel/Platform</th>
              <th style={{ padding: '12px 16px' }}>Subscribers/Followers</th>
              <th style={{ padding: '12px 16px' }}>Avg Reach</th>
              <th style={{ padding: '12px 16px' }}>Impressions</th>
              <th style={{ padding: '12px 16px' }}>Engagement</th>
              <th style={{ padding: '12px 16px' }}>Link Clicks</th>
            </tr>
          </thead>
          <tbody>
            {platformsData.map((plat, idx) => (
              <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.9rem', color: 'white' }}>
                <td style={{ padding: '16px', textTransform: 'capitalize', fontWeight: 600 }}>
                  {plat.platform === 'twitter' ? 'X (Twitter)' : plat.platform}
                </td>
                <td style={{ padding: '16px' }}>{formatNumber(plat.followers)}</td>
                <td style={{ padding: '16px' }}>{formatNumber(plat.reach)}</td>
                <td style={{ padding: '16px' }}>{formatNumber(plat.impressions)}</td>
                <td style={{ padding: '16px' }}>{formatNumber(plat.engagement)}</td>
                <td style={{ padding: '16px' }}>{formatNumber(plat.followers * 0.015)}</td> {/* Mock clicks count */}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
