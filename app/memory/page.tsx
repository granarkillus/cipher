'use client';
import { useEffect, useRef, useState, useCallback } from 'react';

interface Memory {
  id: number;
  fact: string;
  importance: number;
  category?: string;
}

interface Node {
  id: number;
  fact: string;
  imp: number;
  region: string;
  x: number;
  y: number;
}

interface TooltipState {
  visible: boolean;
  fact: string;
  regionName: string;
  regionCol: string;
  imp: number;
  top: number;
  left?: number;
  right?: number;
}

// Brain canvas is 680x440
// These are the bounding boxes for each region INSIDE the brain shape
const REGION_BOUNDS: Record<string, { name: string; col: string; glow: string; x1: number; y1: number; x2: number; y2: number }> = {
  legal:        { name: 'The Courts',   col: '#e24b4a', glow: 'rgba(226,75,74,',   x1: 195, y1: 72,  x2: 340, y2: 175 },
  family:       { name: 'The Nest',     col: '#22c55e', glow: 'rgba(34,197,94,',   x1: 215, y1: 175, x2: 355, y2: 275 },
  heart:        { name: 'The Heart',    col: '#e070a0', glow: 'rgba(220,110,160,', x1: 88,  y1: 220, x2: 240, y2: 355 },
  relationship: { name: 'The Heart',    col: '#e070a0', glow: 'rgba(220,110,160,', x1: 88,  y1: 220, x2: 240, y2: 355 },
  project:      { name: 'The Workshop', col: '#f59e0b', glow: 'rgba(245,158,11,',  x1: 88,  y1: 100, x2: 210, y2: 240 },
  work:         { name: 'The Shift',    col: '#a78bfa', glow: 'rgba(167,139,250,', x1: 390, y1: 130, x2: 525, y2: 280 },
  self:         { name: 'The Self',     col: '#38bdf8', glow: 'rgba(56,189,248,',  x1: 340, y1: 68,  x2: 510, y2: 170 },
  preference:   { name: 'The Self',     col: '#38bdf8', glow: 'rgba(56,189,248,',  x1: 340, y1: 68,  x2: 510, y2: 170 },
  biographical: { name: 'The Self',     col: '#38bdf8', glow: 'rgba(56,189,248,',  x1: 340, y1: 68,  x2: 510, y2: 170 },
  health:       { name: 'The Self',     col: '#38bdf8', glow: 'rgba(56,189,248,',  x1: 340, y1: 68,  x2: 510, y2: 170 },
  financial:    { name: 'The Workshop', col: '#f59e0b', glow: 'rgba(245,158,11,',  x1: 88,  y1: 100, x2: 210, y2: 240 },
};

const DEFAULT_BOUNDS = { name: 'The Self', col: '#38bdf8', glow: 'rgba(56,189,248,', x1: 340, y1: 68, x2: 510, y2: 170 };

function getRegionBounds(category?: string) {
  return REGION_BOUNDS[(category ?? '').toLowerCase()] ?? DEFAULT_BOUNDS;
}

// Position node within its region bounding box using golden angle spiral
function positionNode(memory: Memory, indexInRegion: number, totalInRegion: number): Node {
  const b = getRegionBounds(memory.category);
  const w = b.x2 - b.x1;
  const h = b.y2 - b.y1;
  const cx = b.x1 + w / 2;
  const cy = b.y1 + h / 2;
  const maxR = Math.min(w, h) * 0.44;

  // Sunflower/Vogel spiral for even distribution
  const r = maxR * Math.sqrt((indexInRegion + 0.5) / Math.max(totalInRegion, 1));
  const angle = indexInRegion * 2.399963; // golden angle in radians

  return {
    id: memory.id,
    fact: memory.fact,
    imp: Math.min(5, Math.max(1, memory.importance ?? 1)),
    region: (memory.category ?? 'self').toLowerCase(),
    x: Math.round(cx + r * Math.cos(angle)),
    y: Math.round(cy + r * Math.sin(angle)),
  };
}

function nr(imp: number) { return 3 + imp * 2.5; }

const LEGEND_REGIONS = [
  { key: 'legal',   name: 'The Courts',   col: '#e24b4a' },
  { key: 'heart',   name: 'The Heart',    col: '#e070a0' },
  { key: 'family',  name: 'The Nest',     col: '#22c55e' },
  { key: 'project', name: 'The Workshop', col: '#f59e0b' },
  { key: 'work',    name: 'The Shift',    col: '#a78bfa' },
  { key: 'self',    name: 'The Self',     col: '#38bdf8' },
];

export default function MemoryBrain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [count, setCount] = useState(0);
  const [regionLabel, setRegionLabel] = useState('hover a memory');
  const [regionLabelCol, setRegionLabelCol] = useState('#3a4060');
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false, fact: '', regionName: '', regionCol: '#38bdf8', imp: 1, top: 0,
  });
  const hovRef = useRef<Node | null>(null);
  const tickRef = useRef(0);
  const pulsesRef = useRef<Array<{ a: Node; b: Node; t: number }>>([]);
  const edgesRef = useRef<[number, number][]>([]);
  const nodesRef = useRef<Node[]>([]);

  useEffect(() => {
    fetch('/api/memories')
      .then(r => r.json())
      .then(d => {
        const memories: Memory[] = d.memories ?? [];
        setCount(memories.length);

        // Group by region to get index within region
        const regionGroups: Record<string, Memory[]> = {};
        memories.forEach(m => {
          const key = (m.category ?? 'self').toLowerCase();
          const mapped = REGION_BOUNDS[key] ? key : 'self';
          if (!regionGroups[mapped]) regionGroups[mapped] = [];
          regionGroups[mapped].push(m);
        });

        // Position each node within its region using sunflower spiral
        const positioned: Node[] = [];
        Object.entries(regionGroups).forEach(([, group]) => {
          group.forEach((m, i) => {
            positioned.push(positionNode(m, i, group.length));
          });
        });

        // Build edges between nearby same-region nodes
        const edges: [number, number][] = [];
        positioned.forEach((a, i) => {
          positioned.slice(i + 1).forEach(b => {
            if (a.region === b.region) {
              const d = Math.hypot(a.x - b.x, a.y - b.y);
              if (d < 40 && edges.length < 300) edges.push([a.id, b.id]);
            }
          });
        });

        nodesRef.current = positioned;
        edgesRef.current = edges;
        setNodes(positioned);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const showTooltip = useCallback((n: Node, cw: number, ch: number) => {
    const reg = getRegionBounds(n.region);
    const nx = cw * (n.x / 680);
    const ny = 44 + ch * (n.y / 440);
    const r = nr(n.imp);
    const top = Math.max(50, Math.min(ny - 65, ch - 140));
    if (n.x < 340) {
      setTooltip({ visible: true, fact: n.fact, regionName: reg.name, regionCol: reg.col, imp: n.imp, top, left: nx + r + 18, right: undefined });
    } else {
      setTooltip({ visible: true, fact: n.fact, regionName: reg.name, regionCol: reg.col, imp: n.imp, top, right: cw - nx + r + 18, left: undefined });
    }
    setRegionLabel(reg.name);
    setRegionLabelCol(reg.col);
  }, []);

  const hideTooltip = useCallback(() => {
    setTooltip(t => ({ ...t, visible: false }));
    setRegionLabel('hover a memory');
    setRegionLabelCol('#3a4060');
  }, []);

  useEffect(() => {
    if (!nodes.length) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    const W = 680, H = 440;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    ctx.scale(DPR, DPR);

    function qp(a: Node, b: Node, t: number) {
      const mx = (a.x + b.x) / 2 - (b.y - a.y) * 0.28;
      const my = (a.y + b.y) / 2 + (b.x - a.x) * 0.28;
      const mt = 1 - t;
      return {
        x: mt * mt * a.x + 2 * mt * t * mx + t * t * b.x,
        y: mt * mt * a.y + 2 * mt * t * my + t * t * b.y,
        mx, my,
      };
    }

    function drawBrain() {
      ctx.beginPath();
      ctx.moveTo(144, 65);
      ctx.bezierCurveTo(192, 47, 248, 43, 290, 47);
      ctx.bezierCurveTo(338, 48, 375, 56, 407, 70);
      ctx.bezierCurveTo(448, 84, 482, 108, 506, 133);
      ctx.bezierCurveTo(527, 157, 530, 185, 522, 212);
      ctx.bezierCurveTo(514, 237, 503, 260, 488, 274);
      ctx.bezierCurveTo(468, 292, 446, 300, 422, 303);
      ctx.bezierCurveTo(416, 322, 413, 344, 405, 360);
      ctx.bezierCurveTo(392, 378, 368, 382, 344, 377);
      ctx.bezierCurveTo(320, 373, 302, 379, 285, 383);
      ctx.bezierCurveTo(255, 387, 222, 385, 190, 377);
      ctx.bezierCurveTo(160, 368, 130, 356, 110, 342);
      ctx.bezierCurveTo(91, 330, 83, 310, 84, 288);
      ctx.bezierCurveTo(82, 265, 84, 238, 86, 216);
      ctx.bezierCurveTo(84, 188, 88, 160, 96, 138);
      ctx.bezierCurveTo(110, 103, 128, 79, 144, 65);
      ctx.closePath();
      ctx.fillStyle = '#0c0f1e'; ctx.fill();
      ctx.strokeStyle = '#1c2240'; ctx.lineWidth = 1.5; ctx.stroke();

      // Cerebellum
      ctx.beginPath();
      ctx.moveTo(405, 360);
      ctx.bezierCurveTo(418, 372, 424, 392, 413, 405);
      ctx.bezierCurveTo(400, 418, 375, 414, 358, 402);
      ctx.bezierCurveTo(343, 390, 340, 372, 344, 377);
      ctx.fillStyle = '#0c0f1e'; ctx.fill();
      ctx.strokeStyle = '#1c2240'; ctx.lineWidth = 1.5; ctx.stroke();

      // Brainstem
      ctx.beginPath();
      ctx.moveTo(290, 383);
      ctx.bezierCurveTo(280, 398, 274, 412, 272, 432);
      ctx.strokeStyle = '#1c2240'; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.stroke();

      // Sulci
      ctx.lineCap = 'round'; ctx.lineWidth = 0.8; ctx.strokeStyle = '#171c35';
      [
        [258,52, 240,98, 222,152, 205,202, 188,252, 168,298, 150,338],
        [102,228, 160,212, 220,196, 282,186, 344,178, 400,172, 434,167],
        [374,59, 395,100, 415,138, 435,167],
        [174,65, 167,102, 163,140, 163,178],
        [120,160, 150,145, 182,138, 212,138],
        [330,53, 320,90, 308,132, 300,170],
        [115,288, 142,270, 168,255, 195,248, 225,244],
      ].forEach(pts => {
        ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i+1]);
        ctx.stroke();
      });

      // Region labels
      ctx.textAlign = 'center';
      [
        { t: 'FRONTAL',   x: 140, y: 88,  r: 'project' },
        { t: 'TEMPORAL',  x: 158, y: 258, r: 'heart'   },
        { t: 'PARIETAL',  x: 415, y: 90,  r: 'self'    },
        { t: 'OCCIPITAL', x: 458, y: 145, r: 'work'    },
        { t: 'LIMBIC',    x: 282, y: 182, r: 'family'  },
        { t: 'FRONTAL-P', x: 258, y: 82,  r: 'legal'   },
      ].forEach(z => {
        ctx.font = '7px system-ui';
        ctx.fillStyle = (REGION_BOUNDS[z.r]?.col ?? '#ffffff') + '25';
        ctx.fillText(z.t, z.x, z.y);
      });
      ctx.textAlign = 'left';
    }

    function drawEdges() {
      const hov = hovRef.current;
      const ns = nodesRef.current;
      edgesRef.current.forEach(([a, b]) => {
        const na = ns.find(n => n.id === a);
        const nb = ns.find(n => n.id === b);
        if (!na || !nb) return;
        const act = hov && (hov.id === a || hov.id === b);
        const { mx, my } = qp(na, nb, 0.5);
        ctx.beginPath(); ctx.moveTo(na.x, na.y); ctx.quadraticCurveTo(mx, my, nb.x, nb.y);
        ctx.strokeStyle = act ? (getRegionBounds(na.region).col + '99') : '#1e2848';
        ctx.lineWidth = act ? 1.2 : 0.4;
        ctx.stroke();
      });
    }

    function drawPulses() {
      const ps = pulsesRef.current;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i]; p.t += 0.018;
        if (p.t > 1) { ps.splice(i, 1); continue; }
        const pos = qp(p.a, p.b, p.t);
        const col = getRegionBounds(p.a.region).col;
        ctx.globalAlpha = 1 - p.t * 0.5;
        ctx.beginPath(); ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = col; ctx.fill();
        ctx.beginPath(); ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = col + '55'; ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    function spawnPulse() {
      const hov = hovRef.current;
      if (!hov || Math.random() > 0.06) return;
      const ce = edgesRef.current.filter(([a, b]) => a === hov.id || b === hov.id);
      if (!ce.length) return;
      const [a, b] = ce[Math.floor(Math.random() * ce.length)];
      const ns = nodesRef.current;
      const na = ns.find(n => n.id === a);
      const nb = ns.find(n => n.id === b);
      if (na && nb) pulsesRef.current.push({ a: na, b: nb, t: 0 });
    }

    function drawNodes() {
      const hov = hovRef.current;
      const ns = nodesRef.current.filter(n => isFinite(n.x) && isFinite(n.y));
      ns.forEach(n => {
        const r = nr(n.imp);
        const reg = getRegionBounds(n.region);
        const col = reg.col;
        const isH = hov?.id === n.id;
        const isR = hov && edgesRef.current.some(([a, b]) => (a === hov.id && b === n.id) || (b === hov.id && a === n.id));
        const tick = tickRef.current;
        const sc = isH ? 2.2 : isR ? 1.5 : 1 + Math.sin(tick * 0.04 + n.id * 0.7) * 0.08;

        // Glow for hovered or high importance
        if (isH || n.imp >= 3) {
          const gr = r * sc * (isH ? 5 : 3);
          if (isFinite(gr) && gr > 0) {
            const grd = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, gr);
            grd.addColorStop(0, reg.glow + (isH ? 0.45 : 0.12) + ')');
            grd.addColorStop(1, reg.glow + '0)');
            ctx.beginPath(); ctx.arc(n.x, n.y, gr, 0, Math.PI * 2);
            ctx.fillStyle = grd; ctx.fill();
          }
        }

        // Rings
        if (isH || isR) {
          ctx.beginPath(); ctx.arc(n.x, n.y, r * sc * 2.2, 0, Math.PI * 2);
          ctx.strokeStyle = col + (isH ? 'cc' : '50');
          ctx.lineWidth = isH ? 1.5 : 0.6; ctx.stroke();
        }

        // Core
        ctx.beginPath(); ctx.arc(n.x, n.y, r * sc, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.globalAlpha = isH ? 1 : isR ? 0.95 : 0.85;
        ctx.fill(); ctx.globalAlpha = 1;

        // Highlight
        ctx.beginPath();
        ctx.arc(n.x - r * 0.2 * sc, n.y - r * 0.2 * sc, r * 0.35 * sc, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff18'; ctx.fill();

        // Diamond for importance 5
        if (n.imp === 5) {
          const dr = r * sc * 1.4;
          ctx.beginPath();
          ctx.moveTo(n.x, n.y - dr); ctx.lineTo(n.x + dr * 0.65, n.y);
          ctx.lineTo(n.x, n.y + dr); ctx.lineTo(n.x - dr * 0.65, n.y);
          ctx.closePath();
          ctx.strokeStyle = col + 'dd'; ctx.lineWidth = 1; ctx.stroke();
        }
      });
    }

    let rafId: number;
    function frame() {
      ctx.clearRect(0, 0, W, H);
      tickRef.current++;
      drawBrain();
      drawEdges();
      drawPulses();
      spawnPulse();
      drawNodes();
      rafId = requestAnimationFrame(frame);
    }
    frame();
    return () => cancelAnimationFrame(rafId);
  }, [nodes]);

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (680 / rect.width);
    const my = (e.clientY - rect.top) * (440 / rect.height);
    let found: Node | null = null, best = Infinity;
    nodesRef.current.forEach(n => {
      const d = Math.hypot(mx - n.x, my - n.y);
      if (d < Math.max(nr(n.imp) * 2, 12) && d < best) { best = d; found = n; }
    });
    if (found !== hovRef.current) {
      hovRef.current = found;
      if (found) showTooltip(found, canvas.offsetWidth, canvas.offsetHeight);
      else hideTooltip();
    }
  }

  return (
    <div style={{ background: '#07090f', minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid #141828',
        background: 'rgba(7,9,15,0.97)', display: 'flex', alignItems: 'center',
        gap: '10px', height: '44px', boxSizing: 'border-box', flexShrink: 0,
      }}>
        <a href="/" style={{ textDecoration: 'none' }}>
          <span style={{ color: '#cc1a1a', fontSize: '12px', fontWeight: 700, letterSpacing: '.1em' }}>◈</span>
        </a>
        <span style={{ color: '#cc1a1a', fontSize: '12px', fontWeight: 700, letterSpacing: '.1em' }}>MEMORY BRAIN</span>
        <span style={{ color: '#1e2545', fontSize: '10px' }}>·</span>
        <span style={{ color: '#2d3250', fontSize: '10px', letterSpacing: '.06em' }}>
          {loading ? 'loading...' : `${count} memories · 6 regions`}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ color: '#1e2545', fontSize: '10px', letterSpacing: '.06em' }}>powered by the future</span>
          <span style={{ fontSize: '10px', color: regionLabelCol, letterSpacing: '.07em', transition: 'color .3s' }}>
            {regionLabel}
          </span>
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative' }}>
        {loading ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px' }}>
            <span style={{ color: '#cc1a1a', fontSize: '24px' }}>◈</span>
            <span style={{ color: '#2d3250', fontSize: '11px', letterSpacing: '.1em' }}>LOADING MEMORIES...</span>
          </div>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              style={{ display: 'block', width: '100%', height: '440px', cursor: 'crosshair' }}
              onMouseMove={handleMouseMove}
              onMouseLeave={() => { hovRef.current = null; hideTooltip(); }}
            />

            {tooltip.visible && (
              <div style={{
                position: 'absolute',
                top: tooltip.top,
                left: tooltip.left !== undefined ? tooltip.left : 'auto',
                right: tooltip.right !== undefined ? tooltip.right : 'auto',
                pointerEvents: 'none', zIndex: 20, width: '220px',
                background: 'rgba(8,10,20,0.98)',
                border: '1px solid #242840', borderRadius: '8px',
                padding: '13px 14px', boxShadow: '0 8px 32px rgba(0,0,0,.6)',
                transition: 'top .15s',
              }}>
                <div style={{
                  fontSize: '9px', fontWeight: 700, letterSpacing: '.1em',
                  textTransform: 'uppercase', marginBottom: '9px', padding: '2px 8px',
                  borderRadius: '4px', display: 'inline-block',
                  background: tooltip.regionCol + '18', color: tooltip.regionCol,
                  border: `1px solid ${tooltip.regionCol}44`,
                }}>
                  {tooltip.regionName}
                </div>
                <p style={{ fontSize: '12px', lineHeight: 1.65, color: '#c8cfe0', margin: '0 0 10px' }}>
                  {tooltip.fact}
                </p>
                <div style={{ display: 'flex', gap: '3px', alignItems: 'flex-end' }}>
                  {[1,2,3,4,5].map(i => (
                    <div key={i} style={{
                      width: `${4+i}px`, height: `${4+i}px`, borderRadius: '50%',
                      background: i <= tooltip.imp ? tooltip.regionCol : '#1e2545',
                    }} />
                  ))}
                </div>
              </div>
            )}

            <div style={{ position: 'absolute', bottom: '12px', left: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {LEGEND_REGIONS.map(r => (
                <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: r.col, opacity: 0.85 }} />
                  <span style={{ fontSize: '9px', color: '#3a4060', letterSpacing: '.07em' }}>{r.name.toUpperCase()}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
