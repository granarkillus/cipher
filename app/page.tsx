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

interface Conversation {
  conversation_id: string;
  preview: string;
  last_active: string;
  message_count: number;
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

export default function ChatPage() {
  const [messages, setMessages]             = useState<Message[]>([]);
  const [input, setInput]                   = useState('');
  const [loading, setLoading]               = useState(false);
  const [model, setModel]                   = useState('claude-sonnet-4-6');
  const [models, setModels]                 = useState<ModelOption[]>([]);
  const [conversationId, setConversationId] = useState<string>('');
  const [conversations, setConversations]   = useState<Conversation[]>([]);
  const [sidebarOpen, setSidebarOpen]       = useState(true);
  const [imageFile, setImageFile]           = useState<File | null>(null);
  const [imagePreview, setImagePreview]     = useState<string | null>(null);
  const bottomRef                           = useRef<HTMLDivElement>(null);
  const inputRef                            = useRef<HTMLTextAreaElement>(null);
  const fileInputRef                        = useRef<HTMLInputElement>(null);
  const router                              = useRouter();

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

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

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
    setConversationId(id);
    sessionStorage.setItem('cipher-conversation-id', id);
  }, []);

  const handleNewChat = useCallback(() => {
    const newId = crypto.randomUUID();
    sessionStorage.setItem('cipher-conversation-id', newId);
    setConversationId(newId);
    setMessages([]);
    setInput('');
    setImageFile(null);
    setImagePreview(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if ((!text && !imageFile) || loading || !conversationId) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: text || '[image]' }]);
    setLoading(true);

    try {
      let body: BodyInit;
      let headers: HeadersInit = {};

      if (imageFile) {
        const formData = new FormData();
        formData.append('message', text);
        formData.append('conversationId', conversationId);
        formData.append('model', model);
        formData.append('image', imageFile);
        body = formData;
      } else {
        headers = { 'Content-Type': 'application/json' };
        body = JSON.stringify({ message: text, conversationId, model });
      }

      const res = await fetch('/api/chat', { method: 'POST', headers, body });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      clearImage();
      refreshConversations();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${msg}` }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, imageFile, loading, conversationId, model, refreshConversations]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleSignOut = async () => {
    const supabase = getBrowserClient();
    await supabase.auth.signOut();
    sessionStorage.removeItem('cipher-conversation-id');
    router.push('/login');
  };

  const pillLabel = (label: string) => label.split(' ')[0].toUpperCase();

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0c0e17' }}>
      {sidebarOpen && (
        <div style={{
          width: '220
             <p style={{
                fontSize:   '14px',
                lineHeight: '1.65',
                color:      msg.role === 'user' ? '#dce8f5' : '#c8cfe0',
                whiteSpace: 'pre-wrap',
                wordBreak:  'break-word',
                margin:     0,
              }}>
                {msg.content}
              </p>
            </div>
          ))}

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

        {/* Input bar */}
        <div style={{
          background: '#0f1220',
          borderTop: '1px solid #2d3250',
          padding: '10px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          flexShrink: 0,
        }}>
          {imagePreview && (
            <div style={{ position: 'relative', display: 'inline-block', alignSelf: 'flex-start' }}>
              <img
                src={imagePreview}
                alt="preview"
                style={{ height: '60px', borderRadius: '4px', border: '1px solid #2d3250' }}
              />
              <button
                onClick={clearImage}
                style={{
                  position: 'absolute', top: '-6px', right: '-6px',
                  background: '#cc1a1a', color: '#fff', border: 'none',
                  borderRadius: '50%', width: '16px', height: '16px',
                  fontSize: '10px', cursor: 'pointer', lineHeight: 1,
                }}
              >×</button>
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Attach image"
              style={{
                background: 'transparent',
                color: '#4a5480',
                border: '1px solid #2d3250',
                borderRadius: '6px',
                padding: '9px 10px',
                fontSize: '14px',
                height: '40px',
                cursor: 'pointer',
                lineHeight: 1,
              }}
            >
              🖼
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Transmit..."
              rows={1}
              style={{
                flex:         1,
                background:   '#1c2035',
                border:       '1px solid #2d3250',
                borderRadius: '6px',
                padding:      '9px 12px',
                fontSize:     '14px',
                lineHeight:   '1.5',
                color:        '#eef0f8',
                resize:       'none',
                outline:      'none',
                maxHeight:    '160px',
                overflowY:    'auto',
              }}
              onInput={e => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
              }}
            />
            <button
              onClick={sendMessage}
              disabled={loading || (!input.trim() && !imageFile)}
              style={{
                background:    loading || (!input.trim() && !imageFile) ? 'rgba(56,189,248,0.25)' : '#38bdf8',
                color:         loading || (!input.trim() && !imageFile) ? '#4a5480' : '#0c0e17',
                border:        'none',
                borderRadius:  '6px',
                padding:       '9px 16px',
                fontSize:      '12px',
                fontWeight:    '700',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                height:        '40px',
                transition:    'all 0.15s',
                cursor:        loading || (!input.trim() && !imageFile) ? 'not-allowed' : 'pointer',
              }}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
