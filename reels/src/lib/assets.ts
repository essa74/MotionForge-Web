import {staticFile} from 'remotion';

const isUrl = (value: string) => /^(blob:|data:|https?:)/.test(value);

/** A file name inside reels/public, or a full URL (blob:/data: in the browser). */
export const resolveSrc = (src: string) => (isUrl(src) ? src : staticFile(src));
