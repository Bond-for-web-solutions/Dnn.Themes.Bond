#!/usr/bin/env node
// bond - DNN theme build CLI. Used identically by the terminal, VS Code tasks
// (.vscode/tasks.json) and GitHub Actions. Run `bond help` for usage.
import { parseArgs } from 'node:util';
import { loadWorkspace } from '../lib/workspace.mjs';
import { BondError, paint, printOutcome } from '../lib/util.mjs';

const HELP = `bond <command> [options]

  Theme ids are discovered from themes/*. Omit the theme (or pass --pick) to
  choose from a list; in a non-interactive shell (CI) a theme or --all is required.

  menu                       Pick a command and a theme from a list (arrow keys + Enter)
  build <theme...> | --all   Build theme(s). --mode production (default) | development
                             --package   also create an install ZIP in development mode
                             --deploy    copy each successful build to the site in .env
  watch <theme>              Rebuild (development) on theme/shared changes. --deploy [--prune --adopt]
  validate <theme...> | --all  Re-verify published output, reports and ZIPs (no rebuild)
  clean <theme...> | --all   Delete publish/<theme> (only generated artifacts)
  deploy <theme>             Copy a validated build to the LOCAL DNN site in .env
                             --dry-run --adopt --prune
  snapshot <theme>           Record this release's file list (enables DNN Cleanup on upgrade)
  affected [--base <ref>]    List themes impacted by changes since <ref> (default origin/main)
  check                      Workspace architecture checks (boundaries, layers, identities)
  create-theme <id>          Scaffold themes/<id>. --prefix <p> --package-name <Name>
  list-themes [--all]        Print themes/ as value|label|description lines (VS Code live picker)
  install                    pnpm install --frozen-lockfile via corepack (VS Code task)
  script <name>              Run a package.json script (used by VS Code tasks; no pnpm needed)
`;

const { values: o, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    all: { type: 'boolean' }, mode: { type: 'string' }, package: { type: 'boolean' },
    deploy: { type: 'boolean' }, 'dry-run': { type: 'boolean' },
    adopt: { type: 'boolean' }, prune: { type: 'boolean' }, base: { type: 'string' },
    prefix: { type: 'string' }, 'package-name': { type: 'string' }, 'friendly-name': { type: 'string' },
    json: { type: 'boolean' }, pick: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
  },
});
const [cmd, ...args] = positionals;

/**
 * Ask which theme to use. The list comes from themes/* at run time, so adding a
 * theme never requires editing package.json or .vscode/tasks.json.
 */
async function pickThemes(ws, { allowAll }) {
  const ids = [...ws.themes.keys()].sort();
  if (!ids.length) throw new BondError('No themes found in themes/.', 'BOND002');
  const { createInterface } = await import('node:readline/promises');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log(`Themes in themes/:`);
    ids.forEach((id, i) => console.log(`  ${i + 1}) ${id}`));
    if (allowAll) console.log(`  a) all`);
    const answer = (await rl.question(`${cmd} which theme? `)).trim();
    if (allowAll && /^(a|all|--all)$/i.test(answer)) return ids;
    const picked = /^\d+$/.test(answer) ? ids[Number(answer) - 1] : answer;
    if (!ids.includes(picked)) throw new BondError(`"${answer}" is not a theme. Choose one of: ${ids.join(', ')}`, 'BOND002');
    return [picked];
  } finally {
    rl.close();
  }
}

async function themesArg(ws, { allowAll = true, single = false } = {}) {
  if (o.all && allowAll) return [...ws.themes.keys()].sort();
  if (args.length) {
    if (single && args.length !== 1) throw new BondError(`"${cmd}" takes exactly one theme`, 'BOND002');
    return args;
  }
  if (o.pick || process.stdin.isTTY) return pickThemes(ws, { allowAll: allowAll && !single });
  throw new BondError(`"${cmd}" needs a theme id${allowAll && !single ? ' or --all' : ''}. Themes: ${[...ws.themes.keys()].sort().join(', ')}`, 'BOND002');
}

async function main() {
  if (!cmd || o.help || cmd === 'help') { console.log(HELP); return 0; }
  const ws = loadWorkspace();
  switch (cmd) {
    case 'menu': {
      const { menu } = await import('../lib/menu.mjs');
      return menu();
    }
    case 'build': {
      const mode = o.mode || 'production';
      if (!['production', 'development'].includes(mode)) throw new BondError(`--mode must be production or development`, 'BOND002');
      const { buildTheme } = await import('../lib/build.mjs');
      let failed = 0;
      // Each theme is independent: one failure never hides the others.
      for (const id of await themesArg(ws)) {
        try {
          const res = await buildTheme(ws, id, { mode, package: o.package });
          if (!res.ok) failed++;
          else if (o.deploy) (await import('../lib/ops.mjs')).deploy(ws, id, { adopt: o.adopt, prune: o.prune });
        } catch (err) {
          failed++;
          printError(err);
        }
      }
      return failed ? 1 : 0;
    }
    case 'watch': {
      const { watchTheme } = await import('../lib/watch.mjs');
      const [id] = await themesArg(ws, { single: true });
      await watchTheme(id, { deploy: !!o.deploy, deployOptions: { adopt: o.adopt, prune: o.prune } });
      return 0;
    }
    case 'validate': {
      const { validatePublished } = await import('../lib/ops.mjs');
      let failed = 0;
      for (const id of await themesArg(ws)) if (!validatePublished(ws, id).ok) failed++;
      return failed ? 1 : 0;
    }
    case 'clean': {
      const { clean } = await import('../lib/ops.mjs');
      const ids = o.all ? [] : await themesArg(ws);
      clean(ws, ids, { all: o.all || ids.length === ws.themes.size });
      return 0;
    }
    case 'deploy': {
      const { deploy } = await import('../lib/ops.mjs');
      const [id] = await themesArg(ws, { single: true });
      deploy(ws, id, { dryRun: o['dry-run'], adopt: o.adopt, prune: o.prune });
      return 0;
    }
    case 'snapshot': {
      const { snapshot } = await import('../lib/ops.mjs');
      for (const id of await themesArg(ws)) snapshot(ws, id);
      return 0;
    }
    case 'affected': {
      const { changedFiles, affectedThemes } = await import('../lib/affected.mjs');
      const res = affectedThemes(ws, changedFiles(o.base || 'origin/main'));
      if (o.json) console.log(JSON.stringify(res));
      else { console.log(res.themes.join('\n') || '(no themes affected)'); for (const [t, r] of Object.entries(res.reasons)) console.error(`  ${t}: ${[...new Set(r)].slice(0, 5).join('; ')}`); }
      return 0;
    }
    case 'check': {
      const { checkWorkspace } = await import('../lib/check.mjs');
      return checkWorkspace(ws).ok ? 0 : 1;
    }
    case 'create-theme': {
      const { createTheme } = await import('../lib/create-theme.mjs');
      createTheme(ws, { id: args[0], prefix: o.prefix, packageName: o['package-name'], friendlyName: o['friendly-name'] });
      return 0;
    }
    case 'list-themes': {
      // Machine-readable theme list for VS Code's live picker (Tasks Shell Input
      // extension): one "value|label|description" line per folder in themes/.
      const { readJson } = await import('../lib/util.mjs');
      const path = await import('node:path');
      for (const id of [...ws.themes.keys()].sort()) {
        const t = ws.themes.get(id);
        let name = id;
        try { name = readJson(path.join(t.dir, 'theme.json')).dnn.friendlyName || id; } catch { /* keep id */ }
        console.log(`${id}|${id}|${name} ${t.pkg.version}`);
      }
      if (o.all) console.log('--all|All themes|every theme in themes/');
      return 0;
    }
    case 'install': {
      // Same as `corepack pnpm install --frozen-lockfile` (pnpm version from package.json).
      // A shell is needed on Windows to resolve corepack.cmd; the arguments are constants.
      const { spawnSync } = await import('node:child_process');
      const { repoRoot } = await import('../lib/util.mjs');
      return spawnSync('corepack', ['pnpm', 'install', '--frozen-lockfile'], { cwd: repoRoot, stdio: 'inherit', shell: process.platform === 'win32' }).status ?? 1;
    }
    case 'script': {
      if (args.length !== 1) throw new BondError('script takes exactly one package.json script name', 'BOND002');
      return (await import('../lib/menu.mjs')).runScript(args[0]);
    }
    default:
      throw new BondError(`Unknown command "${cmd}". Run "bond help".`, 'BOND002');
  }
}

function printError(err) {
  if (err instanceof BondError) {
    const where = err.loc?.file ? `${err.loc.file}(${err.loc.line || 1},${err.loc.column || 1})` : 'bond';
    console.error(paint.red(`${where}: error ${err.code}: ${err.message}`, process.stderr));
  } else {
    console.error(err);
  }
}

// Every finished command ends with a green "Done" (or red "Failed") line, except
// machine-readable output (list-themes, affected --json), help, watch (never
// finishes; it reports each rebuild) and menu (the command it runs reports).
function finish(code) {
  process.exitCode = code;
  if (!cmd || o.help || cmd === 'help' || ['list-themes', 'menu', 'watch'].includes(cmd) || (cmd === 'affected' && o.json)) return;
  printOutcome(cmd === 'script' && args[0] ? args[0] : `bond ${process.argv.slice(2).join(' ')}`, code);
}

main().then(finish, (err) => { printError(err); finish(1); });
