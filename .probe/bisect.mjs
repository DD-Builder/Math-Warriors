import { createHeightfield } from '../src/overworld/heightfield.js';
import { resolvePonds } from '../src/overworld/water.js';
import { createPhysicsWorld } from '../src/overworld/physics.js';
import { SANDBOX, bodySpecFor, spawnLift } from '../src/overworld/physicsProps.js';
const hf = createHeightfield();
const ponds = resolvePonds(hf);

async function run(label, opts, places) {
  const phys = await createPhysicsWorld({ heightfield: hf, ...opts });
  for (const p of places) {
    const y = hf.sampleHeight(p.x, p.z) + (p.lift ?? spawnLift(p.kind));
    phys.addBody(bodySpecFor(p, y));
  }
  let t=0;
  try {
    for (let f=0; f<480; f++) { phys.step(1/60, { simTime:t, windScale:1 }); t+=1/60; }
    console.log(label, 'OK');
  } catch (e) { console.log(label, 'PANIC at t=', t.toFixed(2), e.message); }
  phys.dispose();
}
await run('no bodies, with ponds       ', { ponds }, []);
await run('no bodies, no ponds         ', { ponds: [] }, []);
await run('all bodies, no ponds        ', { ponds: [] }, SANDBOX);
await run('all bodies, with ponds      ', { ponds }, SANDBOX);
for (const kind of ['crate','ball','log','plank','leaf','stone']) {
  await run(`only ${kind.padEnd(6)} , with ponds `, { ponds }, SANDBOX.filter(p=>p.kind===kind));
}
