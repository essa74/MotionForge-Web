# EssaXcel reels library

Shared Remotion components plus one file per reel. Rendering runs on any machine with Node 22, ffmpeg and Chrome. No server, no paid API.

## Render

```bash
cd reels
npm install
npm run render -- TemplateDemo                         # uses the reel's default format
npm run render -- TemplateDemo --voice voice.mp3 --logo logo.png --format vertical --out out/my-reel.mp4
```

- `--voice` and `--logo` name files inside `reels/public/`. With a voice-over, the reel length follows the audio exactly, plus the logo tail set in `registry.ts`.
- `--format` is `vertical` (1080x1920), `horizontal` (1920x1080) or `square` (1080x1080).
- `--frames 0-59` renders a short preview.
- The script finishes with ffmpeg: H.264, `yuv420p`, limited-range BT.709, AAC audio, index at the front. Remotion's own output is full-range (`yuvj420p`), which some phones and uploaders reject. The script then checks the result with ffprobe and fails if anything is off.
- Chrome: the script uses `/usr/bin/google-chrome` or `/usr/bin/chromium` when present, or the path in `CHROME_PATH`. Otherwise Remotion downloads its own browser.

## Add a reel

1. Copy `src/reels/TemplateDemo.tsx` to `src/reels/<Name>.tsx`; change the data, captions (seconds on the voice-over timeline) and scenes.
2. Add one entry to `src/registry.ts`.
3. `npm run studio` to preview, `npm run check` to typecheck.

## Components (`src/components`)

| Component | Use |
| --- | --- |
| `ExcelSheet` | Simulated Excel window (RTL by default): ribbon, formula bar, cells, animated selection |
| `KeyCaps` | Keyboard keys shown in sequence (Ctrl + A, Alt + H + O + I) |
| `Captions` | Small, calm Arabic subtitle pill; English runs such as `Ctrl + A` keep their order |
| `LogoCapsule` | Closing logo with the "follow the page" capsule |
| `VoiceOver` | Voice-over track from `public/` |

Fonts: Cairo (SIL Open Font License), bundled in `public/fonts`.

## Notes

- `out/` is git-ignored. Put each reel's voice-over and logo in `public/` only while rendering; do not commit large media.
- `render-demo/`, `worker/` and `backend/` are the earlier server-based experiment and are not used by this library.
