import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getAllowedUserId } from '@/lib/auth';

// GET — return all saved titles
export async function GET(req: NextRequest) {
  const userId = await getAllowedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data, error } = await getServiceClient()
    .from('conversation_titles')
    .select('conversation_id, title')
    .eq('user_id', userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ titles: data });
}

// POST — upsert a title for a conversation
export async function POST(req: NextRequest) {
  const userId = await getAllowedUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);

  if (!body?.conversationId || !body?.title) {
    return NextResponse.json({ error: 'conversationId and title are required' }, { status: 400 });
  }

  const { conversationId, title } = body;

  const supabase = getServiceClient();

  // Don't let one user rename another user's conversation.
  const { data: existing } = await supabase
    .from('conversation_titles')
    .select('user_id')
    .eq('conversation_id', conversationId)
    .maybeSingle();
  if (existing && existing.user_id !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { error } = await supabase
    .from('conversation_titles')
    .upsert(
      { conversation_id: conversationId, user_id: userId, title: title.trim(), updated_at: new Date().toISOString() },
      { onConflict: 'conversation_id' }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
