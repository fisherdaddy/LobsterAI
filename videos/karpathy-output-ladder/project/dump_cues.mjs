// Load the page once (same server/flags as the renderer) and dump the sound-effect cues it registers.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, loadPlaywright, CHROME_ARGS, initScript } from '../render/render.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const { server, port } = await startServer(here, false);
const pw = await loadPlaywright();
const browser = await pw.chromium.launch({ args: CHROME_ARGS });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.addInitScript(initScript, { seedRandom: true, scale: 1 });
page.on('pageerror', (e) => { console.error('[cues] page error', e); process.exitCode = 1; });
await page.goto(`http://127.0.0.1:${port}/page/index.html`);
await page.waitForFunction(() => window.VIDEO && window.CUES, null, { timeout: 60000 });
const data = await page.evaluate(() => ({ duration: window.VIDEO.duration, cues: window.CUES, scenes: window.TIMELINE.scenes }));
fs.mkdirSync(path.join(here, 'build'), { recursive: true });
fs.writeFileSync(path.join(here, 'build', 'cues.json'), JSON.stringify(data, null, 1));
console.log(`[cues] ${data.cues.length} cues, duration ${data.duration}s`);
await browser.close();
server.close();
