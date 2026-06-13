import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getServiceClient } from '@/lib/supabase';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TEXT_EXTENSIONS = ['txt', 'md', 'csv', 'json', 'ts', 'tsx', 'js', 'jsx', 'py', 'sql'];
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

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
    let fileText: string | null = null;
    let fileName: string | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      message      = (formData.get('message') as string) || '';
      conversationId = (formData.get('conversationId') as string) || '';
      model        = (formData.get('model') as string) || 'claude-sonnet-4-6';
      const file   = formData.get('file') as File | null;

      if (file) {
        fileName = file.name;
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        const isImage = IMAGE_TYPES.includes(file.type);
        const isText = TEXT_EXTENSIONS.includes(ext) || file.type.startsWith('text/');
        const isPdf = file.type === 'application/pdf';

        if (isImage) {
          const arrayBuffer = await file.arrayBuffer();
          imageData = Buffer.from(arrayBuffer).toString('base64');
          imageMediaType = file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
        } else if (isText) {
          fileText = await file.text();
          if (fileText.length > 100000) fileText = fileText.slice(0, 100000) + '\n\n[truncated]';
        } else if (isPdf) {
          // Send PDF as base64 document block
          const arrayBuffer = await file.arrayBuffer();
          imageData = Buffer.from(arrayBuffer).toString('base64');
          imageMediaType = null; // signals PDF handling below
          fileText = '__PDF__';
        }
      }
    } else {
      const body  = await request.json();
      message      = body.message || '';
      conversationId = body.conversationId || '';
      model        = body.model || 'claude-sonnet-4-6';
    }

    if ((!message?.trim() && !imageData && !fileText) || !conversationId) {
      return NextResponse.json(
        { error: 'message and conversationId are required' },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();

    const textToEmbed = message.trim() || fileName || '[file uploaded]';
    const embedding = await embed(textToEmbed);

    const { data: similarMessages } = await supabase.rpc('match_messages', {
      query_embedding: embedding,
      match_threshold: 0.3,
      match_count: 6,
    });

    // Fetch core facts
    const { data: coreFacts } = await supabase
      .from('core_facts')
      .select('content')
      .single();

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

    const coreFactsSection = coreFacts?.content
      ? `${coreFacts.content}\n\n`
      : '';

    const systemPrompt = `${coreFactsSection}You are Cipher, a personal AI with access to stored memories and core facts about your owner. Use context naturally — no need to announce it.

${contextSection}Rules for code and files: Always produce complete files with no truncation. If a response contains code, wrap it in a markdown code block with the language specified (e.g. \`\`\`typescript). Never cut off mid-file.

Be direct. Match the register of the message. Don't pad responses.`;

    type TextBlock = { type: 'text'; text: string };
    type ImageBlock = { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };
    type DocumentBlock = { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } };
    type ContentBlock = TextBlock | ImageBlock | DocumentBlock;

    const userContent: ContentBlock[] = [];

    if (imageData && imageMediaType) {
      userContent.push({
        type: 'image',
        source: { type: 'base64', media_type: imageMediaType, data: imageData },
      });
    } else if (imageData && fileText === '__PDF__') {
      userContent.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: imageData },
      });
    }

    if (fileText && fileText !== '__PDF__') {
      const ext = fileName?.split('.').pop()?.toLowerCase() || 'text';
      userContent.push({
        type: 'text',
        text: `File: ${fileName}\n\`\`\`${ext}\n${fileText}\n\`\`\``,
      });
    }

    if (message.trim()) {
      userContent.push({ type: 'text', text: message });
    } else if (!fileText && imageData) {
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
      max_tokens: 8096,
      system: systemPrompt,
      messages: claudeMessages,
    });

    const reply = completion.content[0].type === 'text' ? completion.content[0].text : '';

    const userMessageContent = message.trim()
      ? fileName ? `[${fileName}] ${message}` : message
      : `[${fileName || 'file uploaded'}]`;

    await supabase.from('messages').insert([
      { conversation_id: conversationId, role: 'user',      content: userMessageContent, embedding },
      { conversation_id: conversationId, role: 'assistant', content: reply },
    ]);

    return NextResponse.json({ reply });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Chat route error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
