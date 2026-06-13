import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getServiceClient } from '@/lib/supabase';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TEXT_EXTENSIONS = ['txt', 'md', 'csv', 'json', 'ts', 'tsx', 'js', 'jsx', 'py', 'sql'];
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

const GITHUB_OWNER = 'granarkillus';
const GITHUB_REPO  = 'cipher';
const GITHUB_BRANCH = 'main';

// ── Tool definitions ────────────────────────────────────────────────────────

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
    name: 'read_github_file',
    description: 'Read the current contents of a file in the cipher GitHub repo. Use this before modifying any file so you have the exact current content.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'File path relative to repo root, e.g. "app/page.tsx" or "app/api/chat/route.ts"' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_github_file',
    description: 'Write or update a file in the cipher GitHub repo and commit the change. This triggers a Vercel auto-deploy. Always read the file first before writing.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path:           { type: 'string', description: 'File path relative to repo root, e.g. "app/page.tsx"' },
        content:        { type: 'string', description: 'Complete file content to write. Must be the full file, never partial.' },
        commit_message: { type: 'string', description: 'Short commit message describing the change.' },
      },
      required: ['path', 'content', 'commit_message'],
    },
  },
  {
    name: 'check_vercel_deployment',
    description: 'Check the status of the latest Vercel deployment for the cipher project. Use after committing a file to confirm it deployed successfully.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
];

// ── Tool execution ───────────────────────────────────────────────────────────

async function execWriteMemory(
  input: { fact: string; importance: number },
  conversationId: string,
  supabase: ReturnType<typeof getServiceClient>
): Promise<string> {
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
    return 'Memory saved.';
  } catch (e) {
    return `Memory save failed: ${e}`;
  }
}

async function execReadGithubFile(input: { path: string }): Promise<string> {
  try {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${input.path}?ref=${GITHUB_BRANCH}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!res.ok) return `Error reading file: ${res.status} ${await res.text()}`;
    const data = await res.json();
    const content = Buffer.from(data.content, 'base64').toString('utf8');
    return JSON.stringify({ content, sha: data.sha });
  } catch (e) {
    return `Error: ${e}`;
  }
}

async function execWriteGithubFile(input: { path: string; content: string; commit_message: string }): Promise<string> {
  try {
    // Get current SHA first
    const getUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${input.path}?ref=${GITHUB_BRANCH}`;
    const getRes = await fetch(getUrl, {
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    let sha: string | undefined;
    if (getRes.ok) {
      const existing = await getRes.json();
      sha = existing.sha;
    }

    const putUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${input.path}`;
    const body: Record<string, string> = {
      message: input.commit_message,
      content: Buffer.from(input.content, 'utf8').toString('base64'),
      branch: GITHUB_BRANCH,
    };
    if (sha) body.sha = sha;

    const putRes = await fetch(putUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!putRes.ok) return `Error writing file: ${putRes.status} ${await putRes.text()}`;
    const result = await putRes.json();
    return `File committed. SHA: ${result.content?.sha?.slice(0, 7)}. Vercel deploy triggered.`;
  } catch (e) {
    return `Error: ${e}`;
  }
}

async function execCheckVercelDeployment(): Promise<string> {
  try {
    const url = `https://api.vercel.com/v6/deployments?projectId=${process.env.VERCEL_PROJECT_ID}&limit=1`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` },
    });
    if (!res.ok) return `Error checking deployment: ${res.status}`;
    const data = await res.json();
    const d = data.deployments?.[0];
    if (!d) return 'No deployments found.';
    return JSON.stringify({
      state:   d.state,
      ready:   d.readyState,
      created: new Date(d.createdAt).toISOString(),
      url:     d.url,
      commit:  d.meta?.githubCommitMessage || 'unknown',
    });
  } catch (e) {
    return `Error: ${e}`;
  }
}

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  conversationId: string,
  supabase: ReturnType<typeof getServiceClient>
): Promise<{ result: string; memoryWritten?: boolean }> {
  switch (name) {
    case 'write_memory': {
      const r = await execWriteMemory(input as { fact: string; importance: number }, conversationId, supabase);
      return { result: r, memoryWritten: r === 'Memory saved.' };
    }
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

// ── Embedding ────────────────────────────────────────────────────────────────

async function embed(text: string): Promise<number[]> {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.VOYAGE_API_KEY}` },
    body: JSON.stringify({ input: [text.slice(0, 16000)], model: 'voyage-4-lite', input_type: 'document', output_dimension: 1024 }),
  });
  if (!res.ok) throw new Error(`Voyage ${res.status}: ${await res.text()}`);
  return (await res.json()).data[0].embedding;
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    let message = '', conversationId = '', model = 'claude-haiku-4-5-20251001';
    let imageData: string | null = null;
    let imageMediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | null = null;
    let fileText: string | null = null, fileName: string | null = null;

    if (contentType.includes('multipart/form-data')) {
      const fd = await request.formData();
      message       = (fd.get('message') as string) || '';
      conversationId = (fd.get('conversationId') as string) || '';
      model         = (fd.get('model') as string) || 'claude-haiku-4-5-20251001';
      const file    = fd.get('file') as File | null;

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

    const coreSection = coreFacts?.content ? `${coreFacts.content}\n\n` : '';
    const memSection  = similarMemories?.length
      ? `Stored memories:\n${similarMemories.map((m: { fact: string; importance: number }) => `- [${m.importance}] ${m.fact}`).join('\n')}\n\n`
      : '';
    const ctxSection  = similarMessages?.length
      ? `Relevant past context:\n${similarMessages.map((m: { role: string; content: string }) => `[${m.role}]: ${m.content.slice(0, 300)}`).join('\n')}\n\n`
      : '';

    const systemPrompt = `${coreSection}You are Cipher, a personal AI with access to stored memories, core facts, and tools to read and write the cipher GitHub repo directly.

${memSection}${ctxSection}TOOLS AVAILABLE:
- write_memory: store a new memory when Markham corrects you or shares something new
- read_github_file: read any file in the cipher repo before modifying it
- write_github_file: commit a file change directly to GitHub (triggers Vercel deploy)
- check_vercel_deployment: check if the latest deploy succeeded

RULES for code changes:
1. Always read_github_file FIRST before writing
2. Always write the COMPLETE file — never partial
3. After writing, check_vercel_deployment to confirm deploy status
4. Report back what changed and the deployment state

Rules for code blocks in chat: wrap in markdown with language specified.
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

    // Agentic tool loop — keep running until stop_reason is 'end_turn'
    let currentMessages = [...claudeMessages];
    let reply = '';
    let memoryWritten = false;
    let iterations = 0;
    const MAX_ITERATIONS = 8;

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const completion = await anthropic.messages.create({
        model,
        max_tokens: 8096,
        system: systemPrompt,
        tools: TOOLS,
        messages: currentMessages,
      });

      // Collect any text from this turn
      const textBlocks = completion.content.filter(b => b.type === 'text') as Anthropic.TextBlock[];
      if (textBlocks.length) reply = textBlocks.map(b => b.text).join('');

      if (completion.stop_reason !== 'tool_use') break;

      // Execute all tool calls in this turn
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

      // Append assistant turn + tool results and loop
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
