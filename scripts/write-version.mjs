// Build-time: stamp the app version into public/version.json (fetched at
// runtime for the update check) and keep src/config.js VERSION in exact
// lockstep, so the runtime "am I the latest build?" comparison can never
// drift from package.json.
import { readFileSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
const v = pkg.version;

writeFileSync(new URL('../public/version.json', import.meta.url), JSON.stringify({ version: v }) + '\n');

const cfgUrl = new URL('../src/config.js', import.meta.url);
const cfg = readFileSync(cfgUrl, 'utf8').replace(/export const VERSION = '[^']*';/, `export const VERSION = '${v}';`);
writeFileSync(cfgUrl, cfg);

console.log(`[write-version] ${v} -> public/version.json + config.VERSION`);
