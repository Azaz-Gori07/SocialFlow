import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { 
  Layers, 
  ArrowRight, 
  Lock, 
  Mail, 
  User, 
  Eye, 
  EyeOff,
  KeyRound
} from 'lucide-react';

const oauthBase = `${(import.meta.env.VITE_BACKEND_API_URL as string).replace(/\/$/, '')}/auth/oauth/zenuxs`;

export const Auth: React.FC = () => {
  const { login, register, verifyOtp, pendingOtp, user } = useAuth();
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  React.useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        const res = await login(email, password);
        if (res?.accessToken) {
          navigate('/dashboard');
        }
      } else {
        if (!fullName.trim()) {
          setError('Full name is required');
          setLoading(false);
          return;
        }
        await register(email, password, fullName);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!pendingOtp) {
        throw new Error('OTP session is not available.');
      }
      const res = await verifyOtp(pendingOtp.userId, otpCode, pendingOtp.purpose);
      if (res?.accessToken) {
        navigate('/dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'OTP verification failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      maxHeight: '100vh',
      width: '100vw',
      background: '#e4e5ee',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      position: 'relative',
      overflow: 'hidden'
    }}>
      
      {/* Left Stage - 100% Exact High-Resolution Showcase */}
      <div className="auth-left-showcase" style={{
        flex: '1 1 63.5%',
        position: 'relative',
        height: '100vh',
        maxHeight: '100vh',
        background: '#e8e8f0',
        overflow: 'hidden',
        display: 'flex'
      }}>
        <img 
          src="/login-showcase-bg.png" 
          alt="SocialFlow - Turn your work into real audience growth" 
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'left center',
            display: 'block'
          }}
        />
      </div>

      {/* Right Stage - White Card Container with Subtle Lavender Ambient Curve */}
      <div className="auth-right-container" style={{
        flex: '1 1 36.5%',
        minWidth: '460px',
        height: '100vh',
        maxHeight: '100vh',
        background: 'linear-gradient(135deg, #eef2ff 0%, #e0e7fe 50%, #ede9fe 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden'
      }}>
        
        {/* Soft Ambient Glow at bottom right */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          right: 0,
          width: '320px',
          height: '320px',
          background: 'radial-gradient(circle, rgba(167, 139, 250, 0.35) 0%, rgba(224, 231, 255, 0) 70%)',
          pointerEvents: 'none'
        }} />

        {/* Floating White Authentication Card */}
        <div className="auth-white-card" style={{
          width: '100%',
          height: '100vh',
          maxHeight: '100vh',
          background: '#ffffff',
          borderTopLeftRadius: '36px',
          borderBottomLeftRadius: '36px',
          boxShadow: '-16px 0 40px rgba(15, 23, 42, 0.06)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '24px 44px',
          position: 'relative',
          zIndex: 10,
          overflowY: 'auto'
        }}>
          
          <div style={{
            width: '100%',
            maxWidth: '380px',
            display: 'flex',
            flexDirection: 'column'
          }}>
            
            {/* Brand Logo Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '11px', marginBottom: '16px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #4338ca 0%, #6366f1 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px -2px rgba(67, 56, 202, 0.4)'
              }}>
                <Layers size={19} color="#ffffff" />
              </div>
              <span style={{
                fontFamily: "'Outfit', var(--font-display), sans-serif",
                fontWeight: 700,
                fontSize: '1.45rem',
                letterSpacing: '-0.025em',
                color: '#0f172a',
                lineHeight: 1
              }}>
                SocialFlow
              </span>
            </div>

            {/* Heading & Subtitle */}
            <h2 style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              letterSpacing: '-0.025em',
              color: '#0f172a',
              marginBottom: '4px',
              lineHeight: 1.2
            }}>
              {pendingOtp ? 'Two-Factor Verification' : isLogin ? 'Welcome back' : 'Create your workspace'}
            </h2>
            <p style={{
              fontSize: '0.85rem',
              color: '#64748b',
              lineHeight: 1.45,
              marginBottom: '18px'
            }}>
              {pendingOtp 
                ? 'Enter the 8-digit OTP code sent to your email.'
                : isLogin 
                  ? 'Sign in to manage your content, accounts and automation.' 
                  : 'Start turning shipped commits into compounding audience reach.'}
            </p>

            {/* Error Message */}
            {error && (
              <div style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#b91c1c',
                padding: '9px 12px',
                borderRadius: '8px',
                fontSize: '0.8rem',
                marginBottom: '14px',
                lineHeight: 1.4
              }}>
                {error}
              </div>
            )}

            {/* Tabs: Sign In | Create Account */}
            {!pendingOtp && (
              <div style={{
                display: 'flex',
                width: '100%',
                borderBottom: '1px solid #e2e8f0',
                marginBottom: '16px',
                position: 'relative'
              }}>
                <button
                  type="button"
                  onClick={() => { setIsLogin(true); setError(''); }}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    background: 'transparent',
                    border: 'none',
                    fontSize: '0.875rem',
                    fontWeight: isLogin ? 600 : 500,
                    color: isLogin ? '#0f172a' : '#64748b',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'color 0.15s ease'
                  }}
                >
                  Sign In
                  {isLogin && (
                    <span style={{
                      position: 'absolute',
                      bottom: '-1px',
                      left: 0,
                      right: 0,
                      height: '2px',
                      background: '#4f47ee',
                      borderRadius: '2px'
                    }} />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => { setIsLogin(false); setError(''); }}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    background: 'transparent',
                    border: 'none',
                    fontSize: '0.875rem',
                    fontWeight: !isLogin ? 600 : 500,
                    color: !isLogin ? '#0f172a' : '#64748b',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'color 0.15s ease'
                  }}
                >
                  Create Account
                  {!isLogin && (
                    <span style={{
                      position: 'absolute',
                      bottom: '-1px',
                      left: 0,
                      right: 0,
                      height: '2px',
                      background: '#4f47ee',
                      borderRadius: '2px'
                    }} />
                  )}
                </button>
              </div>
            )}

            {/* OAuth Buttons */}
            {!pendingOtp && (
              <>
                {/* Continue with Zenuxs (Google OAuth) */}
                <button
                  type="button"
                  onClick={() => window.location.assign(`${oauthBase}/google`)}
                  style={{
                    width: '100%',
                    height: '44px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    color: '#0f172a',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    marginBottom: '8px',
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = '#cbd5e1';
                    e.currentTarget.style.background = '#f8fafc';
                    e.currentTarget.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.06)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = '#e2e8f0';
                    e.currentTarget.style.background = '#ffffff';
                    e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.04)';
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                  </svg>
                  <span>Continue with Zenuxs</span>
                </button>

                {/* Continue with GitHub */}
                <button
                  type="button"
                  onClick={() => window.location.assign(`${oauthBase}/github`)}
                  style={{
                    width: '100%',
                    height: '44px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    color: '#0f172a',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    marginBottom: '14px',
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = '#cbd5e1';
                    e.currentTarget.style.background = '#f8fafc';
                    e.currentTarget.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.06)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = '#e2e8f0';
                    e.currentTarget.style.background = '#ffffff';
                    e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.04)';
                  }}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="#0f172a">
                    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
                  </svg>
                  <span>Continue with GitHub</span>
                </button>

                {/* Thin Clean Divider */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '14px'
                }}>
                  <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
                  <span style={{
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    letterSpacing: '0.07em',
                    color: '#94a3b8',
                    textTransform: 'uppercase'
                  }}>
                    OR CONTINUE WITH EMAIL
                  </span>
                  <div style={{ flex: 1, height: '1px', background: '#e2e8f0' }} />
                </div>
              </>
            )}

            {/* OTP Mode Form */}
            {pendingOtp ? (
              <form onSubmit={handleOtpSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 500, color: '#334155', marginBottom: '5px' }}>
                    <KeyRound size={14} style={{ color: '#4f47ee' }} />
                    <span>8-Digit OTP Code</span>
                  </label>
                  <input
                    type="text"
                    style={{
                      width: '100%',
                      height: '46px',
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '10px',
                      textAlign: 'center',
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '1.2rem',
                      letterSpacing: '0.3em',
                      color: '#0f172a',
                      outline: 'none',
                      boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.02)'
                    }}
                    placeholder="••••••••"
                    maxLength={8}
                    value={otpCode}
                    onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    required
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || otpCode.length < 6}
                  style={{
                    width: '100%',
                    height: '44px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    background: '#4f47ee',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 14px rgba(79, 71, 238, 0.35)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span>{loading ? 'Verifying OTP...' : 'Authenticate Session'}</span>
                  {!loading && <ArrowRight size={15} />}
                </button>

                <button
                  type="button"
                  onClick={() => setOtpCode('')}
                  style={{
                    width: '100%',
                    padding: '6px',
                    background: 'transparent',
                    border: 'none',
                    color: '#64748b',
                    fontSize: '0.8rem',
                    cursor: 'pointer'
                  }}
                >
                  Resend code / Change email address
                </button>
              </form>
            ) : (
              /* Email & Password Form */
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                
                {/* Full Name (when Registering) */}
                {!isLogin && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, color: '#334155', marginBottom: '4px' }}>
                      Full Name
                    </label>
                    <div style={{ position: 'relative' }}>
                      <User size={15} style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                      <input
                        type="text"
                        placeholder="Alex Morgan"
                        value={fullName}
                        onChange={e => setFullName(e.target.value)}
                        required
                        style={{
                          width: '100%',
                          height: '44px',
                          paddingLeft: '38px',
                          paddingRight: '14px',
                          background: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '10px',
                          fontSize: '0.875rem',
                          color: '#0f172a',
                          outline: 'none',
                          boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.02)',
                          transition: 'border-color 0.15s ease, box-shadow 0.15s ease'
                        }}
                        onFocus={e => {
                          e.target.style.borderColor = '#4f47ee';
                          e.target.style.boxShadow = '0 0 0 3px rgba(79, 71, 238, 0.12)';
                        }}
                        onBlur={e => {
                          e.target.style.borderColor = '#e2e8f0';
                          e.target.style.boxShadow = 'inset 0 1px 2px rgba(0, 0, 0, 0.02)';
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Work Email */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 500, color: '#334155', marginBottom: '4px' }}>
                    Work Email
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={15} style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        height: '44px',
                        paddingLeft: '38px',
                        paddingRight: '14px',
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px',
                        fontSize: '0.875rem',
                        color: '#0f172a',
                        outline: 'none',
                        boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.02)',
                        transition: 'border-color 0.15s ease, box-shadow 0.15s ease'
                      }}
                      onFocus={e => {
                        e.target.style.borderColor = '#4f47ee';
                        e.target.style.boxShadow = '0 0 0 3px rgba(79, 71, 238, 0.12)';
                      }}
                      onBlur={e => {
                        e.target.style.borderColor = '#e2e8f0';
                        e.target.style.boxShadow = 'inset 0 1px 2px rgba(0, 0, 0, 0.02)';
                      }}
                    />
                  </div>
                </div>

                {/* Password with Forgot password link */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 500, color: '#334155' }}>
                      Password
                    </label>
                    {isLogin && (
                      <span 
                        onClick={() => alert('Password reset link dispatched if email exists.')}
                        style={{ fontSize: '0.8rem', fontWeight: 500, color: '#4f47ee', cursor: 'pointer' }}
                      >
                        Forgot password?
                      </span>
                    )}
                  </div>
                  <div style={{ position: 'relative' }}>
                    <Lock size={15} style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        height: '44px',
                        paddingLeft: '38px',
                        paddingRight: '38px',
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '10px',
                        fontSize: '0.875rem',
                        color: '#0f172a',
                        outline: 'none',
                        boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.02)',
                        transition: 'border-color 0.15s ease, box-shadow 0.15s ease'
                      }}
                      onFocus={e => {
                        e.target.style.borderColor = '#4f47ee';
                        e.target.style.boxShadow = '0 0 0 3px rgba(79, 71, 238, 0.12)';
                      }}
                      onBlur={e => {
                        e.target.style.borderColor = '#e2e8f0';
                        e.target.style.boxShadow = 'inset 0 1px 2px rgba(0, 0, 0, 0.02)';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: 'absolute',
                        right: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Primary CTA Button */}
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: '100%',
                    height: '44px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    background: '#4f47ee',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    marginTop: '4px',
                    boxShadow: '0 4px 14px rgba(79, 71, 238, 0.35)',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={e => {
                    if (!loading) {
                      e.currentTarget.style.background = '#4338ca';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = '0 6px 18px rgba(79, 71, 238, 0.45)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!loading) {
                      e.currentTarget.style.background = '#4f47ee';
                      e.currentTarget.style.transform = 'none';
                      e.currentTarget.style.boxShadow = '0 4px 14px rgba(79, 71, 238, 0.35)';
                    }
                  }}
                >
                  <span>{loading ? 'Authenticating...' : isLogin ? 'Sign In' : 'Create Account'}</span>
                  {!loading && <ArrowRight size={16} />}
                </button>
              </form>
            )}

            {/* Footer Trust & Legal */}
            <div style={{
              marginTop: '18px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '3px',
              fontSize: '0.72rem',
              color: '#64748b'
            }}>
              <div>
                Protected by enterprise-grade security.
              </div>
              <div style={{ color: '#64748b' }}>
                By continuing, you agree to our{' '}
                <span style={{ color: '#475569', textDecoration: 'underline', cursor: 'pointer' }}>
                  Terms of Service
                </span>{' '}
                and{' '}
                <span style={{ color: '#475569', textDecoration: 'underline', cursor: 'pointer' }}>
                  Privacy Policy
                </span>.
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Responsive Rules */}
      <style>{`
        html, body {
          height: 100vh !important;
          max-height: 100vh !important;
          overflow: hidden !important;
        }
        .auth-white-card {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .auth-white-card::-webkit-scrollbar {
          display: none;
        }
        @media (max-width: 1024px) {
          .auth-left-showcase {
            display: none !important;
          }
          .auth-right-container {
            flex: 1 1 100% !important;
            min-width: 100% !important;
            padding: 16px !important;
            background: #ffffff !important;
            overflow-y: auto !important;
          }
          .auth-white-card {
            border-radius: 0 !important;
            box-shadow: none !important;
            padding: 24px 16px !important;
            height: auto !important;
            min-height: 100% !important;
          }
        }
      `}</style>
    </div>
  );
};

export default Auth;
