import React from 'react';
import {staticFile} from 'remotion';
import {Audio} from '@remotion/media';

const isUrl = (value: string) => /^(blob:|data:|https?:)/.test(value);

/** Voice-over: a file name inside reels/public, or a full URL (blob: in the browser). */
export const VoiceOver: React.FC<{src?: string; volume?: number}> = ({src, volume = 1}) =>
  src ? <Audio src={isUrl(src) ? src : staticFile(src)} volume={volume} /> : null;
