import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {mix} from '../lib/theme';
import type {DrawItem, DrawScene, Look} from './spec';

const W = 100; // stage width in units; height follows the frame
const LINE = 0.55;

const Person: React.FC<{item: Extract<DrawItem, {kind: 'person'}>; ink: string; bg: string; t: number}> = ({item, ink, bg, t}) => {
  const mood = item.mood ?? 'neutral';
  const sway = Math.sin(t * 2) * 0.3;
  const mouth = mood === 'sad' ? 'M -1.6 -16.6 Q 0 -18 1.6 -16.6' : mood === 'happy' ? 'M -1.6 -17.2 Q 0 -15.4 1.6 -17.2' : 'M -1.4 -16.9 L 1.4 -16.9';
  const wave = item.pose === 'wave' ? Math.sin(t * 8) * 4 : 0;
  return (
    <g transform={`translate(${item.x} 0) scale(${item.size ?? 1})`} strokeLinecap="round" strokeLinejoin="round" fill="none" stroke={ink} strokeWidth={LINE}>
      <circle cx={0} cy={-19.5 + sway * 0.2} r={3.6} fill={bg} />
      <circle cx={-1.2} cy={-20.2} r={0.35} fill={ink} stroke="none" />
      <circle cx={1.2} cy={-20.2} r={0.35} fill={ink} stroke="none" />
      <path d={mouth} strokeWidth={0.4} />
      {item.hair && <path d="M -3.6 -19.5 Q -4.6 -12 -3.2 -10.5 M 3.6 -19.5 Q 4.6 -12 3.2 -10.5 M -3.4 -21.5 Q 0 -25 3.4 -21.5" />}
      <path d="M 0 -15.9 L 0 -7.5" />
      <path d={`M 0 -14 L ${-4.5} ${-9.5 + sway}`} />
      <path d={item.pose === 'wave' ? `M 0 -14 L 5.5 ${-17 + wave * 0.3}` : `M 0 -14 L ${4.5} ${-9.5 - sway}`} />
      <path d="M 0 -7.5 L -3 0 M 0 -7.5 L 3 0" />
    </g>
  );
};

/** Draws one item. `p` is 0..1 appear progress. */
const Item: React.FC<{item: DrawItem; look: Look; t: number; p: number; H: number}> = ({item, look, t, p, H}) => {
  const ink = look.text;
  const k = item.kind;
  const common = {opacity: p} as const;
  if (k === 'person') return <g {...common}><Person item={item} ink={ink} bg={look.bg} t={t} /></g>;
  if (k === 'spotlight') {
    const x = item.x;
    return <polygon {...common} points={`${x - 3},${-H * 0.5} ${x + 3},${-H * 0.5} ${x + 14},0 ${x - 14},0`} fill={mix('#ffffff', look.bg, 0.16)} stroke="none" />;
  }
  if (k === 'wave') {
    const x1 = item.from, x2 = item.to, n = 8, d = Array.from({length: 60}, (_, i) => {
      const u = i / 59;
      return `${i ? 'L' : 'M'} ${x1 + (x2 - x1) * u * p} ${-17 + Math.sin(u * n * Math.PI * 2 - t * 6) * 1.1}`;
    }).join(' ');
    return <path d={d} fill="none" stroke={item.color ?? '#4f8cff'} strokeWidth={0.5} strokeLinecap="round" />;
  }
  if (k === 'bubble') {
    const w = Math.max(10, item.text.length * 1.6 + 4);
    return (
      <g {...common} transform={`translate(${item.x} ${-30})`}>
        <rect x={-w / 2} y={-3.4} width={w} height={6.8} rx={1.6} fill={look.bg} stroke={look.accent} strokeWidth={0.4} />
        <text x={0} y={1.2} textAnchor="middle" fontSize={3.2} fill={ink} fontFamily="CairoLat, CairoAr, sans-serif" fontWeight={700}>{item.text}</text>
      </g>
    );
  }
  if (k === 'moon') {
    const stars = [[8, -48], [20, -40], [34, -52], [60, -45], [72, -53], [88, -42], [47, -36]];
    return (
      <g {...common}>
        <circle cx={item.x} cy={-44} r={3} fill={look.accent} stroke="none" />
        <circle cx={item.x + 1.6} cy={-45} r={2.6} fill={look.bg} stroke="none" />
        {stars.map(([sx, sy], i) => <circle key={i} cx={sx} cy={sy} r={0.28 + 0.12 * Math.sin(t * 3 + i)} fill={ink} />)}
      </g>
    );
  }
  if (k === 'house') {
    const x = item.x;
    return <path {...common} d={`M ${x - 9} 0 L ${x - 9} -10 L ${x} -18 L ${x + 9} -10 L ${x + 9} 0 M ${x - 2.5} 0 L ${x - 2.5} -6 L ${x + 2.5} -6 L ${x + 2.5} 0 M ${x + 4} -9 L ${x + 7} -9 L ${x + 7} -6 L ${x + 4} -6 Z`} fill="none" stroke={ink} strokeWidth={LINE} strokeLinejoin="round" />;
  }
  if (k === 'clock') {
    const a = t * 1.2;
    return (
      <g {...common} transform={`translate(${item.x} -32)`} fill="none" stroke={ink} strokeWidth={0.45} strokeLinecap="round">
        <circle r={3.6} />
        <path d={`M 0 0 L 0 -2.4 M 0 0 L ${Math.sin(a) * 1.8} ${-Math.cos(a) * 1.8}`} />
      </g>
    );
  }
  if (k === 'phone') {
    return (
      <g {...common} transform={`translate(${item.x} 0)`} fill="none" stroke={ink} strokeWidth={LINE}>
        <rect x={-3.4} y={-12} width={6.8} height={12} rx={1.2} />
        {item.text && <text x={0} y={-5.6} textAnchor="middle" fontSize={2.2} fill={look.accent} stroke="none" fontFamily="CairoLat, CairoAr, sans-serif" fontWeight={700}>{item.text}</text>}
      </g>
    );
  }
  return null;
};

export const DrawSceneView: React.FC<{scene: DrawScene; look: Look; k?: number}> = ({scene, look, k = 1}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const H = (W * height) / width;
  const ground = H * 0.5;
  const t = frame / fps;
  return (
    <AbsoluteFill style={{background: look.bg}}>
      <svg width={width} height={height} viewBox={`0 0 ${W} ${H}`} style={{position: 'absolute', inset: 0}}>
        <g transform={`translate(0 ${ground})`}>
          {scene.items.some((i) => i.kind === 'spotlight') ? null : null}
          {scene.items.map((item, i) => {
            const at = (item.at ?? 0) * k;
            const p = interpolate(t, [at, at + 0.4], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
            return <Item key={i} item={item} look={look} t={t} p={p} H={H} />;
          })}
          {scene.ground !== false && <line x1={3} y1={0} x2={97} y2={0} stroke={look.text} strokeWidth={LINE} strokeLinecap="round" />}
        </g>
      </svg>
    </AbsoluteFill>
  );
};
