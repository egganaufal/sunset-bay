// SOLMARA's entrypoint (Node 22, standard library only). The game is plain static files
// under game/ — index.html and its ES modules, three.js vendored under game/vendor/ — and
// this program hands it in: it copies game/ and screenshots/ from beside this file to
// /output and writes /output/dossier.json, the summary the judge reads, with the vendored
// make.fun library. Run it locally with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function countEntries(dir) {
  let files = 0;
  let bytes = 0;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, name.name);
    if (name.isDirectory()) {
      const sub = countEntries(path);
      files += sub.files;
      bytes += sub.bytes;
    } else if (name.isFile()) {
      files += 1;
      bytes += statSync(path).size;
    }
  }
  return { files, bytes };
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's caps (reference/gate.json): text_max_bytes shapes the dossier's bytes; the
// other caps refuse an entry the scorer would refuse — more than 4 screenshots or one
// over 256 KiB; more than 993 files in game/ or 48 MiB of game files in all; a path under
// game/ over 1000 bytes. game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json.
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);

// A one-line receipt for the run: what went into /output, so a bad copy is obvious.
const gameTotals = countEntries(join(out, 'game'));
const shotTotals = countEntries(join(out, 'screenshots'));
console.log(
  `solmara: game/ ${gameTotals.files} files, ${gameTotals.bytes} bytes; ` +
  `screenshots/ ${shotTotals.files} files, ${shotTotals.bytes} bytes; ` +
  `dossier.json ${dossier.length} bytes -> ${out}`,
);
