'use client';

import { useEffect, useRef, useState } from 'react';
import { Map as MLMap, Marker, type ExpressionSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { feature } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { Topology } from 'topojson-specification';
import world from 'world-atlas/countries-50m.json';
import { LIVE_MARKETS } from '@/lib/data/mock';

const STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const EUROPE: [[number, number], [number, number]] = [[-12, 36], [38, 71]];

const ISO_NUM: Record<string, string> = {
   '246': 'FI', '752': 'SE', '276': 'DE', '840': 'US', '124': 'CA', '233': 'EE', '428': 'LV', '440': 'LT',
   '616': 'PL', '348': 'HU', '250': 'FR', '528': 'NL', '208': 'DK', '056': 'BE', '040': 'AT', '702': 'SG', '156': 'CN',
};
/** Roadmap markets drawn as "coming soon". */
const SOON = ['US', 'CA', 'SG', 'CN'];

const topo = world as unknown as Topology;
const countries = (feature(topo, topo.objects.countries) as FeatureCollection<Geometry, { name: string }>).features;
const LIVE: readonly string[] = LIVE_MARKETS;

export interface Hover {
   code: string;
   name: string;
   x: number;
   y: number;
}

export function WorldMap({
   view,
   values,
   selected,
   onSelect,
   onHover,
}: {
   view: 'world' | 'europe';
   /** Creators found per live market; drives the fill shade. */
   values: Record<string, number>;
   selected: string;
   onSelect: (code: string) => void;
   onHover: (h: Hover | null) => void;
}) {
   const el = useRef<HTMLDivElement>(null);
   const map = useRef<MLMap | null>(null);
   const [ready, setReady] = useState(false);
   const handlers = useRef({ onSelect, onHover });
   handlers.current = { onSelect, onHover };

   useEffect(() => {
      if (!el.current || map.current) return;
      const m = new MLMap({
         container: el.current,
         style: STYLE,
         bounds: EUROPE,
         fitBoundsOptions: { padding: 24 },
         attributionControl: { compact: true },
         dragRotate: false,
         pitchWithRotate: false,
      });
      m.touchZoomRotate.disableRotation();
      map.current = m;

      m.on('load', () => {
         // Continent, ocean and state names add noise at this zoom.
         for (const id of ['place_continent', 'watername_ocean', 'watername_sea', 'place_state'])
            if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', 'none');
         const firstLabel = m.getStyle().layers.find((l) => l.type === 'symbol')?.id;
         const shaped: Feature<Geometry, { code: string; name: string }>[] = countries.map((f) => ({
            ...f,
            properties: { name: f.properties.name, code: ISO_NUM[String(f.id)] ?? '' },
         }));
         m.addSource('countries', { type: 'geojson', data: { type: 'FeatureCollection', features: shaped } });
         m.addLayer(
            {
               id: 'live-fill',
               type: 'fill',
               source: 'countries',
               filter: ['in', ['get', 'code'], ['literal', LIVE]],
               paint: { 'fill-color': '#22c55e', 'fill-opacity': 0.45 },
            },
            firstLabel
         );
         m.addLayer(
            {
               id: 'soon-fill',
               type: 'fill',
               source: 'countries',
               filter: ['in', ['get', 'code'], ['literal', SOON]],
               paint: { 'fill-color': '#a1a1aa', 'fill-opacity': 0.1 },
            },
            firstLabel
         );
         m.addLayer(
            {
               id: 'live-line',
               type: 'line',
               source: 'countries',
               filter: ['in', ['get', 'code'], ['literal', LIVE]],
               paint: { 'line-color': '#86efac', 'line-width': 1, 'line-opacity': 0.5 },
            },
            firstLabel
         );
         m.addLayer({
            id: 'selected-line',
            type: 'line',
            source: 'countries',
            filter: ['==', ['get', 'code'], ''],
            paint: { 'line-color': '#fafafa', 'line-width': 2 },
         });

         m.on('mousemove', (e) => {
            const f = m.queryRenderedFeatures(e.point, { layers: ['live-fill', 'soon-fill'] })[0];
            m.getCanvas().style.cursor = f && f.layer.id === 'live-fill' ? 'pointer' : '';
            if (!f) return handlers.current.onHover(null);
            const code = String(f.properties?.code ?? '');
            const name = countries.find((c) => ISO_NUM[String(c.id)] === code)?.properties.name ?? code;
            handlers.current.onHover({ code, name, x: e.point.x, y: e.point.y });
         });
         m.on('mouseout', () => handlers.current.onHover(null));
         m.on('click', 'live-fill', (e) => {
            const code = e.features?.[0]?.properties?.code;
            if (code) handlers.current.onSelect(String(code));
         });

         new Marker({ element: comingSoonLabel(), anchor: 'center' }).setLngLat([-99, 37.5]).addTo(m);
         new Marker({ element: comingSoonLabel(), anchor: 'center' }).setLngLat([104, 34]).addTo(m);
         new Marker({ element: comingSoonLabel('Singapore · soon'), anchor: 'left' }).setLngLat([104.2, 1.3]).addTo(m);
         setReady(true);
      });

      return () => {
         m.remove();
         map.current = null;
      };
   }, []);

   useEffect(() => {
      const m = map.current;
      if (!m || !ready) return;
      const vs = Object.values(values);
      const [lo, hi] = [Math.min(...vs), Math.max(...vs)];
      m.setPaintProperty('live-fill', 'fill-color', [
         'match',
         ['get', 'code'],
         ...Object.entries(values).flatMap(([code, v]) => [code, shade(hi === lo ? 1 : (v - lo) / (hi - lo))]),
         '#22c55e',
      ] as unknown as ExpressionSpecification);
   }, [values, ready]);

   useEffect(() => {
      if (ready) map.current?.setFilter('selected-line', ['==', ['get', 'code'], selected]);
   }, [selected, ready]);

   useEffect(() => {
      const m = map.current;
      if (!m || !ready) return;
      if (view === 'europe') m.fitBounds(EUROPE, { padding: 24, duration: 900 });
      else m.flyTo({ center: [-25, 38], zoom: 1.2, duration: 900 });
   }, [view, ready]);

   return (
      <div className="absolute inset-0">
         <div ref={el} className="h-full w-full" />
      </div>
   );
}

/** Dim to bright green; brighter means more creators found. */
function shade(t: number) {
   const stops = ['#15803d', '#22c55e', '#86efac'];
   return stops[Math.round(t * (stops.length - 1))];
}

function comingSoonLabel(text = 'Coming soon') {
   const d = document.createElement('div');
   d.textContent = text;
   d.style.cssText =
      'font: 500 11px var(--font-geist-sans), system-ui; color: #a1a1aa; background: #101011; border: 1px solid #27272a; border-radius: 6px; padding: 3px 8px; pointer-events: none;';
   return d;
}
