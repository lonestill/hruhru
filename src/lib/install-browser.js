'use strict';

// Runs Playwright's CLI `install chromium` and streams progress to stdout.
// Meant to be spawned by the main process with ELECTRON_RUN_AS_NODE=1 so the
// bundled Electron binary acts as a Node runtime — no system Node required.
//
// Output format (line-delimited):
//   progress=<percent>   — optional, parsed from playwright CLI output
//   DONE                 — on success
//   ERROR: <message>     — on failure

const { spawn } = require('child_process');
const path = require('path');

const cliPath = require.resolve('playwright/cli.js');
const args = [cliPath, 'install', 'chromium'];

const child = spawn(process.execPath, args, {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
});

let stderr = '';
child.stdout.setEncoding('utf-8');
child.stderr.setEncoding('utf-8');

// Playwright CLI prints human-readable progress like "Downloading Chromium 45%".
// Extract the highest percent we've seen and forward as progress=N.
let lastPct = -1;
const parseProgress = (chunk) => {
    // Strip ANSI escape codes
    const clean = chunk.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
    const m = clean.match(/(\d+)\s*%/);
    if (m) {
        const pct = parseInt(m[1]);
        if (pct > lastPct) {
            lastPct = pct;
            process.stdout.write(`progress=${pct}\n`);
        }
    }
};

child.stdout.on('data', (d) => { parseProgress(d); });
child.stderr.on('data', (d) => { stderr += d; parseProgress(d); });

child.on('error', (err) => {
    process.stdout.write(`ERROR: ${err.message}\n`);
    process.exit(1);
});

child.on('close', (code) => {
    if (code === 0) {
        process.stdout.write('DONE\n');
    } else {
        process.stdout.write(`ERROR: playwright install exited with ${code}\n`);
        if (stderr) process.stderr.write(stderr);
        process.exit(1);
    }
});
