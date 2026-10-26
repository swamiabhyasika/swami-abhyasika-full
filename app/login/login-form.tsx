'use client';

import { FormEvent, useState } from 'react';
import './login.css';

export function LoginForm({ mode }: { mode: 'email' | 'username' }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: form.get('identifier'), password: form.get('password') }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Login failed');
      window.location.href = '/dashboard';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <h1>Swami Abhyasika</h1>
      <p className="sub">Sign in to continue</p>
      <div id="err" style={{ display: error ? 'block' : 'none' }} role="alert">
        {error}
      </div>
      <label htmlFor="identifier">{mode === 'email' ? 'Email' : 'Username'}</label>
      <input
        id="identifier"
        name="identifier"
        type={mode === 'email' ? 'email' : 'text'}
        autoComplete={mode === 'email' ? 'email' : 'username'}
        required
        autoFocus
      />
      <label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required />
      <button type="submit" disabled={busy}>
        {busy ? 'Signing in...' : 'Sign In'}
      </button>
    </form>
  );
}
