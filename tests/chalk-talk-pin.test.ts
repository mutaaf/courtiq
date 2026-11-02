/**
 * The chalk-talk pin in package.json and what package-lock.json actually installs must agree. Bumping the tag in
 * package.json without re-resolving the lock left production on chalk-talk 0.22 while the pin said 0.34
 * (2026-11-02). Bump with: npm install "chalk-talk@github:mutaaf/chalk-talk#vX.Y.Z"
 * .test.ts NOT .spec.ts (LESSONS#0020 / #38).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));

describe('chalk-talk pin', () => {
  it('the lock installs the version the pin names', () => {
    const tag = String(pkg.dependencies['chalk-talk']).match(/#v(\d+\.\d+\.\d+)$/);
    expect(tag, 'pin chalk-talk to a tag like github:mutaaf/chalk-talk#v1.2.3').not.toBeNull();
    expect(lock.packages['node_modules/chalk-talk'].version).toBe(tag![1]);
  });
});
