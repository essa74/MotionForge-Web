import React from 'react';
import {AbsoluteFill, Easing, Img, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {ExcelSheet, sheetHeight, sheetWidth} from '../components/ExcelSheet';
import {KeyCaps} from '../components/KeyCaps';
import {LogoCapsule} from '../components/LogoCapsule';
import {resolveSrc} from '../lib/assets';
import {FONT, brand} from '../lib/theme';
import {excelStateAt} from './excelState';
import type {ExcelScene, ImageScene, LogoScene, TextScene} from './spec';

const BG = 'linear-gradient(180deg, #e8efe9 0%, #cfd9d2 100%)';

export const ExcelSceneView: React.FC<{scene: ExcelScene; k?: number}> = ({scene, k = 1}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  // k stretches the scene to the voice-over; steps keep their place relative to the scene length.
  const t = frame / fps / k;
  const state = excelStateAt(scene, t);
  const rowHeight = scene.rowHeight ?? 84;
  const columns = scene.columns.map((w) => ({header: '', width: w}));
  const rowCount = Math.max(scene.rows.length, state.rows.length);
  const sw = sheetWidth(columns);
  const sh = sheetHeight(rowCount, rowHeight);
  // Fit the window inside the frame (keys on top, captions below), whatever the format.
  const scale = Math.min((width * 0.92) / sw, (height * 0.6) / sh);
  const enter = interpolate(frame, [0, 0.5 * fps], [0, 1], {extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});

  return (
    <AbsoluteFill style={{background: BG}}>
      {state.keys && (
        <div
          style={{
            position: 'absolute',
            top: height * 0.08,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            opacity: interpolate(state.keys.since, [state.keys.hold - 0.3, state.keys.hold], [1, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        >
          {/* Re-keyed per press so each new keys step replays its animation from its own start. */}
          <Sequence from={-Math.round(state.keys.since * k * fps)} layout="none" key={state.keys.keys.join('+')}>
            <KeyCaps keys={state.keys.keys} pressAt={state.keys.keys.map((_, i) => Math.round(i * 0.35 * fps))} size={width > height ? 0.05 : 0.085} />
          </Sequence>
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          top: height * 0.2,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          opacity: enter,
          transform: `translateY(${(1 - enter) * 40}px)`,
        }}
      >
        <ExcelSheet
          columns={columns}
          rows={state.rows}
          scale={scale}
          rowHeight={rowHeight}
          tableHeader={scene.tableHeader ?? true}
          nameBox={state.nameBox}
          formula={state.formula}
          cellStyle={state.cellStyle}
          selection={state.selection}
        />
      </div>
    </AbsoluteFill>
  );
};

const THEMES = {
  light: {bg: BG, title: brand.ink, sub: brand.inkSoft},
  dark: {bg: 'radial-gradient(circle at 50% 40%, #1b3a2a 0%, #0f172a 75%)', title: '#ffffff', sub: '#cbd5e1'},
  green: {bg: `linear-gradient(160deg, ${brand.green} 0%, ${brand.greenDark} 100%)`, title: '#ffffff', sub: '#d1fae5'},
};

export const TextSceneView: React.FC<{scene: TextScene}> = ({scene}) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const theme = THEMES[scene.theme ?? 'light'];
  const a = spring({frame, fps, config: {damping: 16, stiffness: 100}});
  const b = spring({frame: frame - Math.round(0.25 * fps), fps, config: {damping: 16, stiffness: 100}});
  return (
    <AbsoluteFill style={{background: theme.bg, alignItems: 'center', justifyContent: 'center', padding: width * 0.08}}>
      <div
        dir="rtl"
        style={{
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: Math.min(width, height * 1.2) * 0.085,
          lineHeight: 1.35,
          textAlign: 'center',
          color: theme.title,
          opacity: a,
          transform: `translateY(${(1 - a) * 50}px)`,
        }}
      >
        {scene.title}
      </div>
      {scene.subtitle && (
        <div
          dir="rtl"
          style={{
            marginTop: height * 0.025,
            fontFamily: FONT,
            fontWeight: 600,
            fontSize: Math.min(width, height * 1.2) * 0.048,
            lineHeight: 1.5,
            textAlign: 'center',
            color: theme.sub,
            opacity: b,
            transform: `translateY(${(1 - b) * 30}px)`,
          }}
        >
          {scene.subtitle}
        </div>
      )}
    </AbsoluteFill>
  );
};

export const ImageSceneView: React.FC<{scene: ImageScene; durationFrames: number}> = ({scene, durationFrames}) => {
  const frame = useCurrentFrame();
  const {fps, width} = useVideoConfig();
  const p = interpolate(frame, [0, durationFrames], [0, 1], {extrapolateRight: 'clamp'});
  const motion = scene.motion ?? 'zoom-in';
  const zoom = motion === 'zoom-out' ? 1.18 - 0.18 * p : motion === 'zoom-in' ? 1 + 0.18 * p : 1.15;
  const pan = motion === 'pan-left' ? -0.05 + 0.1 * p : motion === 'pan-right' ? 0.05 - 0.1 * p : 0;
  const titleIn = spring({frame: frame - Math.round(0.2 * fps), fps, config: {damping: 16, stiffness: 100}});
  return (
    <AbsoluteFill style={{background: '#0f172a', overflow: 'hidden'}}>
      <Img
        src={resolveSrc(scene.src)}
        style={{width: '100%', height: '100%', objectFit: 'cover', transform: `translateX(${pan * width}px) scale(${zoom})`}}
      />
      {scene.title && (
        <div
          dir="rtl"
          style={{
            position: 'absolute',
            top: '9%',
            left: 0,
            right: 0,
            textAlign: 'center',
            padding: `0 ${width * 0.06}px`,
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: width * 0.07,
            color: '#fff',
            textShadow: '0 4px 24px rgba(0,0,0,.65)',
            opacity: titleIn,
            transform: `translateY(${(1 - titleIn) * 30}px)`,
          }}
        >
          {scene.title}
        </div>
      )}
    </AbsoluteFill>
  );
};

export const LogoSceneView: React.FC<{scene: LogoScene; logo?: string}> = ({scene, logo}) => (
  <LogoCapsule logo={logo} handle={scene.handle} label={scene.label} />
);
