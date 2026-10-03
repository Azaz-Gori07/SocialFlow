import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { 
  Plus, 
  Trash2, 
  Link2,
  CheckCircle2,
  Share2,
  Info
} from 'lucide-react';
import { PlatformBadge } from '../components/SocialIcons';

const OAUTH_PLATFORMS = ['twitter', 'linkedin', 'youtube', 'facebook', 'instagram', 'threads'];

export const ConnectedAccounts: React.FC = () => {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const loadAccounts = async () => {
    try {
      const list = await api.social.getAccounts();
      setAccounts(list || []);
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

    // Catch query params on redirect from OAuth
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
    { id: 'twitter', label: 'X (Twitter)', desc: 'Publish threads, monitor mentions, and analyze link click performance.' },
    { id: 'linkedin', label: 'LinkedIn', desc: 'Distribute professional summaries, industry perspectives, and articles.' },
    { id: 'instagram', label: 'Instagram', desc: 'Sync post captions, carousel imagery, and community discussions.' },
    { id: 'facebook', label: 'Facebook', desc: 'Manage page updates, releases, and audience feedback.' },
    { id: 'youtube', label: 'YouTube', desc: 'Track subscriber trends, community posts, and video distribution.' },
    { id: 'threads', label: 'Threads', desc: 'Share conversational updates, quick insights, and multimedia notes.' }
  ];

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      
      {/* 1. Header Banner */}
      <div>
        <div style={{
          fontSize: '0.6875rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          color: '#6b7280',
          textTransform: 'uppercase',
          marginBottom: '3px'
        }}>
          CHANNELS
        </div>
        <h1 style={{
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontSize: '2.4rem',
          fontWeight: 700,
          color: '#111827',
          letterSpacing: '-0.02em',
          marginBottom: '4px',
          lineHeight: 1.15
        }}>
          Connected Accounts
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#6b7280', lineHeight: 1.4 }}>
          Link, audit, and revoke OAuth access keys for social publishing profiles.
        </p>
      </div>

      {statusMessage && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '10px',
          background: statusMessage.startsWith('✅') ? '#ecfdf5' : '#fef2f2',
          border: `1px solid ${statusMessage.startsWith('✅') ? '#a7f3d0' : '#fecaca'}`,
          color: statusMessage.startsWith('✅') ? '#059669' : '#b91c1c',
          fontSize: '0.85rem',
          fontWeight: 500
        }}>
          {statusMessage}
        </div>
      )}

      {/* 2. Main Two Column Layout */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.4fr 1fr',
        gap: '20px',
        alignItems: 'start'
      }} className="responsive-grid-1-1">
        
        {/* Left Column: Supported Platforms Grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#111827', margin: 0 }}>
              Supported Networks ({platforms.length})
            </h2>
            <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
              Direct OAuth 2.0 Integration
            </span>
          </div>

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '0.875rem' }}>
              Loading networks...
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '14px'
            }}>
              {platforms.map(plat => {
                const connectedForPlat = accounts.filter(a => a.platform === plat.id);
                const isConnected = connectedForPlat.length > 0;

                return (
                  <div 
                    key={plat.id}
                    className="card"
                    style={{
                      padding: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '12px'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <PlatformBadge platform={plat.id} size={32} iconSize={16} />
                          <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827', margin: 0 }}>
                            {plat.label}
                          </h4>
                        </div>

                        {isConnected ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            color: '#059669',
                            background: '#ecfdf5',
                            border: '1px solid #d1fae5',
                            padding: '2px 7px',
                            borderRadius: '9999px'
                          }}>
                            <CheckCircle2 size={11} />
                            <span>{connectedForPlat.length} linked</span>
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Not linked</span>
                        )}
                      </div>

                      <p style={{ fontSize: '0.78rem', color: '#6b7280', lineHeight: 1.45, margin: 0 }}>
                        {plat.desc}
                      </p>
                    </div>

                    {OAUTH_PLATFORMS.includes(plat.id) ? (
                      <button
                        type="button"
                        onClick={() => handleOAuthConnect(plat.id)}
                        disabled={oauthLoading === plat.id}
                        style={{
                          width: '100%',
                          height: '38px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          background: isConnected ? '#ffffff' : '#18181b',
                          color: isConnected ? '#111827' : '#ffffff',
                          border: isConnected ? '1px solid #e5e7eb' : 'none',
                          borderRadius: '8px',
                          fontSize: '0.825rem',
                          fontWeight: 600,
                          cursor: oauthLoading === plat.id ? 'not-allowed' : 'pointer',
                          boxShadow: isConnected ? '0 1px 2px rgba(0, 0, 0, 0.02)' : '0 1px 3px rgba(0, 0, 0, 0.1)',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {oauthLoading === plat.id ? (
                          <span>Connecting...</span>
                        ) : isConnected ? (
                          <><Plus size={14} /><span>Connect Another</span></>
                        ) : (
                          <><Plus size={14} /><span>Link Profile</span></>
                        )}
                      </button>
                    ) : (
                      <button
                        disabled
                        style={{
                          width: '100%',
                          height: '38px',
                          background: '#f9fafb',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          color: '#9ca3af',
                          fontSize: '0.8rem',
                          cursor: 'not-allowed'
                        }}
                      >
                        Coming Soon
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Active Channel Roster */}
        <div className="card" style={{ padding: '24px 26px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Link2 size={18} style={{ color: '#111827' }} />
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', margin: 0 }}>
                Active Channel Roster ({accounts.length})
              </h3>
              <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: 0 }}>
                Profiles currently transmitting and ready to publish.
              </p>
            </div>
          </div>

          {accounts.length === 0 ? (
            <div style={{
              padding: '40px 16px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
              background: '#fafaf9',
              borderRadius: '10px',
              border: '1px dashed #e5e7eb'
            }}>
              <Share2 size={28} style={{ color: '#9ca3af', opacity: 0.6 }} />
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>No accounts linked yet</div>
              <p style={{ fontSize: '0.8rem', color: '#6b7280', maxWidth: '240px', margin: 0, lineHeight: 1.4 }}>
                Choose a social network from the left to link your profile via secure OAuth.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {accounts.map(act => (
                <div 
                  key={act._id || act.id}
                  style={{
                    padding: '12px 16px',
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
                    <PlatformBadge platform={act.platform} size={28} iconSize={14} />
                    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                        {act.displayName || act.username}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: '#6b7280' }}>
                        @{act.username} • <span style={{ color: '#10b981', fontWeight: 600 }}>Active</span>
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDisconnect(act.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#9ca3af',
                      cursor: 'pointer',
                      padding: '6px',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      transition: 'color 0.15s ease'
                    }}
                    title="Disconnect account"
                    onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#9ca3af')}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Security Notice Callout */}
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            padding: '12px 14px',
            background: '#f9fafb',
            borderRadius: '8px',
            border: '1px solid #f3f4f6',
            marginTop: '6px'
          }}>
            <Info size={16} style={{ color: '#6b7280', flexShrink: 0, marginTop: '2px' }} />
            <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0, lineHeight: 1.45 }}>
              OAuth tokens are encrypted at rest with AES-256-GCM. We never request or store your social account passwords.
            </p>
          </div>
        </div>

      </div>

    </div>
  );
};

export default ConnectedAccounts;
