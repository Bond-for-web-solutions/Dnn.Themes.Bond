// Watch mode: rebuild one theme (development) when the theme or any shared
// package it depends on changes. Optional --deploy copies each successful
// build to an explicitly configured local DNN site.
import fs from 'node:fs';
import path from 'node:path';
import { loadWorkspace, loadTheme, dependencyClosure } from './workspace.mjs';
import { buildTheme } from './build.mjs';
import { deploy } from './ops.mjs';
import { rel } from './util.mjs';

// Markers for the VS Code background problem matcher (.vscode/tasks.json).
export const WATCH_BEGIN = 'bond: watch build started';
export const WATCH_END = 'bond: watch build finished';

export async function watchTheme(id, { deploy: deployAfterBuild = false, mode = 'development' } = {}) {
  let ws = loadWorkspace();
  const theme = loadTheme(ws, id);
  const dirs = dependencyClosure(ws, theme.pkg).map((p) => p.dir);
  let timer = null; let running = false; let queued = false;

  const run = async () => {
    if (running) { queued = true; return; }
    running = true;
    console.log(WATCH_BEGIN);
    try {
      ws = loadWorkspace(); // pick up package.json/theme.json edits
      const res = await buildTheme(ws, id, { mode });
      if (res.ok && deployAfterBuild) {
        try { deploy(ws, id); } catch (e) { console.error(`bond: error ${e.code || 'BOND700'}: deploy skipped: ${e.message}`); }
      }
    } catch (e) {
      console.error(`bond: error ${e.code || 'BOND001'}: ${e.message}`);
    } finally {
      console.log(WATCH_END);
      running = false;
      if (queued) { queued = false; run(); }
    }
  };

  await run();
  for (const dir of dirs) {
    fs.watch(dir, { recursive: true }, (_event, file) => {
      if (!file) return;
      const f = String(file).replace(/\\/g, '/');
      if (f.startsWith('node_modules/') || f.includes('/node_modules/') || f.split('/').some((s) => s.startsWith('.'))) return;
      clearTimeout(timer);
      timer = setTimeout(() => { console.log(`bond: change in ${rel(path.join(dir, file))}`); run(); }, 150);
    });
  }
  console.log(`bond: watching ${dirs.length} folder(s) for ${id}: ${dirs.map(rel).join(', ')} (Ctrl+C to stop)`);
  return new Promise(() => {});
}
