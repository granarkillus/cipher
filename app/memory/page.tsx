'use client';
import { useState, useEffect, useRef } from 'react';

interface Memory {
  id: string;
  fact: string;
  importance: number;
  created_at: string;
}

interface Node {
  id: string;
  fact: string;
  importance: number;
  category: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const ZONES: Record<string, { label: string; color: string; cx: number; cy: number; r: number }> = {
  legal:        { label: 'LEGAL',        color: '#f59e0b', cx: 0.18, cy: 0.25, r: 0.13 },
  relationship: { label: 'RELATIONSHIP', color: '#ec4899', cx: 0.50, cy: 0.18, r: 0.14 },
  family:       { label: 'FAMILY',       color: '#22c55e', cx: 0.82, cy: 0.25, r: 0.13 },
  project:      { label: 'PROJECT',      color: '#38bdf8', cx: 0.82, cy: 0.72, r: 0.13 },
  work:         { label: 'WORK',         color: '#a78bfa', cx: 0.50, cy: 0.82, r: 0.14 },
  preference:   { label: 'PREFERENCE',   color: '#fb923c', cx: 0.18, cy: 0.72, r: 0.13 },
  misc:         { label: 'MISC',         color: '#4a5480', cx: 0.50, cy: 0.50, r: 0.10 },
};

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  legal:        ['legal', 'court', 'case', 'judge', 'law', 'custody', 'divorce', 'colombia', 'spoa', 'queens', 'conciliation', 'gartley v'],
  relationship: ['manuela', 'natalia', 'ex', 'wife', 'girlfriend', 'relationship', 'duque', 'russian', 'colombian'],
  family:       ['ivar', 'zoe', 'nikolai', 'son', 'daughter', 'mother', 'father', 'sister', 'jennifer', 'marilyn', 'christine', 'family', 'dressel', 'lindbergh'],
  project:      ['cipher', 'archon', 'github', 'vercel', 'supabase', 'xing.wtf', 'memoir', 'eyes of glory', 'whitepaper', 'agi', 'project', 'subdomain', 'portal'],
  work:         ['allied', 'washu', 'supervisor', 'justin', 'shawn', 'account manager', 'security', 'work', 'job', 'shift', 'corporate'],
  preference:   ['bjj', 'diet', 'supplement', 'creatine', 'magnesium', 'training', 'crypto', 'btc', 'sol', 'eth', 'rhr', 'hrv', 'health', 'food', 'blue belt'],
};

function categorize(fact: string): string {
  const lower = fact.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) return cat;
  }
  return 'misc';
}

function importanceColor(importance: number): string {
  if (importance >= 5) return '#22c55e';
  if (importance >= 3) return '#f59e0b';
  return '#4a5480';
}

function importanceRadius(importance: number): number {
  if (importance >= 5) return 9;
  if (importance >= 3) return 7;
  return 5;
}

export default function MemoryWorld() {
  const [memories, setMemories]     = useState<Memory[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [nodes, setNodes]           = useState<Node[]>([]);
  const [selected, setSelected]     = useState<Node | null>(null);
  const [hovered, setHovered]       = useState<string | null>(null);
  const canvasRef                   = useRef<HTMLCanvasElement>(null);
  const animRef                     = useRef<number>(0);
  const nodesRef                    = useRef<Node[]>([]);
  const hoveredRef                  = useRef<string | null>(null);
  const selectedRef                 = useRef<Node | null>(null);
  const W                           = useRef(0);
  const H                           = useRef(0);

  useEffect(() => {
    fetch('/api/memories')
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setMemories(d.memories ?? []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Build nodes once memories load
  useEffect(() => {
    if (!memories.length) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.width;
    const h = canvas.height;

    const built: Node[] = memories.map(m => {
      const cat = categorize(m.fact);
      const zone = ZONES[cat];
      // Place within zone with small jitter
      const angle = Math.random() * Math.PI * 2;
      const dist  = Math.random() * zone.r * 0.65;
      return {
        id:         m.id,
        fact:       m.fact,
        importance: m.importance,
        category:   cat,
        x:          zone.cx * w + Math.cos(angle) * dist * w,
        y:          zone.cy * h + Math.sin(angle) * dist * h,
        vx:         (Math.random() - 0.5) * 0.3,
        vy:         (Math.random() - 0.5) * 0.3,
      };
    });
    setNodes(built);
    nodesRef.current = built;
  }, [memories]);

  // Sync refs
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { hoveredRef.current = hovered; }, [hovered]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      W.current = canvas.width;
      H.current = canvas.height;
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      const w = W.current || canvas.width;
      const h = H.current || canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Background
      ctx.fillStyle = '#07090f';
      ctx.fillRect(0, 0, w, h);

      // Zone rings
      for (const zone of Object.values(ZONES)) {
        const zoneR = zone.r * Math.min(w, h);
        ctx.beginPath();
        ctx.arc(zone.cx * w, zone.cy * h, zoneR * 0.9, 0, Math.PI * 2);
        ctx.strokeStyle = zone.color + '33';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.font = 'bold 11px monospace';
        ctx.fillStyle = zone.color + 'cc';
        ctx.letterSpacing = '0.08em';
        ctx.textAlign = 'center';
        ctx.fillText(zone.label, zone.cx * w, zone.cy * h - zoneR * 0.92);
      }

      const ns = nodesRef.current;
      const hov = hoveredRef.current;
      const sel = selectedRef.current;

      // Physics: repulsion + weak zone gravity + zone boundary clamping
      for (let i = 0; i < ns.length; i++) {
        const n    = ns[i];
        const zone = ZONES[n.category];
        const zx   = zone.cx * w;
        const zy   = zone.cy * h;
        const zr   = zone.r * Math.min(w, h) * 0.82; // usable radius in px

        // Weak gravity toward zone center
        const dxC = zx - n.x;
        const dyC = zy - n.y;
        n.vx += dxC * 0.00015;
        n.vy += dyC * 0.00015;

        // Repulsion from every other node
        for (let j = i + 1; j < ns.length; j++) {
          const o  = ns[j];
          const dx = n.x - o.x;
          const dy = n.y - o.y;
          const d2 = dx * dx + dy * dy || 1;
          const d  = Math.sqrt(d2);
          const minD = 14; // minimum separation in px
          if (d < minD * 4) {
            const force = (minD * 4 - d) / (minD * 4) * 0.4;
            const fx = (dx / d) * force;
            const fy = (dy / d) * force;
            n.vx += fx; n.vy += fy;
            o.vx -= fx; o.vy -= fy;
          }
        }

        // Clamp inside zone ring
        const dxZ = n.x - zx;
        const dyZ = n.y - zy;
        const distZ = Math.sqrt(dxZ * dxZ + dyZ * dyZ);
        if (distZ > zr) {
          n.x = zx + (dxZ / distZ) * zr;
          n.y = zy + (dyZ / distZ) * zr;
          n.vx *= 0.3;
          n.vy *= 0.3;
        }

        n.vx *= 0.92;
        n.vy *= 0.92;
        n.x  += n.vx;
        n.y  += n.vy;
        // Hard canvas clamp
        n.x = Math.max(10, Math.min(w - 10, n.x));
        n.y = Math.max(10, Math.min(h - 10, n.y));
      }

      // Draw edges between nodes in same zone (nearest 2)
      for (let i = 0; i < ns.length; i++) {
        const a = ns[i];
        const zone = ZONES[a.category];
        let closest = 0;
        const dists: { d: number; j: number }[] = [];
        for (let j = 0; j < ns.length; j++) {
          if (i === j || ns[j].category !== a.category) continue;
          const dx = a.x - ns[j].x;
          const dy = a.y - ns[j].y;
          dists.push({ d: Math.sqrt(dx * dx + dy * dy), j });
        }
        dists.sort((x, y) => x.d - y.d);
        for (const { d, j } of dists.slice(0, 2)) {
          if (d > w * 0.18) continue;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(ns[j].x, ns[j].y);
          ctx.strokeStyle = zone.color + '18';
          ctx.lineWidth = 0.5;
          ctx.stroke();
          closest++;
        }
      }

      // Draw nodes
      for (const n of ns) {
        const zone   = ZONES[n.category];
        const r      = importanceRadius(n.importance);
        const color  = importanceColor(n.importance);
        const isHov  = hov === n.id;
        const isSel  = sel?.id === n.id;

        // Glow for high importance
        if (n.importance >= 5 || isHov || isSel) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 6, 0, Math.PI * 2);
          const grad = ctx.createRadialGradient(n.x, n.y, r * 0.5, n.x, n.y, r + 6);
          grad.addColorStop(0, color + '44');
          grad.addColorStop(1, 'transparent');
          ctx.fillStyle = grad;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(n.x, n.y, isHov || isSel ? r + 2 : r, 0, Math.PI * 2);
        ctx.fillStyle   = isSel ? '#ffffff' : color;
        ctx.strokeStyle = zone.color + '88';
        ctx.lineWidth   = 0.8;
        ctx.fill();
        ctx.stroke();

        // Label on hover
        if (isHov || isSel) {
          const maxW  = 220;
          const words = n.fact.split(' ');
          const lines: string[] = [];
          let line = '';
          ctx.font = '11px monospace';
          for (const word of words) {
            const test = line ? `${line} ${word}` : word;
            if (ctx.measureText(test).width > maxW) {
              lines.push(line);
              line = word;
            } else {
              line = test;
            }
          }
          if (line) lines.push(line);
          const lh   = 14;
          const pad  = 8;
          const bw   = maxW + pad * 2;
          const bh   = lines.length * lh + pad * 2;
          let bx     = n.x + r + 8;
          let by     = n.y - bh / 2;
          if (bx + bw > w - 10) bx = n.x - r - 8 - bw;
          if (by < 10) by = 10;
          if (by + bh > h - 10) by = h - bh - 10;

          ctx.fillStyle   = 'rgba(12,14,23,0.92)';
          ctx.strokeStyle = zone.color + '66';
          ctx.lineWidth   = 1;
          ctx.beginPath();
          ctx.roundRect(bx, by, bw, bh, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#c8cfe0';
          ctx.font      = '11px monospace';
          ctx.textAlign = 'left';
          lines.forEach((l, idx) => ctx.fillText(l, bx + pad, by + pad + (idx + 1) * lh - 2));
        }
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [nodes.length]);

  // Mouse interaction
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx   = e.clientX - rect.left;
    const my   = e.clientY - rect.top;
    let found: string | null = null;
    for (const n of nodesRef.current) {
      const dx = mx - n.x;
      const dy = my - n.y;
      if (Math.sqrt(dx * dx + dy * dy) < importanceRadius(n.importance) + 6) {
        found = n.id;
        break;
      }
    }
    setHovered(found);
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx   = e.clientX - rect.left;
    const my   = e.clientY - rect.top;
    for (const n of nodesRef.current) {
      const dx = mx - n.x;
      const dy = my - n.y;
      if (Math.sqrt(dx * dx + dy * dy) < importanceRadius(n.importance) + 6) {
        setSelected(prev => prev?.id === n.id ? null : n);
        return;
      }
    }
    setSelected(null);
  };

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#07090f', position: 'relative', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: '48px', background: 'rgba(7,9,15,0.9)',
        borderBottom: '1px solid #2d3250',
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '0 20px', zIndex: 10,
      }}>
        <span style={{ color: '#cc1a1a', fontSize: '14px', fontWeight: '700', letterSpacing: '0.08em' }}>◈ CIPHER</span>
        <span style={{ color: '#2d3250', fontSize: '14px' }}>·</span>
        <span style={{ color: '#4a5480', fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Memory World</span>
        <div style={{ flex: 1 }} />
        {!loading && !error && (
          <span style={{ color: '#4a5480', fontSize: '11px', letterSpacing: '0.06em' }}>
            {memories.length} nodes
          </span>
        )}
        <a href="/" style={{
          background: 'transparent', color: '#4a5480', border: '1px solid #2d3250',
          borderRadius: '4px', padding: '3px 10px', fontSize: '11px',
          letterSpacing: '0.04em', cursor: 'pointer', textDecoration: 'none',
        }}>← CIPHER</a>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%,-50%)',
          color: '#4a5480', fontSize: '12px', letterSpacing: '0.1em',
          textTransform: 'uppercase', zIndex: 5,
        }}>
          <span style={{ color: '#cc1a1a', marginRight: '8px' }}>◈</span>
          Loading memory...
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%,-50%)',
          color: '#cc1a1a', fontSize: '12px', letterSpacing: '0.06em', zIndex: 5,
          background: '#1c2035', border: '1px solid #cc1a1a',
          borderRadius: '6px', padding: '12px 20px',
        }}>
          Error: {error}
        </div>
      )}

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute', top: '48px', left: 0,
          width: '100%', height: 'calc(100% - 48px)',
          cursor: hovered ? 'pointer' : 'default',
        }}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
      />

      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: '16px', left: '16px',
        display: 'flex', flexDirection: 'column', gap: '4px',
        background: 'rgba(7,9,15,0.8)', border: '1px solid #2d3250',
        borderRadius: '6px', padding: '10px 14px', zIndex: 10,
      }}>
        <span style={{ color: '#4a5480', fontSize: '9px', letterSpacing: '0.1em', marginBottom: '4px' }}>IMPORTANCE</span>
        {[
          { color: '#22c55e', label: '5 — Critical' },
          { color: '#f59e0b', label: '3-4 — Useful' },
          { color: '#4a5480', label: '1-2 — Minor' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, display: 'inline-block' }} />
            <span style={{ color: '#4a5480', fontSize: '10px' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Selected detail card */}
      {selected && (
        <div style={{
          position: 'absolute', bottom: '16px', right: '16px',
          width: '300px', background: 'rgba(12,14,23,0.95)',
          border: `1px solid ${ZONES[selected.category].color}44`,
          borderRadius: '8px', padding: '14px 16px', zIndex: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{
              fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase',
              color: ZONES[selected.category].color, fontWeight: '700',
            }}>
              {ZONES[selected.category].label}
            </span>
            <span style={{
              fontSize: '9px', letterSpacing: '0.06em', textTransform: 'uppercase',
              color: importanceColor(selected.importance), marginLeft: 'auto',
            }}>
              ★ {selected.importance}
            </span>
            <button onClick={() => setSelected(null)} style={{
              background: 'transparent', border: 'none', color: '#4a5480',
              fontSize: '14px', cursor: 'pointer', lineHeight: 1, padding: 0,
            }}>×</button>
          </div>
          <p style={{ margin: 0, fontSize: '12px', lineHeight: '1.6', color: '#c8cfe0' }}>{selected.fact}</p>
        </div>
      )}
    </div>
  );
}
