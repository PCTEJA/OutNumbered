import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
if (!existsSync('public/wasm/outnumbered.wasm')) {
  const { status } = await new Promise(resolve => {
    const child = spawn(process.execPath, ['scripts/build-wasm.mjs'], { stdio: 'inherit' });
    child.on('exit', status => resolve({ status }));
  });
  if (status) process.exit(status);
}
const children = [
  spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { stdio: 'inherit' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '0.0.0.0'], { stdio: 'inherit' }),
];
let stopping = false;
function stop(code = 0) { if (stopping) return; stopping = true; children.forEach(child => child.kill()); process.exit(code); }
children.forEach(child => child.on('exit', code => stop(code ?? 0)));
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
