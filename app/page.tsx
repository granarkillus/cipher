'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { getBrowserClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ModelOption {
  id: string;
  label: string;
}

function newConversationId() {
  return crypto.randomUUID();
}

export default function ChatPage() {
  const [messages, setMessages]         = useState<Message[]>([]);
  const [input, setInput]               = useState('');
  const [loading, setLoading]           = useState(false);
  const [model, setModel]               = useState('claude-sonnet-4-6');
  const [models, setModels]             = useState<ModelOption[]>([]);
  const [conversationId]                = useState(newConversationId);
  const bottomRef                       = useRef<HTMLDivElement>(null);
  const inputRef                        = useRef<HTMLTextAreaElement>(null);
  const router                          = useRouter();

  // Load model list
  useEffect(() => {
    fetch('/api/models')
      .then(r => r.json())
      .then(d => { if (d.models?.length) setModels(d.models); })
      .catch(() => {});
  }, []);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, conversationId, model }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${msg}` }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, loading, conversationId, model]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleSignOut = async () => {
    const supabase = getBrowserClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleNewChat = () => {
    window.location.reload();
  };

  // Short label for pills (e.g. "Sonnet 4.6" → "SONNET")
  const pillLabel = (label: string) => label.split(' ')[0].toUpperCase();

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: '#0c0e17',
    }}>

      {/* ── Header ── */}
      <header style={{
        background: '#0f1220',
        borderBottom: '1px solid #2d3250',
        padding: '0 16px',
        height: '50px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexShrink: 0,
      }}>

        {/* Wordmark */}
        <span style={{
          color: '#cc1a1a',
          fontSize: '14px',
          fontWeight: '700',
          letterSpacing: '0.08em',
          marginRight: 'auto',
        }}>
          ◈ CIPHER
        </span>

        {/* Model pills */}
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'nowrap' }}>
          {(models.length
            ? models
            : [
                { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
                { id: 'claude-sonnet-4-6',         label: 'Sonnet 4.6' },
                { id: 'claude-opus-4-8',           label: 'Opus 4.8' },
                { id: 'claude-fable-5',            label: 'Fable 5' },
              ]
          ).map(m => {
            const active = m.id === model;
            return (
              <button
                key={m.id}
                onClick={() => setModel(m.id)}
                style={{
                  background:    active ? 'rgba(56,189,248,0.12)' : 'transparent',
                  color:         active ? '#38bdf8'              : '#4a5480',
                  border:        active ? '1px solid rgba(56,189,248,0.30)' : '1px solid #2d3250',
                  borderRadius:  '4px',
                  padding:       '3px 8px',
                  fontSize:      '11px',
                  fontWeight:    active ? '600' : '500',
                  letterSpacing: '0.05em',
                  transition:    'all 0.15s',
                  cursor:        'pointer',
                }}
              >
                {pillLabel(m.label)}
              </button>
            );
          })}
        </div>

        <button
          onClick={handleNewChat}
          style={{
            background:    'transparent',
            color:         '#4a5480',
            border:        '1px solid #2d3250',
            borderRadius:  '4px',
            padding:       '3px 10px',
            fontSize:      '11px',
            letterSpacing: '0.05em',
          }}
        >
          NEW
        </button>

        <button
          onClick={handleSignOut}
          style={{
            background: 'transparent',
            color:      '#4a5480',
            border:     'none',
            fontSize:   '11px',
            padding:    '3px 4px',
            letterSpacing: '0.04em',
          }}
        >
          OUT
        </button>
      </header>

      {/* ── Message list ── */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px 0 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
      }}>

        {messages.length === 0 && (
          <div style={{
            margin: 'auto',
            textAlign: 'center',
            color: '#2d3250',
            padding: '40px 20px',
          }}>
            <p style={{ fontSize: '32px', marginBottom: '10px' }}>◈</p>
            <p style={{ fontSize: '13px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Online
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              padding:   '8px 24px',
              maxWidth:  '740px',
              width:     '100%',
              margin:    '0 auto',
              display:   'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <span style={{
              fontSize:      '10px',
              fontWeight:    '700',
              letterSpacing: '0.09em',
              textTransform: 'uppercase',
              color: msg.role === 'user' ? '#38bdf8' : '#cc1a1a',
            }}>
              {msg.role === 'user' ? 'You' : 'Cipher'}
            </span>
            <p style={{
              fontSize:   '14px',
              lineHeight: '1.65',
              color:      msg.role === 'user' ? '#dce8f5' : '#c8cfe0',
              whiteSpace: 'pre-wrap',
              wordBreak:  'break-word',
            }}>
              {msg.content}
            </p>
          </div>
        ))}

        {/* Typing indicator */}
        {loading && (
          <div style={{
            padding: '8px 24px',
            maxWidth: '740px',
            width: '100%',
            margin: '0 auto',
          }}>
            <span style={{
              fontSize:      '10px',
              fontWeight:    '700',
              letterSpacing: '0.09em',
              textTransform: 'uppercase',
              color: '#cc1a1a',
            }}>
              Cipher
            </span>
            <p style={{ fontSize: '14px', color: '#2d3250', marginTop: '4px' }}>▌</p>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input bar ── */}
      <div style={{
        background:  '#0f1220',
        borderTop:   '1px solid #2d3250',
        padding:     '10px 16px',
        display:     'flex',
        gap:         '8px',
        alignItems:  'flex-end',
        flexShrink:  0,
      }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Transmit..."
          rows={1}
          style={{
            flex:        1,
            background:  '#1c2035',
            border:      '1px solid #2d3250',
            borderRadius:'6px',
            padding:     '9px 12px',
            fontSize:    '14px',
            lineHeight:  '1.5',
            color:       '#eef0f8',
            resize:      'none',
            outline:     'none',
            maxHeight:   '160px',
            overflowY:   'auto',
          }}
          onInput={e => {
            const el = e.currentTarget;
            el.style.height = 'auto';
            el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
          }}
        />
        <button
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          style={{
            background:    loading || !input.trim() ? 'rgba(56,189,248,0.25)' : '#38bdf8',
            color:         loading || !input.trim() ? '#4a5480'                : '#0c0e17',
            border:        'none',
            borderRadius:  '6px',
            padding:       '9px 16px',
            fontSize:      '12px',
            fontWeight:    '700',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            height:        '40px',
            transition:    'all 0.15s',
          }}
        >
          Send
        </button>
      </div>

    </div>
  );
}
