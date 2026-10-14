import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { zipSync, strToU8 } from 'fflate';
const root = new URL('../', import.meta.url);
const files = ['policy.js', 'content.js', 'content.css'];
const icons = [16, 32, 48, 128].map(size => `icons/icon-${size}.png`);
const packageInfo = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
await mkdir(new URL('dist/', root), { recursive: true });
const sums = [];
// ZIP timestamps use local components: constant components keep builds reproducible
// across timezones as well as repeated builds.
const entry = body => [typeof body === 'string' ? strToU8(body) : body, { mtime: new Date(2020, 0, 1) }];
async function archiveFile(filename, entries) {
  const data = zipSync(entries, { level: 9 });
  await writeFile(new URL(`dist/${filename}`, root), data);
  sums.push(`${createHash('sha256').update(data).digest('hex')}  ${filename}`);
  console.log(`Built ${filename}`);
}
for (const browser of ['chromium', 'firefox']) {
  const dir = new URL(`dist/${browser}/`, root);
  await mkdir(dir, { recursive: true });
  const manifest = JSON.parse((await readFile(new URL(`manifests/${browser}.json`, root), 'utf8')).replace(/^\uFEFF/, ''));
  if (manifest.version !== packageInfo.version) throw new Error('Manifest/package version mismatch');
  const archive = {};
  const entries = [['manifest.json', JSON.stringify(manifest, null, 2) + '\n']];
  for (const file of files) entries.push([file, (await readFile(new URL(`src/${file}`, root), 'utf8')).replace(/^\uFEFF/, '')]);
  for (const name of icons) entries.push([name, await readFile(new URL(name, root))]);
  await mkdir(new URL('icons/', dir), { recursive: true });
  for (const [name, body] of entries) {
    await writeFile(new URL(name, dir), body);
    archive[name] = entry(body);
  }
  await archiveFile(`hush-${manifest.version}-${browser}${browser === 'firefox' ? '-unsigned.xpi' : '.zip'}`, archive);
}
const source = {};
for (const path of ['.gitignore', 'LICENSE', 'README.md', 'package.json', 'package-lock.json']) source[path] = entry(await readFile(new URL(path, root)));
for (const dir of ['src', 'manifests', 'scripts', 'tests', 'docs', 'icons']) {
  for (const name of (await readdir(new URL(dir + '/', root))).sort()) {
    const path = dir + '/' + name;
    source[path] = entry(await readFile(new URL(path, root)));
  }
}
await archiveFile(`hush-${packageInfo.version}-source.zip`, source);
await writeFile(new URL('dist/SHA256SUMS', root), sums.join('\n') + '\n');
