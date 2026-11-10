// usage: node scripts/montage.mjs out.png cols w img1 img2 ...
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
const [out, cols, w, ...files] = process.argv.slice(2);
const html = `<body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(${cols},${w}px);gap:2px">${files
  .map((f) => `<div style="position:relative"><img src="data:image/png;base64,${readFileSync(f).toString('base64')}" style="width:${w}px;display:block"><span style="position:absolute;top:4px;left:6px;color:#0f0;font:bold 14px monospace">${f.split('/').pop()}</span></div>`)
  .join('')}</body>`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: cols * (+w + 2), height: 400 } });
await p.setContent(html);
await p.waitForTimeout(300);
await p.screenshot({ path: out, fullPage: true });
await b.close();
