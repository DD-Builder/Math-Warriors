import { createHeightfield } from '../src/overworld/heightfield.js';
import { resolvePonds } from '../src/overworld/water.js';
import { createPhysicsWorld, PHYS } from '../src/overworld/physics.js';
import { createPhysicsProps, SANDBOX, PUZZLES } from '../src/overworld/physicsProps.js';

const hf = createHeightfield();
const ponds = resolvePonds(hf);
console.log('ponds:', ponds.map(p => `${p.id}@(${p.x},${p.z}) r${p.radius} level ${p.level.toFixed(2)}`).join(' | '));

const t0 = Date.now();
const phys = await createPhysicsWorld({ heightfield: hf, ponds });
console.log('world built in', Date.now()-t0, 'ms');

const props = createPhysicsProps({ physics: phys, heightfield: hf });
console.log('props stats', JSON.stringify(props.stats()));

// triangle + draw-call audit
let tris = 0, calls = 0;
props.group.traverse((o) => {
  if (!o.isInstancedMesh) return;
  calls++;
  const g = o.geometry;
  const per = g.index ? g.index.count/3 : g.attributes.position.count/3;
  tris += per * o.count;
  console.log(`  ${o.name.padEnd(12)} cap=${String(o.count).padStart(3)}  ${String(per).padStart(4)} tris each  ${per*o.count} total`);
});
console.log(`DRAW CALLS: ${calls}   TRIANGLES (all slots): ${tris}`);

// settle 8 s
let t = 0, steps = 0;
const T0 = Date.now();
for (let f = 0; f < 480; f++) { steps += phys.step(1/60, { simTime: t, windScale: 1 }); props.update(1/60); t += 1/60; }
const ms = Date.now()-T0;
console.log(`\n480 frames / ${steps} substeps in ${ms} ms  =>  ${(ms/480).toFixed(3)} ms per frame`);
console.log('phys stats', JSON.stringify(phys.stats()));

// how far did each body drift from its authored spot?
let sunk = 0, drift = 0, worst = 0, worstId = '';
for (const p of SANDBOX) {
  const rec = phys.get(p.id);
  if (!rec) { console.log('MISSING', p.id); continue; }
  const tr = rec.body.translation();
  const g = hf.sampleHeight(tr.x, tr.z);
  const d = Math.hypot(tr.x - p.x, tr.z - p.z);
  drift += d; if (d > worst) { worst = d; worstId = p.id; }
  if (tr.y < g - 1.0) { sunk++; console.log('  BELOW GROUND:', p.id, 'y', tr.y.toFixed(2), 'ground', g.toFixed(2)); }
}
console.log(`mean drift ${ (drift/SANDBOX.length).toFixed(2) } m, worst ${worst.toFixed(2)} m (${worstId}), below-ground ${sunk}`);
console.log('awake after 8 s:', phys.stats().awake, 'of', phys.stats().bodies);

// leaf on the pool?
const leaf = phys.get('phx-g-leaf-5');
console.log('pond leaf wet =', leaf.wet.toFixed(3), 'y =', leaf.body.translation().y.toFixed(3), 'pond level', ponds[0].level.toFixed(3));

// puzzle reachability: are the puzzle zones on walkable-ish ground?
for (const p of PUZZLES) for (const z of p.zones) {
  const g = hf.sampleHeight(z.x, z.z), n = hf.sampleNormal(z.x, z.z);
  const slope = Math.acos(Math.max(-1,Math.min(1,n[1]))) * 180/Math.PI;
  console.log(`${p.id}/${z.id} ground ${g.toFixed(2)} slope ${slope.toFixed(1)}deg`);
}
props.dispose(); phys.dispose();
