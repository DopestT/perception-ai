import assert from 'node:assert/strict';
import { pages, site } from './site.config.mjs';

assert.equal(site.domain, 'https://hagerstownbasementwaterproofing.com');
assert.equal(pages.length, 19);
assert.equal(new Set(pages.map((page) => page.path)).size, pages.length);
for (const page of pages) {
  assert.ok(page.path.startsWith('/'));
  assert.ok(page.title.length > 10);
  assert.ok(page.description.length > 20);
  assert.ok(page.h1.length > 3);
  assert.ok(page.intro.length > 20);
  assert.ok(Array.isArray(page.bullets) && page.bullets.length >= 4);
}
console.log(`Validated ${pages.length} Hagerstown microsite pages.`);
