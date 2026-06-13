import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const [message, setMessage] = useState('Completing sign-in...');

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '');
    const params = new URLSearchParams(hash);
    const accessToken = params.get('accessToken');
    const refreshToken = params.get('refreshToken');
    const userId = params.get('userId');
    const provider = params.get('provider');

    const searchParams = new URLSearchParams(window.location.search);
    const error = searchParams.get('error');

    if (error) {
      setMessage(error);
      window.setTimeout(() => navigate('/'), 1500);
      return;
    }

    if (accessToken && refreshToken && userId) {
      localStorage.setItem('access_token', accessToken);
      localStorage.setItem('refresh_token', refreshToken);
      localStorage.setItem('user', JSON.stringify({ id: userId, provider }));
      window.location.hash = '';
      setMessage('Sign-in complete. Redirecting...');
      window.setTimeout(() => navigate('/'), 300);
      return;
    }

    setMessage('Sign-in did not return the required session data.');
    window.setTimeout(() => navigate('/'), 1500);
  }, [navigate]);

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'hsl(var(--bg-base))', color: 'hsl(var(--text-primary))' }}>
      <div style={{ textAlign: 'center' }}>{message}</div>
    </div>
  );
};

export default AuthCallback;
