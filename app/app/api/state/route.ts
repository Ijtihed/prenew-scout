import { NextResponse } from 'next/server';
import { getDb } from '@/lib/server/db';

/** Team state (saved, outreach, settings) as one JSON blob per key. */
export async function GET(req: Request) {
   const key = new URL(req.url).searchParams.get('key');
   if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });
   const row = getDb().prepare('SELECT value, updated_at FROM kv WHERE key = ?').get(key) as { value: string; updated_at: string } | undefined;
   return NextResponse.json(row ? { value: row.value, updatedAt: row.updated_at } : { value: null });
}

export async function PUT(req: Request) {
   const key = new URL(req.url).searchParams.get('key');
   const { value } = (await req.json()) as { value?: string };
   if (!key || typeof value !== 'string') return NextResponse.json({ error: 'key and value required' }, { status: 400 });
   getDb()
      .prepare(
         'INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
      )
      .run(key, value, new Date().toISOString());
   return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
   const key = new URL(req.url).searchParams.get('key');
   if (key) getDb().prepare('DELETE FROM kv WHERE key = ?').run(key);
   return NextResponse.json({ ok: true });
}
