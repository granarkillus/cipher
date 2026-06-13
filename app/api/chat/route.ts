import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getServiceClient } from '@/lib/supabase';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TEXT_EXTENSIONS = ['txt', 'md', 'csv', 'json', 'ts', 'tsx', 'js', 'jsx', 'py', 'sql'];
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

const GITHUB_OWNER  = 'granarkillus';
const GITHUB_REPO   = 'cipher';
const GITHUB_BRANCH = 'main';

// ── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'write_memory',
    description: 'Write a new memory or fact to permanent memory store. Use when Markham corrects something, shares something new and important, or explicitly asks you to remember something. Do NOT use for things already in core context.',
    input_schema: {
      type: 'object' as const,
      properties: {
        fact:       { type: 'string',  description: 'The fact to store. Concise, specific, a statement about Markham.' },
        importance: { type: 'integer', description: 'Importance 1-5. 5=critical. 3=useful. 1=minor.', minimum: 1, maximum: 5 },
      },
      required: ['fact', 'importance'],
    },
  },
  {
    name: 'query_cipher_db',
    description: 'Query the Cipher Supabase database directly. Use to check message counts, list memories, search memory content, or get recent conversation stats. Always use this when asked about database contents.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query_type: {
          type: 'string',
          enum: ['stats', 'memories_list', 'memories_search', 'messages_search', 'recent_conversations'],
          description: 'stats=counts. memories_list=all memories. memories_search=search memory facts. messages_search=search raw message content. recent_conversations=latest messages.',
        },
        search_term: {
          type: 'string',
          description: 'Required for memories_search. Text to search for in memory facts.',
        },
        limit: {
          type: 'integer',
          description: 'Max results to return (default 10, max 50).',
          minimum: 1,
          maximum: 50,
        },
      },
      required: ['query_type'],
    },
  },
  {
    name: 'read_github_file',
    description: 'Read the current contents of a file in the cipher GitHub repo. Use this before modifying any file so you have the exact current content.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'File path relative to repo root, e.g. "app/page.tsx"' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_github_file',
    description: 'Write or update a file in the cipher GitHub repo and commit the change. Always read the file first. Always write the COMPLETE file. After writing, call check_vercel_deployment automatically.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path:           { type: 'string', description: 'File path relative to repo root.' },
        content:        { type: 'string', description: 'Complete file content. Never partial.' },
        commit_message: { type: 'string', description: 'Short commit message.' },
      },
      required: ['path', 'content', 'commit_message'],
    },
  },
  {
    name: 'check_vercel_deployment',
    description: 'Check the status of the latest Vercel deployment. Always call this after write_github_file. Report SHA and deployment state together.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
];

// ── Tool execution ────────────────────────────────────────────────────────────

async function execWriteMemory(
  input: { fact: string; importance: number },
  conversationId: string,
  supabase: ReturnType<typeof getServiceClient>
): Promise<{ result: string; memoryWritten: boolean }> {
  try {
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.VOYAGE_API_KEY}` },
      body: JSON.stringify({ input: [input.fact.slice(0, 16000)], model: 'voyage-4-lite', input_type: 'document', output_dimension: 1024 }),
    });
    const emb = res.ok ? (await res.json()).data[0].embedding : null;
    await supabase.from('memories').insert({
      fact: input.fact,
      importance: Math.min(5, Math.max(1, input.importance)),
      source_conversation: conversationId,
      embedding: emb,
    });
    return { result: 'Memory saved.', memoryWritten: true };
  } catch (e) {
    return { result: `Memory save failed: ${e}`, memoryWritten: false };
  }
}

async function execQueryCipherDb(
  input: { query_type: string; search_term?: string; limit?: number },
  supabase: ReturnType<typeof getServiceClient>
): Promise<string> {
  const limit = Math.min(input.limit || 10, 50);
  try {
    switch (input.query_type) {
      case 'stats': {
        const [msgResult, memResult] = await Promise.all([
          supabase.from('messages').select('*', { count: 'exact', head: true }),
          supabase.from('memories').select('*', { count: 'exact', head: true }),
        ]);
        return JSON.stringify({
          total_messages: msgResult.count ?? 0,
          total_memories: memResult.count ?? 0,
        });
      }
      case 'memories_list': {
        const { data, error } = await supabase
          .from('memories')
          .select('id, fact, importance, created_at')
          .order('importance', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(limit);
        if (error) return `Error: ${error.message}`;
        return JSON.stringify(data);
      }
      case 'memories_search': {
        if (!input.search_term) return 'Error: search_term required for memories_search';
        const { data, error } = await supabase
          .from('memories')
          .select('id, fact, importance, created_at')
          .ilike('fact', `%${input.search_term}%`)
          .limit(limit);
        if (error) return `Error: ${error.message}`;
        return JSON.stringify(data);
      }
      case 'recent_conversations': {
        const { data, error } = await supabase
          .from('messages')
          .select('conversation_id, role, content, created_at')
          .order('created_at', { ascending: false })
          .limit(limit);
        if (error) return `Error: ${error.message}`;
        return JSON.stringify(data);
      }
      case 'messages_search': {
        if (!input.search_term) return 'Error: search_term required for messages_search';
        const { data, error } = await supabase
          .from('messages')
          .select('role, content, created_at, conversation_id')
          .ilike('content', `%${input.search_term}%`)
          .order('created_at', { ascending: false })
          .limit(limit);
        if (error) return `Error: ${error.message}`;
        return JSON.stringify(data);
      }
      default:
        return `Unknown query_type: ${input.query_type}`;
    }
  } catch (e) {
    return `Query failed: ${e}`;
  }
}

async function execReadGithubFile(input: { path: string }): Promise<string> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${input.path}?ref=${GITHUB_BRANCH}`,
      { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } }
    );
    if (!res.ok) return `Error: ${res.status} ${await res.text()}`;
    const data = await res.json();
    return JSON.stringify({ content: Buffer.from(data.content, 'base64').toString('utf8'), sha: data.sha });
  } catch (e) { return `Error: ${e}`; }
}

async function execWriteGithubFile(input: { path: string; content: string; commit_message: string }): Promise<string> {
  try {
    const getRes = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${input.path}?ref=${GITHUB_BRANCH}`,
      { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } }
    );
    const sha = getRes.ok ? (await getRes.json()).sha : undefined;

    const body: Record<string, string> = {
      message: input.commit_message,
      content: Buffer.from(input.content, 'utf8').toString('base64'),
      branch: GITHUB_BRANCH,
    };
    if (sha) body.sha = sha;

    const putRes = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${input.path}`,
      { method: 'PUT', headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    if (!putRes.ok) return `Error: ${putRes.status} ${await putRes.text()}`;
    const result = await putRes.json();
    return `Committed. SHA: ${result.content?.sha?.slice(0, 7)}`;
  } catch (e) { return `Error: ${e}`; }
}

async function execCheckVercelDeployment(): Promise<string> {
  try {
    const res = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${process.env.VERCEL_PROJECT_ID}&limit=1`,
      { headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` } }
    );
    if (!res.ok) return `Error: ${res.status}`;
    const data = await res.json();
    const d = data.deployments?.[0];
    if (!d) return 'No deployments found.';
    return JSON.stringify({ state: d.state, readyState: d.readyState, created: new Date(d.createdAt).toISOString(), url: d.url, commit: d.meta?.githubCommitMessage || 'unknown' });
  } catch (e) { return `Error: ${e}`; }
}

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  conversationId: string,
  supabase: ReturnType<typeof getServiceClient>
): Promise<{ result: string; memoryWritten?: boolean }> {
  switch (name) {
    case 'write_memory':
      return execWriteMemory(input as { fact: string; importance: number }, conversationId, supabase);
    case 'query_cipher_db':
      return { result: await execQueryCipherDb(input as { query_type: string; search_term?: string; limit?: number }, supabase) };
    case 'read_github_file':
      return { result: await execReadGithubFile(input as { path: string }) };
    case 'write_github_file':
      return { result: await execWriteGithubFile(input as { path: string; content: string; commit_message: string }) };
    case 'check_vercel_deployment':
      return { result: await execCheckVercelDeployment() };
    default:
      return { result: `Unknown tool: ${name}` };
  }
}

// ── Embedding ─────────────────────────────────────────────────────────────────

async function embed(text: string): Promise<number[]> {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.VOYAGE_API_KEY}` },
    body: JSON.stringify({ input: [text.slice(0, 16000)], model: 'voyage-4-lite', input_type: 'document', output_dimension: 1024 }),
  });
  if (!res.ok) throw new Error(`Voyage ${res.status}: ${await res.text()}`);
  return (await res.json()).data[0].embedding;
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    let message = '', conversationId = '', model = 'claude-haiku-4-5-20251001';
    let imageData: string | null = null;
    let imageMediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | null = null;
    let fileText: string | null = null, fileName: string | null = null;

    if (contentType.includes('multipart/form-data')) {
      const fd = await request.formData();
      message        = (fd.get('message') as string) || '';
      conversationId = (fd.get('conversationId') as string) || '';
      model          = (fd.get('model') as string) || 'claude-haiku-4-5-20251001';
      const file     = fd.get('file') as File | null;
      if (file) {
        fileName = file.name;
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        if (IMAGE_TYPES.includes(file.type)) {
          imageData = Buffer.from(await file.arrayBuffer()).toString('base64');
          imageMediaType = file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
        } else if (TEXT_EXTENSIONS.includes(ext) || file.type.startsWith('text/')) {
          fileText = await file.text();
          if (fileText.length > 100000) fileText = fileText.slice(0, 100000) + '\n\n[truncated]';
        } else if (file.type === 'application/pdf') {
          imageData = Buffer.from(await file.arrayBuffer()).toString('base64');
          fileText  = '__PDF__';
        }
      }
    } else {
      const body     = await request.json();
      message        = body.message || '';
      conversationId = body.conversationId || '';
      model          = body.model || 'claude-haiku-4-5-20251001';
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

    const coreSection = coreFacts?.content ? `${coreFacts.content}\n\n` : '';
    const memSection  = similarMemories?.length
      ? `Stored memories:\n${similarMemories.map((m: { fact: string; importance: number }) => `- [${m.importance}] ${m.fact}`).join('\n')}\n\n`
      : '';
    const ctxSection  = similarMessages?.length
      ? `Relevant past context:\n${similarMessages.map((m: { role: string; content: string }) => `[${m.role}]: ${m.content.slice(0, 300)}`).join('\n')}\n\n`
      : '';

    const systemPrompt = `${coreSection}You are Cipher, a personal AI with access to stored memories, core facts, direct database access, and tools to read/write the cipher GitHub repo.

${memSection}${ctxSection}TOOLS:
- write_memory: store a new memory when Markham corrects you or shares something new
- query_cipher_db: query the Supabase database directly — use for message counts, memory lists, searches
- read_github_file: read any file in the cipher repo before modifying it
- write_github_file: commit a file directly to GitHub (triggers Vercel deploy) — always read first, always write complete file, always call check_vercel_deployment after
- check_vercel_deployment: check deploy status — always call after write_github_file, report SHA + state together

RULES:
- Never report a tool action complete without verified result
- After write_github_file: always call check_vercel_deployment, report SHA + deployment state in one message
- For database questions: always use query_cipher_db instead of guessing
- For code changes: read → modify complete file → write → check deployment

Rules for code in chat: wrap in markdown code blocks with language. Never truncate.
Be direct. Match the register. Don't pad.`;

    type TextBlock     = { type: 'text'; text: string };
    type ImageBlock    = { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };
    type DocumentBlock = { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } };
    type ContentBlock  = TextBlock | ImageBlock | DocumentBlock;

    const userContent: ContentBlock[] = [];
    if (imageData && imageMediaType)
      userContent.push({ type: 'image', source: { type: 'base64', media_type: imageMediaType, data: imageData } });
    else if (imageData && fileText === '__PDF__')
      userContent.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: imageData } });
    if (fileText && fileText !== '__PDF__')
      userContent.push({ type: 'text', text: `File: ${fileName}\n\`\`\`${fileName?.split('.').pop() || 'text'}\n${fileText}\n\`\`\`` });
    if (message.trim())
      userContent.push({ type: 'text', text: message });
    else if (!fileText && imageData)
      userContent.push({ type: 'text', text: 'What do you see in this image?' });

    const claudeMessages: Anthropic.MessageParam[] = [
      ...recentHistory.map((m: { role: string; content: string }) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: userContent as Anthropic.ContentBlockParam[] },
    ];

    // Agentic tool loop
    let currentMessages = [...claudeMessages];
    let reply = '';
    let memoryWritten = false;
    let iterations = 0;
    const MAX_ITERATIONS = 10;

    while (iterations < MAX_ITERATIONS) {
      iterations++;
      const completion = await anthropic.messages.create({
        model,
        max_tokens: 8096,
        system: systemPrompt,
        tools: TOOLS,
        messages: currentMessages,
      });

      const textBlocks = completion.content.filter(b => b.type === 'text') as Anthropic.TextBlock[];
      if (textBlocks.length) reply = textBlocks.map(b => b.text).join('');

      if (completion.stop_reason !== 'tool_use') break;

      const toolUseBlocks = completion.content.filter(b => b.type === 'tool_use') as Anthropic.ToolUseBlock[];
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolBlock of toolUseBlocks) {
        const { result, memoryWritten: mw } = await executeTool(
          toolBlock.name,
          toolBlock.input as Record<string, unknown>,
          conversationId,
          supabase
        );
        if (mw) memoryWritten = true;
        toolResults.push({ type: 'tool_result', tool_use_id: toolBlock.id, content: result });
      }

      currentMessages = [
        ...currentMessages,
        { role: 'assistant', content: completion.content },
        { role: 'user',      content: toolResults },
      ];
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
