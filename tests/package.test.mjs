import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const { version } = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
test('packages contain exactly local runtime assets and scoped static content scripts', async () => {
  for (const browser of ['chromium', 'firefox']) {
    const name = `hush-${version}-${browser}${browser === 'firefox' ? '-unsigned.xpi' : '.zip'}`;
    const data = await readFile(new URL('dist/' + name, root));
    const archive = unzipSync(data);
    assert.deepEqual(Object.keys(archive).sort(), ['content.css','content.js','icons/icon-128.png','icons/icon-16.png','icons/icon-32.png','icons/icon-48.png','manifest.json','policy.js']);
    const manifest = JSON.parse(strFromU8(archive['manifest.json']));
    assert.equal(manifest.manifest_version, browser === 'firefox' ? 2 : 3);
    for (const key of ['permissions','host_permissions','background','web_accessible_resources','externally_connectable','update_url']) assert.equal(key in manifest, false, key);
    assert.deepEqual(manifest.content_scripts[0].matches, ['https://www.instagram.com/*','https://instagram.com/*','https://m.instagram.com/*']);
    assert.equal(manifest.content_scripts[0].run_at, 'document_start');
    for (const file of ['content.css','content.js','policy.js']) {
      assert.equal(strFromU8(archive[file]), (await readFile(new URL('src/' + file, root), 'utf8')).replace(/^\uFEFF/, ''));
    }
    const sums = await readFile(new URL('dist/SHA256SUMS', root), 'utf8');
    assert.ok(sums.includes(`${createHash('sha256').update(data).digest('hex')}  ${name}`));
  }
});

test('complete source archive contains editable source, lockfile, tests and documentation only', async () => {
  const archive = unzipSync(await readFile(new URL(`dist/hush-${version}-source.zip`, root)));
  for (const name of ['src/content.js','src/policy.js','src/content.css','manifests/chromium.json','manifests/firefox.json','scripts/build.mjs','scripts/browser-test.mjs','tests/content.test.mjs','tests/package.test.mjs','README.md','docs/INSTALL.md','docs/VERIFICATION.md','package-lock.json']) {
    assert.ok(archive[name], name);
    assert.equal(strFromU8(archive[name]), await readFile(new URL(name, root), 'utf8'), name);
  }
  assert.ok(Object.keys(archive).every(name => !name.startsWith('node_modules/') && !name.startsWith('test-results/') && !name.startsWith('.git/')));
});
