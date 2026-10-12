import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

/** Launch Vite directly: no npm/cmd process tree or Windows WMI cleanup. */
export function startQaGame(root, slug, port) {
  const gameRoot = join(root, 'games', slug);
  const dev = JSON.parse(readFileSync(join(gameRoot, 'package.json'), 'utf8')).scripts.dev;
  const config = /^vite --config ([\w./-]+)$/.exec(dev)?.[1];
  if (!config) throw new Error(`Unsupported QA dev command for ${slug}: ${dev}`);
  return spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--config',
    join(gameRoot, config), '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: gameRoot, env: { ...process.env, PORT: String(port) },
    stdio: 'ignore', windowsHide: true,
  });
}
async function bounded(work) {
  let timer;
  try { await Promise.race([work, new Promise(resolve => { timer = setTimeout(resolve, 3000); })]); }
  finally { clearTimeout(timer); }
}
export async function stopQaGame(server) {
  if (server.exitCode !== null || server.signalCode !== null) return;
  const exited = new Promise(resolve => server.once('exit', resolve));
  server.kill(); await bounded(exited);
  if (server.exitCode === null && server.signalCode === null) server.kill('SIGKILL');
}
export async function launchQaBrowser(executablePath) {
  const server = await chromium.launchServer({ executablePath });
  const browser = await chromium.connect(server.wsEndpoint());
  return { browser, async close() {
    await bounded(browser.close()); await bounded(server.close());
    const process = server.process();
    if (process.exitCode === null && process.signalCode === null) process.kill();
  } };
}
