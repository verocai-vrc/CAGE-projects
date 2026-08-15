// Starts the Vite dev server and opens it in the default browser so a
// human can playtest CAGE directly. Blocks in the foreground streaming
// dev-server logs; Ctrl+C stops the server. Cross-platform (Windows
// `start`, macOS `open`, Linux `xdg-open`).
//
// Usage: node .claude/skills/run-cage/playtest.mjs
import { spawn } from 'node:child_process';

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const dev = spawn(npmCmd, ['run', 'dev'], { stdio: ['ignore', 'pipe', 'inherit'] });

let opened = false;
let buf = '';
dev.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  if (opened) return;
  buf += chunk.toString();
  const match = buf.match(/Local:\s+(http:\/\/localhost:\d+\/)/);
  if (match) {
    opened = true;
    const url = match[1];
    console.log(`\n[playtest] opening ${url} in your browser...\n`);
    const openCmd = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const openArgs = process.platform === 'win32' ? ['/c', 'start', '""', url] : [url];
    spawn(openCmd, openArgs, { stdio: 'ignore', detached: true }).unref();
  }
});

dev.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGINT', () => dev.kill('SIGINT'));
process.on('SIGTERM', () => dev.kill('SIGTERM'));
