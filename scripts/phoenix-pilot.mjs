#!/usr/bin/env node
/** Запускает локальный сервер питомца и каталог из готовых билдов игр. */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const python = join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const sitePort = Number(process.env.GAMEWINGO_PILOT_SITE_PORT || 4173);
const apiPort = Number(process.env.GAMEWINGO_PILOT_API_PORT || 8788);
if (!existsSync(python)) {
  console.error('Сначала установите backend/requirements.txt в .venv (см. docs/concepts/phoenix/PILOT-TEST.md).');
  process.exit(1);
}
if (!existsSync(join(root, 'games', 'soz', 'dist', 'index.html'))) {
  console.error('Сначала выполните npm run build:all.');
  process.exit(1);
}
process.env.GAMEWINGO_PET_PILOT_API = `http://127.0.0.1:${apiPort}/pet`;
const catalog = spawn(process.execPath, [join(root, 'scripts', 'build-catalog.mjs')], {
  cwd: root, env: process.env, stdio: 'inherit', shell: false,
});
catalog.on('exit', (code) => {
  if (code !== 0) { process.exitCode = code || 1; return; }
  const backend = spawn(python, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(apiPort)], {
    cwd: join(root, 'backend'),
    env: { ...process.env, GAMEWINGO_PET_PILOT: '1',
      GAMEWINGO_PET_DB: join(root, 'backend', 'data', 'pet-pilot.sqlite3') },
    stdio: 'inherit',
  });
  const site = spawn(python, ['-m', 'http.server', String(sitePort), '--bind', '127.0.0.1',
    '--directory', join(root, 'dist-all')], { cwd: root, stdio: 'inherit' });
  const stop = () => { backend.kill(); site.kill(); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  backend.once('exit', () => site.kill());
  site.once('exit', () => backend.kill());
  console.log(`Пилот феникса: http://127.0.0.1:${sitePort}/phoenix.html?lang=ru`);
  console.log(`Диагностика: http://127.0.0.1:${sitePort}/pet-pilot-check.html`);
  console.log('Ctrl+C останавливает оба сервера.');
});
