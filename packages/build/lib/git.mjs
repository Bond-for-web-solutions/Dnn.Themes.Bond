import { execFileSync } from 'node:child_process';
import { repoRoot } from './util.mjs';

export function git(args, { allowFail = true } = {}) {
  try {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (err) {
    if (allowFail) return null;
    throw err;
  }
}

/** Build traceability. Never fails: a source ZIP download simply reports "unknown". */
export function gitInfo() {
  const sha = git(['rev-parse', 'HEAD']);
  if (!sha) return { sha: 'unknown', short: 'unknown', dirty: false, branch: null, commitTime: null };
  const status = git(['status', '--porcelain', '--untracked-files=normal']) || '';
  return {
    sha,
    short: sha.slice(0, 7),
    dirty: status.length > 0,
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    commitTime: Number(git(['log', '-1', '--format=%ct'])) || null,
  };
}

/**
 * ZIP entry timestamp. SOURCE_DATE_EPOCH (reproducible-builds.org) wins, then the
 * HEAD commit time, then a fixed date - never the wall clock.
 */
export function buildEpoch(info = gitInfo()) {
  const env = Number(process.env.SOURCE_DATE_EPOCH);
  if (Number.isFinite(env) && env > 315532800) return new Date(env * 1000);
  if (info.commitTime) return new Date(info.commitTime * 1000);
  return new Date(Date.UTC(2000, 0, 1));
}
