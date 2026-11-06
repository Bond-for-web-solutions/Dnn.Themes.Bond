// `bond menu`: pick a command and (if needed) a theme with the arrow keys.
// Themes are read from themes/* at run time, so the menu never needs editing
// when a theme is added. Every entry runs the same command as package.json /
// the CLI, nothing menu-specific.
import path from 'node:path';
import readline from 'node:readline';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { repoRoot, readJson, BondError, printOutcome } from './util.mjs';
import { loadWorkspace } from './workspace.mjs';

const CLI = fileURLToPath(new URL('../bin/bond.mjs', import.meta.url));

// theme: 'one' = pick a theme, 'one-or-all' = pick a theme or "all".
// run(ids) returns { cli: [...] } (bond CLI args) or { script: 'name' } (package.json script).
export const ACTIONS = [
  { id: 'build', label: 'Build theme (production)', hint: 'compile, validate, package -> publish/<theme>', theme: 'one', run: ([t]) => ({ cli: ['build', t, '--mode', 'production'] }) },
  { id: 'build-dev', label: 'Build theme (development)', hint: 'readable CSS/JS + source maps, no ZIP', theme: 'one', run: ([t]) => ({ cli: ['build', t, '--mode', 'development'] }) },
  { id: 'build-all', label: 'Build all themes (production)', hint: 'every theme in themes/', run: () => ({ cli: ['build', '--all', '--mode', 'production'] }) },
  { id: 'watch', label: 'Watch theme', hint: 'rebuild on theme + shared package changes (Ctrl+C to stop)', theme: 'one', run: ([t]) => ({ cli: ['watch', t] }) },
  { id: 'validate', label: 'Validate packages', hint: 're-verify publish/ (files, ZIPs, checksums)', run: () => ({ cli: ['validate', '--all'] }) },
  { id: 'deploy', label: 'Deploy theme locally', hint: 'copy to the LOCAL DNN site in .env', theme: 'one', run: ([t]) => ({ cli: ['deploy', t] }) },
  { id: 'clean', label: 'Clean publish output', hint: 'delete generated publish/<theme> only', theme: 'one-or-all', run: (ids) => ({ cli: ['clean', ...(ids.length > 1 ? ['--all'] : ids)] }) },
  { id: 'check', label: 'Check architecture', hint: 'package boundaries, layers, theme identities', run: () => ({ cli: ['check'] }) },
  { id: 'lint', label: 'Lint (CSS + JS)', hint: 'Stylelint + ESLint', run: () => ({ script: 'lint' }) },
  { id: 'test', label: 'Integration tests', hint: 'node:test suite', run: () => ({ script: 'test' }) },
  { id: 'test-visual', label: 'Visual + isolation tests', hint: 'Playwright', run: () => ({ script: 'test:visual' }) },
  { id: 'affected', label: 'Which themes are affected', hint: 'changes since origin/main', run: () => ({ cli: ['affected', '--base', 'origin/main'] }) },
  { id: 'snapshot', label: 'Record release snapshot', hint: 'file list for DNN Cleanup on the next upgrade', theme: 'one', run: ([t]) => ({ cli: ['snapshot', t] }) },
  { id: 'create-theme', label: 'Create a new theme', hint: 'scaffold themes/<id> (asks for a name)', create: true },
];

const interactive = () => process.stdin.isTTY && process.stdout.isTTY;

/** Arrow-key list in a terminal; numbered prompt otherwise (also accepts an id). */
async function select(title, items) {
  if (!interactive()) return selectByNumber(title, items);
  closeReader();
  return new Promise((resolve, reject) => {
    let i = 0;
    const out = process.stdout;
    const draw = (first) => {
      if (!first) out.write(`\x1b[${items.length}A`);
      for (let k = 0; k < items.length; k++) {
        const it = items[k];
        const line = k === i ? `\x1b[36m❯ ${it.label}\x1b[0m${it.hint ? `  \x1b[2m${it.hint}\x1b[0m` : ''}` : `  ${it.label}`;
        out.write(`\x1b[2K${line}\n`);
      }
    };
    out.write(`${title} \x1b[2m(↑/↓ then Enter, Esc to cancel)\x1b[0m\n\x1b[?25l`);
    draw(true);
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const done = (fn) => {
      process.stdin.off('keypress', onKey);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      out.write('\x1b[?25h');
      fn();
    };
    const onKey = (_s, key = {}) => {
      if (key.name === 'up' || key.name === 'k') { i = (i - 1 + items.length) % items.length; draw(); }
      else if (key.name === 'down' || key.name === 'j') { i = (i + 1) % items.length; draw(); }
      else if (key.name === 'return' || key.name === 'enter') done(() => resolve(items[i]));
      else if (key.name === 'escape' || (key.ctrl && key.name === 'c')) done(() => reject(new BondError('Cancelled.', 'BOND003')));
    };
    process.stdin.on('keypress', onKey);
  });
}

async function selectByNumber(title, items) {
  console.log(title);
  items.forEach((it, k) => console.log(`  ${k + 1}) ${it.label}${it.hint ? `  - ${it.hint}` : ''}`));
  const answer = (await ask('Choose: ')).trim();
  const hit = /^\d+$/.test(answer) ? items[Number(answer) - 1] : items.find((it) => it.value === answer || it.label.toLowerCase() === answer.toLowerCase());
  if (!hit) throw new BondError(`"${answer}" is not one of the options.`, 'BOND002');
  return hit;
}

// One line reader for the whole menu: a reader per question would drop input
// that was already buffered (e.g. answers piped in by tests).
// Lines are queued: with piped input readline emits every buffered line at
// once, and a line that arrives while no question is pending would be lost.
let rl = null; const lines = []; const waiting = []; let ended = false;
async function ask(question, fallback = '') {
  if (!rl) {
    rl = readline.createInterface({ input: process.stdin, terminal: false });
    rl.on('line', (l) => (waiting.length ? waiting.shift()(l) : lines.push(l)));
    rl.on('close', () => { ended = true; while (waiting.length) waiting.shift()(null); });
  }
  process.stdout.write(question);
  const line = lines.length ? lines.shift() : ended ? null : await new Promise((r) => waiting.push(r));
  if (line === null) throw new BondError('No input (stdin closed).', 'BOND003');
  if (!process.stdin.isTTY) process.stdout.write(`${line}\n`);
  return line.trim() || fallback;
}
function closeReader() { if (rl) { rl.close(); rl = null; } }

function runCli(args) {
  closeReader();
  console.log(`\n> bond ${args.join(' ')}\n`);
  return spawnSync(process.execPath, [CLI, ...args], { cwd: repoRoot, stdio: 'inherit' }).status ?? 1;
}

export function runScript(name) {
  closeReader();
  const script = readJson(path.join(repoRoot, 'package.json')).scripts[name];
  if (!script) throw new BondError(`No package.json script "${name}".`, 'BOND002');
  console.log(`\n> ${script}\n`);
  const bin = path.join(repoRoot, 'node_modules', '.bin');
  const PATH = `${bin}${path.delimiter}${process.env.PATH || process.env.Path || ''}`;
  return spawnSync(script, { cwd: repoRoot, stdio: 'inherit', shell: true, env: { ...process.env, PATH, Path: PATH } }).status ?? 1;
}

export async function menu() {
  try {
    return await runMenu();
  } finally {
    closeReader();
  }
}

async function runMenu() {
  const ws = loadWorkspace();
  const themes = [...ws.themes.keys()].sort();
  const action = await select('What do you want to run?', ACTIONS.map((a) => ({ ...a, value: a.id })));

  if (action.create) {
    const id = await ask('New theme id (lowercase, e.g. acme): ');
    const prefix = await ask(`CSS prefix [${id.replace(/-/g, '')}]: `, id.replace(/-/g, ''));
    const args = ['create-theme', id, '--prefix', prefix];
    const name = await ask('DNN package name [default from id]: ');
    if (name) args.push('--package-name', name);
    return runCli(args);
  }

  let ids = [];
  if (action.theme) {
    if (!themes.length) throw new BondError('No themes found in themes/.', 'BOND002');
    const items = themes.map((t) => ({ label: t, value: t }));
    if (action.theme === 'one-or-all') items.push({ label: 'all themes', value: '--all' });
    const picked = await select(`${action.label}: which theme?`, items);
    ids = picked.value === '--all' ? themes : [picked.value];
  }
  const step = action.run(ids);
  if (!step.script) return runCli(step.cli); // the child bond process prints its own Done/Failed line
  const code = runScript(step.script);
  printOutcome(step.script, code);
  return code;
}
