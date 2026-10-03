import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { 
  Bell, 
  Mail, 
  Smartphone, 
  CheckCircle2, 
  Save, 
  Check, 
  ShieldAlert,
  Send,
  MessageSquare,
  Users,
  CreditCard,
  TrendingUp,
  Info
} from 'lucide-react';

const NOTIFICATION_TYPES = [
  { value: 'post_published', label: 'Post Published', desc: 'Alert when a scheduled draft goes live successfully on channels', icon: Send },
  { value: 'post_failed', label: 'Post Failed', desc: 'Urgent notification if token expiration or rate limits block a release', icon: ShieldAlert },
  { value: 'new_comment', label: 'New Discussion / Comment', desc: 'Notify when audience members post comments or replies', icon: MessageSquare },
  { value: 'workspace_invite', label: 'Team Member Invite', desc: 'Alerts for team roster updates and workspace permission changes', icon: Users },
  { value: 'subscription_update', label: 'Plan & Billing Alert', desc: 'Invoices, quota usage notifications, and renewal notices', icon: CreditCard },
  { value: 'analytics_alert', label: 'Performance Spike Insight', desc: 'Milestone spikes in reach, impressions, and engagement', icon: TrendingUp },
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '360px', color: '#9ca3af', fontSize: '0.875rem' }}>
        Loading alert rules...
      </div>
    );
  }

  const channels = [
    { key: 'inApp' as const, label: 'In-App Notifications', icon: Bell, desc: 'Real-time alert popovers and system status telemetry in SocialFlow.' },
    { key: 'email' as const, label: 'Email Notifications', icon: Mail, desc: 'Direct digest and critical failure alerts sent to your inbox.' },
    { key: 'push' as const, label: 'Push Notifications', icon: Smartphone, desc: 'Browser device push notifications for live engagement events.' },
  ];

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
            Alert Rules
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', lineHeight: 1.4 }}>
            Configure delivery channels, threshold triggers, and real-time alert filters.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSave}
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
          <span>{saving ? 'Saving...' : saved ? 'Preferences Saved!' : 'Save Changes'}</span>
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
          <span>Notification rules and channel dispatch preferences successfully synchronized.</span>
        </div>
      )}

      {/* 2. Channel Configuration Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {channels.map(({ key, label, icon: Icon, desc }) => {
          const channel = preferences?.[key];
          if (!channel) return null;

          return (
            <div
              key={key}
              className="card"
              style={{
                padding: '24px 28px',
                display: 'flex',
                flexDirection: 'column',
                gap: '18px'
              }}
            >
              {/* Channel Header Row with Toggle Switch */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    background: channel.enabled ? '#ecfdf5' : '#f4f4f5',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <Icon size={20} style={{ color: channel.enabled ? '#059669' : '#6b7280' }} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#111827', margin: 0 }}>
                        {label}
                      </h3>
                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        background: channel.enabled ? '#ecfdf5' : '#f3f4f6',
                        color: channel.enabled ? '#059669' : '#9ca3af'
                      }}>
                        {channel.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.825rem', color: '#6b7280', margin: '2px 0 0 0' }}>
                      {desc}
                    </p>
                  </div>
                </div>

                {/* iOS / Mac style Toggle Switch */}
                <div 
                  onClick={() => toggleChannel(key)}
                  style={{
                    width: '46px',
                    height: '26px',
                    borderRadius: '9999px',
                    background: channel.enabled ? '#18181b' : '#e5e7eb',
                    padding: '3px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    transition: 'background 0.2s ease',
                    boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.08)'
                  }}
                  title={`Toggle ${label}`}
                >
                  <div style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: '#ffffff',
                    transform: channel.enabled ? 'translateX(20px)' : 'translateX(0)',
                    transition: 'transform 0.2s ease',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)'
                  }} />
                </div>
              </div>

              {/* Event Type Toggles (Visible when channel is enabled) */}
              {channel.enabled && (
                <div style={{
                  paddingTop: '16px',
                  borderTop: '1px solid #f3f4f6',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Trigger Events
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '10px'
                  }}>
                    {NOTIFICATION_TYPES.map(nt => {
                      const isSelected = channel.types.includes(nt.value);
                      const EventIcon = nt.icon;
                      return (
                        <div
                          key={nt.value}
                          onClick={() => toggleType(key, nt.value)}
                          style={{
                            padding: '12px 14px',
                            background: isSelected ? '#ffffff' : '#fafaf9',
                            border: '1px solid',
                            borderColor: isSelected ? '#18181b' : '#e5e7eb',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '10px',
                            boxShadow: isSelected ? '0 1px 3px rgba(0, 0, 0, 0.06)' : 'none',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                            <div style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '6px',
                              background: isSelected ? '#f4f4f5' : '#f9fafb',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}>
                              <EventIcon size={14} style={{ color: isSelected ? '#111827' : '#9ca3af' }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                              <span style={{ fontSize: '0.825rem', fontWeight: isSelected ? 600 : 500, color: '#111827' }}>
                                {nt.label}
                              </span>
                              <span style={{ fontSize: '0.72rem', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {nt.desc}
                              </span>
                            </div>
                          </div>

                          <div style={{
                            width: '18px',
                            height: '18px',
                            borderRadius: '4px',
                            background: isSelected ? '#18181b' : '#ffffff',
                            border: isSelected ? 'none' : '1px solid #d1d5db',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            {isSelected && <Check size={12} color="#ffffff" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Info Callout */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '14px 18px',
        background: '#ffffff',
        border: '1px solid #ebe8e2',
        borderRadius: '10px'
      }}>
        <Info size={16} style={{ color: '#6b7280', flexShrink: 0 }} />
        <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
          Real-time Socket.IO broadcasts are always delivered instantly to active dashboard tabs regardless of email digest rules.
        </span>
      </div>

    </div>
  );
};
