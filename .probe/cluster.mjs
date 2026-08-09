import { SANDBOX } from '../src/overworld/physicsProps.js';
for (const r of [8, 10, 12, 14]) {
  const lonely = [];
  for (const a of SANDBOX) {
    let n = 0;
    for (const b of SANDBOX) if (a !== b && Math.hypot(a.x-b.x, a.z-b.z) <= r) n++;
    if (n < 2) lonely.push(`${a.id}(${n})`);
  }
  console.log(`r=${r}m  under-2-neighbours: ${lonely.length ? lonely.join(' ') : 'none'}`);
}
