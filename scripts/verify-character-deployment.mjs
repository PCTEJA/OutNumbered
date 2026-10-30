import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const base = process.argv[2] ?? 'https://outnumbered-henna.vercel.app';
const hash = data => createHash('sha256').update(data).digest('hex');
await Promise.all(['c01', 'c01f'].map(async variant => {
  const path = `/characters/${variant}-animated.glb`;
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  const remote = Buffer.from(await response.arrayBuffer());
  const local = await readFile(new URL(`../public${path}`, import.meta.url));
  if (hash(remote) !== hash(local)) throw new Error(`${variant}: deployed GLB differs from the validated local asset`);
  console.log(`${variant}: HTTP 200, ${remote.length} bytes, SHA-256 matches local export`);
}));
const response = await fetch(new URL('/characters.html', base), { signal: AbortSignal.timeout(30000) });
if (!response.ok) throw new Error(`Studio: HTTP ${response.status}`);
const html = await response.text();
const local = await readFile(new URL('../dist/characters.html', import.meta.url), 'utf8');
const entry = local.match(/src="([^"]+characters[^\"]+\.js)"/)?.[1];
if (!entry || !html.includes(entry)) throw new Error('Deployed studio does not reference the validated build');
console.log(`Studio: HTTP 200, production references ${entry}`);
