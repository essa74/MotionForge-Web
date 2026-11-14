// Copies the shared video engine from reels/src into the app (motionforge-app/src/reels-engine).
// reels/src is the source of truth: edit there, then run `npm run sync-engine`.
// The app keeps its own copy so it builds on its own (for example on StackBlitz, which only opens that folder).
import {cpSync, mkdirSync, rmSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, '../motionforge-app/src/reels-engine');

rmSync(target, {recursive: true, force: true});
mkdirSync(join(target, 'lib'), {recursive: true});
cpSync(join(root, 'src/components'), join(target, 'components'), {recursive: true});
cpSync(join(root, 'src/engine'), join(target, 'engine'), {recursive: true});
for (const file of ['assets.ts', 'theme.ts', 'types.ts']) cpSync(join(root, 'src/lib', file), join(target, 'lib', file));
// Fonts for the in-browser renderer.
mkdirSync(resolve(root, '../motionforge-app/src/studio/fonts'), {recursive: true});
cpSync(join(root, 'public/fonts'), resolve(root, '../motionforge-app/src/studio/fonts'), {recursive: true, filter: (src) => !src.endsWith('.txt')});
console.log('Engine copied to', target);
