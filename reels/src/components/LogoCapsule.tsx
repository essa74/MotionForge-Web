import React from 'react';
import {Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {brand, FONT} from '../lib/theme';

type Props = {
  /** File inside reels/public. Without it a simple "E" badge is drawn. */
  logo?: string;
  handle?: string;
  label?: string;
};

/** Closing screen: logo, then a small "follow the page" capsule underneath. */
export const LogoCapsule: React.FC<Props> = ({logo, handle = '@EssaXcel', label = 'تابع الصفحة'}) => {
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
        background: 'radial-gradient(ellipse at 50% 40%, #1b3a2a 0%, #0f172a 70%)',
        gap: width * 0.05,
        opacity: interpolate(frame, [0, 8], [0, 1], {extrapolateRight: 'clamp'}),
      }}
    >
      <div style={{transform: `scale(${interpolate(logoIn, [0, 1], [0.7, 1])})`, opacity: logoIn}}>
        {logo ? (
          <Img src={staticFile(logo)} style={{width: logoSize, height: logoSize, objectFit: 'contain'}} />
        ) : (
          <div
            style={{
              width: logoSize * 0.6,
              height: logoSize * 0.6,
              borderRadius: logoSize * 0.14,
              background: brand.green,
              color: '#fff',
              fontFamily: FONT,
              fontWeight: 800,
              fontSize: logoSize * 0.38,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            E
          </div>
        )}
      </div>
      <div
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
          color: '#fff',
          opacity: capsuleIn,
          transform: `translateY(${interpolate(capsuleIn, [0, 1], [18, 0])}px)`,
        }}
      >
        <span>{label}</span>
        <span style={{color: '#7ddba0', fontWeight: 800, direction: 'ltr'}}>{handle}</span>
      </div>
    </div>
  );
};
