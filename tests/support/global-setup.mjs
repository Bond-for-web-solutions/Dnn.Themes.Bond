// Visual tests always run against fresh production builds of every theme.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export default function globalSetup() {
  if (process.env.BOND_SKIP_BUILD === '1') return;
  execFileSync(process.execPath, [path.join(root, 'packages', 'build', 'bin', 'bond.mjs'), 'build', '--all', '--mode', 'production'], { cwd: root, stdio: 'inherit' });
}
