// Zrzuty prezentacyjne: node shoot.mjs <outdir> [scene...]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const out = process.argv[2]; const only = process.argv.slice(3);
fs.mkdirSync(out, { recursive: true });
const BASE = 'http://localhost:5179/';
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.2, locale: 'en-GB', timezoneId: 'Europe/London' });
const settle = async (page, ms = 900) => {
  await page.waitForTimeout(ms);
  await page.evaluate(async () => {
    const imgs = [...document.images].filter((i) => i.getBoundingClientRect().top < innerHeight);
    await Promise.all(imgs.map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 4000); }))));
  });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(400);
};
const nav = (page, v) => page.click(`.nav-btn[data-view="${v}"]`);
const scenes = {
  '01-addons': async (p) => { await p.goto(BASE + '?sort=date'); await settle(p); await nav(p, 'addons'); },
  '02-dashboard': async (p) => { await p.goto(BASE); },
  '03-airport-details': async (p) => { await p.goto(BASE + '?sort=date'); await settle(p); await nav(p, 'addons'); await settle(p); await p.click('[data-fcat="airport"]'); await settle(p, 300); await p.locator('.pkg', { hasText: 'LOWI' }).first().click(); await settle(p, 1800); },
  '04-aircraft-details': async (p) => { await p.goto(BASE); await settle(p); await nav(p, 'addons'); await settle(p); await p.click('[data-fcat="aircraft"]'); await settle(p, 300); await p.locator('.pkg', { hasText: 'A320neo Family' }).first().click(); await settle(p, 1200); },
  '05-map': async (p) => {
    await p.goto(BASE); await settle(p); await nav(p, 'map'); await settle(p, 1500);
    await p.mouse.move(650, 440);
    for (let k = 0; k < 2; k++) { await p.mouse.wheel(0, -120); await p.waitForTimeout(500); }
    await settle(p, 3000);
  },
  '06-prepare-flight': async (p) => { await p.goto(BASE); await settle(p); await p.click('#d-plan'); await settle(p, 800); await p.click('#pl-sb'); await settle(p, 3500); },
  '07-profiles': async (p) => { await p.goto(BASE); await settle(p); await nav(p, 'profiles'); },
  '08-airports-by-country': async (p) => { await p.goto(BASE + '?group'); await settle(p); await nav(p, 'addons'); await settle(p); await p.click('[data-fcat="airport"]'); await settle(p, 300);
    const ccs = await p.$$eval('[data-grp]', (els) => els.map((e) => e.dataset.grp));
    for (const cc of ccs) if (!['AT', 'CH'].includes(cc)) await p.click(`[data-grp="${cc}"]`);
    await p.evaluate(() => document.activeElement?.blur());
  },
  '09-health': async (p) => { await p.goto(BASE); await settle(p); await nav(p, 'health'); },
  '10-official': async (p) => { await p.goto(BASE); await settle(p); await nav(p, 'official'); },
  '11-light-list': async (p) => { await p.goto(BASE + '?theme=light&view=list&sort=category'); await settle(p); await nav(p, 'addons'); },
};
for (const [name, run] of Object.entries(scenes)) {
  if (only.length && !only.includes(name)) continue;
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log(name, 'console:', m.text()); });
  await run(page);
  await settle(page, 1200);
  await page.mouse.move(1590, 890);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('ok', name);
  await page.close();
}
await browser.close();
