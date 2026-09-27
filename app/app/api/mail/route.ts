import { NextResponse } from 'next/server';
import { getDb } from '@/lib/server/db';

interface Mail {
   creatorId?: string;
   to?: string;
   cc?: string;
   subject?: string;
   body?: string;
}

/** Records an outgoing email. Scout keeps mail in its own database and never delivers it. */
export async function POST(req: Request) {
   const m = (await req.json().catch(() => ({}))) as Mail;
   if (!m.creatorId || !m.to || !m.subject || !m.body?.trim())
      return NextResponse.json({ error: 'creatorId, to, subject and body required' }, { status: 400 });
   const at = new Date().toISOString();
   const { lastInsertRowid } = getDb()
      .prepare('INSERT INTO emails (creator_id, to_addr, cc, subject, body, at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(m.creatorId, m.to, m.cc || null, m.subject, m.body.trim(), at);
   return NextResponse.json({ id: Number(lastInsertRowid), at });
}

/** Everything sent to one creator, oldest first. */
export async function GET(req: Request) {
   const creatorId = new URL(req.url).searchParams.get('creatorId');
   if (!creatorId) return NextResponse.json({ error: 'creatorId required' }, { status: 400 });
   const rows = getDb()
      .prepare('SELECT id, to_addr AS "to", cc, subject, body, at FROM emails WHERE creator_id = ? ORDER BY at')
      .all(creatorId);
   return NextResponse.json({ emails: rows });
}
