import type { Market } from './types';

export type EventKind = 'shopping' | 'country' | 'gaming' | 'payday';

export interface CalEvent {
   id: string;
   title: string;
   kind: EventKind;
   start: string;
   end?: string;
   /** Markets it applies to; undefined means all. */
   markets?: Market[];
   /** Estimated date: school holidays vary by region, sales by retailer. */
   approx?: boolean;
   /** Big moments get the countdown banner and lead-time advice. */
   big?: boolean;
   note?: string;
}

/**
 * Oct 2026 to Sep 2027, checked 26 Sep 2026 against Valve, Amazon, The Game Awards, Rockstar and
 * school-holiday listings. "approx" dates are still estimates and should be checked before planning.
 */
export const EVENTS: CalEvent[] = [
   // Shopping
   { id: 'prime-oct', title: 'Prime Big Deal Days', kind: 'shopping', start: '2026-10-06', end: '2026-10-07', markets: ['DE', 'SE'] },
   { id: 'singles', title: "Singles' Day", kind: 'shopping', start: '2026-11-11' },
   { id: 'black-week', title: 'Black Week', kind: 'shopping', start: '2026-11-23', end: '2026-11-29', note: 'Nordic retailers run the whole week' },
   { id: 'black-friday', title: 'Black Friday', kind: 'shopping', start: '2026-11-27', big: true },
   { id: 'cyber-monday', title: 'Cyber Monday', kind: 'shopping', start: '2026-11-30' },
   { id: 'xmas-order', title: 'Last orders before Christmas', kind: 'shopping', start: '2026-12-16', approx: true, note: 'Typical last day for delivery by Dec 24' },
   { id: 'xmas', title: 'Christmas Eve', kind: 'shopping', start: '2026-12-24', big: true, note: 'The main gift day in FI, SE and DE' },
   { id: 'mellandagsrea', title: 'Mellandagsrea', kind: 'shopping', start: '2026-12-26', end: '2026-12-31', markets: ['SE'] },
   { id: 'jan-sales', title: 'January sales', kind: 'shopping', start: '2027-01-02', end: '2027-01-15', approx: true },
   { id: 'valentine', title: "Valentine's Day", kind: 'shopping', start: '2027-02-14' },
   { id: 'easter', title: 'Easter', kind: 'shopping', start: '2027-03-26', end: '2027-03-29' },
   { id: 'prime-jul', title: 'Prime Day', kind: 'shopping', start: '2027-07-13', end: '2027-07-14', markets: ['DE', 'SE'], approx: true },
   { id: 'bts-shop', title: 'Back-to-school shopping', kind: 'shopping', start: '2027-07-26', end: '2027-08-15', approx: true, big: true, note: 'Students buying their first gaming PC' },

   // Country: school holidays (vary by region)
   { id: 'fi-syysloma', title: 'Syysloma (autumn break)', kind: 'country', start: '2026-10-12', end: '2026-10-16', markets: ['FI'], note: 'Week 42 in all Finnish schools' },
   { id: 'se-hostlov', title: 'Höstlov (autumn break)', kind: 'country', start: '2026-10-26', end: '2026-10-30', markets: ['SE'], note: 'Week 44 in most municipalities' },
   { id: 'de-herbst', title: 'Herbstferien (varies by state)', kind: 'country', start: '2026-10-12', end: '2026-11-06', markets: ['DE'], approx: true },
   { id: 'fi-joulu', title: 'Joululoma (Christmas break)', kind: 'country', start: '2026-12-19', end: '2027-01-06', markets: ['FI'], approx: true },
   { id: 'se-jullov', title: 'Jullov (Christmas break)', kind: 'country', start: '2026-12-19', end: '2027-01-07', markets: ['SE'], approx: true },
   { id: 'de-weihnacht', title: 'Weihnachtsferien', kind: 'country', start: '2026-12-23', end: '2027-01-06', markets: ['DE'], approx: true },
   { id: 'se-sportlov', title: 'Sportlov (winter break)', kind: 'country', start: '2027-02-15', end: '2027-03-12', markets: ['SE'], approx: true, note: 'Weeks 7–10 depending on region' },
   { id: 'fi-hiihto', title: 'Hiihtoloma (winter break)', kind: 'country', start: '2027-02-22', end: '2027-03-12', markets: ['FI'], approx: true, note: 'Weeks 8–10 depending on region' },
   { id: 'de-oster', title: 'Osterferien', kind: 'country', start: '2027-03-22', end: '2027-04-09', markets: ['DE'], approx: true },
   { id: 'fi-kesa', title: 'Summer holiday starts', kind: 'country', start: '2027-06-01', markets: ['FI'], approx: true, big: true },
   { id: 'se-sommar', title: 'Sommarlov starts', kind: 'country', start: '2027-06-11', markets: ['SE'], approx: true, big: true },
   { id: 'de-sommer', title: 'Sommerferien (staggered by state)', kind: 'country', start: '2027-06-24', end: '2027-09-10', markets: ['DE'], approx: true },
   { id: 'fi-school', title: 'School starts', kind: 'country', start: '2027-08-11', markets: ['FI'], approx: true },
   { id: 'se-school', title: 'Skolstart', kind: 'country', start: '2027-08-17', markets: ['SE'], approx: true },

   // Gaming
   { id: 'steam-autumn', title: 'Steam Autumn Sale', kind: 'gaming', start: '2026-10-01', end: '2026-10-08' },
   { id: 'next-fest-oct', title: 'Steam Next Fest', kind: 'gaming', start: '2026-10-19', end: '2026-10-26', note: 'Free demos of upcoming games' },
   { id: 'gta6', title: 'GTA VI launch', kind: 'gaming', start: '2026-11-19', big: true, note: 'Consoles first; huge attention on gaming content' },
   { id: 'tga', title: 'The Game Awards', kind: 'gaming', start: '2026-12-10' },
   { id: 'steam-winter', title: 'Steam Winter Sale', kind: 'gaming', start: '2026-12-17', end: '2027-01-04' },
   { id: 'next-fest-feb', title: 'Steam Next Fest', kind: 'gaming', start: '2027-02-22', end: '2027-03-01', approx: true },
   { id: 'steam-spring', title: 'Steam Spring Sale', kind: 'gaming', start: '2027-03-18', end: '2027-03-25', approx: true },
   { id: 'sgf', title: 'Summer Game Fest', kind: 'gaming', start: '2027-06-04', approx: true },
   { id: 'steam-summer', title: 'Steam Summer Sale', kind: 'gaming', start: '2027-06-24', end: '2027-07-08', approx: true },
   { id: 'assembly', title: 'Assembly Summer (Helsinki LAN)', kind: 'gaming', start: '2027-07-29', end: '2027-08-01', markets: ['FI'], approx: true },
   { id: 'gamescom', title: 'Gamescom (Cologne)', kind: 'gaming', start: '2027-08-25', end: '2027-08-29', markets: ['DE'], approx: true, big: true },
];

/** Paydays: the 25th in Sweden, the last weekday of the month in Finland and Germany. */
export function paydays(year: number, month: number): CalEvent[] {
   const pad = (n: number) => String(n).padStart(2, '0');
   const last = new Date(Date.UTC(year, month + 1, 0));
   while (last.getUTCDay() === 0 || last.getUTCDay() === 6) last.setUTCDate(last.getUTCDate() - 1);
   const se = new Date(Date.UTC(year, month, 25));
   while (se.getUTCDay() === 0 || se.getUTCDay() === 6) se.setUTCDate(se.getUTCDate() - 1);
   return [
      { id: `pay-se-${year}-${month}`, title: 'Payday', kind: 'payday', start: se.toISOString().slice(0, 10), markets: ['SE'] },
      { id: `pay-fide-${year}-${month}`, title: 'Payday', kind: 'payday', start: `${year}-${pad(month + 1)}-${pad(last.getUTCDate())}`, markets: ['FI', 'DE'] },
   ];
}

/** Recommended lead times for a creator post around a big moment. */
export const LEAD = { outreachDays: 28, postDays: 7 };
