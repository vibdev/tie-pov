// usage: node scripts/finals.mjs out.png [view] [stepFromEnd] — every knot's last (or n-th from last) pose
import { chromium } from 'playwright';
const [out, view = 'mirror', back = '0'] = process.argv.slice(2);
const SIZE = +(process.env.SIZE ?? 300);
const KNOTS = ['four-in-hand', 'oriental', 'kelvin', 'nicky', 'pratt', 'half-windsor', 'windsor', 'st-andrew', 'plattsburgh', 'bow-tie'];
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const shots = [];
for (const k of KNOTS) {
  const p = await b.newPage({ viewport: { width: SIZE, height: SIZE } });
  p.on('pageerror', (e) => console.log(k, 'pageerror', e.message));
  await p.goto(`http://localhost:5199/#knot=${k}&view=${view}&ui=0&manual=1&fabric=${process.env.FABRIC ?? 'two-tone'}`);
  await p.waitForTimeout(1200);
  await p.evaluate(`(() => { tie.goTo(99, false); if (${back}) tie.goTo(tie.step - ${back}, false); tie.tick(1/60, 90); })()`);
  shots.push((await p.screenshot()).toString('base64'));
  await p.close();
}
const m = await b.newPage({ viewport: { width: 5 * (SIZE + 2), height: 400 } });
await m.setContent(`<body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(5,${SIZE}px);gap:2px">${shots.map((s) => `<img src="data:image/png;base64,${s}">`).join('')}</body>`);
await m.screenshot({ path: out, fullPage: true });
await b.close();
