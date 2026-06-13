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
    if (!text && !imageFile || loading || !conversationId) return;

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

      {/* Sidebar */}
      {sidebarOpen && (
        <div style={{
          width: '220px',
          background: '#0f1220',
          borderRight: '1px solid #2d3250',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}>
          <div style={{
            padding: '14px 12px',
            borderBottom: '1px solid #2d3250',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <span style={{
              color: '#cc1a1a',
              fontSize: '13px',
