import { buyersPer10kFor } from '@/lib/data/mock';
import type { Creator } from '@/lib/data/types';

/** PCs one sponsored post is likely to sell. Buyers come from engaged viewers who use the code (see
 * `buyersPer10kFor`), scaled by how PC-leaning the audience is, then corrected by how real tracked links
 * performed against predictions (`salesMultiplier`). */
export function expectedPcs(c: Creator, salesMultiplier = 1) {
   // Viewers asking about PCs in the comments are the clearest buyer signal; capped so a few comments can't dominate.
   const intent = c.comments?.intent != null && c.comments.intentN >= 2 ? 1 + Math.min(0.5, c.comments.intent / 10) : 1;
   const rate = buyersPer10kFor(c.engagementRate) * (c.fit.niche / 80) * intent * salesMultiplier;
   return (c.prediction.views[1] * rate) / 10000;
}
