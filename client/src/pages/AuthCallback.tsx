import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const { exchangeCode } = useAuth();
  const [message, setMessage] = useState('Completing sign-in...');

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '');
    const params = new URLSearchParams(hash);
    const code = params.get('code');
    const provider = params.get('provider');

    const searchParams = new URLSearchParams(window.location.search);
    const error = searchParams.get('error');

    if (error) {
      setMessage(error);
      window.setTimeout(() => navigate('/'), 1500);
      return;
    }

    if (code) {
      exchangeCode(code)
        .then(() => {
          window.location.hash = '';
          setMessage(`Sign-in with ${provider || 'your provider'} complete. Redirecting...`);
          window.setTimeout(() => navigate('/'), 300);
        })
        .catch((err) => {
          setMessage(err?.message || 'Sign-in failed. Please try again.');
          window.setTimeout(() => navigate('/'), 1500);
        });
      return;
    }

    setMessage('Sign-in did not return the required session data.');
    window.setTimeout(() => navigate('/'), 1500);
  }, [exchangeCode, navigate]);

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg-base)', color: 'var(--text-primary)' }}>
      <div style={{ textAlign: 'center' }}>{message}</div>
    </div>
  );
};

export default AuthCallback;
