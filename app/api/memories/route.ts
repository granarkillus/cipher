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
    const { data, error } = await supabase
      .from('memories')
      .select('id, fact, importance, category, created_at')
      .eq('user_id', userId)
      .order('importance', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ memories: data ?? [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
