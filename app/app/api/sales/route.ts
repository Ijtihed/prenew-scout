import { NextResponse } from 'next/server';
import { getDb } from '@/lib/server/db';

/**
 * Webhook for Prenew's shop: POST one order that came through a tracked link
 * ({ orderId, slug | utmCampaign, amount?, pcs?, at? }). Set SCOUT_WEBHOOK_SECRET and send it as
 * the x-scout-secret header; without the env var it's open, which is only fine locally.
 */
export async function POST(req: Request) {
   const secret = process.env.SCOUT_WEBHOOK_SECRET;
   if (secret && req.headers.get('x-scout-secret') !== secret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
   const b = (await req.json()) as { orderId?: string; slug?: string; utmCampaign?: string; amount?: number; pcs?: number; at?: string };
   const slug = (b.slug ?? b.utmCampaign ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '');
   if (!b.orderId || !slug) return NextResponse.json({ error: 'orderId and slug required' }, { status: 400 });
   getDb()
      .prepare('INSERT OR REPLACE INTO sales (order_id, slug, amount, pcs, at) VALUES (?, ?, ?, ?, ?)')
      .run(String(b.orderId), slug, b.amount ?? null, b.pcs ?? 1, b.at ?? new Date().toISOString());
   return NextResponse.json({ ok: true });
}
