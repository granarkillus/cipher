'use client';
import { useEffect, useRef, useState } from 'react';

interface Memory {
  id: number;
  fact: string;
  importance: number;
  category: string;
  created_at: string;
}

interface Node {
  id: number;
  fact: string;
  imp: number;
  region: string;
  x: number;
  y: number;
}

const REGIONS: Record<string, { name: string; col: string; glow: string; cx: number; cy: number }> = {
  legal:        { name: 'The Courts',   col: '#e24b4a', glow: 'rgba(226,75,74,',    cx: 270, cy: 130 },
  heart:        { name: 'The Heart',    col: '#e070a0', glow: 'rgba(220,110,160,',  cx: 165, cy: 310 },
  relationship: { name: 'The Heart',    col: '#e070a0', glow: 'rgba(220,110,160,',  cx: 165, cy: 310 },
  family:       { name: 'The Nest',     col: '#22c55e', glow: 'rgba(34,197,94,',    cx: 285, cy: 228 },
  project:      { name: 'The Workshop', col: '#f59e0b', glow: 'rgba(245,158,11,',   cx: 132, cy: 190 },
  work:         { name: 'The Shift',    col: '#a78bfa', glow: 'rgba(167,139,250,',  cx: 448, cy: 208 },
  self:         { name: 'The Self',     col: '#38bdf8', glow: 'rgba(56,189,248,',   cx: 378, cy: 152 },
  preference:   { name: 'The Self',     col: '#38bdf8', glow: 'rgba(56,189,248,',   cx: 378, cy: 152 },
  biographical: { name: 'The Self',     col: '#38bdf8', glow: 'rgba(56,189,248,',   cx: 378, cy: 152 },
  health:       { name: 'The Self',     col: '#38bdf8', glow: 'rgba(56,189,248,',   cx: 378, cy: 152 },
  financial:    { name: 'The Workshop', col: '#f59e0b', glow: 'rgba(245,158,11,',   cx: 132, cy: 190 },
};

const DEFAULT_REGION = { name: 'The Self', col: '#38bdf8', glow: 'rgba(56,189,248,', cx: 378, cy: 152 };

function getRegion(category: string) {
  return REGIONS[category?.toLowerCase()] ?? DEFAULT_REGION;
}

function positionNode(memory: Memory, index: number): Node {
  const reg = getRegion(memory.category);
  const angle = ((memory.id * 137 + index * 23) % 360) * (Math.PI / 180);
  const dist = 15 + ((memory.id * 73 + index * 11) % 45);
  return {
    id: memory.id,
    fact: memory.fact,
    imp: Math.min(5, Math.max(1, memory.importance)),
    region: memory.category?.toLowerCase() ?? 'self',
    x: Math.round(reg.cx + Math.cos(angle) * dist),
    y: Math.round(reg.cy + Math.sin(angle) * dist),
  };
}

function nr(imp: number) { return 5 + imp * 3.6; }

export default function MemoryBrain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [count, setCount] = useState(0);
  const hovRef = useRef<Node | null>(null);
  const tickRef = useRef(0);
  const pulsesRef = useRef<Array<{ a: Node; b: Node; t: number }>>([]);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const rlabelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    fetch('/api/memories')
      .then(r => r.json())
      .then(d => {
        const memories: Memory[] = d.memories ?? [];
        setCount(memories.length);
        const positioned = memories.map((m, i) => positionNode(m, i));
        setNodes(positioned);
        setLoading(false);
      })
      .catch(() => setLoading(false));
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

    // Build edges from shared region clusters (connect nearby same-region nodes)
    const edges: [number, number][] = [];
    nodes.forEach((a, i) => {
      nodes.slice(i + 1).forEach(b => {
        if (a.region === b.region) {
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 80) edges.push([a.id, b.id]);
        }
      });
    });

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
        for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
        ctx.stroke();
      });

      // Region labels
      ctx.textAlign = 'center';
      [
        { t: 'FRONTAL', x: 120, y: 90, r: 'project' },
        { t: 'TEMPORAL', x: 162, y: 262, r: 'heart' },
        { t: 'PARIETAL', x: 335, y: 92, r: 'legal' },
        { t: 'OCCIPITAL', x: 450, y: 150, r: 'work' },
        { t: 'LIMBIC', x: 282, y: 186, r: 'family' },
      ].forEach(z => {
        ctx.font = '7px system-ui';
        ctx.fillStyle = (REGIONS[z.r]?.col ?? '#ffffff') + '30';
        ctx.fillText(z.t, z.x, z.y);
      });
      ctx.textAlign = 'left';
    }

    function drawEdges() {
      const hov = hovRef.current;
      edges.forEach(([a, b]) => {
        const na = nodes.find(n => n.id === a);
        const nb = nodes.find(n => n.id === b);
        if (!na || !nb) return;
        const act = hov && (hov.id === a || hov.id === b);
        const { mx, my } = qp(na, nb, 0.5);
        ctx.beginPath(); ctx.moveTo(na.x, na.y); ctx.quadraticCurveTo(mx, my, nb.x, nb.y);
        const reg = getRegion(na.region);
        ctx.strokeStyle = act ? (reg.col + 'aa') : '#182038';
        ctx.lineWidth = act ? 1.5 : 0.6;
        ctx.stroke();
      });
    }

    function drawPulses() {
      const ps = pulsesRef.current;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i]; p.t += 0.016;
        if (p.t > 1) { ps.splice(i, 1); continue; }
        const pos = qp(p.a, p.b, p.t);
        const col = getRegion(p.a.region).col;
        ctx.globalAlpha = 1 - p.t * 0.6;
        ctx.beginPath(); ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = col; ctx.fill();
        ctx.beginPath(); ctx.arc(pos.x, pos.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = col + '55'; ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    function spawnPulse() {
      const hov = hovRef.current;
      if (!hov || Math.random() > 0.05) return;
      const ce = edges.filter(([a, b]) => a === hov.id || b === hov.id);
      if (!ce.length) return;
      const [a, b] = ce[Math.floor(Math.random() * ce.length)];
      const na = nodes.find(n => n.id === a);
      const nb = nodes.find(n => n.id === b);
      if (na && nb) pulsesRef.current.push({ a: na, b: nb, t: 0 });
    }

    function drawNodes() {
      const hov = hovRef.current;
      nodes.forEach(n => {
        const r = nr(n.imp);
        const reg = getRegion(n.region);
        const col = reg.col;
        const isH = hov?.id === n.id;
        const isR = hov && edges.some(([a, b]) => (a === hov.id && b === n.id) || (b === hov.id && a === n.id));
        const tick = tickRef.current;
        const sc = isH ? 1.7 : isR ? 1.3 : 1 + Math.sin(tick * 0.04 + n.id * 0.7) * 0.1;

        if (isH || n.imp >= 4) {
          const gr = r * sc * (isH ? 4 : 2.8);
          const grd = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, gr);
          grd.addColorStop(0, reg.glow + (isH ? 0.5 : 0.18) + ')');
          grd.addColorStop(1, reg.glow + '0)');
          ctx.beginPath(); ctx.arc(n.x, n.y, gr, 0, Math.PI * 2);
          ctx.fillStyle = grd; ctx.fill();
        }

        if (isH || isR) {
          ctx.beginPath(); ctx.arc(n.x, n.y, r * sc * 2, 0, Math.PI * 2);
          ctx.strokeStyle = col + (isH ? 'cc' : '40');
          ctx.lineWidth = isH ? 1.5 : 0.7; ctx.stroke();
        }

        ctx.beginPath(); ctx.arc(n.x, n.y, r * sc, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.globalAlpha = isH ? 1 : isR ? 0.92 : 0.68;
        ctx.fill(); ctx.globalAlpha = 1;

        ctx.beginPath();
        ctx.arc(n.x - r * 0.22 * sc, n.y - r * 0.22 * sc, r * 0.38 * sc, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff1a'; ctx.fill();

        if (n.imp === 5) {
          const dr = r * sc * 1.2;
          ctx.beginPath();
          ctx.moveTo(n.x, n.y - dr); ctx.lineTo(n.x + dr * 0.6, n.y);
          ctx.lineTo(n.x, n.y + dr); ctx.lineTo(n.x - dr * 0.6, n.y);
          ctx.closePath();
          ctx.strokeStyle = col + 'cc'; ctx.lineWidth = 1; ctx.stroke();
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

  function showTooltip(n: Node) {
    const tt = tooltipRef.current;
    const rl = rlabelRef.current;
    const canvas = canvasRef.current;
    if (!tt || !canvas) return;
    const reg = getRegion(n.region);
    const cw = canvas.offsetWidth, ch = canvas.offsetHeight;
    const nx = cw * (n.x / 680), ny = 44 + ch * (n.y / 440);
    const r = nr(n.imp);

    tt.querySelector('#tt-cat')!.textContent = reg.name;
    (tt.querySelector('#tt-cat') as HTMLElement).style.cssText =
      `font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:9px;padding:2px 8px;border-radius:4px;display:inline-block;background:${reg.col}18;color:${reg.col};border:1px solid ${reg.col}44;`;
    tt.querySelector('#tt-fact')!.textContent = n.fact;
    tt.querySelector('#tt-imp')!.innerHTML = [1,2,3,4,5]
      .map(i => `<div style="width:${4+i}px;height:${4+i}px;border-radius:50%;background:${i<=n.imp?reg.col:'#1e2545'}"></div>`)
      .join('');

    tt.style.opacity = '1';
    tt.style.top = Math.max(50, Math.min(ny - 65, ch)) + 'px';
    if (n.x < 340) {
      tt.style.left = (nx + r + 18) + 'px';
      tt.style.right = 'auto';
    } else {
      tt.style.right = (cw - nx + r + 18) + 'px';
      tt.style.left = 'auto';
    }

    if (rl) { rl.textContent = reg.name; rl.style.color = reg.col; }
  }

  function hideTooltip() {
    const tt = tooltipRef.current;
    const rl = rlabelRef.current;
    if (tt) tt.style.opacity = '0';
    if (rl) { rl.textContent = 'hover a memory'; rl.style.color = '#3a4060'; }
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (680 / rect.width);
    const my = (e.clientY - rect.top) * (440 / rect.height);
    let found: Node | null = null, best = Infinity;
    nodes.forEach(n => {
      const d = Math.hypot(mx - n.x, my - n.y);
      if (d < nr(n.imp) * 1.9 && d < best) { best = d; found = n; }
    });
    if (found !== hovRef.current) {
      hovRef.current = found;
      if (found) showTooltip(found);
      else hideTooltip();
    }
  }

  return (
    <div style={{
      background: '#07090f', minHeight: '100vh', display: 'flex',
      flexDirection: 'column', fontFamily: 'system-ui, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid #141828',
        background: 'rgba(7,9,15,0.97)', display: 'flex',
        alignItems: 'center', gap: '10px', height: '44px', boxSizing: 'border-box',
        flexShrink: 0,
      }}>
        <a href="/" style={{ textDecoration: 'none' }}>
          <span style={{ color: '#cc1a1a', fontSize: '12px', fontWeight: 700, letterSpacing: '.1em' }}>◈</span>
        </a>
        <span style={{ color: '#cc1a1a', fontSize: '12px', fontWeight: 700, letterSpacing: '.1em' }}>MEMORY BRAIN</span>
        <span style={{ color: '#1e2545', fontSize: '10px' }}>·</span>
        <span style={{ color: '#2d3250', fontSize: '10px', letterSpacing: '.06em' }}>
          {loading ? 'loading...' : `${count} memories · 6 regions`}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ color: '#1e2545', fontSize: '10px', letterSpacing: '.06em' }}>powered by the future</span>
          <span ref={rlabelRef} style={{ fontSize: '10px', color: '#3a4060', letterSpacing: '.07em', transition: 'color .3s' }}>
            hover a memory
          </span>
        </div>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, position: 'relative' }}>
        {loading ? (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: '12px',
          }}>
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

            {/* Tooltip */}
            <div
              ref={tooltipRef}
              style={{
                position: 'absolute', pointerEvents: 'none', opacity: 0,
                transition: 'opacity .18s, left .2s, right .2s',
                zIndex: 20, width: '220px',
                background: 'rgba(8,10,20,0.98)',
                border: '1px solid #242840', borderRadius: '8px',
                padding: '13px 14px',
                boxShadow: '0 8px 32px rgba(0,0,0,.6)',
              }}
            >
              <div id="tt-cat" />
              <p id="tt-fact" style={{ fontSize: '12px', lineHeight: 1.65, color: '#c8cfe0', margin: '0 0 10px' }} />
              <div id="tt-imp" style={{ display: 'flex', gap: '3px', alignItems: 'flex-end' }} />
            </div>

            {/* Legend */}
            <div style={{
              position: 'absolute', bottom: '12px', left: '16px',
              display: 'flex', gap: '12px', flexWrap: 'wrap',
            }}>
              {Object.entries(REGIONS)
                .filter(([key]) => !['relationship','preference','biographical','health','financial'].includes(key))
                .map(([, reg]) => (
                  <div key={reg.name} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: reg.col, opacity: 0.8 }} />
                    <span style={{ fontSize: '9px', color: '#3a4060', letterSpacing: '.07em' }}>{reg.name.toUpperCase()}</span>
                  </div>
                ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
