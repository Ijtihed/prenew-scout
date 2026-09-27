'use client';

import {
   Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, PolarAngleAxis, PolarGrid, Radar, RadarChart,
   ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts';
import type { Creator, FitScores } from '@/lib/data/types';
import { compact, shortDate } from '@/lib/format';
import { expectedPcs } from '@/lib/engine';

const INK = 'oklch(0.92 0 0)';
const MUTED = 'oklch(0.705 0.015 286.067)';
const GRID = 'oklch(0.274 0.006 286.033 / 0.6)';
/** Validated categorical order (CVD-safe on the dark surface) for compare overlays. */
export const SERIES = ['#3987e5', '#d95926', '#199e70', '#9085e9'];
const AXIS = { stroke: GRID, tick: { fill: MUTED, fontSize: 11 }, tickLine: false };

function Tip({ active, payload, label, fmt }: {
   active?: boolean;
   payload?: { name?: string; value?: number; color?: string }[];
   label?: string;
   fmt: (v: number) => string;
}) {
   if (!active || !payload?.length) return null;
   return (
      <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
         {label && <div className="mb-0.5 text-muted-foreground">{label}</div>}
         {payload.map((p, i) => (
            <div key={i} className="flex items-center gap-1.5">
               {payload.length > 1 && <span className="h-0.5 w-2.5 rounded" style={{ background: p.color }} />}
               {payload.length > 1 && <span className="text-muted-foreground">{p.name}</span>}
               <span className="font-medium tabular-nums">{fmt(p.value ?? 0)}</span>
            </div>
         ))}
      </div>
   );
}

export function ViewsOverTime({ c, height = 200 }: { c: Creator; height?: number }) {
   const data = [...c.posts].reverse().map((p) => ({ date: shortDate(p.date), views: p.views }));
   return (
      <ResponsiveContainer width="100%" height={height}>
         <AreaChart data={data} margin={{ top: 6, right: 6, left: -10, bottom: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="date" {...AXIS} interval={6} />
            <YAxis {...AXIS} axisLine={false} tickFormatter={compact} width={46} />
            <Tooltip content={<Tip fmt={(v) => `${compact(v)} views`} />} cursor={{ stroke: GRID }} />
            <Area type="linear" dataKey="views" stroke={INK} strokeWidth={1.5} fill={INK} fillOpacity={0.05}
               dot={false} activeDot={{ r: 4, fill: INK, stroke: '#101011', strokeWidth: 2 }} />
         </AreaChart>
      </ResponsiveContainer>
   );
}

export function EngagementDistribution({ c, height = 200 }: { c: Creator; height?: number }) {
   const rates = c.posts.map((p) => (p.likes + p.comments + p.shares) / Math.max(1, p.views));
   const lo = Math.floor(Math.min(...rates) * 100);
   const hi = Math.ceil(Math.max(...rates) * 100);
   const step = Math.max(1, Math.ceil((hi - lo) / 8));
   const bins: { bin: string; posts: number; mid: number }[] = [];
   for (let b = lo; b < hi; b += step) {
      bins.push({ bin: `${b}–${b + step}%`, mid: b + step / 2, posts: rates.filter((r) => r * 100 >= b && r * 100 < b + step).length });
   }
   const median = c.engagementRate * 100;
   return (
      <ResponsiveContainer width="100%" height={height}>
         <BarChart data={bins} margin={{ top: 6, right: 6, left: -22, bottom: 0 }} barCategoryGap={2}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="bin" {...AXIS} />
            <YAxis {...AXIS} axisLine={false} allowDecimals={false} width={40} />
            <Tooltip content={<Tip fmt={(v) => `${v} posts`} />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
            <Bar dataKey="posts" radius={[4, 4, 0, 0]} maxBarSize={24}>
               {bins.map((b) => (
                  <Cell key={b.bin} fill={Math.abs(b.mid - median) <= step / 2 ? INK : 'oklch(0.4 0.006 286)'} />
               ))}
            </Bar>
         </BarChart>
      </ResponsiveContainer>
   );
}

const FIT_LABELS: Record<keyof FitScores, string> = {
   niche: 'Niche fit', engagement: 'Engagement', consistency: 'Consistency', audience: 'Audience', cost: 'Cheap reach', growth: 'Growth',
};

export function FitRadar({ creators, height = 240 }: { creators: Creator[]; height?: number }) {
   const keys = Object.keys(FIT_LABELS) as (keyof FitScores)[];
   const data = keys.map((k) => {
      const row: Record<string, string | number> = { axis: FIT_LABELS[k] };
      creators.forEach((c) => (row[c.handle] = Math.round(c.fit[k])));
      return row;
   });
   const single = creators.length === 1;
   return (
      <ResponsiveContainer width="100%" height={height}>
         <RadarChart data={data} outerRadius="70%">
            <PolarGrid stroke={GRID} />
            <PolarAngleAxis dataKey="axis" tick={{ fill: MUTED, fontSize: 11 }} />
            <Tooltip content={<Tip fmt={(v) => `${v}/100`} />} />
            {creators.map((c, i) => (
               <Radar key={c.id} name={c.handle} dataKey={c.handle}
                  stroke={single ? INK : SERIES[i]} strokeWidth={1.5}
                  fill={single ? INK : SERIES[i]} fillOpacity={single ? 0.08 : 0.05} />
            ))}
            {!single && (
               <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }}
                  formatter={(v: string) => <span style={{ color: MUTED }}>{v}</span>} />
            )}
         </RadarChart>
      </ResponsiveContainer>
   );
}

export function TrendLine({ data, dataKey, fmt, height = 110 }: {
   data: Record<string, number | string>[];
   dataKey: string;
   fmt: (v: number) => string;
   height?: number;
}) {
   return (
      <ResponsiveContainer width="100%" height={height}>
         <AreaChart data={data} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
            <XAxis dataKey="label" hide />
            <YAxis hide domain={['auto', 'auto']} />
            <Tooltip content={<Tip fmt={fmt} />} cursor={{ stroke: GRID }} />
            <Area type="linear" dataKey={dataKey} stroke={INK} strokeWidth={1.5} fill={INK} fillOpacity={0.05}
               dot={false} activeDot={{ r: 4, fill: INK, stroke: '#101011', strokeWidth: 2 }} isAnimationActive={false} />
         </AreaChart>
      </ResponsiveContainer>
   );
}

/**
 * Who makes Prenew the most money: profit after their fee (up) against what they cost (across), one circle per
 * compared creator, sized by the views they bring. Above the break-even line pays for itself; the higher, the
 * further ahead. Expected PCs come from lib/engine.ts.
 */
export function ValueMap({ creators, profit }: { creators: Creator[]; profit: number }) {
   const data = creators
      .map((c, i) => {
         const pcs = expectedPcs(c);
         return { x: c.prediction.price[1], y: pcs * profit - c.prediction.price[1], z: c.prediction.views[1], name: c.handle, color: SERIES[i] };
      })
      .sort((a, b) => b.y - a.y)
      .map((d, rank) => ({ ...d, label: `${rank + 1}. ${d.name} · ${d.y >= 0 ? '+' : '−'}€${compact(Math.abs(d.y))}` }));
   const xs = data.map((d) => d.x);
   const ys = data.map((d) => d.y);
   const pad = Math.max(200, (Math.max(...ys, 0) - Math.min(...ys, 0)) * 0.18);
   const lo = Math.min(...ys, 0) - pad;
   const hi = Math.max(...ys, 0) + pad;
   // Round steps (€500, €1K, €2K…) so the axis reads at a glance.
   const raw = (hi - lo) / 4;
   const mag = 10 ** Math.floor(Math.log10(raw));
   const step = [1, 2, 5, 10].map((m) => m * mag).find((v) => v >= raw)!;
   const yTicks = Array.from({ length: 12 }, (_, i) => Math.floor(lo / step) * step + i * step).filter((t) => t >= lo && t <= hi);
   const maxZ = Math.max(...data.map((d) => d.z), 1);
   return (
      <ResponsiveContainer width="100%" height={380}>
         <ScatterChart margin={{ top: 28, right: 40, left: 8, bottom: 16 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis type="number" dataKey="x" name="Cost" scale="log" domain={[Math.min(...xs) / 1.8, Math.max(...xs) * 1.8]} allowDataOverflow {...AXIS}
               ticks={[50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].filter((t) => t >= Math.min(...xs) / 1.8 && t <= Math.max(...xs) * 1.8)}
               tickFormatter={(v: number) => `€${compact(v)}`}
               label={{ value: 'What they cost per post', position: 'insideBottom', offset: -10, fill: MUTED, fontSize: 11 }} />
            <YAxis type="number" dataKey="y" name="Profit" domain={[lo, hi]} ticks={yTicks} {...AXIS} axisLine={false} width={60}
               tickFormatter={(v: number) => `${v < 0 ? '−' : ''}€${compact(Math.abs(v))}`}
               label={{ value: 'Profit for Prenew after their fee', angle: -90, position: 'insideLeft', fill: MUTED, fontSize: 11, dy: 90 }} />
            <ZAxis type="number" dataKey="z" domain={[0, maxZ]} range={[200, 2400]} />
            <ReferenceLine y={0} stroke={MUTED} strokeDasharray="4 4" label={{ value: 'break-even', position: 'insideBottomRight', fill: MUTED, fontSize: 10 }} />
            <Tooltip
               cursor={false}
               content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as (typeof data)[number];
                  return (
                     <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                        <div className="font-medium">{d.name}</div>
                        <div className="tabular-nums text-muted-foreground">
                           Costs €{compact(d.x)} · {compact(d.z)} views · {d.y >= 0 ? '+' : '−'}€{compact(Math.abs(d.y))} after their fee
                        </div>
                     </div>
                  );
               }}
            />
            {data.map((d) => (
               <Scatter key={d.name} name={d.name} data={[d]} fill={d.color} fillOpacity={0.85} stroke="#101011" strokeWidth={2}>
                  <LabelList
                     dataKey="label"
                     content={({ x, y, width, value }) => (
                        <text x={Number(x) + Number(width) / 2} y={Number(y) - 10} textAnchor="middle" fill={INK} fontSize={12} fontWeight={500}>
                           {String(value)}
                        </text>
                     )}
                  />
               </Scatter>
            ))}
         </ScatterChart>
      </ResponsiveContainer>
   );
}
