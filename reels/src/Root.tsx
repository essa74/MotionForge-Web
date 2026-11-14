import React from 'react';
import {Composition, staticFile} from 'remotion';
import {getAudioDurationInSeconds} from '@remotion/media-utils';
import './lib/fonts';
import {FORMATS} from './lib/theme';
import type {ReelProps} from './lib/types';
import {specSeconds} from './engine/spec';
import {reels} from './registry';

export const Root: React.FC = () => (
  <>
    {reels.map((reel) => (
      <Composition
        key={reel.id}
        id={reel.id}
        component={reel.component}
        defaultProps={{} as ReelProps}
        fps={reel.fps}
        width={FORMATS[reel.format].width}
        height={FORMATS[reel.format].height}
        durationInFrames={Math.round(reel.seconds * reel.fps)}
        calculateMetadata={async ({props: rawProps}) => {
          const props = rawProps as ReelProps;
          const {width, height} = FORMATS[props.format ?? props.spec?.format ?? reel.format];
          // With a voice-over, the reel length follows the audio exactly (plus the logo tail).
          const seconds = props.voiceOver
            ? (await getAudioDurationInSeconds(staticFile(props.voiceOver))) + (reel.tailSeconds ?? 0)
            : props.spec
              ? specSeconds(props.spec)
              : reel.seconds;
          return {width, height, fps: reel.fps, durationInFrames: Math.max(1, Math.ceil(seconds * reel.fps))};
        }}
      />
    ))}
  </>
);
