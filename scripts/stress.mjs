// plays every knot start to finish at fixed time steps and reports anything unphysical
import { chromium } from 'playwright';
const KNOTS = (process.argv[2] ?? 'four-in-hand,oriental,kelvin,nicky,pratt,half-windsor,windsor,st-andrew,plattsburgh,bow-tie').split(',');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const k of KNOTS) {
  const p = await b.newPage({ viewport: { width: 200, height: 200 } });
  p.on('pageerror', (e) => console.log(k, 'pageerror', e.message));
  await p.goto(`http://localhost:5199/#knot=${k}&view=mirror&ui=0&manual=1`);
  await p.waitForTimeout(1200);
  const r = await p.evaluate(`(() => { const out = []; tie.goTo(0, false); tie.tick(1/60, 30);
    for (let st = 1; st < 30; st++) { tie.goTo(st); if (!tie.anim || tie.anim.to !== st) break; let worst = 0, wf = 0, jump = 0, jf = 0, ji = 0, nan = 0, f = 0; let last = tie.sim.pos.map(q => q.clone());
      while (tie.anim && f < 900) { tie.tick(1/60, 1); f++; const s = tie.sim;
        for (let i = 0; i < s.M; i++) { const q = s.pos[i]; if (!(q.x === q.x)) nan++; const d = q.distanceTo(last[i]); if (d > jump) { jump = d; jf = f; ji = i; } last[i].copy(q);
          if (i) { const e = q.distanceTo(s.pos[i-1]) / s.ds; if (e > worst) { worst = e; wf = f; } } } }
      out.push('  step ' + st + ' ' + f + 'f  stretch ' + worst.toFixed(2) + ' @' + wf + '  fastest ' + (jump * 60).toFixed(2) + ' m/s @' + jf + ' i' + ji + '/' + tie.sim.M + (nan ? ' NaN!' : '')); tie.tick(1/60, 20); }
    return out.join('\\n'); })()`);
  console.log(k + '\n' + r);
  await p.close();
}
await b.close();
