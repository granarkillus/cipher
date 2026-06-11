'use client';
import { useState } from 'react';
import { getBrowserClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const supabase = getBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push('/');
      router.refresh();
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0c0e17',
    }}>
      <form onSubmit={handleLogin} style={{
        background: '#141724',
        border: '1px solid #2d3250',
        borderTop: '2px solid #cc1a1a',
        borderRadius: '8px',
        padding: '32px 28px',
        width: '320px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}>

        {/* Wordmark */}
        <div style={{ marginBottom: '6px' }}>
          <h1 style={{
            color: '#cc1a1a',
            fontSize: '20px',
            fontWeight: '700',
            letterSpacing: '0.08em',
          }}>
            ◈ CIPHER
          </h1>
          <p style={{
            color: '#4a5480',
            fontSize: '11px',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            marginTop: '3px',
          }}>
            Personal memory system
          </p>
        </div>

        {error && (
          <p style={{
            color: '#f87171',
            fontSize: '13px',
            background: 'rgba(248,113,113,0.08)',
            border: '1px solid rgba(248,113,113,0.2)',
            padding: '8px 10px',
            borderRadius: '4px',
          }}>
            {error}
          </p>
        )}

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          style={{
            background: '#1c2035',
            border: '1px solid #2d3250',
            borderRadius: '4px',
            padding: '10px 12px',
            fontSize: '14px',
            color: '#eef0f8',
            outline: 'none',
          }}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          style={{
            background: '#1c2035',
            border: '1px solid #2d3250',
            borderRadius: '4px',
            padding: '10px 12px',
            fontSize: '14px',
            color: '#eef0f8',
            outline: 'none',
          }}
        />

        <button
          type="submit"
          disabled={loading}
          style={{
            background: loading ? 'rgba(56,189,248,0.4)' : '#38bdf8',
            color: '#0c0e17',
            border: 'none',
            borderRadius: '4px',
            padding: '10px',
            fontSize: '13px',
            fontWeight: '700',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            marginTop: '4px',
            transition: 'background 0.15s',
          }}
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>

      </form>
    </div>
  );
}
