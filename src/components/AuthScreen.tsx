'use client';

import { useState, useCallback, useRef } from 'react';
import { useApp } from '@/lib/store';

export default function AuthScreen() {
  const { dispatch } = useApp();
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
      <form
        onSubmit={handleSubmit}
        className={`w-full max-w-[380px] bg-ink border border-stone rounded-lg p-8 ${
          shaking ? 'shake' : ''
        }`}
        style={{ borderWidth: '0.5px' }}
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
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter username"
            className="w-full bg-void text-cloud text-sm px-3 py-2.5 rounded-none outline-none placeholder:text-ghost transition-colors duration-150"
            style={{ border: '0.5px solid var(--color-stone)' }}
            onFocus={(e) => (e.target.style.borderColor = 'var(--color-signal)')}
            onBlur={(e) => (e.target.style.borderColor = 'var(--color-stone)')}
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
            style={{ border: '0.5px solid var(--color-stone)' }}
            ref={passwordRef}
            onFocus={(e) => (e.target.style.borderColor = 'var(--color-signal)')}
            onBlur={(e) => (e.target.style.borderColor = 'var(--color-stone)')}
          />
        </div>

        {/* Submit button */}
        <button
          id="auth-submit"
          type="submit"
          disabled={loading || !username || !password}
          className="w-full font-mono text-xs uppercase tracking-[0.15em] py-3 transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            border: '0.5px solid var(--color-signal)',
            background: 'transparent',
            color: 'var(--color-signal)',
          }}
          onMouseEnter={(e) => {
            if (!loading) {
              (e.target as HTMLButtonElement).style.background = 'var(--color-signal)';
              (e.target as HTMLButtonElement).style.color = 'var(--color-void)';
            }
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLButtonElement).style.background = 'transparent';
            (e.target as HTMLButtonElement).style.color = 'var(--color-signal)';
          }}
        >
          {loading ? (
            <span>
              AUTHENTICATING<span className="cursor-blink">_</span>
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
