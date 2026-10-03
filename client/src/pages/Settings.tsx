import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Settings as SettingsIcon, 
  Save, 
  Check, 
  CheckCircle2, 
  Key, 
  Copy, 
  ShieldAlert, 
  Trash2, 
  Download, 
  Share2,
  CheckCheck
} from 'lucide-react';

export const Settings: React.FC = () => {
  const { workspace } = useAuth();
  const [workspaceName, setWorkspaceName] = useState(workspace?.name || "azaz's Workspace");
  const [timezone, setTimezone] = useState('Asia/Kolkata (IST, UTC+05:30)');
  const [dateFormat, setDateFormat] = useState('MMM D, YYYY');
  
  // Publishing toggles
  const [autoShortenUrls, setAutoShortenUrls] = useState(true);
  const [autoHashtags, setAutoHashtags] = useState(true);
  const [crossPostWarning, setCrossPostWarning] = useState(true);

  // API Key state
  const [apiKey] = useState('sf_live_9a7d83f1c29e46a7b8e5c3d2');
  const [copiedKey, setCopiedKey] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('https://api.myserver.com/webhooks/socialflow');
  
  // Save feedback state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleCopyKey = () => {
    navigator.clipboard.writeText(apiKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }, 600);
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      
      {/* 1. Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{
            fontSize: '0.6875rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: '#6b7280',
            textTransform: 'uppercase',
            marginBottom: '3px'
          }}>
            PREFERENCES
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
            Settings
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', lineHeight: 1.4 }}>
            Manage workspace defaults, automated publishing policies, API integrations, and data retention.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSaveSettings}
          disabled={saving}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '9px 20px',
            background: '#18181b',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
          }}
        >
          {saved ? <Check size={15} style={{ color: '#10b981' }} /> : <Save size={15} />}
          <span>{saving ? 'Saving...' : saved ? 'Settings Saved!' : 'Save Changes'}</span>
        </button>
      </div>

      {saved && (
        <div style={{
          padding: '12px 16px',
          background: '#ecfdf5',
          border: '1px solid #d1fae5',
          borderRadius: '10px',
          color: '#059669',
          fontSize: '0.85rem',
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <CheckCircle2 size={16} />
          <span>Application configurations and workspace dispatch policies updated successfully.</span>
        </div>
      )}

      {/* 2. Settings Grid Layout */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.25fr 1fr',
        gap: '20px',
        alignItems: 'start'
      }} className="responsive-grid-1-1">
        
        {/* Left Column: General & Publishing Policies */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Card 1: Workspace & General Settings */}
          <div className="card" style={{ padding: '24px 26px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: '#f4f4f5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <SettingsIcon size={20} style={{ color: '#111827' }} />
              </div>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', margin: 0 }}>
                  General Workspace Settings
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>
                  Configure basic identity and regional formatting.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                  Workspace Display Name
                </label>
                <input
                  type="text"
                  value={workspaceName}
                  onChange={e => setWorkspaceName(e.target.value)}
                  style={{
                    width: '100%',
                    height: '42px',
                    padding: '0 14px',
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    color: '#111827',
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                    Primary Timezone
                  </label>
                  <select
                    value={timezone}
                    onChange={e => setTimezone(e.target.value)}
                    style={{
                      width: '100%',
                      height: '42px',
                      padding: '0 12px',
                      background: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '0.825rem',
                      color: '#111827',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="Asia/Kolkata (IST, UTC+05:30)">Asia/Kolkata (IST, UTC+05:30)</option>
                    <option value="UTC (Universal Coordinated Time)">UTC (UTC+00:00)</option>
                    <option value="America/New_York (EST, UTC-05:00)">America/New_York (EST, UTC-05:00)</option>
                    <option value="America/Los_Angeles (PST, UTC-08:00)">America/Los_Angeles (PST, UTC-08:00)</option>
                    <option value="Europe/London (GMT, UTC+00:00)">Europe/London (GMT, UTC+00:00)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                    Date & Time Format
                  </label>
                  <select
                    value={dateFormat}
                    onChange={e => setDateFormat(e.target.value)}
                    style={{
                      width: '100%',
                      height: '42px',
                      padding: '0 12px',
                      background: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '0.825rem',
                      color: '#111827',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="MMM D, YYYY">MMM D, YYYY (Oct 2, 2026)</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY (02/10/2026)</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD (2026-10-02)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Publishing & Dispatch Policy */}
          <div className="card" style={{ padding: '24px 26px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: '#eff6ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Share2 size={20} style={{ color: '#2563eb' }} />
              </div>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', margin: 0 }}>
                  Publishing & Dispatch Rules
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>
                  Automate outbound link formatting and generation parameters.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Toggle 1: Auto-shorten URLs */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: '#f9fafb',
                borderRadius: '10px',
                border: '1px solid #f3f4f6'
              }}>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827' }}>
                    Auto-Shorten Outbound Links
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    Convert external URLs to trackable vanity links for click analytics.
                  </div>
                </div>
                <div
                  onClick={() => setAutoShortenUrls(!autoShortenUrls)}
                  style={{
                    width: '44px',
                    height: '24px',
                    borderRadius: '9999px',
                    background: autoShortenUrls ? '#18181b' : '#e5e7eb',
                    padding: '2px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    transition: 'background 0.2s ease',
                    flexShrink: 0
                  }}
                >
                  <div style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: '#ffffff',
                    transform: autoShortenUrls ? 'translateX(20px)' : 'translateX(0)',
                    transition: 'transform 0.2s ease',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)'
                  }} />
                </div>
              </div>

              {/* Toggle 2: Auto-Hashtag Suggestion */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: '#f9fafb',
                borderRadius: '10px',
                border: '1px solid #f3f4f6'
              }}>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827' }}>
                    Smart Hashtag Recommendations
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    Automatically append relevant trending topics on generated copies.
                  </div>
                </div>
                <div
                  onClick={() => setAutoHashtags(!autoHashtags)}
                  style={{
                    width: '44px',
                    height: '24px',
                    borderRadius: '9999px',
                    background: autoHashtags ? '#18181b' : '#e5e7eb',
                    padding: '2px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    transition: 'background 0.2s ease',
                    flexShrink: 0
                  }}
                >
                  <div style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: '#ffffff',
                    transform: autoHashtags ? 'translateX(20px)' : 'translateX(0)',
                    transition: 'transform 0.2s ease',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)'
                  }} />
                </div>
              </div>

              {/* Toggle 3: Cross-post warning */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: '#f9fafb',
                borderRadius: '10px',
                border: '1px solid #f3f4f6'
              }}>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827' }}>
                    Cross-Platform Mention Guards
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    Warn if an @mention on X does not match the recipient on LinkedIn or Threads.
                  </div>
                </div>
                <div
                  onClick={() => setCrossPostWarning(!crossPostWarning)}
                  style={{
                    width: '44px',
                    height: '24px',
                    borderRadius: '9999px',
                    background: crossPostWarning ? '#18181b' : '#e5e7eb',
                    padding: '2px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    transition: 'background 0.2s ease',
                    flexShrink: 0
                  }}
                >
                  <div style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: '#ffffff',
                    transform: crossPostWarning ? 'translateX(20px)' : 'translateX(0)',
                    transition: 'transform 0.2s ease',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)'
                  }} />
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Right Column: API Keys, Data Management, and Danger Zone */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Card 3: API & Webhooks */}
          <div className="card" style={{ padding: '24px 26px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: '#fef3c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Key size={20} style={{ color: '#b45309' }} />
              </div>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', margin: 0 }}>
                  API & Webhook Integrations
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>
                  Connect external CI/CD pipelines and headless publishers.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                  Workspace Public API Key
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    readOnly
                    value={apiKey}
                    style={{
                      flexGrow: 1,
                      height: '42px',
                      padding: '0 12px',
                      background: '#f9fafb',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '0.825rem',
                      fontFamily: 'var(--font-mono)',
                      color: '#111827',
                      outline: 'none'
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleCopyKey}
                    style={{
                      height: '42px',
                      padding: '0 14px',
                      background: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '0.825rem',
                      fontWeight: 600,
                      color: '#374151',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    {copiedKey ? <CheckCheck size={14} style={{ color: '#10b981' }} /> : <Copy size={14} />}
                    <span>{copiedKey ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                  Webhook Delivery Endpoint
                </label>
                <input
                  type="url"
                  value={webhookUrl}
                  onChange={e => setWebhookUrl(e.target.value)}
                  style={{
                    width: '100%',
                    height: '42px',
                    padding: '0 12px',
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '0.825rem',
                    color: '#111827',
                    outline: 'none'
                  }}
                />
              </div>
            </div>
          </div>

          {/* Card 4: Data Management & Export */}
          <div className="card" style={{ padding: '24px 26px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: '#ecfdf5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Download size={20} style={{ color: '#059669' }} />
              </div>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', margin: 0 }}>
                  Data Export & Archive
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>
                  Download a complete backup of all drafted and scheduled posts.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => alert('Preparing complete workspace JSON archive for download...')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                height: '40px',
                background: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '0.825rem',
                fontWeight: 600,
                color: '#374151',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)'
              }}
            >
              <Download size={14} />
              <span>Export Full Workspace Data (.json)</span>
            </button>
          </div>

          {/* Card 5: Danger Zone */}
          <div className="card" style={{ padding: '24px 26px', display: 'flex', flexDirection: 'column', gap: '14px', border: '1px solid #fecaca' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ShieldAlert size={18} style={{ color: '#ef4444' }} />
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#b91c1c', margin: 0 }}>
                Danger Zone
              </h3>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0, lineHeight: 1.4 }}>
              Irreversible actions. Deleting cache or resetting the workspace permanently clears drafts and telemetry.
            </p>

            <button
              type="button"
              onClick={() => {
                if (confirm('Clear all draft cache and reload from server?')) {
                  localStorage.clear();
                  window.location.reload();
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                height: '38px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: '#ef4444',
                cursor: 'pointer'
              }}
            >
              <Trash2 size={13} />
              <span>Clear Cached Workspace Data</span>
            </button>
          </div>

        </div>

      </div>

    </div>
  );
};

export default Settings;
