import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  User, 
  Mail, 
  Lock, 
  ShieldCheck, 
  KeyRound, 
  Save, 
  Building, 
  CheckCircle2
} from 'lucide-react';
import { PlatformBadge } from '../components/SocialIcons';

export const Profile: React.FC = () => {
  const { user, workspace } = useAuth();
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [email] = useState(user?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordNotice, setPasswordNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [profileNotice, setProfileNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const handleUpdateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setTimeout(() => {
      setSavingProfile(false);
      setProfileNotice({ type: 'success', text: 'Profile details updated successfully.' });
      setTimeout(() => setProfileNotice(null), 3000);
    }, 600);
  };

  const handleUpdatePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordNotice({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordNotice({ type: 'error', text: 'Password must be at least 8 characters.' });
      return;
    }

    setSavingPassword(true);
    setTimeout(() => {
      setSavingPassword(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordNotice({ type: 'success', text: 'Security password changed successfully.' });
      setTimeout(() => setPasswordNotice(null), 3000);
    }, 800);
  };

  const userInitial = user?.fullName ? user.fullName[0].toUpperCase() : 'A';

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
          ACCOUNT
        </div>
        <h1 style={{
          fontSize: '2.35rem',
          fontWeight: 700,
          color: '#111827',
          letterSpacing: '-0.025em',
          marginBottom: '4px',
          lineHeight: 1.15
        }}>
          Profile & Account
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#6b7280', lineHeight: 1.4 }}>
          Manage your personal credentials, workspace presence, and account security.
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.2fr 1fr',
        gap: '20px'
      }} className="responsive-grid-1-1">
        
        {/* Left Column: Personal Information & Workspace Role */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Card: Personal Details */}
          <div className="card" style={{ padding: '24px 26px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
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
                <User size={20} style={{ color: '#b45309' }} />
              </div>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', margin: 0 }}>
                  Personal Information
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>
                  Update your public name and view registered email.
                </p>
              </div>
            </div>

            {/* Avatar Row */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              padding: '14px',
              background: '#f9fafb',
              borderRadius: '10px',
              border: '1px solid #f3f4f6'
            }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: '#ef4444',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '1.1rem',
                flexShrink: 0
              }}>
                {userInitial}
              </div>
              <div style={{ flexGrow: 1 }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#111827' }}>
                  {user?.fullName || 'azaz'}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                  {user?.email || 'azazgori76@gmail.com'}
                </div>
              </div>
              <span style={{
                background: '#ecfdf5',
                color: '#059669',
                fontSize: '0.72rem',
                fontWeight: 600,
                padding: '3px 9px',
                borderRadius: '9999px',
                border: '1px solid #d1fae5'
              }}>
                Active Account
              </span>
            </div>

            {profileNotice && (
              <div style={{
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '0.825rem',
                background: profileNotice.type === 'success' ? '#ecfdf5' : '#fef2f2',
                color: profileNotice.type === 'success' ? '#10b981' : '#ef4444'
              }}>
                {profileNotice.text}
              </div>
            )}

            <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                  Full Name
                </label>
                <div style={{ position: 'relative' }}>
                  <User size={15} style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                  <input
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      height: '42px',
                      paddingLeft: '38px',
                      paddingRight: '14px',
                      background: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '0.875rem',
                      color: '#111827',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                  Email Address (Primary Identity)
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={15} style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                  <input
                    type="email"
                    value={email}
                    readOnly
                    disabled
                    style={{
                      width: '100%',
                      height: '42px',
                      paddingLeft: '38px',
                      paddingRight: '14px',
                      background: '#f9fafb',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '0.875rem',
                      color: '#6b7280',
                      outline: 'none',
                      cursor: 'not-allowed'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                <button
                  type="submit"
                  disabled={savingProfile}
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
                    cursor: savingProfile ? 'not-allowed' : 'pointer'
                  }}
                >
                  <Save size={14} />
                  <span>{savingProfile ? 'Saving...' : 'Save Profile'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Card: Current Workspace Context */}
          <div className="card" style={{ padding: '24px 26px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
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
                <Building size={20} style={{ color: '#2563eb' }} />
              </div>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', margin: 0 }}>
                  Workspace Context
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>
                  Your assigned permissions and organizational membership.
                </p>
              </div>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 14px',
              background: '#f9fafb',
              borderRadius: '8px',
              border: '1px solid #f3f4f6'
            }}>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827' }}>
                  {workspace?.name || "azaz's Workspace"}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                  Workspace ID: <code style={{ fontFamily: 'var(--font-mono)' }}>{workspace?.id?.substring(0, 14) || 'ws_default'}...</code>
                </div>
              </div>
              <span style={{
                background: '#fef3c7',
                color: '#92400e',
                fontSize: '0.75rem',
                fontWeight: 600,
                padding: '3px 10px',
                borderRadius: '6px',
                textTransform: 'capitalize'
              }}>
                {workspace?.role || 'Owner'}
              </span>
            </div>
          </div>

        </div>

        {/* Right Column: Security & Authentication */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Card: Change Password */}
          <div className="card" style={{ padding: '24px 26px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: '#ffedd5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <KeyRound size={20} style={{ color: '#c2410c' }} />
              </div>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', margin: 0 }}>
                  Password & Security
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>
                  Manage session credentials and access key.
                </p>
              </div>
            </div>

            {passwordNotice && (
              <div style={{
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '0.825rem',
                background: passwordNotice.type === 'success' ? '#ecfdf5' : '#fef2f2',
                color: passwordNotice.type === 'success' ? '#10b981' : '#ef4444'
              }}>
                {passwordNotice.text}
              </div>
            )}

            <form onSubmit={handleUpdatePassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                  Current Password
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={15} style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                  <input
                    type="password"
                    placeholder="••••••••••••"
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      height: '42px',
                      paddingLeft: '38px',
                      paddingRight: '14px',
                      background: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '0.875rem',
                      color: '#111827',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                  New Password
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={15} style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                  <input
                    type="password"
                    placeholder="Min 8 characters"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      height: '42px',
                      paddingLeft: '38px',
                      paddingRight: '14px',
                      background: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '0.875rem',
                      color: '#111827',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, color: '#374151', marginBottom: '6px' }}>
                  Confirm New Password
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={15} style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                  <input
                    type="password"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      height: '42px',
                      paddingLeft: '38px',
                      paddingRight: '14px',
                      background: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '0.875rem',
                      color: '#111827',
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                <button
                  type="submit"
                  disabled={savingPassword}
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
                    cursor: savingPassword ? 'not-allowed' : 'pointer'
                  }}
                >
                  <Lock size={14} />
                  <span>{savingPassword ? 'Updating...' : 'Update Password'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Card: Linked OAuth Identities */}
          <div className="card" style={{ padding: '24px 26px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
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
                <ShieldCheck size={20} style={{ color: '#111827' }} />
              </div>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', margin: 0 }}>
                  Single Sign-On Identities
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>
                  OAuth providers linked to your session.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Google Identity */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 14px',
                background: '#f9fafb',
                borderRadius: '8px',
                border: '1px solid #f3f4f6'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                  </svg>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827' }}>Google SSO</span>
                </div>
                <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <CheckCircle2 size={13} /> Linked
                </span>
              </div>

              {/* GitHub Identity */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 14px',
                background: '#f9fafb',
                borderRadius: '8px',
                border: '1px solid #f3f4f6'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <PlatformBadge platform="twitter" size={18} iconSize={12} />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#111827' }}>GitHub Developer Sync</span>
                </div>
                <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <CheckCircle2 size={13} /> Linked
                </span>
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
