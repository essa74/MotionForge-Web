import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {FONT} from '../lib/theme';
import type {CaptionLine} from '../lib/types';

// Keeps English runs such as "Ctrl + A" or "=$K5" in their own left-to-right order inside Arabic text.
const LATIN_RUN =
  /([A-Za-z0-9@=$][A-Za-z0-9@=$.\/:()_-]*(?: [+] [A-Za-z0-9@=$][A-Za-z0-9@=$.\/:()_-]*)*)/g;

const renderMixed = (text: string) =>
  text.split(LATIN_RUN).map((part, i) =>
    i % 2 === 1 ? (
      <bdi key={i} dir="ltr">
        {part}
      </bdi>
    ) : (
      part
    ),
  );

type Props = {
  lines: CaptionLine[];
  /** Distance from the bottom edge, as a fraction of the video height. */
  bottom?: number;
  /** Font size as a fraction of the video width. Kept small on purpose. */
  size?: number;
};

/** Calm, small Arabic subtitle pill. One line at a time, soft fade and rise. */
export const Captions: React.FC<Props> = ({lines, bottom = 0.12, size = 0.04}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const t = frame / fps;
  const line = lines.find((item) => t >= item.from && t < item.to);
  if (!line) return null;

  const start = line.from * fps;
  const end = line.to * fps;
  const fadeIn = Math.round(0.18 * fps);
  const fadeOut = Math.round(0.12 * fps);
  const opacity = interpolate(frame, [start, start + fadeIn, end - fadeOut, end], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const rise = interpolate(frame, [start, start + fadeIn], [14, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: height * bottom,
        display: 'flex',
        justifyContent: 'center',
        padding: `0 ${width * 0.07}px`,
        opacity,
        transform: `translateY(${rise}px)`,
      }}
    >
      <div
        dir="rtl"
        style={{
          fontFamily: FONT,
          fontWeight: 600,
          fontSize: width * size,
          lineHeight: 1.5,
          color: '#ffffff',
          background: 'rgba(15, 23, 42, 0.74)',
          border: '1px solid rgba(255, 255, 255, 0.14)',
          borderRadius: width * 0.03,
          padding: `${width * 0.012}px ${width * 0.035}px`,
          textAlign: 'center',
          maxWidth: '100%',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.25)',
        }}
      >
        {renderMixed(line.text)}
      </div>
    </div>
  );
};
