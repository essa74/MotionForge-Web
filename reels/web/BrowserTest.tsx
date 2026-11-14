import React from 'react';
import {AbsoluteFill, Sequence, useVideoConfig} from 'remotion';
import {VoiceOver} from '../src/components/VoiceOver';
import {TemplateDemo} from '../src/reels/TemplateDemo';
import type {ReelProps} from '../src/lib/types';

/** Test composition: the demo reel repeated to fill the requested length. */
export const BrowserTest: React.FC<ReelProps> = ({voiceOver, logo}) => {
  const {fps, durationInFrames} = useVideoConfig();
  const segment = 10 * fps;
  const count = Math.ceil(durationInFrames / segment);
  return (
    <AbsoluteFill>
      <VoiceOver src={voiceOver} />
      {Array.from({length: count}, (_, i) => (
        <Sequence key={i} from={i * segment} durationInFrames={segment}>
          <TemplateDemo logo={logo} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
