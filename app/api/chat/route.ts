import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getServiceClient } from '@/lib/supabase';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TEXT_EXTENSIONS = ['txt', 'md', 'csv', 'json', 'ts', 'tsx', 'js', 'jsx', 'py', 'sql'];
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

const WRITE_MEMORY_TOOL: Anthropic.Tool = {
  name: 'write_memory',
  description: 'Write a new memory or fact to your permanent memory store. Use when Markham corrects something wrong, shares something new and important about himself, or explicitly asks you to remember something. Do NOT use for things already in core context.',
  input_schema: {
    type: 'object' as const,
    properties: {
      fact: {
        type: 'string',
        description: 'The fact to store. Concise, specific, written as a statement about Markham.',
      },
      importance: {
        type: 'integer',
        description: 'Importance 1-5. 5=critical life fact. 3=useful context. 1=minor detail.',
        minimum: 1,
        maximum: 5,
      },
    },
    required: ['fact', 'importance'],
  },
};

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
    let model = 'claude-haiku-4-5-20251001';
    let imageData: string | null = null;
    let imageMediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | null = null;
    let fileText: string | null = null;
    let fileName: string | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      message       = (formData.get('message') as string) || '';
      conversationId = (formData.get('conversationId') as string) || '';
      model         = (formData.get('model') as string) || 'claude-haiku-4-5-20251001';
      const file    = formData.get('file') as File | null;

      if (file) {
        fileName = file.name;
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        const isImage = IMAGE_TYPES.includes(file.type);
        const isText  = TEXT_EXTENSIONS.includes(ext) || file.type.startsWith('text/');
        const isPdf   = file.type === 'application/pdf';

        if (isImage) {
          const ab = await file.arrayBuffer();
          imageData = Buffer.from(ab).toString('base64');
          imageMediaType = file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
        } else if (isText) {
          fileText = await file.text();
          if (fileText.length > 100000) fileText = fileText.slice(0, 100000) + '\n\n[truncated]';
        } else if (isPdf) {
          const ab = await file.arrayBuffer();
          imageData = Buffer.from(ab).toString('base64');
          imageMediaType = null;
          fileText = '__PDF__';
        }
      }
    } else {
      const body    = await request.json();
      message       = body.message || '';
      conversationId = body.conversationId || '';
      model         = body.model || 'claude-haiku-4-5-20251001';
    }

    if ((!message?.trim() && !imageData && !fileText) || !conversationId) {
      return NextResponse.json({ error: 'message and conversationId are required' }, { status: 400 });
    }

    const supabase = getServiceClient();

    const textToEmbed = message.trim() || fileName || '[file uploaded]';
    const embedding = await embed(textToEmbed);

    const [{ data: similarMessages }, { data: similarMemories }, { data: coreFacts }, { data: history }] =
      await Promise.all([
        supabase.rpc('match_messages', { query_embedding: embedding, match_threshold: 0.3, match_count: 6 }),
        supabase.rpc('match_memories', { query_embedding: embedding, match_threshold: 0.3, match_count: 4 }),
        supabase.from('core_facts').select('content').single(),
        supabase.from('messages').select('role, content').eq('conversation_id', conversationId)
          .order('created_at', { ascending: false }).limit(20),
      ]);

    const recentHistory = (history ?? []).reverse();

    const coreFactsSection   = coreFacts?.content ? `${coreFacts.content}\n\n` : '';
    const memoriesSection    = similarMemories?.length
      ? `Stored memories:\n${similarMemories.map((m: { fact: string; importance: number }) =>
          `- [${m.importance}] ${m.fact}`).join('\n')}\n\n`
      : '';
    const contextSection     = similarMessages?.length
      ? `Relevant past context:\n${similarMessages.map((m: { role: string; content: string }) =>
          `[${m.role}]: ${m.content.slice(0, 300)}`).join('\n')}\n\n`
      : '';

    const systemPrompt = `${coreFactsSection}You are Cipher, a personal AI with access to stored memories and core facts about your owner. Use context naturally.

${memoriesSection}${contextSection}You have a write_memory tool. Use it when:
- Markham corrects something you got wrong
- Markham shares something new and important
- Markham explicitly says to remember something

Do NOT write memories for things already in core context. Do NOT write redundant or obvious facts.

Rules for code: Always produce complete files in markdown code blocks with language specified. Never truncate.

Be direct. Match the register of the message. Don't pad.`;

    type TextBlock     = { type: 'text'; text: string };
    type ImageBlock    = { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };
    type DocumentBlock = { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } };
    type ContentBlock  = TextBlock | ImageBlock | DocumentBlock;

    const userContent: ContentBlock[] = [];

    if (imageData && imageMediaType) {
      userContent.push({ type: 'image', source: { type: 'base64', media_type: imageMediaType, data: imageData } });
    } else if (imageData && fileText === '__PDF__') {
      userContent.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: imageData } });
    }
    if (fileText && fileText !== '__PDF__') {
      const ext = fileName?.split('.').pop()?.toLowerCase() || 'text';
      userContent.push({ type: 'text', text: `File: ${fileName}\n\`\`\`${ext}\n${fileText}\n\`\`\`` });
    }
    if (message.trim()) {
      userContent.push({ type: 'text', text: message });
    } else if (!fileText && imageData) {
      userContent.push({ type: 'text', text: 'What do you see in this image?' });
    }

    const claudeMessages: Anthropic.MessageParam[] = [
      ...recentHistory.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: userContent as Anthropic.ContentBlockParam[] },
    ];

    // First call — may use write_memory tool
    const completion = await anthropic.messages.create({
      model,
      max_tokens: 8096,
      system: systemPrompt,
      tools: [WRITE_MEMORY_TOOL],
      messages: claudeMessages,
    });

    let reply = '';
    let memoryWritten = false;

    if (completion.stop_reason === 'tool_use') {
      const toolBlock = completion.content.find(b => b.type === 'tool_use') as Anthropic.ToolUseBlock | undefined;

      if (toolBlock?.name === 'write_memory') {
        const input = toolBlock.input as { fact: string; importance: number };

        try {
          const memEmbedding = await embed(input.fact);
          await supabase.from('memories').insert({
            fact: input.fact,
            importance: Math.min(5, Math.max(1, input.importance)),
            source_conversation: conversationId,
            embedding: memEmbedding,
          });
          memoryWritten = true;
        } catch (e) {
          console.error('Memory write failed:', e);
        }

        // Second call with tool result → final reply
        const followUp = await anthropic.messages.create({
          model,
          max_tokens: 8096,
          system: systemPrompt,
          tools: [WRITE_MEMORY_TOOL],
          messages: [
            ...claudeMessages,
            { role: 'assistant', content: completion.content },
            {
              role: 'user',
              content: [{
                type: 'tool_result' as const,
                tool_use_id: toolBlock.id,
                content: memoryWritten ? 'Memory saved.' : 'Memory save failed.',
              }],
            },
          ],
        });

        reply = followUp.content
          .filter(b => b.type === 'text')
          .map(b => (b as Anthropic.TextBlock).text)
          .join('');
      }
    } else {
      reply = completion.content
        .filter(b => b.type === 'text')
        .map(b => (b as Anthropic.TextBlock).text)
        .join('');
    }

    const userMessageContent = message.trim()
      ? fileName ? `[${fileName}] ${message}` : message
      : `[${fileName || 'file uploaded'}]`;

    await supabase.from('messages').insert([
      { conversation_id: conversationId, role: 'user',      content: userMessageContent, embedding },
      { conversation_id: conversationId, role: 'assistant', content: reply },
    ]);

    return NextResponse.json({ reply, memoryWritten });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Chat route error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
