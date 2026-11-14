import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {FONT} from '../lib/theme';

type Props = {
  keys: string[];
  /** Frame (relative to this component) at which each key is pressed, in order. */
  pressAt?: number[];
  /** Overall size as a fraction of video width (key height). */
  size?: number;
};

/** Keyboard keys shown in sequence, e.g. Alt, H, O, I. Pressed keys sink and turn green. */
export const KeyCaps: React.FC<Props> = ({keys, pressAt, size = 0.1}) => {
  const frame = useCurrentFrame();
  const {fps, width} = useVideoConfig();
  const h = width * size;

  return (
    <div style={{display: 'flex', alignItems: 'center', gap: h * 0.18, direction: 'ltr'}}>
      {keys.map((label, i) => {
        const at = pressAt?.[i] ?? i * Math.round(0.45 * fps);
        const pressed = frame >= at;
        const down = pressed
          ? spring({frame: frame - at, fps, config: {damping: 14, stiffness: 220}, durationInFrames: 12})
          : 0;
        const sink = interpolate(down, [0, 1], [0, h * 0.06]);
        return (
          <React.Fragment key={`${label}-${i}`}>
            {i > 0 && (
              <span style={{fontFamily: FONT, fontWeight: 700, fontSize: h * 0.45, color: '#94a3b8'}}>+</span>
            )}
            <div
              style={{
                minWidth: h * (label.length > 1 ? 1.5 : 1),
                height: h,
                padding: `0 ${h * 0.22}px`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: h * 0.2,
                fontFamily: FONT,
                fontWeight: 800,
                fontSize: h * 0.42,
                color: pressed ? '#ffffff' : '#0f172a',
                background: pressed ? '#217346' : '#f8fafc',
                border: '2px solid ' + (pressed ? '#185c37' : '#cbd5e1'),
                boxShadow: `0 ${h * 0.1 - sink}px 0 ${pressed ? '#185c37' : '#cbd5e1'}, 0 ${h * 0.2}px ${h * 0.3}px rgba(15,23,42,.2)`,
                transform: `translateY(${sink}px)`,
              }}
            >
              {label}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};
