import { NextResponse } from 'next/server';

interface ModelOption {
  id: string;
  label: string;
}

const FALLBACK_MODELS: ModelOption[] = [
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
  { id: 'claude-sonnet-4-6',         label: 'Sonnet 4.6' },
  { id: 'claude-opus-4-8',           label: 'Opus 4.8' },
  { id: 'claude-fable-5',            label: 'Fable 5' },
];

const EXCLUDE = ['instant', 'mythos', 'preview', '2024', '2023'];

function labelFor(id: string): string {
  if (id.includes('fable-5'))    return 'Fable 5';
  if (id.includes('opus-4-8'))   return 'Opus 4.8';
  if (id.includes('opus-4-7'))   return 'Opus 4.7';
  if (id.includes('opus-4-6'))   return 'Opus 4.6';
  if (id.includes('opus'))       return 'Opus';
  if (id.includes('sonnet-4-6')) return 'Sonnet 4.6';
  if (id.includes('sonnet'))     return 'Sonnet';
  if (id.includes('haiku-4-5'))  return 'Haiku 4.5';
  if (id.includes('haiku'))      return 'Haiku';
  return id;
}

export async function GET() {
  try {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      next: { revalidate: 3600 },
    });

    if (!res.ok) throw new Error(`${res.status}`);

    const json = await res.json();

    const models: ModelOption[] = (json.data ?? [])
      .filter((m: { id: string }) =>
        m.id.startsWith('claude-') &&
        !EXCLUDE.some(pat => m.id.includes(pat))
      )
      .map((m: { id: string }) => ({
        id: m.id,
        label: labelFor(m.id),
      }));

    return NextResponse.json({ models: models.length ? models : FALLBACK_MODELS });
  } catch {
    return NextResponse.json({ models: FALLBACK_MODELS });
  }
}
