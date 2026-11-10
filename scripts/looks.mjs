// usage: node scripts/looks.mjs outDir [knot] — one mirror-view still of the finished knot per look
import { chromium } from 'playwright';
const [out = '/tmp/looks', knot = 'windsor'] = process.argv.slice(2);
const LOOKS = { atelier: 'two-tone', woodblock: 'stripe', blueprint: 'stripe', riso: 'stripe', noir: 'two-tone' };
const only = process.env.ONLY?.split(',');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [look, fabric] of Object.entries(LOOKS)) {
  if (only && !only.includes(look)) continue;
  const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 2 });
  page.on('console', (m) => { if (m.type() === 'error') console.log(look, m.text()); });
  page.on('pageerror', (e) => console.log(look, 'pageerror', e.message));
  await page.goto(`http://localhost:5199/#knot=${knot}&step=99&view=mirror&ui=0&look=${look}&fabric=${fabric}`);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${out}/${look}.png` });
  await page.close();
}
await browser.close();
