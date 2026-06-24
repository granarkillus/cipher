import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase';

export async function GET() {
  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('memories')
      .select('id, fact, importance, category, created_at')
      .order('importance', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ memories: data ?? [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
