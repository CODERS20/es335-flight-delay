import { motion } from "framer-motion";
import { useMemo } from "react";
import type { Options } from "../lib/data";
import { COLOR, useSize } from "../lib/labels";

/**
 * Real airports at their real coordinates, sized by how many training flights
 * left them, with the busiest routes drawn as arcs and planes flying them.
 * Every dot and every arc comes from the training data.
 */
export default function FlightMap({ options, dim = false }: { options: Options; dim?: boolean }) {
  const { ref, w, h } = useSize<HTMLDivElement>();

  const geo = useMemo(() => {
    if (!w || !h) return null;
    // The contiguous United States: Alaska and Hawaii would squash the map.
    const ap = options.airports.filter(
      (a) =>
        a.lat != null && a.lon != null && a.lon > -125 && a.lon < -66 && a.lat > 24 && a.lat < 50,
    );
    // A simple equal-scale projection, corrected for latitude so the country
    // keeps its familiar shape.
    const k = Math.cos((38 * Math.PI) / 180);
    const xs = ap.map((a) => a.lon! * k);
    const ys = ap.map((a) => -a.lat!);
    const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
    const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
    const pad = 40;
    const s = Math.min((w - 2 * pad) / (x1 - x0), (h - 2 * pad) / (y1 - y0));
    const ox = (w - s * (x1 - x0)) / 2;
    const oy = (h - s * (y1 - y0)) / 2;
    const proj = (lat: number, lon: number) => ({
      x: ox + (lon * k - x0) * s,
      y: oy + (-lat - y0) * s,
    });

    const maxN = Math.max(...ap.map((a) => a.n_train));
    const at: Record<string, { x: number; y: number; r: number; n: number; code: string }> = {};
    ap.forEach((a) => {
      const p = proj(a.lat!, a.lon!);
      at[a.code] = { ...p, r: 1.4 + Math.sqrt(a.n_train / maxN) * 6.5, n: a.n_train, code: a.code };
    });

    // One arc per city pair, bowed upwards like a great-circle route.
    const seen = new Set<string>();
    const arcs: { d: string; n: number; key: string }[] = [];
    for (const [o, d, n] of options.top_routes) {
      const a = at[o];
      const b = at[d];
      if (!a || !b) continue;
      const key = [o, d].sort().join("-");
      if (seen.has(key)) continue;
      seen.add(key);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      let nx = -dy / len;
      let ny = dx / len;
      if (ny > 0) {
        nx = -nx;
        ny = -ny;
      }
      const bow = Math.min(len * 0.28, 140);
      arcs.push({
        d: `M${a.x.toFixed(1)},${a.y.toFixed(1)} Q${(mx + nx * bow).toFixed(1)},${(my + ny * bow).toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`,
        n,
        key,
      });
      if (arcs.length >= 46) break;
    }

    const dots = Object.values(at).sort((p, q) => q.n - p.n);
    return { dots, arcs, labels: dots.slice(0, 11), maxRoute: Math.max(...arcs.map((a) => a.n)) };
  }, [options, w, h]);

  return (
    <div ref={ref} className="absolute inset-0">
      {geo ? (
        <svg width={w} height={h} className={dim ? "opacity-60" : undefined} aria-hidden="true">
          <defs>
            <linearGradient id="arc" x1="0" x2="1">
              <stop offset="0%" stopColor={COLOR.amber} stopOpacity="0.05" />
              <stop offset="50%" stopColor={COLOR.amber} stopOpacity="0.85" />
              <stop offset="100%" stopColor={COLOR.amber} stopOpacity="0.05" />
            </linearGradient>
            <radialGradient id="glow">
              <stop offset="0%" stopColor="#9CC5FF" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#9CC5FF" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* routes */}
          {geo.arcs.map((a, i) => (
            <motion.path
              key={a.key}
              d={a.d}
              fill="none"
              stroke="url(#arc)"
              strokeWidth={0.6 + (a.n / geo.maxRoute) * 1.8}
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.75 }}
              transition={{ duration: 1.8, delay: 0.4 + i * 0.035, ease: [0.16, 1, 0.3, 1] }}
            />
          ))}

          {/* airports */}
          {geo.dots.map((p, i) => (
            <motion.g
              key={p.code}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.15 + Math.min(i, 80) * 0.008 }}
              style={{ transformOrigin: `${p.x}px ${p.y}px` }}
            >
              {p.r > 4 ? <circle cx={p.x} cy={p.y} r={p.r * 2.6} fill="url(#glow)" opacity={0.35} /> : null}
              <circle cx={p.x} cy={p.y} r={p.r} fill="#CFE0FF" fillOpacity={0.85} />
            </motion.g>
          ))}

          {/* planes flying the busiest routes */}
          {geo.arcs.slice(0, 26).map((a, i) => (
            <g key={`plane-${a.key}`}>
              <circle r={5} fill={COLOR.amber} opacity={0}>
                <set attributeName="opacity" to="0.18" begin={`${1.6 + i * 0.4}s`} />
                <animateMotion
                  dur={`${5 + (i % 5) * 1.3}s`}
                  begin={`${1.6 + i * 0.4}s`}
                  repeatCount="indefinite"
                  path={a.d}
                  rotate="auto"
                />
              </circle>
              <circle r={1.9} fill="#FFF4D6" opacity={0}>
                <set attributeName="opacity" to="1" begin={`${1.6 + i * 0.4}s`} />
                <animateMotion
                  dur={`${5 + (i % 5) * 1.3}s`}
                  begin={`${1.6 + i * 0.4}s`}
                  repeatCount="indefinite"
                  path={a.d}
                  rotate="auto"
                />
              </circle>
            </g>
          ))}

          {/* the busiest airports, named */}
          {geo.labels.map((p, i) => (
            <motion.text
              key={`l-${p.code}`}
              x={p.x + p.r + 4}
              y={p.y + 3.5}
              fill={COLOR.soft}
              fontSize={10.5}
              fontFamily="'JetBrains Mono', monospace"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.9 }}
              transition={{ delay: 1.2 + i * 0.06 }}
            >
              {p.code}
            </motion.text>
          ))}
        </svg>
      ) : null}
    </div>
  );
}
