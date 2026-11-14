import React from 'react';
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

export const EssaStudioIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const entrance = spring({frame: frame - 12, fps, config: {damping: 15, stiffness: 85, mass: 0.8}});
  const titleOpacity = interpolate(frame, [14, 32, 190, 209], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const titleY = interpolate(entrance, [0, 1], [52, 0]);
  const logoScale = interpolate(entrance, [0, 1], [0.55, 1]);
  const ring = interpolate(frame, [0, 90, 209], [0.72, 1.12, 1.35], {easing: Easing.out(Easing.quad), extrapolateRight: 'clamp'});
  const line = interpolate(frame, [35, 70], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const glow = interpolate(frame, [0, 45, 120, 209], [0.2, 0.85, 0.6, 0.25], {extrapolateRight: 'clamp'});
  const particles = Array.from({length: 24}, (_, i) => ({
    x: (i * 137.5) % width,
    y: (i * 83.7) % height,
    size: 2 + (i % 3) * 2,
    delay: i * 2,
  }));

  return (
    <AbsoluteFill style={{
      background: 'radial-gradient(ellipse at 50% 42%, #243b68 0%, #101a31 42%, #060a13 100%)',
      color: '#f7f8ff',
      fontFamily: 'Arial, Helvetica, sans-serif',
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <AbsoluteFill style={{opacity: glow, background: 'radial-gradient(circle at 50% 44%, rgba(79,145,255,.32), transparent 42%)'}} />
      {particles.map((p, i) => (
        <div key={i} style={{
          position: 'absolute', left: p.x, top: p.y, width: p.size, height: p.size,
          borderRadius: 99, background: '#a8d9ff',
          opacity: interpolate(frame - p.delay, [0, 18, 75, 110], [0, 0.8, 0.35, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
          transform: `translateY(${interpolate(frame - p.delay, [0, 110], [18, -36], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}px)`,
        }} />
      ))}
      <div style={{
        position: 'absolute', width: height * 0.7, height: height * 0.7,
        borderRadius: '50%', border: '1px solid rgba(132,190,255,.35)',
        transform: `scale(${ring})`, boxShadow: '0 0 80px rgba(66,133,255,.12), inset 0 0 80px rgba(66,133,255,.08)',
      }} />
      <div style={{
        width: height * 0.205, height: height * 0.205, borderRadius: height * 0.055,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(145deg, #b8edff 0%, #579bff 48%, #8164f5 100%)',
        boxShadow: '0 22px 90px rgba(68,135,255,.48), inset 0 2px 2px rgba(255,255,255,.55)',
        transform: `scale(${logoScale}) rotate(${interpolate(entrance, [0,1], [-14,0])}deg)`,
        fontSize: height * 0.13, fontWeight: 900, color: '#07152b',
        opacity: titleOpacity,
      }}>E</div>
      <div style={{
        marginTop: height * 0.055,
        fontSize: Math.min(width * 0.065, height * 0.14),
        fontWeight: 800, letterSpacing: '-0.045em',
        opacity: titleOpacity,
        transform: `translateY(${titleY}px)`,
        textShadow: '0 8px 40px rgba(86,153,255,.28)',
      }}>EssaStudio AI</div>
      <div style={{
        marginTop: height * 0.022,
        fontSize: height * 0.027,
        letterSpacing: '0.28em',
        color: '#a9c9f5',
        opacity: titleOpacity,
      }}>CREATE · MOTION · INSPIRE</div>
      <div style={{
        position: 'absolute', bottom: height * 0.19, height: 3, width: width * 0.28,
        borderRadius: 9, background: 'linear-gradient(90deg, transparent, #9bdcff, #8e83ff, transparent)',
        transform: `scaleX(${line})`, boxShadow: '0 0 24px rgba(125,188,255,.7)',
      }} />
    </AbsoluteFill>
  );
};
