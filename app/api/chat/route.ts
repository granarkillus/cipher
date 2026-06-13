import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getServiceClient } from '@/lib/supabase';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function embed(text: string): Promise<number[]> {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      input: [text.slice(0, 16000)],
      model: 'voyage-4-lite',
      input_type: 'document',
      output_dimension: 1024,
    }),
  });
  if (!res.ok) throw new Error(`Voyage ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.data[0].embedding;
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    
    let message = '';
    let conversationId = '';
    let model = 'claude-sonnet-4-6';
    let imageData: string | null = null;
    let imageMediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      message = (formData.get('message') as string) || '';
      conversationId = (formData.get('conversationId') as string) || '';
      model = (formData.get('model') as string) || 'claude-sonnet-4-6';
      const imageFile = formData.get('image') as File | null;

      if (imageFile) {
        const arrayBuffer = await imageFile.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        imageData = base64;
        imageMediaType = (imageFile.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp') || 'image/jpeg';
      }
    } else {
      const body = await request.json();
      message = body.message || '';
      conversationId = body.conversationId || '';
      model = body.model || 'claude-sonnet-4-6';
    }

    if ((!message?.trim() && !imageData) || !conversationId) {
      return NextResponse.json(
        { error: 'message and conversationId are required' },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();

    const textToEmbed = message.trim() || '[image uploaded]';
    const embedding = await embed(textToEmbed);

    const { data: similarMessages } = await supabase.rpc('match_messages', {
      query_embedding: embedding,
      match_threshold: 0.3,
      match_count: 6,
    });

    const { data: history } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(20);

    const recentHistory = (history ?? []).reverse();

    const contextSection = similarMessages?.length
      ? `Relevant context from past conversations:\n${similarMessages
          .map((m: { role: string; content: string }) => `[${m.role}]: ${m.content.slice(0, 300)}`)
          .join('\n')}\n\n`
      : '';

    const systemPrompt = `You are Cipher, a personal AI with access to stored memories from past conversations with your owner. Use that context naturally — no need to announce you're doing it.

${contextSection}Be direct. Match the register of the message. Don't pad responses.`;

    type TextBlock = { type: 'text'; text: string };
    type ImageBlock = { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };
    type ContentBlock = TextBlock | ImageBlock;

    const userContent: ContentBlock[] = [];

    if (imageData && imageMediaType) {
      userContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: imageMediaType,
          data: imageData,
        },
      });
    }

    if (message.trim()) {
      userContent.push({ type: 'text', text: message });
    } else if (imageData) {
      userContent.push({ type: 'text', text: 'What do you see in this image?' });
    }

    const claudeMessages: { role: 'user' | 'assistant'; content: string | ContentBlock[] }[] = [
      ...recentHistory.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: userContent },
    ];

    const completion = await anthropic.messages.create({
      model,
      max_tokens: 2048,
      system: systemPrompt,
      messages: claudeMessages,
    });

    const reply =
      completion.content[0].type === 'text' ? completion.content[0].text : '';

    const userMessageContent = message.trim()
      ? imageData ? `[image] ${message}` : message
      : '[image uploaded]';

    await supabase.from('messages').insert([
      {
        conversation_id: conversationId,
        role: 'user',
        content: userMessageContent,
        embedding,
      },
      {
        conversation_id: conversationId,
        role: 'assistant',
        content: reply,
      },
    ]);

    return NextResponse.json({ reply });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Chat route error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
