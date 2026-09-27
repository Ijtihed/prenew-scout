import { GENERATED } from './mock';
import type { Creator } from './types';

/** A few saved creators so Saved isn't empty on first run. Drawn from generated creators so they exist
 * whatever real data has loaded. */

const find = (pred: (c: Creator) => boolean, skip: Creator[] = []) => GENERATED.find((c) => pred(c) && !skip.includes(c));

const saved1 = find((c) => c.market === 'SE' && c.hiddenGem);
const saved2 = find((c) => c.market === 'DE' && c.tier === 'mid');
const saved3 = find((c) => c.market === 'FI' && c.platform === 'youtube');

export const SAMPLE_SAVED = [saved1, saved2, saved3].filter((c): c is Creator => !!c).map((c) => c.id);
