import React, { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { api } from '../../services/api';

interface AutomationSettings {
  detectOpportunities: boolean;
  generateDrafts: boolean;
  autoPublish: boolean;
  autoContent: boolean;
  aiInstructions: string | null;
  aiLength: string | null;
  aiTechnicalDepth: string | null;
  schedPeriod: string;
  schedMinPosts: number;
  schedMaxPosts: number;
  defaultTone: string;
  timezone: string;
}

const AI_LENGTHS = [
  { value: '', label: 'Model default' },
  { value: 'short', label: 'Short' },
  { value: 'medium', label: 'Medium' },
  { value: 'long', label: 'Long' }
];

const AI_DEPTHS = [
  { value: '', label: 'Model default' },
  { value: 'high_level', label: 'High level' },
  { value: 'technical', label: 'Technical' },
  { value: 'deep_dive', label: 'Deep dive' }
];

const SCHED_PERIODS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' }
];

const TONES = [
  { value: 'technical', label: 'Technical' },
  { value: 'casual', label: 'Casual' },
  { value: 'storytelling', label: 'Storytelling' },
  { value: 'founder', label: 'Founder' },
  { value: 'learning', label: 'Learning' },
  { value: 'short_form', label: 'Short form' }
];

const TOGGLES: Array<{ key: keyof AutomationSettings; label: string; help: string }> = [
  { key: 'detectOpportunities', label: 'Detect opportunities', help: 'Turn detected development work into postable opportunities.' },
  { key: 'generateDrafts', label: 'Generate drafts', help: 'Create LinkedIn drafts for pending opportunities during a sync run.' },
  { key: 'autoContent', label: 'Run content generation automatically', help: 'Run the automatic generation pass after each repository sync.' },
  { key: 'autoPublish', label: 'Automatic publishing', help: 'Reserved setting. It does not publish anything: drafts always wait in the Draft Library for your review.' }
];

export const DeveloperSettings: React.FC = () => {
  const [form, setForm] = useState<AutomationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.developer
      .getAutomationSettings()
      .then(settings => {
        if (!cancelled) setForm(settings);
      })
      .catch(err => {
        console.error(err);
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load settings.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    if (!form) return;
    // The server rejects an inverted range before it reaches Mongo, so the
    // same rule is enforced here to keep the message next to the fields.
    if (form.schedMinPosts > form.schedMaxPosts) {
      setError('Minimum posts cannot be greater than maximum posts.');
      setNotice('');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const updated = await api.developer.updateAutomationSettings({
        detectOpportunities: form.detectOpportunities,
        generateDrafts: form.generateDrafts,
        autoPublish: form.autoPublish,
        autoContent: form.autoContent,
        aiInstructions: form.aiInstructions ? form.aiInstructions : null,
        aiLength: form.aiLength || null,
        aiTechnicalDepth: form.aiTechnicalDepth || null,
        schedPeriod: form.schedPeriod,
        schedMinPosts: Number(form.schedMinPosts),
        schedMaxPosts: Number(form.schedMaxPosts),
        defaultTone: form.defaultTone,
        timezone: form.timezone
      });
      setForm(updated);
      setNotice('Settings saved.');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ padding: '60px', textAlign: 'center', color: 'hsl(var(--text-muted))' }}>Loading settings...</div>;
  }

  if (!form) {
    return (
      <div>
        <div className="header-bar">
          <div>
            <h1 className="page-title">Settings</h1>
          </div>
        </div>
        <div role="alert" className="glass-card" style={{ padding: '24px', color: '#ef4444', fontSize: '0.9rem' }}>
          {error || 'Settings are unavailable right now.'}
        </div>
      </div>
    );
  }

  const instructionCount = form.aiInstructions?.length ?? 0;

  return (
    <div>
      <div className="header-bar">
        <div>
          <h1 className="page-title">Settings</h1>
          <p style={{ color: 'hsl(var(--text-secondary))', marginTop: '4px', fontSize: '0.95rem' }}>
            Automation and AI writing preferences for developer-generated drafts.
          </p>
        </div>
        <button onClick={handleSave} disabled={saving} className="btn btn-primary" style={{ gap: '8px', fontSize: '0.85rem' }}>
          <Save size={16} />
          <span>{saving ? 'Saving...' : 'Save settings'}</span>
        </button>
      </div>

      {error && (
        <div role="alert" style={{ padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', marginBottom: '16px', fontSize: '0.9rem' }}>
          {error}
        </div>
      )}
      {notice && (
        <div role="status" style={{ padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#10b981', marginBottom: '16px', fontSize: '0.9rem' }}>
          {notice}
        </div>
      )}

      <div className="glass-card" style={{ padding: '24px', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '20px' }}>Automation</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {TOGGLES.map(toggle => (
            <div key={toggle.key} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <input
                id={`dev-setting-${toggle.key}`}
                type="checkbox"
                checked={form[toggle.key] as boolean}
                onChange={e => setForm(f => (f ? { ...f, [toggle.key]: e.target.checked } : f))}
                style={{ width: '18px', height: '18px', marginTop: '2px', accentColor: 'hsl(var(--primary))', flexShrink: 0 }}
              />
              <div>
                <label htmlFor={`dev-setting-${toggle.key}`} style={{ fontSize: '0.9rem', fontWeight: 500, cursor: 'pointer' }}>
                  {toggle.label}
                </label>
                <p style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))', marginTop: '2px' }}>{toggle.help}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-card" style={{ padding: '24px', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '20px' }}>AI writing</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div>
            <label htmlFor="dev-setting-instructions" className="form-label">Custom instructions</label>
            <textarea
              id="dev-setting-instructions"
              className="form-input"
              style={{ minHeight: '120px', fontSize: '0.9rem' }}
              value={form.aiInstructions ?? ''}
              onChange={e => setForm(f => (f ? { ...f, aiInstructions: e.target.value } : f))}
              maxLength={4000}
              placeholder="Guidance appended to every developer draft prompt"
            />
            <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', marginTop: '6px' }}>
              {instructionCount} of 4000 characters used. Leave empty to use the model default.
            </div>
          </div>

          <div className="responsive-grid-1-1">
            <div>
              <label htmlFor="dev-setting-length" className="form-label">Post length</label>
              <select
                id="dev-setting-length"
                className="form-input"
                value={form.aiLength ?? ''}
                onChange={e => setForm(f => (f ? { ...f, aiLength: e.target.value } : f))}
              >
                {AI_LENGTHS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="dev-setting-depth" className="form-label">Technical depth</label>
              <select
                id="dev-setting-depth"
                className="form-input"
                value={form.aiTechnicalDepth ?? ''}
                onChange={e => setForm(f => (f ? { ...f, aiTechnicalDepth: e.target.value } : f))}
              >
                {AI_DEPTHS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="dev-setting-tone" className="form-label">Default tone</label>
            <select
              id="dev-setting-tone"
              className="form-input"
              value={form.defaultTone}
              onChange={e => setForm(f => (f ? { ...f, defaultTone: e.target.value } : f))}
            >
              {TONES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="glass-card" style={{ padding: '24px' }}>
        <h2 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '8px' }}>Posting limits</h2>
        <p style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))', marginBottom: '20px' }}>
          Caps how many developer drafts are generated per period. The minimum is a target, never a forced post.
        </p>
        <div className="responsive-grid-3-col" style={{ gap: '16px' }}>
          <div>
            <label htmlFor="dev-setting-period" className="form-label">Period</label>
            <select
              id="dev-setting-period"
              className="form-input"
              value={form.schedPeriod}
              onChange={e => setForm(f => (f ? { ...f, schedPeriod: e.target.value } : f))}
            >
              {SCHED_PERIODS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="dev-setting-min" className="form-label">Minimum posts</label>
            <input
              id="dev-setting-min"
              type="number"
              className="form-input"
              min={0}
              step={1}
              value={form.schedMinPosts}
              onChange={e => setForm(f => (f ? { ...f, schedMinPosts: Number(e.target.value) } : f))}
            />
          </div>
          <div>
            <label htmlFor="dev-setting-max" className="form-label">Maximum posts</label>
            <input
              id="dev-setting-max"
              type="number"
              className="form-input"
              min={1}
              step={1}
              value={form.schedMaxPosts}
              onChange={e => setForm(f => (f ? { ...f, schedMaxPosts: Number(e.target.value) } : f))}
            />
          </div>
        </div>
        {form.schedMinPosts > form.schedMaxPosts && (
          <p role="alert" style={{ fontSize: '0.8rem', color: '#ef4444', marginTop: '12px' }}>
            Minimum posts cannot be greater than maximum posts.
          </p>
        )}

        <div style={{ marginTop: '20px', maxWidth: '320px' }}>
          <label htmlFor="dev-setting-timezone" className="form-label">Timezone</label>
          <input
            id="dev-setting-timezone"
            type="text"
            className="form-input"
            value={form.timezone}
            onChange={e => setForm(f => (f ? { ...f, timezone: e.target.value } : f))}
            maxLength={64}
          />
        </div>
      </div>
    </div>
  );
};

export default DeveloperSettings;
