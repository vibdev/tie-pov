// usage: node scripts/whole.mjs out.png "<hash>" [framesPerMove] [firstStep] [lastStep] — one row of frames per move
import { chromium } from 'playwright';
const [out, hash, n = '7', first = '1', lastStep = '99'] = process.argv.slice(2);
const SIZE = +(process.env.SIZE ?? 260);
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: SIZE, height: SIZE } });
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://localhost:5199/#' + hash + '&ui=0&manual=1');
await p.waitForTimeout(1500);
await p.evaluate(`tie.goTo(${first} - 1, false); tie.tick(1/60, 60)`);
const shots = [];
for (let st = +first; st <= +lastStep; st++) {
  const frames = await p.evaluate(`(() => { tie.goTo(${st}); if (!tie.anim || tie.anim.to !== ${st}) return 0; return Math.ceil((tie.anim.wait + tie.anim.dur) * 60) + 12; })()`);
  if (!frames) break;
  const per = Math.ceil(frames / +n);
  for (let i = 0; i < +n; i++) { await p.evaluate(`tie.tick(1/60, ${per})`); shots.push((await p.screenshot()).toString('base64')); }
}
const m = await b.newPage({ viewport: { width: +n * (SIZE + 2), height: 400 } });
await m.setContent(`<body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(${n},${SIZE}px);gap:2px">${shots.map((s) => `<img src="data:image/png;base64,${s}">`).join('')}</body>`);
await m.screenshot({ path: out, fullPage: true });
await b.close();
