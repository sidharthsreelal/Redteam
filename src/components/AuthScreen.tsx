'use client';

import { useState, useCallback, useRef } from 'react';
import { useApp } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import GravityField from './GravityField';

export default function AuthScreen() {
  const { dispatch } = useApp();
  const { theme } = useTheme();
  const passwordRef = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Artificial 600ms delay per spec
    await new Promise((r) => setTimeout(r, 600));

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (data.success) {
        setFadeOut(true);
        setTimeout(() => {
          dispatch({ type: 'LOGIN', username });
        }, 400);
      } else {
        setShaking(true);
        setError(data.error || 'ACCESS DENIED — invalid credentials');
        setTimeout(() => setShaking(false), 240);
      }
    } catch {
      setError('CONNECTION ERROR — try again');
    } finally {
      setLoading(false);
    }
  }, [username, password, dispatch]);

  return (
    <div
      className={`fixed inset-0 bg-void flex items-center justify-center transition-opacity duration-400 ${
        fadeOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Gravity repulsion field background */}
      <GravityField />

      <form
        onSubmit={handleSubmit}
        className={`w-full max-w-[380px] border rounded-lg p-8 relative ${
          shaking ? 'shake' : ''
        }`}
        style={{
          backgroundColor: theme === 'dark' ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.15)',
          borderColor: 'rgba(239, 68, 68, 0.7)', 
          borderWidth: theme === 'dark' ? '1px' : '2px',
          zIndex: 1,
          backdropFilter: 'blur(16px)',
          boxShadow: '0 0 25px rgba(239, 68, 68, 0.15)',
        }}
      >
        {/* System label */}
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ghost mb-6 text-center">
          SYSTEM ACCESS
        </p>

        {/* Product name */}
        <h1 className="font-mono text-2xl text-white text-center tracking-tight mb-2">
          RedTeam
        </h1>

        {/* Description */}
        <p className="text-sm text-fog text-center mb-6">
          Refine Your Ideas
        </p>

        {/* Divider */}
        <div className="h-px bg-stone mb-6" />

        {/* Username field */}
        <div className="mb-4">
          <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-ghost mb-2">
            USERNAME
          </label>
          <input
            id="auth-username"
            type="text"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            placeholder="Enter username"
            className="w-full bg-void text-cloud text-sm px-3 py-2.5 rounded-none outline-none placeholder:text-ghost transition-colors duration-150"
            style={{
              border: '1px solid rgba(239, 68, 68, 0.3)',
              outline: 'none',
            }}
            onFocus={(e) => (e.target.style.borderColor = '#EF4444')}
            onBlur={(e) => (e.target.style.borderColor = 'rgba(239, 68, 68, 0.3)')}
            autoComplete="off"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                passwordRef.current?.focus();
              }
            }}
          />
        </div>

        {/* Password field */}
        <div className="mb-6">
          <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-ghost mb-2">
            PASSWORD
          </label>
          <input
            id="auth-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            className="w-full bg-void text-cloud text-sm px-3 py-2.5 rounded-none outline-none placeholder:text-ghost transition-colors duration-150"
            style={{
              border: '1px solid rgba(239, 68, 68, 0.3)',
              outline: 'none',
            }}
            ref={passwordRef}
            onFocus={(e) => (e.target.style.borderColor = '#EF4444')}
            onBlur={(e) => (e.target.style.borderColor = 'rgba(239, 68, 68, 0.3)')}
          />
        </div>

        {/* Submit button */}
        <button
          id="auth-submit"
          type="submit"
          disabled={loading || !username || !password}
          className="w-full font-mono text-xs uppercase tracking-[0.15em] py-3 transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            border: '1px solid #EF4444',
            background: 'transparent',
            color: '#EF4444',
          }}
          onMouseEnter={(e) => {
            if (!loading) {
              (e.target as HTMLButtonElement).style.background = '#EF4444';
              (e.target as HTMLButtonElement).style.color = 'white';
            }
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLButtonElement).style.background = 'transparent';
            (e.target as HTMLButtonElement).style.color = '#EF4444';
          }}
        >
          {loading ? (
            <span className="flex items-center justify-center">
              AUTHENTICATING
              <span className="flex w-[12px] ml-[2px]">
                <span className="dot-1">.</span>
                <span className="dot-2">.</span>
                <span className="dot-3">.</span>
              </span>
            </span>
          ) : (
            'AUTHENTICATE →'
          )}
        </button>

        {/* Error message */}
        {error && (
          <p className="font-mono text-xs text-accent-red mt-4 text-center">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
