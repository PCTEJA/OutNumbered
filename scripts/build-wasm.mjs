import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import asc from 'assemblyscript/asc';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await mkdir(path.join(root, 'public', 'wasm'), { recursive: true });
const result = await asc.main([
  path.join(root, 'assembly', 'index.ts'),
  '--outFile', path.join(root, 'public', 'wasm', 'outnumbered.wasm'),
  '--textFile', path.join(root, 'public', 'wasm', 'outnumbered.wat'),
  '--optimizeLevel', '3',
  '--shrinkLevel', '2',
  '--runtime', 'stub',
  '--noAssert',
], { stdout: process.stdout, stderr: process.stderr });
if (result.error) {
  console.error('Could not compile the OutNumbered WebAssembly core:', result.error);
  process.exitCode = 1;
} else {
  console.log('Built public/wasm/outnumbered.wasm');
}
