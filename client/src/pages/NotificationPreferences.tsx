import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Bell, Mail, Smartphone, CheckCircle2, Save } from 'lucide-react';

const NOTIFICATION_TYPES = [
  { value: 'post_published', label: 'Post Published' },
  { value: 'post_failed', label: 'Post Failed' },
  { value: 'new_comment', label: 'New Comment' },
  { value: 'workspace_invite', label: 'Workspace Invite' },
  { value: 'subscription_update', label: 'Subscription Update' },
  { value: 'analytics_alert', label: 'Analytics Alert' },
];

interface ChannelConfig {
  enabled: boolean;
  types: string[];
}

interface Preferences {
  userId: string;
  email: ChannelConfig;
  push: ChannelConfig;
  inApp: ChannelConfig;
}

export const NotificationPreferences: React.FC = () => {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const fetchPreferences = async () => {
      try {
        const prefs = await api.notifications.getPreferences();
        setPreferences(prefs);
      } catch (err) {
        console.error('Fetch preferences error', err);
      } finally {
        setLoading(false);
      }
    };
    fetchPreferences();
  }, []);

  const toggleChannel = (channel: 'email' | 'push' | 'inApp') => {
    if (!preferences) return;
    setPreferences({
      ...preferences,
      [channel]: {
        ...preferences[channel],
        enabled: !preferences[channel].enabled,
      },
    });
    setSaved(false);
  };

  const toggleType = (channel: 'email' | 'push' | 'inApp', type: string) => {
    if (!preferences) return;
    const currentTypes = preferences[channel].types;
    const newTypes = currentTypes.includes(type)
      ? currentTypes.filter((t: string) => t !== type)
      : [...currentTypes, type];

    setPreferences({
      ...preferences,
      [channel]: {
        ...preferences[channel],
        types: newTypes,
      },
    });
    setSaved(false);
  };

  const handleSave = async () => {
    if (!preferences) return;
    setSaving(true);
    try {
      await api.notifications.updatePreferences({
        email: preferences.email,
        push: preferences.push,
        inApp: preferences.inApp,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Save preferences error', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '60px 0',
        }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            border: '3px solid rgba(255,255,255,0.05)',
            borderTopColor: 'hsl(var(--primary))',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        />
      </div>
    );
  }

  const channels = [
    { key: 'inApp' as const, label: 'In-App Notifications', icon: Bell, desc: 'Display notifications within the app interface in real-time.' },
    { key: 'email' as const, label: 'Email Notifications', icon: Mail, desc: 'Receive notification digests via email.' },
    { key: 'push' as const, label: 'Push Notifications', icon: Smartphone, desc: 'Get push notifications on your devices.' },
  ];

  return (
    <div className="animate-fade-in" style={{ position: 'relative' }}>
      <div className="glow-blur" />

      {/* Header */}
      <div className="header-bar">
        <div>
          <h1 className="page-title">Notification Preferences</h1>
          <p style={{ color: 'hsl(var(--text-secondary))', marginTop: '4px', fontSize: '0.95rem' }}>
            Configure how and when you receive notifications across different channels.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
          style={{ fontSize: '0.85rem' }}
        >
          <Save size={14} />
          <span>{saving ? 'Saving...' : saved ? 'Saved!' : 'Save Preferences'}</span>
        </button>
      </div>

      {/* Channel Configuration Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {channels.map(({ key, label, icon: Icon, desc }) => {
          const channel = preferences?.[key];
          if (!channel) return null;

          return (
            <div
              key={key}
              className="glass-card"
              style={{
                padding: '24px',
                borderTop: `3px solid ${
                  channel.enabled ? 'hsl(var(--primary))' : 'hsl(var(--border))'
                }`,
                transition: 'all 0.2s ease',
              }}
            >
              {/* Channel Header */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: 'var(--radius-md)',
                      background: channel.enabled
                        ? 'hsl(var(--primary) / 0.15)'
                        : 'rgba(255,255,255,0.03)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon
                      size={18}
                      style={{
                        color: channel.enabled
                          ? 'hsl(var(--primary))'
                          : 'hsl(var(--text-muted))',
                      }}
                    />
                  </div>
                  <div>
                    <h3
                      style={{
                        fontSize: '1rem',
                        fontWeight: 600,
                        color: channel.enabled ? 'white' : 'hsl(var(--text-secondary))',
                      }}
                    >
                      {label}
                    </h3>
                    <p style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))', marginTop: '2px' }}>
                      {desc}
                    </p>
                  </div>
                </div>

                <label
                  style={{
                    position: 'relative',
                    display: 'inline-block',
                    width: '44px',
                    height: '24px',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={channel.enabled}
                    onChange={() => toggleChannel(key)}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      borderRadius: '12px',
                      background: channel.enabled
                        ? 'hsl(var(--primary))'
                        : 'rgba(255,255,255,0.1)',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        top: '2px',
                        left: channel.enabled ? '22px' : '2px',
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        background: 'white',
                        transition: 'all 0.2s ease',
                      }}
                    />
                  </span>
                </label>
              </div>

              {/* Notification Types Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                  gap: '8px',
                  opacity: channel.enabled ? 1 : 0.4,
                  pointerEvents: channel.enabled ? 'auto' : 'none',
                }}
              >
                {NOTIFICATION_TYPES.map(nt => {
                  const isActive = channel.types.includes(nt.value);
                  return (
                    <button
                      key={nt.value}
                      onClick={() => toggleType(key, nt.value)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 12px',
                        background: isActive
                          ? 'hsl(var(--primary) / 0.1)'
                          : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${
                          isActive
                            ? 'hsl(var(--primary) / 0.3)'
                            : 'var(--border-glass)'
                        }`,
                        borderRadius: 'var(--radius-sm)',
                        color: isActive ? 'white' : 'hsl(var(--text-secondary))',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-sans)',
                        fontSize: '0.8rem',
                        fontWeight: isActive ? 500 : 400,
                        textAlign: 'left',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {isActive && <CheckCircle2 size={12} style={{ color: 'hsl(var(--primary))' }} />}
                      <span>{nt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default NotificationPreferences;