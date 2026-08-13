#!/usr/bin/env node
// scripts/bump-version.mjs
// Auto-bumps package.json's version so store uploads never ship the same
// version twice. Wired into `npm run build` and `npm run zip` (runs before
// the wxt step, so the built manifest always carries the new version). Usage:
//   node scripts/bump-version.mjs          -> bumps patch (1.0.0 -> 1.0.1)
//   node scripts/bump-version.mjs 1.0.1    -> sets an explicit version
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = join(root, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

const [major, minor, patch] = pkg.version.split('.').map((n) => Number(n));
const next = process.argv[2] || `${major}.${minor}.${patch + 1}`;

if (!/^\d+\.\d+\.\d+$/.test(next)) {
  console.error(`Invalid version "${next}" - use X.Y.Z, e.g. 0.2.0`);
  process.exit(1);
}

pkg.version = next;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(next);
