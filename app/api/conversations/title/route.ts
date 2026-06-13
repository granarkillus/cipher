import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET — return all saved titles
export async function GET() {
  const { data, error } = await supabase
    .from('conversation_titles')
    .select('conversation_id, title');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ titles: data });
}

// POST — upsert a title for a conversation
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body?.conversationId || !body?.title) {
    return NextResponse.json({ error: 'conversationId and title are required' }, { status: 400 });
  }

  const { conversationId, title } = body;

  const { error } = await supabase
    .from('conversation_titles')
    .upsert(
      { conversation_id: conversationId, title: title.trim(), updated_at: new Date().toISOString() },
      { onConflict: 'conversation_id' }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
