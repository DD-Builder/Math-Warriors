import { createHeightfield } from '../src/overworld/heightfield.js';
import { resolvePonds } from '../src/overworld/water.js';
import { createPhysicsWorld } from '../src/overworld/physics.js';
import { SANDBOX, bodySpecFor, spawnLift } from '../src/overworld/physicsProps.js';
const kind = process.argv[2];
const hf = createHeightfield();
const places = kind === 'all' ? SANDBOX : SANDBOX.filter(p=>p.kind===kind);
const phys = await createPhysicsWorld({ heightfield: hf, ponds: resolvePonds(hf) });
const recs = [];
for (const p of places) {
  const y = hf.sampleHeight(p.x, p.z) + (p.lift ?? spawnLift(p.kind));
  recs.push([p, phys.addBody(bodySpecFor(p, y))]);
}
let t=0;
try {
  for (let f=0; f<480; f++) {
    phys.step(1/60, { simTime:t, windScale:1 }); t+=1/60;
    for (const [p, r] of recs) {
      const tr = r.body.translation();
      if (!Number.isFinite(tr.x+tr.y+tr.z)) throw new Error(`NaN on ${p.id} at f=${f}`);
      if (Math.abs(tr.y) > 900) throw new Error(`${p.id} launched to y=${tr.y.toFixed(0)} at f=${f}`);
    }
  }
  console.log(kind.padEnd(6), 'OK', places.length, 'bodies');
} catch (e) { console.log(kind.padEnd(6), 'FAIL:', e.message); }
