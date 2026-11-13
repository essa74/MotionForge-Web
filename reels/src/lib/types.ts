/** A subtitle line. `from` and `to` are in seconds on the voice-over timeline. */
export type CaptionLine = {text: string; from: number; to: number};

/** Props every reel accepts, so the render script can override them per run. */
export type ReelProps = {
  /** File inside reels/public, e.g. "voice.mp3". When set, reel length follows the audio. */
  voiceOver?: string;
  /** File inside reels/public, e.g. "logo.png". */
  logo?: string;
  /** Overrides the reel's default format. */
  format?: 'vertical' | 'horizontal' | 'square';
};
