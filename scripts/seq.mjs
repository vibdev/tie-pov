// usage: node scripts/seq.mjs "<hash>" "<js to start>" prefix n interval
import { chromium } from 'playwright';
const [hash, js, prefix, n = '6', iv = '400'] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 500, height: 500 } });
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://localhost:5199/#' + hash);
await p.waitForTimeout(2500);
await p.evaluate(js);
for (let i = 0; i < +n; i++) { await p.waitForTimeout(+iv); await p.screenshot({ path: `${prefix}${i}.png` }); }
await b.close();
