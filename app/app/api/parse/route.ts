import { NextResponse } from 'next/server';
import { GAME_NAMES } from '@/lib/data/games';
import { chat } from '@/lib/server/llm';


const SCHEMA = {
   type: 'object',
   properties: {
      markets: { type: 'array', items: { enum: ['FI', 'SE', 'DE', 'DK', 'FR', 'NL', 'BE', 'AT', 'PL', 'EE', 'LV', 'LT'] } },
      platforms: { type: 'array', items: { enum: ['tiktok', 'youtube'] } },
      tiers: { type: 'array', items: { enum: ['nano', 'micro', 'mid', 'macro'] } },
      games: { type: 'array', items: { enum: GAME_NAMES } },
      maxPrice: { type: ['number', 'null'] },
      minViews: { type: ['number', 'null'] },
      directOnly: { type: 'boolean' },
      gemsOnly: { type: 'boolean' },
      sort: { enum: ['score', 'growth', 'views', 'price', 'er'] },
   },
   required: ['markets', 'platforms', 'tiers', 'games', 'maxPrice', 'minViews', 'directOnly', 'gemsOnly', 'sort'],
};

const SYSTEM = `You turn a marketer's search for gaming influencers into filters. Platforms: TikTok and YouTube Shorts. Markets: FI Finland, SE Sweden, DE Germany.
Tiers by followers: nano 500-10K, micro 10K-100K, mid 100K-500K, macro 500K+. maxPrice is euros per post.
Map related games or franchises to the listed game names (e.g. "block games" -> Minecraft, "cod" -> Call of Duty, "souls games" -> Elden Ring).
"growth", "rising", "trending" means sort "growth".
Only fill a field when the user clearly asked for it. Anything not mentioned must be [] , null or false. Never guess prices or view counts. sort defaults to "score".`;

export async function POST(req: Request) {
   const { q } = (await req.json()) as { q?: string };
   if (!q?.trim()) return NextResponse.json({ error: 'empty' }, { status: 400 });
   try {
      const out = await chat(
         [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: q },
         ],
         { json: SCHEMA, temperature: 0, timeoutMs: 20000 }
      );
      return NextResponse.json(JSON.parse(out || '{}'));
   } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 503 });
   }
}
