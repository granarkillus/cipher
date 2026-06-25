'use client';
import { useEffect, useRef, useState, useCallback } from 'react';

interface Memory { id: number; fact: string; importance: number; category?: string; }
interface Node { id: number; fact: string; imp: number; region: string; x: number; y: number; }
interface TooltipState { visible: boolean; fact: string; regionName: string; regionCol: string; imp: number; cx: number; cy: number; }

// Art coordinate space — brain is drawn within this, then scaled to fill viewport
const ART_W = 680, ART_H = 460;
// Bounding box of the brain shape (for fit-to-viewport scaling)
const BRAIN_BOX = { x: 70, y: 30, w: 480, h: 400 };

const REGIONS: Record<string, { name: string; col: string; rgb: [number,number,number]; cx: number; cy: number; spread: number }> = {
  legal:   { name: 'The Courts',   col: '#ff5a59', rgb: [255,90,89],   cx: 290, cy: 112, spread: 80 },
  self:    { name: 'The Self',     col: '#4cc4ff', rgb: [76,196,255],  cx: 442, cy: 170, spread: 86 },
  work:    { name: 'The Shift',    col: '#b89bff', rgb: [184,155,255], cx: 478, cy: 256, spread: 60 },
  family:  { name: 'The Nest',     col: '#3ee07a', rgb: [62,224,122],  cx: 296, cy: 238, spread: 70 },
  heart:   { name: 'The Heart',    col: '#ff7eb0', rgb: [255,126,176], cx: 158, cy: 302, spread: 74 },
  project: { name: 'The Workshop', col: '#ffb22e', rgb: [255,178,46],  cx: 150, cy: 176, spread: 70 },
};
const ALIAS: Record<string, string> = { relationship:'heart', preference:'self', biographical:'self', health:'self', financial:'project' };
function regionKey(c?: string){ const k=(c??'self').toLowerCase(); return REGIONS[k]?k:(ALIAS[k]??'self'); }
function nr(imp: number){ return 3 + imp * 2.1; }

const LEGEND = [
  { key:'legal', name:'The Courts' }, { key:'heart', name:'The Heart' },
  { key:'family', name:'The Nest' }, { key:'project', name:'The Workshop' },
  { key:'work', name:'The Shift' }, { key:'self', name:'The Self' },
];

// Brain outline as a reusable path
function brainPath(ctx: CanvasRenderingContext2D) {
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
}

// Deterministic pseudo-random
function seeded(i: number){ const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

// Generate organic sulci (brain folds) as flowing curves, once
function genSulci() {
  const curves: { pts: [number,number][]; w: number; o: number }[] = [];
  // Long flowing folds radiating from a central axis
  const seeds = 26;
  for (let s = 0; s < seeds; s++) {
    const startX = 110 + seeded(s) * 400;
    const startY = 60 + seeded(s + 50) * 60;
    const pts: [number,number][] = [];
    let x = startX, y = startY;
    const steps = 5 + Math.floor(seeded(s + 99) * 4);
    const drift = (seeded(s + 7) - 0.5) * 30;
    for (let k = 0; k < steps; k++) {
      pts.push([x, y]);
      x += drift + Math.sin(k * 1.3 + s) * 26 + (seeded(s * 10 + k) - 0.5) * 24;
      y += 45 + seeded(s + k * 3) * 25;
    }
    curves.push({ pts, w: 0.6 + seeded(s + 3) * 0.9, o: 0.05 + seeded(s + 13) * 0.08 });
  }
  return curves;
}

export default function MemoryBrain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [count, setCount] = useState(0);
  const [regionLabel, setRegionLabel] = useState('hover a memory');
  const [regionLabelCol, setRegionLabelCol] = useState('#7a86a8');
  const [tooltip, setTooltip] = useState<TooltipState>({ visible:false, fact:'', regionName:'', regionCol:'#38bdf8', imp:1, cx:0, cy:0 });
  const hovRef = useRef<Node | null>(null);
  const tickRef = useRef(0);
  const pulsesRef = useRef<Array<{ a: Node; b: Node; t: number }>>([]);
  const edgesRef = useRef<[number, number][]>([]);
  const nodesRef = useRef<Node[]>([]);
  const sulciRef = useRef(genSulci());
  const transformRef = useRef({ scale: 1, ox: 0, oy: 0 });
  const ambientRef = useRef(Array.from({length: 40}, (_, i) => ({
    x: 90 + seeded(i) * 440, y: 50 + seeded(i+30) * 350,
    vx: (seeded(i+60)-0.5)*0.15, vy: (seeded(i+90)-0.5)*0.15,
    r: 0.5 + seeded(i+120)*1, o: 0.1 + seeded(i+150)*0.25,
  })));

  useEffect(() => {
    fetch('/api/memories').then(r=>r.json()).then(d => {
      const memories: Memory[] = Array.isArray(d.memories) ? d.memories : [];
      setCount(memories.length);
      const perRegion: Record<string, number> = {};
      memories.forEach(m => { const k = regionKey(m.category); perRegion[k]=(perRegion[k]??0)+1; });
      const seen: Record<string, number> = {};
      const positioned: Node[] = memories.map(m => {
        const k = regionKey(m.category);
        const total = perRegion[k]; const idx = seen[k] ?? 0; seen[k] = idx + 1;
        const reg = REGIONS[k];
        const rr = reg.spread * Math.sqrt((idx + 0.5) / Math.max(total,1));
        const ang = idx * 2.399963;
        return { id:m.id, fact:m.fact, imp:Math.min(5,Math.max(1,m.importance??1)), region:k,
          x: Math.round(reg.cx + rr*Math.cos(ang)), y: Math.round(reg.cy + rr*Math.sin(ang)) };
      });
      // edges: 2 nearest same-region neighbors
      const edges: [number,number][] = [];
      const byRegion: Record<string, Node[]> = {};
      positioned.forEach(n => (byRegion[n.region] ??= []).push(n));
      Object.values(byRegion).forEach(group => {
        group.forEach(a => {
          group.filter(b=>b.id!==a.id)
            .map(b=>({b,d:Math.hypot(a.x-b.x,a.y-b.y)}))
            .sort((p,q)=>p.d-q.d).slice(0,2)
            .forEach(({b})=>{ if(!edges.some(([x,y])=>(x===a.id&&y===b.id)||(x===b.id&&y===a.id))) edges.push([a.id,b.id]); });
        });
      });
      nodesRef.current = positioned; edgesRef.current = edges;
      setNodes(positioned); setLoading(false);
    }).catch(()=>setLoading(false));
  }, []);

  const updateTooltip = useCallback((n: Node | null) => {
    if (!n) { setTooltip(t=>({...t,visible:false})); setRegionLabel('hover a memory'); setRegionLabelCol('#7a86a8'); return; }
    const reg = REGIONS[n.region] ?? REGIONS.self;
    const { scale, ox, oy } = transformRef.current;
    const cx = ox + n.x * scale; const cy = oy + n.y * scale;
    setTooltip({ visible:true, fact:n.fact, regionName:reg.name, regionCol:reg.col, imp:n.imp, cx, cy });
    setRegionLabel(reg.name); setRegionLabelCol(reg.col);
  }, []);

  useEffect(() => {
    if (!nodes.length) return;
    const canvas = canvasRef.current; const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d')!;
    let rafId = 0;

    function resize() {
      const cw = wrap!.clientWidth, ch = wrap!.clientHeight;
      const DPR = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = cw * DPR; canvas!.height = ch * DPR;
      canvas!.style.width = cw + 'px'; canvas!.style.height = ch + 'px';
      // fit brain box into viewport, maintain aspect
      const scale = Math.min(cw / BRAIN_BOX.w, ch / BRAIN_BOX.h) * 0.9;
      const ox = (cw - BRAIN_BOX.w * scale) / 2 - BRAIN_BOX.x * scale;
      const oy = (ch - BRAIN_BOX.h * scale) / 2 - BRAIN_BOX.y * scale;
      transformRef.current = { scale, ox, oy };
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    function qp(a: Node, b: Node, t: number) {
      const mx=(a.x+b.x)/2-(b.y-a.y)*0.28, my=(a.y+b.y)/2+(b.x-a.x)*0.28, mt=1-t;
      return { x:mt*mt*a.x+2*mt*t*mx+t*t*b.x, y:mt*mt*a.y+2*mt*t*my+t*t*b.y };
    }

    function drawBrain() {
      const tick = tickRef.current;
      // Outer atmosphere
      brainPath(ctx);
      ctx.save(); ctx.clip();
      // base fill gradient — volumetric
      const bg = ctx.createRadialGradient(300, 200, 30, 300, 200, 320);
      bg.addColorStop(0, '#10152a');
      bg.addColorStop(0.6, '#0a0e1e');
      bg.addColorStop(1, '#070a16');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, ART_W, ART_H);

      // organic sulci folds
      sulciRef.current.forEach(c => {
        ctx.beginPath();
        ctx.moveTo(c.pts[0][0], c.pts[0][1]);
        for (let i=1;i<c.pts.length-1;i++){
          const xc=(c.pts[i][0]+c.pts[i+1][0])/2, yc=(c.pts[i][1]+c.pts[i+1][1])/2;
          ctx.quadraticCurveTo(c.pts[i][0], c.pts[i][1], xc, yc);
        }
        ctx.strokeStyle = `rgba(120,140,200,${c.o})`;
        ctx.lineWidth = c.w; ctx.lineCap='round'; ctx.stroke();
        // subtle highlight along fold
        ctx.strokeStyle = `rgba(150,180,255,${c.o*0.4})`;
        ctx.lineWidth = c.w*0.4; ctx.stroke();
      });

      // central fissure
      ctx.beginPath();
      ctx.moveTo(300, 50);
      ctx.bezierCurveTo(290, 130, 295, 210, 285, 300);
      ctx.strokeStyle = 'rgba(80,100,160,0.12)'; ctx.lineWidth = 2; ctx.stroke();

      // ambient drifting particles
      ambientRef.current.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x<90||p.x>530) p.vx*=-1; if (p.y<50||p.y>380) p.vy*=-1;
        const tw = 0.5 + 0.5*Math.sin(tick*0.03 + p.x);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
        ctx.fillStyle = `rgba(140,170,230,${p.o*tw})`; ctx.fill();
      });
      ctx.restore();

      // Outer rim glow
      brainPath(ctx);
      ctx.strokeStyle = 'rgba(90,120,200,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.strokeStyle = 'rgba(120,160,255,0.15)'; ctx.lineWidth = 4; ctx.stroke();

      // cerebellum
      ctx.beginPath();
      ctx.moveTo(405,360); ctx.bezierCurveTo(418,372,424,392,413,405);
      ctx.bezierCurveTo(400,418,375,414,358,402); ctx.bezierCurveTo(343,390,340,372,344,377);
      ctx.fillStyle='#0a0e1e'; ctx.fill();
      ctx.strokeStyle='rgba(90,120,200,0.4)'; ctx.lineWidth=1.2; ctx.stroke();
      // brainstem
      ctx.beginPath(); ctx.moveTo(290,383); ctx.bezierCurveTo(280,398,274,412,272,432);
      ctx.strokeStyle='rgba(90,120,200,0.4)'; ctx.lineWidth=9; ctx.lineCap='round'; ctx.stroke();

      // territory rings + labels
      Object.values(REGIONS).forEach(reg => {
        ctx.beginPath(); ctx.arc(reg.cx, reg.cy, reg.spread+10, 0, Math.PI*2);
        ctx.strokeStyle = `rgba(${reg.rgb[0]},${reg.rgb[1]},${reg.rgb[2]},0.10)`;
        ctx.lineWidth=1; ctx.setLineDash([3,5]); ctx.stroke(); ctx.setLineDash([]);
      });
      ctx.textAlign='center';
      Object.values(REGIONS).forEach(reg => {
        ctx.font='700 9px system-ui';
        ctx.fillStyle = `rgba(${reg.rgb[0]},${reg.rgb[1]},${reg.rgb[2]},0.6)`;
        ctx.fillText(reg.name.toUpperCase(), reg.cx, reg.cy - reg.spread - 14);
      });
      ctx.textAlign='left';
    }

    function drawEdges() {
      const hov = hovRef.current; const ns = nodesRef.current;
      edgesRef.current.forEach(([a,b]) => {
        const na=ns.find(n=>n.id===a), nb=ns.find(n=>n.id===b);
        if(!na||!nb) return;
        const reg = REGIONS[na.region] ?? REGIONS.self;
        const act = hov && (hov.id===a||hov.id===b);
        const m = qp(na,nb,0.5);
        ctx.beginPath(); ctx.moveTo(na.x,na.y); ctx.quadraticCurveTo(m.x,m.y,nb.x,nb.y);
        ctx.strokeStyle = act ? `rgba(${reg.rgb[0]},${reg.rgb[1]},${reg.rgb[2]},0.85)` : `rgba(${reg.rgb[0]},${reg.rgb[1]},${reg.rgb[2]},0.16)`;
        ctx.lineWidth = act ? 1.4 : 0.6; ctx.stroke();
      });
    }

    function drawPulses() {
      const ps = pulsesRef.current;
      for (let i=ps.length-1;i>=0;i--){
        const p=ps[i]; p.t+=0.02;
        if(p.t>1){ps.splice(i,1);continue;}
        const pos=qp(p.a,p.b,p.t); const reg=REGIONS[p.a.region]??REGIONS.self;
        ctx.globalAlpha=1-p.t*0.4;
        ctx.beginPath(); ctx.arc(pos.x,pos.y,2.5,0,Math.PI*2); ctx.fillStyle=reg.col; ctx.fill();
        ctx.beginPath(); ctx.arc(pos.x,pos.y,5,0,Math.PI*2);
        ctx.fillStyle=`rgba(${reg.rgb[0]},${reg.rgb[1]},${reg.rgb[2]},0.4)`; ctx.fill();
        ctx.globalAlpha=1;
      }
    }
    function spawnPulse() {
      const hov=hovRef.current; if(!hov||Math.random()>0.08) return;
      const ce=edgesRef.current.filter(([a,b])=>a===hov.id||b===hov.id); if(!ce.length) return;
      const [a,b]=ce[Math.floor(Math.random()*ce.length)]; const ns=nodesRef.current;
      const na=ns.find(n=>n.id===a), nb=ns.find(n=>n.id===b);
      if(na&&nb) pulsesRef.current.push({a:na,b:nb,t:0});
    }

    function drawNodes() {
      const hov=hovRef.current;
      const ns=nodesRef.current.filter(n=>isFinite(n.x)&&isFinite(n.y));
      ns.forEach(n => {
        const r=nr(n.imp); const reg=REGIONS[n.region]??REGIONS.self;
        const [R,G,B]=reg.rgb;
        const isH=hov?.id===n.id;
        const isR=hov&&edgesRef.current.some(([a,b])=>(a===hov.id&&b===n.id)||(b===hov.id&&a===n.id));
        const tick=tickRef.current;
        const sc=isH?2.0:isR?1.35:1+Math.sin(tick*0.045+n.id*0.7)*0.07;

        // tight bloom — crisp lit point, not a wide blob
        const gr=r*sc*(isH?3.2:1.6);
        if(isFinite(gr)&&gr>0){
          const grd=ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,gr);
          grd.addColorStop(0,`rgba(${R},${G},${B},${isH?0.7:0.4})`);
          grd.addColorStop(0.5,`rgba(${R},${G},${B},${isH?0.25:0.1})`);
          grd.addColorStop(1,`rgba(${R},${G},${B},0)`);
          ctx.beginPath(); ctx.arc(n.x,n.y,gr,0,Math.PI*2); ctx.fillStyle=grd; ctx.fill();
        }
        // hover/related ring
        if(isH||isR){
          ctx.beginPath(); ctx.arc(n.x,n.y,r*sc*2.4,0,Math.PI*2);
          ctx.strokeStyle=`rgba(${R},${G},${B},${isH?0.8:0.3})`; ctx.lineWidth=isH?1.4:0.6; ctx.stroke();
        }
        // solid core
        ctx.beginPath(); ctx.arc(n.x,n.y,r*sc,0,Math.PI*2);
        ctx.fillStyle=reg.col; ctx.fill();
        // hot white center — makes it look "lit"
        ctx.beginPath(); ctx.arc(n.x,n.y,r*sc*0.45,0,Math.PI*2);
        ctx.fillStyle=`rgba(255,255,255,${isH?0.9:0.55})`; ctx.fill();

        // diamond outline for importance 5
        if(n.imp===5){
          const dr=r*sc*1.5;
          ctx.beginPath();
          ctx.moveTo(n.x,n.y-dr); ctx.lineTo(n.x+dr*0.62,n.y);
          ctx.lineTo(n.x,n.y+dr); ctx.lineTo(n.x-dr*0.62,n.y); ctx.closePath();
          ctx.strokeStyle=`rgba(${R},${G},${B},0.9)`; ctx.lineWidth=1; ctx.stroke();
        }
      });
    }

    function frame() {
      const { scale, ox, oy } = transformRef.current;
      const DPR = Math.min(window.devicePixelRatio || 1, 2);
      ctx.setTransform(DPR,0,0,DPR,0,0);
      ctx.clearRect(0,0,canvas!.width,canvas!.height);
      ctx.save();
      ctx.translate(ox, oy); ctx.scale(scale, scale);
      tickRef.current++;
      drawBrain(); drawEdges(); drawPulses(); spawnPulse(); drawNodes();
      ctx.restore();
      rafId=requestAnimationFrame(frame);
    }
    frame();
    return () => { cancelAnimationFrame(rafId); ro.disconnect(); };
  }, [nodes]);

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas=canvasRef.current; if(!canvas) return;
    const rect=canvas.getBoundingClientRect();
    const { scale, ox, oy }=transformRef.current;
    const ax=(e.clientX-rect.left-ox)/scale;
    const ay=(e.clientY-rect.top-oy)/scale;
    let found:Node|null=null, best=Infinity;
    nodesRef.current.forEach(n=>{
      const d=Math.hypot(ax-n.x,ay-n.y);
      if(d<Math.max(nr(n.imp)*2.2,9)&&d<best){best=d;found=n;}
    });
    if(found!==hovRef.current){ hovRef.current=found; updateTooltip(found); }
  }

  // tooltip placement: opposite side of node, clamped
  const ttSide = tooltip.cx > (wrapRef.current?.clientWidth ?? 1000)/2 ? 'left' : 'right';
  const ttStyle: React.CSSProperties = {
    position:'absolute', top: Math.max(8, Math.min(tooltip.cy-60, (wrapRef.current?.clientHeight ?? 600)-170)),
    [ttSide==='right'?'left':'right']: ttSide==='right' ? tooltip.cx+24 : (wrapRef.current?.clientWidth ?? 1000)-tooltip.cx+24,
    pointerEvents:'none', zIndex:20, width:230,
    background:'rgba(8,11,22,0.96)', backdropFilter:'blur(8px)',
    border:'1px solid #242840', borderRadius:10, padding:'14px 16px',
    boxShadow:'0 12px 40px rgba(0,0,0,.7)', transition:'top .12s,left .12s,right .12s',
  };

  return (
    <div style={{ background:'#05070e', height:'100vh', display:'flex', flexDirection:'column', fontFamily:'system-ui,sans-serif', overflow:'hidden' }}>
      <div style={{ padding:'10px 16px', borderBottom:'1px solid #121626', background:'rgba(5,7,14,0.97)', display:'flex', alignItems:'center', gap:10, height:44, boxSizing:'border-box', flexShrink:0, zIndex:30 }}>
        <a href="/" style={{ textDecoration:'none' }}><span style={{ color:'#cc1a1a', fontSize:12, fontWeight:700, letterSpacing:'.1em' }}>◈</span></a>
        <span style={{ color:'#cc1a1a', fontSize:12, fontWeight:700, letterSpacing:'.1em' }}>MEMORY BRAIN</span>
        <span style={{ color:'#1e2545', fontSize:10 }}>·</span>
        <span style={{ color:'#7a86a8', fontSize:10, letterSpacing:'.06em' }}>{loading?'loading...':`${count} memories · 6 regions`}</span>
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:16 }}>
          <span style={{ color:'#6a7498', fontSize:10, letterSpacing:'.06em' }}>powered by the future</span>
          <span style={{ fontSize:10, color:regionLabelCol, letterSpacing:'.07em', transition:'color .3s', minWidth:80, textAlign:'right' }}>{regionLabel}</span>
        </div>
      </div>

      <div ref={wrapRef} style={{ flex:1, position:'relative', minHeight:0 }}>
        {loading ? (
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12 }}>
            <span style={{ color:'#cc1a1a', fontSize:24 }}>◈</span>
            <span style={{ color:'#2d3250', fontSize:11, letterSpacing:'.1em' }}>LOADING MEMORIES...</span>
          </div>
        ) : (
          <>
            <canvas ref={canvasRef} style={{ display:'block', cursor:'crosshair' }} onMouseMove={handleMouseMove} onMouseLeave={()=>{ hovRef.current=null; updateTooltip(null); }} />
            {tooltip.visible && (
              <div style={ttStyle}>
                <div style={{ fontSize:9, fontWeight:700, letterSpacing:'.1em', textTransform:'uppercase', marginBottom:9, padding:'2px 8px', borderRadius:4, display:'inline-block', background:tooltip.regionCol+'1e', color:tooltip.regionCol, border:`1px solid ${tooltip.regionCol}44` }}>{tooltip.regionName}</div>
                <p style={{ fontSize:12.5, lineHeight:1.65, color:'#d2d8e8', margin:'0 0 11px' }}>{tooltip.fact}</p>
                <div style={{ display:'flex', gap:3, alignItems:'flex-end' }}>
                  {[1,2,3,4,5].map(i=>(<div key={i} style={{ width:4+i, height:4+i, borderRadius:'50%', background:i<=tooltip.imp?tooltip.regionCol:'#1e2545' }} />))}
                </div>
              </div>
            )}
            <div style={{ position:'absolute', bottom:14, left:16, display:'flex', gap:14, flexWrap:'wrap', zIndex:10 }}>
              {LEGEND.map(r=>(
                <div key={r.key} style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <div style={{ width:7, height:7, borderRadius:'50%', background:REGIONS[r.key].col, boxShadow:`0 0 6px ${REGIONS[r.key].col}` }} />
                  <span style={{ fontSize:9, color:'#3a4060', letterSpacing:'.07em' }}>{r.name.toUpperCase()}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
