import React from 'react';
import {Img, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {resolveSrc} from '../lib/assets';
import {brand, FONT, glowLayers} from '../lib/theme';
import type {Look} from '../engine/spec';

export const Glow: React.FC<{accent: string; bg: string; y: number; strength: number}> = ({accent, bg, y, strength}) => {
  const {width, height} = useVideoConfig();
  const size = Math.max(width, height) * 0.95;
  return (
    <div style={{position: 'absolute', inset: 0, overflow: 'hidden'}}>
      {glowLayers(accent, bg, strength).map((l, i) => (
        <div key={i} style={{position: 'absolute', left: width / 2 - (size * l.scale) / 2, top: height * y - (size * l.scale) / 2, width: size * l.scale, height: size * l.scale, borderRadius: '50%', background: l.color}} />
      ))}
    </div>
  );
};

type Props = {
  /** File inside reels/public. Without it a simple "E" badge is drawn. */
  logo?: string;
  handle?: string;
  label?: string;
  /** Page identity. When given, nothing of the classic EssaXcel look is used. */
  look?: Look;
};

/** Closing screen: logo, then a small "follow the page" capsule underneath. */
export const LogoCapsule: React.FC<Props> = ({logo, handle: handleProp, label: labelProp, look}) => {
  const handle = look ? handleProp : (handleProp ?? '@EssaXcel');
  const label = labelProp ?? 'تابع الصفحة';
  const letter = (handle ?? '').replace(/^@/, '').charAt(0).toUpperCase();
  const frame = useCurrentFrame();
  const {fps, width} = useVideoConfig();
  const logoIn = spring({frame, fps, config: {damping: 15, stiffness: 90}});
  const capsuleIn = spring({frame: frame - Math.round(0.5 * fps), fps, config: {damping: 16, stiffness: 100}});
  const logoSize = width * 0.34;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: look ? look.bg : 'radial-gradient(circle at 50% 50%, #1b3a2a 0%, #0f172a 70%)',
        gap: width * 0.05,
        opacity: interpolate(frame, [0, 8], [0, 1], {extrapolateRight: 'clamp'}),
      }}
    >
      {look && <Glow accent={look.accent} bg={look.bg} y={0.45} strength={0.22} />}
      <div style={{transform: `scale(${interpolate(logoIn, [0, 1], [0.7, 1])})`, opacity: logoIn}}>
        {logo ? (
          <Img src={resolveSrc(logo)} style={{width: logoSize, height: logoSize, objectFit: 'contain'}} />
        ) : look && !letter ? null : (
          <div
            style={{
              width: logoSize * 0.6,
              height: logoSize * 0.6,
              borderRadius: logoSize * 0.14,
              background: look ? look.accent : brand.green,
              color: look ? look.bg : '#fff',
              fontFamily: FONT,
              fontWeight: 800,
              fontSize: logoSize * 0.38,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {look ? letter : 'E'}
          </div>
        )}
      </div>
      {handle && <div
        dir="rtl"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: width * 0.02,
          padding: `${width * 0.014}px ${width * 0.04}px`,
          borderRadius: 999,
          background: 'rgba(255,255,255,0.1)',
          border: '1px solid rgba(255,255,255,0.28)',
          fontFamily: FONT,
          fontWeight: 600,
          fontSize: width * 0.036,
          color: look?.text ?? '#fff',
          opacity: capsuleIn,
          transform: `translateY(${interpolate(capsuleIn, [0, 1], [18, 0])}px)`,
        }}
      >
        <span>{label}</span>
        <span style={{color: look?.accent ?? '#7ddba0', fontWeight: 800, direction: 'ltr'}}>{handle}</span>
      </div>}
    </div>
  );
};
