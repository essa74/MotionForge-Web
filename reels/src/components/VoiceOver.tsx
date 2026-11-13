import React from 'react';
import {Audio, staticFile} from 'remotion';

/** Voice-over from reels/public. Renders nothing when no file is given. */
export const VoiceOver: React.FC<{src?: string; volume?: number}> = ({src, volume = 1}) =>
  src ? <Audio src={staticFile(src)} volume={volume} /> : null;
