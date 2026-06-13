'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { getBrowserClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  time?: string;
}

interface ModelOption {
  id: string;
  label: string;
}

interface Conversation {
  conversation_id: string;
  preview: string;
  last_active: string;
  message_count: number;
}

interface Artifact {
  language: string;
  code: string;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function now(): string {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function importanceColor(importance: number): string {
  if (importance >= 5) return '#22c55e';
  if (importance >= 3) return '#f59e0b';
  return '#4a5480';
}

function extractArtifact(content: string): Artifact | null {
  const match = content.match(/```(\w+)?\n([\s\S]*?)```/);
  if (!match) return null;
  const language = match[1] || 'text';
  const code = match[2].trim();
  if (code.length < 50) return null;
  return { language, code };
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

function downloadFile(content: string, filename: string, language: string) {
  const extMap: Record<string, string> = {
    typescript: 'ts', tsx: 'tsx', javascript: 'js', jsx: 'jsx',
    python: 'py', sql: 'sql', css: 'css', html: 'html',
    json: 'json', markdown: 'md', md: 'md', bash: 'sh', text: 'txt',
  };
  const ext = extMap[language] || 'txt';
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `cipher-output.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ChatPage() {
  const [messages, setMessages]             = useState<Message[]>([]);
  const [input, setInput]                   = useState('');
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState(false);
  const [memoryToast, setMemoryToast]       = useState(false);
  const [model, setModel]                   = useState('claude-haiku-4-5-20251001');
  const [models, setModels]                 = useState<ModelOption[]>([]);
  const [conversationId, setConversationId] = useState<string>('');
  const [conversations, setConversations]   = useState<Conversation[]>([]);
  const [sidebarOpen, setSidebarOpen]       = useState(true);
  const [renamingId, setRenamingId]         = useState<string | null>(null);
  const [renameValue, setRenameValue]       = useState('');
  const [titles, setTitles]                 = useState<Record<string, string>>({});
  const [artifact, setArtifact]             = useState<Artifact | null>(null);
  const [artifactFilename, setArtifactFilename] = useState('');
  const [copied, setCopied]                 = useState(false);
  const [file, setFile]                     = useState<File | null>(null);
  const [filePreview, setFilePreview]       = useState<string | null>(null);
  const bottomRef                           = useRef<HTMLDivElement>(null);
  const inputRef                            = useRef<HTMLTextAreaElement>(null);
  const fileInputRef                        = useRef<HTMLInputElement>(null);
  const router                              = useRouter();

  const status = error ? 'error' : loading ? 'thinking' : 'online';
  const statusConfig = {
    online:   { dot: '#22c55e', label: 'ONLINE' },
    thinking: { dot: '#f59e0b', label: 'THINKING' },
    error:    { dot: '#cc1a1a', label: 'ERROR' },
  };
  const { dot, label } = statusConfig[status];

  useEffect(() => {
    const stored = sessionStorage.getItem('cipher-conversation-id');
    if (stored) {
      setConversationId(stored);
    } else {
      const newId = crypto.randomUUID();
      sessionStorage.setItem('cipher-conversation-id', newId);
      setConversationId(newId);
    }
  }, []);

  useEffect(() => {
    fetch('/api/models')
      .then(r => r.json())
      .then(d => { if (d.models?.length) setModels(d.models); })
      .catch(() => {});
  }, []);

  const refreshConversations = useCallback(() => {
    fetch('/api/conversations')
      .then(r => r.json())
      .then(d => { if (d.conversations) setConversations(d.conversations); })
      .catch(() => {});
  }, []);

  const refreshTitles = useCallback(() => {
    fetch('/api/conversations/title')
      .then(r => r.json())
      .then(d => {
        if (d.titles) {
          const map: Record<string, string> = {};
          for (const row of d.titles) map[row.conversation_id] = row.title;
          setTitles(map);
        }
      })
      .catch(() => {});
  }, []);

  const saveTitle = useCallback(async (id: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) { setRenamingId(null); return; }
    await fetch('/api/conversations/title', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: id, title: trimmed }),
    }).catch(() => {});
    setTitles(prev => ({ ...prev, [id]: trimmed }));
    setRenamingId(null);
  }, []);

  useEffect(() => { refreshConversations(); }, [refreshConversations]);
  useEffect(() => { refreshTitles(); }, [refreshTitles]);

  useEffect(() => {
    if (!conversationId) return;
    fetch(`/api/messages?conversationId=${conversationId}`)
      .then(r => r.json())
      .then(d => {
        if (d.messages) {
          setMessages(d.messages.map((m: { role: 'user' | 'assistant'; content: string }) => ({
            role: m.role,
            content: m.content,
          })));
        }
      })
      .catch(() => {});
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const loadConversation = useCallback((id: string) => {
    setMessages([]);
    setArtifact(null);
    setError(false);
    setConversationId(id);
    sessionStorage.setItem('cipher-conversation-id', id);
  }, []);

  const handleNewChat = useCallback(() => {
    const newId = crypto.randomUUID();
    sessionStorage.setItem('cipher-conversation-id', newId);
    setConversationId(newId);
    setMessages([]);
    setInput('');
    setFile(null);
    setFilePreview(null);
    setArtifact(null);
    setError(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    if (f.type.startsWith('image/')) {
      setFilePreview(URL.createObjectURL(f));
    } else {
      setFilePreview(f.name);
    }
  };

  const clearFile = () => {
    setFile(null);
    setFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if ((!text && !file) || loading || !conversationId) return;

    const timestamp = now();
    setInput('');
    setError(false);
    setMessages(prev => [...prev, { role: 'user', content: text || `[${file?.name}]`, time: timestamp }]);
    setLoading(true);

    try {
      let body: BodyInit;
      let headers: HeadersInit = {};

      if (file) {
        const formData = new FormData();
        formData.append('message', text);
        formData.append('conversationId', conversationId);
        formData.append('model', model);
        formData.append('file', file);
        body = formData;
      } else {
        headers = { 'Content-Type': 'application/json' };
        body = JSON.stringify({ message: text, conversationId, model });
      }

      const res = await fetch('/api/chat', { method: 'POST', headers, body });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const reply = data.reply as string;
      setMessages(prev => [...prev, { role: 'assistant', content: reply, time: now() }]);

      if (data.memoryWritten) {
        setMemoryToast(true);
        setTimeout(() => setMemoryToast(false), 3000);
      }

      const detected = extractArtifact(reply);
      if (detected) {
        setArtifact(detected);
        setArtifactFilename(`cipher-output.${detected.language}`);
      }

      clearFile();
      refreshConversations();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${msg}`, time: now() }]);
      setError(true);
      setTimeout(() => setError(false), 5000);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, file, loading, conversationId, model, refreshConversations]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleCopy = () => {
    if (!artifact) return;
    copyToClipboard(artifact.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSignOut = async () => {
    const supabase = getBrowserClient();
    await supabase.auth.signOut();
    sessionStorage.removeItem('cipher-conversation-id');
    router.push('/login');
  };

  const pillLabel = (l: string) => l.split(' ')[0].toUpperCase();

  const codeStyle = {
    background: '#1c2035',
    border: '1px solid #2d3250',
    borderRadius: '6px',
    padding: '12px 14px',
    overflowX: 'auto' as const,
    fontSize: '13px',
    lineHeight: '1.6',
    margin: '8px 0',
    fontFamily: 'monospace',
    color: '#c8cfe0',
    display: 'block',
    whiteSpace: 'pre' as const,
  };

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0c0e17', position: 'relative' }}>

      {/* Lion background */}
      <img
        src="/lion.jpg"
        alt=""
        style={{
          position: 'fixed', top: 0, left: 0,
          width: '100%', height: '100%',
          objectFit: 'cover', opacity: 0.08,
          zIndex: 0, pointerEvents: 'none',
        }}
      />

      {/* Memory saved toast */}
      {memoryToast && (
        <div style={{
          position: 'fixed', bottom: '80px', left: '50%',
          transform: 'translateX(-50%)',
          background: '#1c2035', border: '1px solid rgba(56,189,248,0.30)',
          borderRadius: '6px', padding: '8px 16px',
          fontSize: '12px', color: '#38bdf8', fontWeight: '600',
          letterSpacing: '0.05em', zIndex: 100,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>
          ◈ Memory saved
        </div>
      )}

      {/* ── Sidebar ── */}
      {sidebarOpen && (
        <div style={{
          width: '200px', background: 'rgba(15,18,32,0.92)',
          borderRight: '1px solid #2d3250',
          display: 'flex', flexDirection: 'column', flexShrink: 0,
          position: 'relative', zIndex: 1,
        }}>
          <div style={{
            padding: '14px 12px', borderBottom: '1px solid #2d3250',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <span style={{ color: '#cc1a1a', fontSize: '13px', fontWeight: '700', letterSpacing: '0.08em', flex: 1 }}>
              ◈ CIPHER
            </span>
            <button onClick={handleNewChat} style={{
              background: 'rgba(56,189,248,0.12)', color: '#38bdf8',
              border: '1px solid rgba(56,189,248,0.30)', borderRadius: '4px',
              padding: '3px 8px', fontSize: '11px', fontWeight: '600',
              letterSpacing: '0.04em', cursor: 'pointer',
            }}>NEW</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
            {conversations.length === 0 ? (
              <p style={{ color: '#4a5480', fontSize: '12px', padding: '16px 12px', textAlign: 'center' }}>
                No history yet
              </p>
            ) : conversations.map(conv => (
              <button key={conv.conversation_id} onClick={() => loadConversation(conv.conversation_id)} style={{
                width: '100%',
                background: conv.conversation_id === conversationId ? 'rgba(56,189,248,0.08)' : 'transparent',
                border: 'none',
                borderLeft: conv.conversation_id === conversationId ? '2px solid #38bdf8' : '2px solid transparent',
                padding: '8px 12px', textAlign: 'left', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: '2px',
              }}>
                <span style={{
                  fontSize: '12px',
                  color: conv.conversation_id === conversationId ? '#eef0f8' : '#8892b0',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  display: 'block', maxWidth: '170px',
                }}>
                  {conv.preview?.slice(0, 40) || 'Conversation'}
                </span>
                <span style={{ fontSize: '10px', color: '#4a5480' }}>
                  {formatDate(conv.last_active)} · {conv.message_count}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Chat column ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative', zIndex: 1 }}>

        <header style={{
          background: 'rgba(15,18,32,0.92)', borderBottom: '1px solid #2d3250',
          padding: '0 16px', height: '50px',
          display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0,
        }}>
          <button onClick={() => setSidebarOpen(s => !s)} style={{
            background: 'transparent', color: '#4a5480', border: 'none',
            fontSize: '16px', padding: '4px 6px', cursor: 'pointer', lineHeight: 1,
          }}>☰</button>

          {!sidebarOpen && (
            <span style={{ color: '#cc1a1a', fontSize: '14px', fontWeight: '700', letterSpacing: '0.08em' }}>
              ◈ CIPHER
            </span>
          )}

          <div style={{ display: 'flex', gap: '4px', flexWrap: 'nowrap', marginRight: 'auto' }}>
            {(models.length ? models : [
              { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
              { id: 'claude-sonnet-4-6',         label: 'Sonnet 4.6' },
              { id: 'claude-opus-4-8',           label: 'Opus 4.8' },
              { id: 'claude-fable-5',            label: 'Fable 5' },
            ]).map(m => {
              const active = m.id === model;
              return (
                <button key={m.id} onClick={() => setModel(m.id)} style={{
                  background:    active ? 'rgba(56,189,248,0.12)' : 'transparent',
                  color:         active ? '#38bdf8' : '#4a5480',
                  border:        active ? '1px solid rgba(56,189,248,0.30)' : '1px solid #2d3250',
                  borderRadius:  '4px', padding: '3px 8px', fontSize: '11px',
                  fontWeight:    active ? '600' : '500', letterSpacing: '0.05em',
                  transition:    'all 0.15s', cursor: 'pointer',
                }}>
                  {pillLabel(m.label)}
                </button>
              );
            })}
          </div>

          {/* Status indicator */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            padding: '3px 8px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid #2d3250',
            borderRadius: '4px',
          }}>
            <span style={{
              width: '6px', height: '6px', borderRadius: '50%',
              background: dot,
              boxShadow: loading ? `0 0 6px ${dot}` : 'none',
              display: 'inline-block',
              transition: 'all 0.3s',
            }} />
            <span style={{ fontSize: '10px', fontWeight: '600', letterSpacing: '0.06em', color: '#4a5480' }}>
              {label}
            </span>
          </div>

          <button onClick={handleSignOut} style={{
            background: 'transparent', color: '#4a5480', border: 'none',
            fontSize: '11px', padding: '3px 4px', letterSpacing: '0.04em', cursor: 'pointer',
          }}>OUT</button>
        </header>

        <div style={{
          flex: 1, overflowY: 'auto', padding: '20px 0 12px',
          display: 'flex', flexDirection: 'column', gap: '2px',
        }}>
          {messages.length === 0 && (
            <div style={{ margin: 'auto', textAlign: 'center', color: '#2d3250', padding: '40px 20px' }}>
              <p style={{ fontSize: '32px', marginBottom: '10px' }}>◈</p>
              <p style={{ fontSize: '13px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Online</p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} style={{
              padding: '8px 20px', width: '100%',
              display: 'flex', flexDirection: 'column', gap: '4px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  fontSize: '10px', fontWeight: '700', letterSpacing: '0.09em',
                  textTransform: 'uppercase',
                  color: msg.role === 'user' ? '#38bdf8' : '#cc1a1a',
                }}>
                  {msg.role === 'user' ? 'You' : 'Cipher'}
                </span>
                {msg.time && (
                  <span style={{ fontSize: '10px', color: '#4a5480' }}>{msg.time}</span>
                )}
              </div>
              <div style={{ fontSize: '14px', lineHeight: '1.65', color: msg.role === 'user' ? '#dce8f5' : '#c8cfe0' }}>
                {msg.role === 'assistant' ? (
                  <ReactMarkdown
                    components={{
                      code({ className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || '');
                        if (!match) {
                          return (
                            <code style={{
                              background: '#1c2035', color: '#38bdf8',
                              padding: '1px 6px', borderRadius: '3px', fontSize: '13px',
                            }} {...props}>
                              {children}
                            </code>
                          );
                        }
                        return <code style={codeStyle}>{String(children).replace(/\n$/, '')}</code>;
                      },
                      p({ children }) { return <p style={{ margin: '4px 0', lineHeight: '1.65' }}>{children}</p>; },
                      ul({ children }) { return <ul style={{ paddingLeft: '20px', margin: '6px 0' }}>{children}</ul>; },
                      ol({ children }) { return <ol style={{ paddingLeft: '20px', margin: '6px 0' }}>{children}</ol>; },
                      li({ children }) { return <li style={{ margin: '2px 0' }}>{children}</li>; },
                      strong({ children }) { return <strong style={{ color: '#eef0f8', fontWeight: '600' }}>{children}</strong>; },
                      h1({ children }) { return <h1 style={{ color: '#eef0f8', fontSize: '18px', fontWeight: '700', margin: '12px 0 6px' }}>{children}</h1>; },
                      h2({ children }) { return <h2 style={{ color: '#eef0f8', fontSize: '16px', fontWeight: '600', margin: '10px 0 4px' }}>{children}</h2>; },
                      h3({ children }) { return <h3 style={{ color: '#eef0f8', fontSize: '14px', fontWeight: '600', margin: '8px 0 4px' }}>{children}</h3>; },
                      blockquote({ children }) {
                        return (
                          <blockquote style={{ borderLeft: '3px solid #2d3250', paddingLeft: '12px', margin: '8px 0', color: '#8892b0', fontStyle: 'italic' }}>
                            {children}
                          </blockquote>
                        );
                      },
                      table({ children }) {
                        return (
                          <div style={{ overflowX: 'auto', margin: '8px 0' }}>
                            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '13px' }}>{children}</table>
                          </div>
                        );
                      },
                      th({ children }) {
                        return <th style={{ border: '1px solid #2d3250', padding: '6px 10px', background: '#1c2035', color: '#eef0f8', textAlign: 'left' }}>{children}</th>;
                      },
                      td({ children }) {
                        return <td style={{ border: '1px solid #2d3250', padding: '6px 10px', color: '#c8cfe0' }}>{children}</td>;
                      },
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                ) : (
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</p>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ padding: '8px 20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <style>{`@keyframes expand-bar{0%,100%{transform:scaleX(0.3);opacity:0.4}50%{transform:scaleX(1);opacity:1}}`}</style>
              <span style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '0.09em', textTransform: 'uppercase', color: '#cc1a1a' }}>Cipher</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '2px' }}>
                <div style={{ height: '2px', width: '60px', background: '#cc1a1a', borderRadius: '1px', animation: 'expand-bar 1.2s ease-in-out infinite', transformOrigin: 'left' }} />
                <div style={{ height: '2px', width: '40px', background: '#cc1a1a', borderRadius: '1px', animation: 'expand-bar 1.2s ease-in-out infinite', animationDelay: '0.2s', transformOrigin: 'left', opacity: 0.6 }} />
                <div style={{ height: '2px', width: '50px', background: '#cc1a1a', borderRadius: '1px', animation: 'expand-bar 1.2s ease-in-out infinite', animationDelay: '0.4s', transformOrigin: 'left', opacity: 0.3 }} />
                <span style={{ fontSize: '11px', color: '#4a5480', letterSpacing: '0.06em', marginTop: '2px' }}>processing...</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div style={{
          background: 'rgba(15,18,32,0.92)', borderTop: '1px solid #2d3250',
          padding: '10px 16px', display: 'flex', flexDirection: 'column',
          gap: '6px', flexShrink: 0,
        }}>
          {filePreview && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', alignSelf: 'flex-start' }}>
              {file?.type.startsWith('image/') ? (
                <img src={filePreview} alt="preview" style={{ height: '50px', borderRadius: '4px', border: '1px solid #2d3250' }} />
              ) : (
                <span style={{ background: '#1c2035', color: '#8892b0', border: '1px solid #2d3250', borderRadius: '4px', padding: '4px 10px', fontSize: '12px' }}>
                  📄 {filePreview}
                </span>
              )}
              <button onClick={clearFile} style={{
                background: '#cc1a1a', color: '#fff', border: 'none',
                borderRadius: '50%', width: '18px', height: '18px',
                fontSize: '11px', cursor: 'pointer', lineHeight: 1,
              }}>×</button>
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.txt,.md,.csv,.json,.ts,.tsx,.js,.jsx,.py,.sql"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            <button onClick={() => fileInputRef.current?.click()} title="Attach file" style={{
              background: 'transparent', color: '#4a5480', border: '1px solid #2d3250',
              borderRadius: '6px', padding: '9px 10px', fontSize: '14px',
              height: '40px', cursor: 'pointer', lineHeight: 1,
            }}>📎</button>

            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message Cipher..."
              rows={1}
              style={{
                flex: 1, background: '#1c2035', border: '1px solid #2d3250',
                borderRadius: '6px', padding: '9px 12px', fontSize: '14px',
                lineHeight: '1.5', color: '#eef0f8', resize: 'none',
                outline: 'none', maxHeight: '160px', overflowY: 'auto',
              }}
              onInput={e => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
              }}
            />

            <button
              onClick={sendMessage}
              disabled={loading || (!input.trim() && !file)}
              style={{
                background:    loading || (!input.trim() && !file) ? 'rgba(56,189,248,0.25)' : '#38bdf8',
                color:         loading || (!input.trim() && !file) ? '#4a5480' : '#0c0e17',
                border:        'none', borderRadius: '6px', padding: '9px 16px',
                fontSize:      '12px', fontWeight: '700', letterSpacing: '0.06em',
                textTransform: 'uppercase', height: '40px', transition: 'all 0.15s',
                cursor:        loading || (!input.trim() && !file) ? 'not-allowed' : 'pointer',
              }}
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {/* ── Artifact panel ── */}
      {artifact && (
        <div style={{
          width: '420px', background: 'rgba(15,18,32,0.95)',
          borderLeft: '1px solid #2d3250',
          display: 'flex', flexDirection: 'column', flexShrink: 0,
          position: 'relative', zIndex: 1,
        }}>
          <div style={{
            padding: '0 16px', height: '50px', borderBottom: '1px solid #2d3250',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <span style={{ color: '#8892b0', fontSize: '11px', letterSpacing: '0.06em', flex: 1 }}>
              {artifact.language.toUpperCase()}
            </span>
            <input
              value={artifactFilename}
              onChange={e => setArtifactFilename(e.target.value)}
              style={{
                background: '#1c2035', border: '1px solid #2d3250', borderRadius: '4px',
                padding: '3px 8px', fontSize: '11px', color: '#8892b0',
                width: '160px', outline: 'none',
              }}
              placeholder="filename"
            />
            <button onClick={handleCopy} style={{
              background: copied ? 'rgba(56,189,248,0.2)' : 'rgba(56,189,248,0.12)',
              color: '#38bdf8', border: '1px solid rgba(56,189,248,0.30)',
              borderRadius: '4px', padding: '3px 10px', fontSize: '11px',
              fontWeight: '600', cursor: 'pointer', letterSpacing: '0.04em',
            }}>
              {copied ? 'COPIED' : 'COPY'}
            </button>
            <button
              onClick={() => downloadFile(artifact.code, artifactFilename, artifact.language)}
              style={{
                background: 'transparent', color: '#4a5480', border: '1px solid #2d3250',
                borderRadius: '4px', padding: '3px 10px', fontSize: '11px',
                cursor: 'pointer', letterSpacing: '0.04em',
              }}
            >
              ↓ DL
            </button>
            <button onClick={() => setArtifact(null)} style={{
              background: 'transparent', color: '#4a5480', border: 'none',
              fontSize: '16px', cursor: 'pointer', lineHeight: 1, padding: '2px 4px',
            }}>×</button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            <pre style={{
              margin: 0, fontSize: '12px', lineHeight: '1.6',
              color: '#c8cfe0', fontFamily: 'monospace',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {artifact.code}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
