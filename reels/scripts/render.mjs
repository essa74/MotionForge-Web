#!/usr/bin/env node
// Usage: npm run render -- <CompositionId> [--voice voice.mp3] [--logo logo.png]
//          [--format vertical|horizontal|square] [--out out/name.mp4] [--frames 0-59]
// Files named by --voice / --logo must be inside reels/public.
import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, rmSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) flags[argv[i].slice(2)] = argv[++i];
    else positional.push(argv[i]);
  }
  return {positional, flags};
}

function fail(message) {
  console.error('Error: ' + message);
  process.exit(1);
}

const {positional, flags} = parseArgs(process.argv.slice(2));
const id = positional[0];
if (!id) fail('Usage: npm run render -- <CompositionId> [--voice file] [--logo file] [--format f] [--out path]');

const props = {};
if (flags.voice) props.voiceOver = flags.voice;
if (flags.logo) props.logo = flags.logo;
if (flags.format) {
  if (!['vertical', 'horizontal', 'square'].includes(flags.format)) fail('--format must be vertical, horizontal or square');
  props.format = flags.format;
}
for (const key of ['voiceOver', 'logo']) {
  if (props[key] && !existsSync(join(root, 'public', props[key]))) fail(`public/${props[key]} not found`);
}

const out = resolve(root, flags.out ?? `out/${id}.mp4`);
const raw = out.replace(/\.mp4$/i, '') + '.raw.mp4';
mkdirSync(dirname(out), {recursive: true});

// Use an installed Chrome when there is one (offline machines, CI images); otherwise Remotion downloads its own.
const chrome = process.env.CHROME_PATH || ['/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);
const args = [
  'remotion', 'render', 'src/index.ts', id, raw,
  '--codec=h264', '--pixel-format=yuv420p', '--audio-codec=aac', '--crf=18', '--log=error',
  '--props=' + JSON.stringify(props),
];
if (chrome) args.push('--browser-executable=' + chrome, '--chrome-mode=chrome-for-testing');
if (flags.frames) args.push('--frames=' + flags.frames);

const render = spawnSync('npx', args, {cwd: root, stdio: 'inherit'});
if (render.status !== 0) fail('render failed');

// Remotion's output is "full range" (yuvj420p), which some phones and uploaders refuse to open.
// Convert to standard limited-range BT.709 H.264 and put the index at the front (faststart).
const encode = spawnSync(
  'ffmpeg',
  [
    '-y', '-v', 'error', '-i', raw,
    '-vf', 'scale=in_range=pc:in_color_matrix=bt601:out_range=tv:out_color_matrix=bt709,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-profile:v', 'high', '-level', '4.1',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-c:a', 'copy', '-movflags', '+faststart', out,
  ],
  {stdio: 'inherit'},
);
if (encode.status !== 0) fail('ffmpeg could not convert the render to a standard MP4');
rmSync(raw, {force: true});

// Verify the result instead of assuming it is fine.
const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,pix_fmt,width,height,r_frame_rate:format=duration,size', '-of', 'json', out], {encoding: 'utf8'});
if (probe.status !== 0) fail('ffprobe could not read the output file');
const info = JSON.parse(probe.stdout);
const video = info.streams.find((s) => s.codec_type === 'video');
const audio = info.streams.find((s) => s.codec_type === 'audio');
const problems = [];
if (!video || video.codec_name !== 'h264') problems.push('video is not H.264');
if (video && video.pix_fmt !== 'yuv420p') problems.push('pixel format is not yuv420p');
if (props.voiceOver && (!audio || audio.codec_name !== 'aac')) problems.push('voice-over audio missing or not AAC');
if (problems.length) fail(problems.join('; '));

console.log(
  `OK ${out}\n  ${video.width}x${video.height} ${video.r_frame_rate} fps, ${Number(info.format.duration).toFixed(2)}s, ` +
    `${(Number(info.format.size) / 1e6).toFixed(1)} MB, audio: ${audio ? audio.codec_name : 'none'}`,
);
