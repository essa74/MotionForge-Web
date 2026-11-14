import React from 'react';
import {AbsoluteFill, Sequence, useVideoConfig} from 'remotion';
import {Captions} from '../components/Captions';
import {VoiceOver} from '../components/VoiceOver';
import type {ReelProps} from '../lib/types';
import {ExcelSceneView, ImageSceneView, LogoSceneView, TextSceneView} from './scenes';
import {specSeconds, type ReelSpec, type Scene} from './spec';

const captionLines = (scene: Scene) =>
  typeof scene.caption === 'string'
    ? [{text: scene.caption, from: 0.2, to: Math.max(0.3, scene.duration - 0.2)}]
    : (scene.caption ?? []);

const SceneView: React.FC<{scene: Scene; logo?: string; frames: number; k: number}> = ({scene, logo, frames, k}) => {
  switch (scene.type) {
    case 'excel':
      return <ExcelSceneView scene={scene} k={k} />;
    case 'text':
      return <TextSceneView scene={scene} />;
    case 'image':
      return <ImageSceneView scene={scene} durationFrames={frames} />;
    case 'logo':
      return <LogoSceneView scene={scene} logo={logo} />;
  }
};

/** Plays a ReelSpec: scenes back to back. With a voice-over the scene lengths stretch to fill the audio. */
export const SceneReel: React.FC<ReelProps & {spec: ReelSpec}> = ({spec, voiceOver, logo}) => {
  const {fps, durationInFrames} = useVideoConfig();
  const planned = specSeconds(spec);
  // The closing logo scene keeps its own length; everything before it stretches to fit the voice.
  const last = spec.scenes[spec.scenes.length - 1];
  const tail = last?.type === 'logo' ? last.duration : 0;
  const target = durationInFrames / fps - tail;
  const body = planned - tail;
  const k = voiceOver && body > 0 ? target / body : 1;

  let cursor = 0;
  return (
    <AbsoluteFill>
      <VoiceOver src={voiceOver} />
      {spec.scenes.map((scene, i) => {
        const isTail = scene.type === 'logo' && i === spec.scenes.length - 1;
        const frames = Math.max(1, Math.round(scene.duration * (isTail ? 1 : k) * fps));
        const from = cursor;
        cursor += frames;
        const lines = captionLines(scene).map((l) => ({...l, from: l.from * (isTail ? 1 : k), to: l.to * (isTail ? 1 : k)}));
        return (
          <Sequence key={i} from={from} durationInFrames={frames}>
            <SceneView scene={scene} logo={logo} frames={frames} k={isTail ? 1 : k} />
            {lines.length > 0 && <Captions lines={lines} bottom={0.1} />}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
