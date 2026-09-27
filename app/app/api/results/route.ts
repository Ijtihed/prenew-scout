import { NextResponse } from 'next/server';
import { getDb } from '@/lib/server/db';

/** Real tracked-link results for one creator slug: clicks and sales, total and per day. */
export async function GET(req: Request) {
   const slug = new URL(req.url).searchParams.get('slug');
   if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
   const db = getDb();
   const clicks = (db.prepare('SELECT COUNT(*) AS n FROM clicks WHERE slug = ?').get(slug) as { n: number }).n;
   const sales = db.prepare('SELECT COUNT(*) AS orders, COALESCE(SUM(pcs), 0) AS pcs, COALESCE(SUM(amount), 0) AS revenue FROM sales WHERE slug = ?').get(slug) as {
      orders: number;
      pcs: number;
      revenue: number;
   };
   const byDay = db
      .prepare(
         `SELECT day, SUM(c) AS clicks, SUM(s) AS pcs FROM (
            SELECT substr(at, 1, 10) AS day, 1 AS c, 0 AS s FROM clicks WHERE slug = ?
            UNION ALL SELECT substr(at, 1, 10), 0, pcs FROM sales WHERE slug = ?
          ) GROUP BY day ORDER BY day`
      )
      .all(slug, slug);
   return NextResponse.json({ slug, clicks, ...sales, byDay });
}
