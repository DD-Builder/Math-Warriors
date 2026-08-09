import { createHeightfield } from '../src/overworld/heightfield.js';
import { resolvePonds } from '../src/overworld/water.js';
import { buildTerrainHeights } from '../src/overworld/physics.js';
const hf = createHeightfield();
const g = buildTerrainHeights((x,z)=>hf.sampleHeight(x,z), { size:480, cells:96 });
let bad=0, min=1e9, max=-1e9;
for (const h of g.heights) { if (!Number.isFinite(h)) bad++; if (h<min) min=h; if (h>max) max=h; }
console.log('terrain heights: bad', bad, 'min', min.toFixed(2), 'max', max.toFixed(2));
console.log('ponds', JSON.stringify(resolvePonds(hf)));
