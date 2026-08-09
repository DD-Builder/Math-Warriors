import { PROP_KINDS, kindMass, windResponse } from '../src/overworld/physicsProps.js';
import { PHYS } from '../src/overworld/physics.js';
console.log('kind    mass       sail       accel@5.6  accel@gust9  friction-hold');
for (const [k, v] of Object.entries(PROP_KINDS)) {
  const m = kindMass(k);
  // static friction resists up to mu * m * g; express as the accel it cancels
  const hold = v.friction * -PHYS.gravity;
  console.log(k.padEnd(7), m.toExponential(2).padEnd(10), v.sail.toExponential(2).padEnd(10),
    windResponse(k).toFixed(3).padStart(8), windResponse(k, 9).toFixed(3).padStart(11), hold.toFixed(1).padStart(12));
}
