// usage: node scripts/steps.mjs out.png "<hash>" [cols] — every step's settled pose, side by side
import { chromium } from 'playwright';
const [out, hash, cols = '6'] = process.argv.slice(2);
const SIZE = +(process.env.SIZE ?? 400);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: SIZE, height: SIZE } });
p.on('pageerror', (e) => console.log('pageerror', e.message));
p.on('console', (m) => { if (m.type() === 'error') console.log(m.text()); });
await p.goto('http://localhost:5199/#' + hash + '&ui=0&manual=1');
await p.waitForTimeout(1500);
const shots = [];
for (let i = 0; i < 20; i++) {
  const ok = await p.evaluate(`(() => { tie.goTo(${i}, false); if (tie.step !== ${i}) return false; tie.tick(1/60, 90); return true; })()`);
  if (!ok) break;
  shots.push((await p.screenshot()).toString('base64'));
}
const m = await b.newPage({ viewport: { width: +cols * (SIZE + 2), height: 400 } });
await m.setContent(`<body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(${cols},${SIZE}px);gap:2px">${shots.map((s) => `<img src="data:image/png;base64,${s}">`).join('')}</body>`);
await m.screenshot({ path: out, fullPage: true });
await b.close();
