import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { 
  Plus, 
  Trash2, 
  Link2,
  CheckCircle2
} from 'lucide-react';

const XIcon = ({ size }: any) => <span style={{ fontWeight: 'bold', fontSize: `${size}px` }}>X</span>;
const LinkedInIcon = ({ size }: any) => <span style={{ fontWeight: 'bold', fontSize: `${size}px` }}>In</span>;
const InstagramIcon = ({ size }: any) => <span style={{ fontWeight: 'bold', fontSize: `${size}px` }}>Ig</span>;
const FacebookIcon = ({ size }: any) => <span style={{ fontWeight: 'bold', fontSize: `${size}px` }}>Fb</span>;
const YoutubeIcon = ({ size }: any) => <span style={{ fontWeight: 'bold', fontSize: `${size}px` }}>Yt</span>;
const TiktokIcon = ({ size }: any) => <span style={{ fontWeight: 'bold', fontSize: `${size}px` }}>Tt</span>;

const OAUTH_PLATFORMS = ['twitter', 'linkedin', 'youtube'];

export const Settings: React.FC = () => {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadAccounts = async () => {
    try {
      const list = await api.social.getAccounts();
      setAccounts(list);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await loadAccounts();
      setLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connection') === 'success') {
      const platform = params.get('platform');
      setStatusMessage(`✅ ${platform} account connected successfully!`);
      window.history.replaceState({}, '', window.location.pathname);
      loadAccounts();
    } else if (params.get('connection') === 'error') {
      const msg = decodeURIComponent(params.get('message') || 'Unknown error');
      setStatusMessage(`❌ Connection failed: ${msg}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleOAuthConnect = async (platform: string) => {
    setOauthLoading(platform);
    setStatusMessage(null);
    try {
      const res = await api.social.connectOAuth(platform);
      window.location.href = res.url;
    } catch (err: any) {
      setStatusMessage(`❌ Failed to initiate ${platform} connection: ${err.message}`);
      setOauthLoading(null);
    }
  };

  const handleDisconnect = async (id: string) => {
    const act = accounts.find(a => a.id === id);
    if (!act) return;
    if (!confirm(`Are you sure you want to disconnect @${act.username} from ${act.platform}? All associated analytics and comments will be deleted.`)) return;

    try {
      await api.social.disconnect(id);
      await loadAccounts();
    } catch (err) {
      console.error(err);
    }
  };

  const platforms = [
    { id: 'twitter', label: 'X (Twitter)', icon: XIcon, color: '#1DA1F2', desc: 'Publish threads, check CTR, and monitor replies.' },
    { id: 'linkedin', label: 'LinkedIn', icon: LinkedInIcon, color: '#0077B5', desc: 'Post professional summaries and articles.' },
    { id: 'instagram', label: 'Instagram', icon: InstagramIcon, color: '#E1306C', desc: 'Sync captions, media carousels, and inbox comments.' },
    { id: 'facebook', label: 'Facebook', icon: FacebookIcon, color: '#1877F2', desc: 'Manage page posts and community engagements.' },
    { id: 'youtube', label: 'YouTube', icon: YoutubeIcon, color: '#FF0000', desc: 'Track subscriber trends, videos, and comments.' },
    { id: 'tiktok', label: 'TikTok', icon: TiktokIcon, color: '#00F2FE', desc: 'Publish shorts and monitor video completion rates.' }
  ];

  return (
    <div className="animate-fade-in" style={{ position: 'relative' }}>
      <div className="glow-blur" />

      {/* Header */}
      <div className="header-bar">
        <div>
          <h1 className="page-title">Connected Channels</h1>
          <p style={{ color: 'hsl(var(--text-secondary))', marginTop: '4px', fontSize: '0.95rem' }}>
            Link, audit, and revoke OAuth access keys for social publishing profiles.
          </p>
        </div>
      </div>

      {statusMessage && (
        <div style={{ padding: '12px 16px', borderRadius: 'var(--radius-md)', background: statusMessage.startsWith('✅') ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)', color: statusMessage.startsWith('✅') ? '#10b981' : '#ef4444', marginBottom: '16px', fontSize: '0.85rem' }}>
          {statusMessage}
        </div>
      )}

      <div className="responsive-grid-125-1">
        
        {/* Left Column - Supported Integrations Grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Supported Platforms</h2>
          
          {loading ? (
            <p style={{ color: 'hsl(var(--text-secondary))' }}>Loading profiles...</p>
          ) : (
            <div className="responsive-grid-1-1">
              {platforms.map(plat => {
                const Icon = plat.icon;
                const connectedForPlat = accounts.filter(a => a.platform === plat.id);
                const isConnected = connectedForPlat.length > 0;

                return (
                  <div key={plat.id} className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px', borderTop: `4px solid ${plat.color}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Icon size={20} style={{ color: plat.color }} />
                        <h4 style={{ fontSize: '1rem', fontWeight: 600 }}>{plat.label}</h4>
                      </div>
                      
                      {isConnected ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: '#10b981', fontWeight: 600 }}>
                          <CheckCircle2 size={12} />
                          <span>Connected ({connectedForPlat.length})</span>
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.7rem', color: 'hsl(var(--text-muted))' }}>Disconnected</span>
                      )}
                    </div>

                    <p style={{ fontSize: '0.8rem', color: 'hsl(var(--text-secondary))', lineHeight: '1.4' }}>
                      {plat.desc}
                    </p>

                    {OAUTH_PLATFORMS.includes(plat.id) ? (
                      <button
                        onClick={() => handleOAuthConnect(plat.id)}
                        className={isConnected ? "btn btn-secondary" : "btn btn-primary"}
                        style={{ width: '100%', marginTop: '6px', fontSize: '0.8rem', gap: '4px' }}
                        disabled={oauthLoading === plat.id}
                      >
                        {oauthLoading === plat.id ? 'Connecting...' : (
                          <><Plus size={14} /><span>{isConnected ? 'Connect Another' : 'Link Profile'}</span></>
                        )}
                      </button>
                    ) : (
                      <button
                        disabled
                        className="btn btn-secondary"
                        style={{ width: '100%', marginTop: '6px', fontSize: '0.8rem', gap: '4px', opacity: 0.4 }}
                        title="OAuth integration coming soon"
                      >
                        <Plus size={14} />
                        <span>Not Available</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column - Connected Channels Roster */}
        <div className="glass-card" style={{ padding: '24px', alignSelf: 'start' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Link2 size={18} style={{ color: 'hsl(var(--primary))' }} />
            <span>Active Channel Roster ({accounts.length})</span>
          </h3>

          {accounts.length === 0 ? (
            <div style={{ padding: '30px 10px', textAlign: 'center', color: 'hsl(var(--text-muted))' }}>
              <p style={{ fontSize: '0.8rem' }}>No channels linked yet. Configure a platform connection on the left.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {accounts.map(act => {
                const platMatch = platforms.find(p => p.id === act.platform);
                const PlatIcon = platMatch?.icon || Link2;
                return (
                  <div 
                    key={act._id} 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      background: 'rgba(255,255,255,0.01)',
                      border: '1px solid var(--border-glass)',
                      borderRadius: 'var(--radius-md)',
                      padding: '12px 16px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <img src={act.avatarUrl} alt="" style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'white' }}>{act.displayName}</span>
                        <span style={{ fontSize: '0.7rem', color: 'hsl(var(--text-muted))', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <PlatIcon size={10} style={{ color: platMatch?.color }} />
                          <span>@{act.username}</span>
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDisconnect(act.id)}
                      style={{ background: 'none', border: 'none', color: 'hsl(var(--text-muted))', cursor: 'pointer', display: 'flex' }}
                      title="Disconnect Account"
                      className="delete-hover"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      <style>{`
        .delete-hover:hover {
          color: #ef4444 !important;
        }
      `}</style>
    </div>
  );
};
