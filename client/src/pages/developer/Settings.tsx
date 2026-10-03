import React, { useEffect, useState } from 'react';
import { Save, Check, CheckCircle2, Sliders, Sparkles, Clock, Globe } from 'lucide-react';
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
  { key: 'autoPublish', label: 'Automatic publishing', help: 'Reserved setting. Drafts always wait in the Draft Library for your review.' }
];

export const DeveloperSettings: React.FC = () => {
  const [form, setForm] = useState<AutomationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

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
    if (form.schedMinPosts > form.schedMaxPosts) {
      setError('Minimum posts cannot be greater than maximum posts.');
      return;
    }
    setSaving(true);
    setError('');
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
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px', color: '#9ca3af', fontSize: '0.875rem' }}>
        Loading settings...
      </div>
    );
  }

  if (!form) {
    return (
      <div className="card" style={{ padding: '32px', color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca' }}>
        {error || 'Settings are unavailable right now.'}
      </div>
    );
  }

  const instructionCount = form.aiInstructions?.length ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Action Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          Configure automated sync rules, AI writing parameters, and drafting velocity.
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
          <span>{saving ? 'Saving...' : saved ? 'Settings Saved!' : 'Save Settings'}</span>
        </button>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', borderRadius: '10px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}
      {saved && (
        <div style={{ padding: '12px 16px', borderRadius: '10px', background: '#ecfdf5', border: '1px solid #d1fae5', color: '#059669', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle2 size={16} />
          <span>Developer automation preferences updated successfully.</span>
        </div>
      )}

      {/* Card 1: Automation Toggles */}
      <div className="card" style={{ padding: '24px 26px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Sliders size={18} style={{ color: '#111827' }} />
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', margin: 0 }}>
            Automation Pipeline
          </h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {TOGGLES.map(toggle => {
            const isChecked = form[toggle.key] as boolean;
            return (
              <div
                key={toggle.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: '#f9fafb',
                  borderRadius: '10px',
                  border: '1px solid #f3f4f6',
                  gap: '16px'
                }}
              >
                <div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
                    {toggle.label}
                  </div>
                  <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: '2px 0 0 0' }}>
                    {toggle.help}
                  </p>
                </div>

                {/* iOS Style Toggle */}
                <div
                  onClick={() => setForm(f => (f ? { ...f, [toggle.key]: !isChecked } : f))}
                  style={{
                    width: '44px',
                    height: '24px',
                    borderRadius: '9999px',
                    background: isChecked ? '#18181b' : '#e5e7eb',
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
                    transform: isChecked ? 'translateX(20px)' : 'translateX(0)',
                    transition: 'transform 0.2s ease',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)'
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Card 2: AI Writing Preferences */}
      <div className="card" style={{ padding: '24px 26px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Sparkles size={18} style={{ color: '#111827' }} />
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', margin: 0 }}>
            AI Writing Persona
          </h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label htmlFor="dev-setting-instructions" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
              Custom System Instructions
            </label>
            <textarea
              id="dev-setting-instructions"
              className="form-input"
              style={{ minHeight: '110px', fontSize: '0.875rem', resize: 'vertical' }}
              value={form.aiInstructions ?? ''}
              onChange={e => setForm(f => (f ? { ...f, aiInstructions: e.target.value } : f))}
              maxLength={4000}
              placeholder="e.g. Write in a clear, engineering-led voice. Highlight performance benchmarks and open-source contributions."
            />
            <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '4px' }}>
              {instructionCount} of 4000 characters used. Leave blank to use standard model default.
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '16px'
          }} className="responsive-grid-3-col">
            <div>
              <label htmlFor="dev-setting-length" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                Post Length
              </label>
              <select
                id="dev-setting-length"
                className="form-input"
                value={form.aiLength ?? ''}
                onChange={e => setForm(f => (f ? { ...f, aiLength: e.target.value } : f))}
                style={{ height: '40px' }}
              >
                {AI_LENGTHS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div>
              <label htmlFor="dev-setting-depth" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                Technical Depth
              </label>
              <select
                id="dev-setting-depth"
                className="form-input"
                value={form.aiTechnicalDepth ?? ''}
                onChange={e => setForm(f => (f ? { ...f, aiTechnicalDepth: e.target.value } : f))}
                style={{ height: '40px' }}
              >
                {AI_DEPTHS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div>
              <label htmlFor="dev-setting-tone" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                Default Tone
              </label>
              <select
                id="dev-setting-tone"
                className="form-input"
                value={form.defaultTone}
                onChange={e => setForm(f => (f ? { ...f, defaultTone: e.target.value } : f))}
                style={{ height: '40px' }}
              >
                {TONES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Card 3: Posting Limits & Timezone */}
      <div className="card" style={{ padding: '24px 26px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Clock size={18} style={{ color: '#111827' }} />
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', margin: 0 }}>
              Draft Generation Cadence
            </h3>
            <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: 0 }}>
              Caps how many drafts are queued per interval. Minimum is a generation target, never an auto-publish.
            </p>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '16px'
        }} className="responsive-grid-3-col">
          <div>
            <label htmlFor="dev-setting-period" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
              Period Window
            </label>
            <select
              id="dev-setting-period"
              className="form-input"
              value={form.schedPeriod}
              onChange={e => setForm(f => (f ? { ...f, schedPeriod: e.target.value } : f))}
              style={{ height: '40px' }}
            >
              {SCHED_PERIODS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="dev-setting-min" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
              Target Minimum Drafts
            </label>
            <input
              id="dev-setting-min"
              type="number"
              className="form-input"
              min={0}
              step={1}
              value={form.schedMinPosts}
              onChange={e => setForm(f => (f ? { ...f, schedMinPosts: Number(e.target.value) } : f))}
              style={{ height: '40px' }}
            />
          </div>

          <div>
            <label htmlFor="dev-setting-max" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
              Maximum Posts Cap
            </label>
            <input
              id="dev-setting-max"
              type="number"
              className="form-input"
              min={1}
              step={1}
              value={form.schedMaxPosts}
              onChange={e => setForm(f => (f ? { ...f, schedMaxPosts: Number(e.target.value) } : f))}
              style={{ height: '40px' }}
            />
          </div>
        </div>

        <div style={{ maxWidth: '320px', marginTop: '4px' }}>
          <label htmlFor="dev-setting-timezone" style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
            Primary Timezone
          </label>
          <div style={{ position: 'relative' }}>
            <Globe size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input
              id="dev-setting-timezone"
              type="text"
              className="form-input"
              style={{ paddingLeft: '34px', height: '40px' }}
              value={form.timezone}
              onChange={e => setForm(f => (f ? { ...f, timezone: e.target.value } : f))}
              maxLength={64}
            />
          </div>
        </div>
      </div>

    </div>
  );
};

export default DeveloperSettings;
