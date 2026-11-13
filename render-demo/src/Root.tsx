import React from 'react';
import {Composition} from 'remotion';
import {EssaStudioIntro} from './EssaStudioIntro';

export const Root: React.FC = () => (
  <Composition
    id="EssaStudioIntro"
    component={EssaStudioIntro}
    durationInFrames={210}
    fps={30}
    width={1920}
    height={1080}
  />
);
