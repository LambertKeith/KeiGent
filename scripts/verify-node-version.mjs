#!/usr/bin/env node

const minimum = [22, 19, 0];
const current = process.versions.node.split(".").map((part) => Number(part));

const ok = current[0] > minimum[0]
  || (current[0] === minimum[0] && current[1] > minimum[1])
  || (current[0] === minimum[0] && current[1] === minimum[1] && current[2] >= minimum[2]);

if (!ok) {
  console.error(`Node ${process.versions.node} is below KeiGent release requirement >=22.19.0`);
  process.exit(1);
}

console.log(`Node ${process.versions.node} satisfies KeiGent release requirement >=22.19.0`);
