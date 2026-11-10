// behavioural checks of the core interactions: node scripts/check.mjs
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5199/#knot=four-in-hand');
await page.waitForTimeout(1500);
const st = () => page.evaluate(() => ({ step: tie.step, anim: tie.anim && { to: tie.anim.to, t: +tie.anim.t.toFixed(3), wait: +tie.anim.wait.toFixed(2) }, paused: tie.paused, num: document.getElementById('step-num').textContent, play: document.getElementById('btn-play').getAttribute('aria-label') }));
let ok = true;
const idle = () => page.waitForFunction(() => !tie.anim, null, { timeout: 120000 });
const moving = () => page.waitForFunction(() => tie.anim && tie.anim.wait <= 0 && tie.anim.t > 0.1, null, { timeout: 30000 });
const expect = (name, cond, info) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`, cond ? '' : JSON.stringify(info)); ok &&= cond; };

// 1. pause freezes the move
await page.click('#btn-next');
await moving();
await page.click('#btn-play'); // pause
const a = await st();
await page.waitForTimeout(800);
const b = await st();
expect('pause freezes progress', a.anim && b.anim && a.anim.t === b.anim.t && b.paused === true, { a, b });
await page.click('#btn-play'); // resume
await page.waitForTimeout(1500);
const c = await st();
expect('resume continues from same point', c.anim ? c.anim.t > b.anim.t : c.step === 1, { b, c });
await idle(); await page.waitForTimeout(2500);
const d = await st();
expect('single-step resume does not autoplay on', d.step === 1 && !d.anim, d);

// 2. guide matches the shown step (guide visible for step 1 append move)
const g = await page.evaluate(() => tie.guideVisible?.());
expect('guide shows current move path', g === true, g);

// 3. rapid next: geometry synced, step logic consistent
await page.click('#btn-next'); await page.waitForTimeout(150); await page.click('#btn-next');
const e = await st();
expect('rapid next targets step 3', e.anim && e.anim.to === 3 && e.step === 2, e);
await idle();

// 4. keyboard: arrows on slider don't step
const openSettings = () => page.evaluate(() => { document.getElementById('settings').open = true; });
await openSettings();
await page.focus('#opt-speed');
const before = (await st()).step;
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(100);
expect('arrow on slider does not navigate', (await st()).step === before && !(await st()).anim, await st());
// space on a focused button activates it natively
await page.focus('#btn-prev');
await page.keyboard.press(' ');
await page.waitForTimeout(100);
const f = await st();
expect('space on focused button activates that button', f.anim && f.anim.to === before - 1, f);
await idle();

// 5. left-handed: counter matches chips
await openSettings();
await page.click('label:has(#opt-lefty)');
await page.waitForTimeout(300);
await page.click('#btn-next');
await page.waitForTimeout(100);
const h = await page.evaluate(() => ({ num: document.getElementById('step-num').textContent, cur: document.querySelector('#knot-seq .cur')?.textContent, text: document.getElementById('step-text').textContent }));
expect('lefty chip matches instruction', /your right/.test(h.text) === (h.cur[0] === 'R'), h);

// 6. a11y basics
const ax = await page.evaluate(() => ({
  toggleFocusable: [...document.querySelectorAll('.toggle input')].every((i) => getComputedStyle(i).display !== 'none'),
  timelineNamed: [...document.querySelectorAll('#timeline button')].every((b) => b.getAttribute('aria-label')),
  live: document.getElementById('live').textContent.length > 0,
}));
expect('a11y basics', ax.toggleFocusable && ax.timelineNamed && ax.live, ax);

// 7. pause freezes the whole pose (free ends too)
await page.evaluate(() => tie.goTo(4));
await moving();
await page.click('#btn-play');
const p1 = await page.evaluate(() => tie.sim.pos.map((p) => [p.x, p.y, p.z]));
await page.waitForTimeout(800);
const p2 = await page.evaluate(() => tie.sim.pos.map((p) => [p.x, p.y, p.z]));
const maxMove = Math.max(...p1.map((a, i) => Math.hypot(a[0] - p2[i][0], a[1] - p2[i][1], a[2] - p2[i][2])));
expect('pause freezes free fabric too', maxMove < 1e-6, { maxMove });
await page.click('#btn-play');
await idle();

// 8. keyboard focus survives timeline and knot selection
await page.focus('#timeline button:nth-child(3)');
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
const tf = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
expect('timeline keeps focus', /^Step 3/.test(tf ?? ''), tf);
await idle();
await page.keyboard.press('Escape');
await page.focus('#knot-btn');
await page.keyboard.press('Enter');
await page.waitForTimeout(100);
await page.keyboard.press('Tab');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
const kf = await page.evaluate(() => ({ id: document.activeElement?.id, name: document.getElementById('knot-btn-name').textContent }));
expect('knot choice returns focus to opener', kf.id === 'knot-btn' && kf.name !== 'Four-in-Hand', kf);

// 9. the second view swaps with the main one, and settings closes on an outside click
await page.click('#timeline button:nth-child(2)'); // also an outside click
await page.waitForTimeout(200);
const sw0 = await page.evaluate(() => ({ open: document.getElementById('settings').open, label: document.querySelector('#pip span').textContent, cls: document.body.className }));
await page.click('#pip');
await page.waitForTimeout(200);
const sw1 = await page.evaluate(() => ({ label: document.querySelector('#pip span').textContent, cls: document.body.className }));
await page.click('#pip');
expect('settings closes on outside click', sw0.open === false, sw0);
expect('second view swaps with the main view', sw0.label === 'Mirror' && /view-pov/.test(sw0.cls) && sw1.label === 'Your view' && /view-mirror/.test(sw1.cls), { sw0, sw1 });
await idle();

// 10. on the last step the main button starts over
await page.evaluate(() => tie.goTo(6, false));
const lastLabel = await page.textContent('#btn-next');
await page.click('#btn-next');
await page.waitForTimeout(200);
expect('last step: next becomes start over', /Start over/.test(lastLabel) && (await st()).step === 0, { lastLabel, s: await st() });

// 11. repeat mode shows the same move again without being asked
await openSettings();
await page.click('label:has(#opt-loop)');
await page.click('#btn-next');
await moving(); await idle();
await page.waitForFunction(() => tie.anim && tie.anim.to === 1, null, { timeout: 60000 });
expect('repeat mode replays the move', (await st()).anim?.to === 1, await st());
await openSettings();
await page.click('label:has(#opt-loop)');
await idle();

expect('no page errors', errors.length === 0, errors);
// 9. mobile framing: every bow-tie step and every knot's last step keeps the working area on screen
await page.close();
const m = await browser.newPage({ viewport: { width: 390, height: 844 } });
let worst = 1, where = '';
for (const [knot, steps] of [['bow-tie', [2, 4, 6, 7, 8]], ['windsor', [9]]]) {
  for (const n of steps) {
    await m.goto(`http://localhost:5199/?r=${knot}${n}#knot=${knot}&step=${n}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await m.waitForFunction(() => window.tie, null, { timeout: 60000 });
    await m.waitForTimeout(2500); // the camera eases to its framing
    const f = await m.evaluate(() => tie.onScreen());
    if (f < worst) { worst = f; where = `${knot}#${n}`; }
  }
}
expect('mobile POV frames the working area', worst >= 0.98, { worst, where });
await browser.close();
process.exit(ok ? 0 : 1);
