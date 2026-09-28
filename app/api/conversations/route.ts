import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';
import { getAllowedUserId } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const userId = await getAllowedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const supabase = getServiceClient();

    const { data, error } = await supabase.rpc('get_conversations', {
      limit_count: 50,
      p_user_id: userId,
    });

    if (error) throw error;

    return NextResponse.json({ conversations: data ?? [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
