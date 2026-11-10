// usage: node scripts/shot.mjs "<hash>" out.png [width height]
import { chromium } from 'playwright';
const [hash, out, w = '1400', h = '900'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
await page.goto('http://localhost:5199/#' + hash);
await page.waitForTimeout(+(process.env.WAIT ?? 2500));
if (process.env.EVAL) await page.evaluate(process.env.EVAL);
if (process.env.EVAL) await page.waitForTimeout(+(process.env.WAIT2 ?? 1500));
await page.screenshot({ path: out });
if (logs.length) console.log(logs.join('\n'));
await browser.close();
