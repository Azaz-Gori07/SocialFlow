import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Layers, Sparkles } from 'lucide-react';

const oauthBase = 'http://localhost:5000/api/auth/oauth/zenuxs';

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

  // Redirect to dashboard if already logged in
  React.useEffect(() => {
    if (user) {
      navigate('/');
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
          navigate('/');
        }
      } else {
        if (!fullName) {
          setError('Name is required');
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
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message || 'OTP verification failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center', background: 'hsl(var(--bg-base))', overflow: 'hidden', position: 'relative' }}>
      
      {/* Background glow effects */}
      <div style={{ position: 'absolute', width: '600px', height: '600px', background: 'radial-gradient(circle, rgba(139, 92, 246, 0.1) 0%, transparent 70%)', filter: 'blur(50px)', top: '-10%', left: '-10%', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', width: '500px', height: '500px', background: 'radial-gradient(circle, rgba(0, 242, 254, 0.08) 0%, transparent 70%)', filter: 'blur(50px)', bottom: '-10%', right: '-10%', pointerEvents: 'none' }} />

      <div className="glass-card animate-fade-in" style={{ width: '100%', maxWidth: '420px', padding: '40px 32px', zIndex: 10 }}>
        
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '24px' }}>
          <div style={{ background: 'linear-gradient(135deg, hsl(var(--primary)), #00F2FE)', borderRadius: '8px', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Layers size={24} color="white" />
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.5rem', background: 'linear-gradient(135deg, #fff, hsl(var(--text-secondary)))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            SocialFlow AI
          </span>
        </div>

        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, textAlign: 'center', marginBottom: '8px' }}>
          {isLogin ? 'Welcome back' : 'Create your workspace'}
        </h2>
        <p style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))', textAlign: 'center', marginBottom: '24px' }}>
          {isLogin ? 'Log in to manage your connected accounts' : 'Get started with a free personal workspace'}
        </p>

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: '0.8rem', marginBottom: '16px' }}>
            {error}
          </div>
        )}

        {pendingOtp ? (
          <form onSubmit={handleOtpSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label className="form-label">Enter the 6-digit OTP</label>
              <input
                type="text"
                className="form-input"
                placeholder="123456"
                value={otpCode}
                onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '8px', padding: '12px', fontSize: '0.95rem' }} disabled={loading}>
              {loading ? 'Verifying OTP...' : 'Verify OTP'}
            </button>
            <button type="button" className="btn" style={{ width: '100%' }} onClick={() => {
              setOtpCode('');
              setPendingOtp(null);
            }}>
              Resend / Change email
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {!isLogin && (
            <div>
              <label className="form-label">Full Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="Alex Morgan"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                required
              />
            </div>
          )}

          <div>
            <label className="form-label">Email Address</label>
            <input
              type="email"
              className="form-input"
              placeholder="alex@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '8px', padding: '12px', fontSize: '0.95rem' }}
            disabled={loading}
          >
            {loading ? 'Authenticating...' : isLogin ? 'Sign In' : 'Create Account'}
          </button>
        </form>
        )}

        <div style={{ display: 'grid', gap: '8px', marginTop: '18px' }}>
          <button type="button" className="btn" onClick={() => window.location.assign(`${oauthBase}/google`)} style={{ width: '100%' }}>Continue with Zenuxs Google</button>
          <button type="button" className="btn" onClick={() => window.location.assign(`${oauthBase}/github`)} style={{ width: '100%' }}>Continue with Zenuxs GitHub</button>
        </div>

        <div style={{ marginTop: '24px', borderTop: '1px solid hsl(var(--border))', paddingTop: '16px', display: 'flex', justifyContent: 'center', fontSize: '0.8rem', gap: '6px' }}>
          <span style={{ color: 'hsl(var(--text-secondary))' }}>
            {isLogin ? "Don't have an account?" : 'Already have an account?'}
          </span>
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
            }}
            style={{ background: 'none', border: 'none', color: 'hsl(var(--primary))', cursor: 'pointer', fontWeight: 600 }}
          >
            {isLogin ? 'Sign Up' : 'Log In'}
          </button>
        </div>

        {/* Features highlight */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.7rem', color: 'hsl(var(--text-muted))', marginTop: '24px' }}>
          <Sparkles size={12} style={{ color: 'hsl(var(--primary))' }} />
          <span>Includes AI Content Studio & Repurposer</span>
        </div>

      </div>
    </div>
  );
};
