const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, '.build');
fs.mkdirSync(outDir, { recursive: true });

function runGit(args) {
  try {
    return cp.execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return 'unknown';
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const commit = runGit(['rev-parse', 'HEAD']);
const shortCommit = commit.length >= 7 ? commit.slice(0, 7) : commit;
const dirty = runGit(['status', '--porcelain']) !== '';

const info = {
  version: pkg.version || '0.0.0',
  sourceCommit: commit,
  sourceShort: shortCommit,
  sourceDirty: dirty,
  buildAtUtc: new Date().toISOString(),
  mode: 'production'
};

fs.writeFileSync(
  path.join(outDir, 'build-info.json'),
  JSON.stringify(info, null, 2) + '\n',
  'utf8'
);

console.log(JSON.stringify(info));
