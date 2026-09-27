import { NextResponse } from 'next/server';
import { getDb } from '@/lib/server/db';

const SHOP = process.env.PRENEW_SHOP_URL ?? 'https://www.prenew.com/';

/** Tracked link: counts the click, then sends the viewer to Prenew with UTM tags the shop can attribute sales to. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
   const { slug } = await params;
   const clean = slug.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 64);
   if (clean) {
      getDb()
         .prepare('INSERT INTO clicks (slug, at, referrer, user_agent) VALUES (?, ?, ?, ?)')
         .run(clean, new Date().toISOString(), req.headers.get('referer'), req.headers.get('user-agent'));
   }
   const to = new URL(SHOP);
   to.searchParams.set('utm_source', 'scout');
   to.searchParams.set('utm_medium', 'creator');
   to.searchParams.set('utm_campaign', clean || 'unknown');
   return NextResponse.redirect(to, 302);
}
