/**
 * End-to-end checks against a live deployment, driven through a real Chrome.
 *
 *   npm run e2e                                  # checks https://stash1099.vercel.app
 *   BASE=http://localhost:3000 npm run e2e        # checks a local build
 *
 * Runs with a Russian browser locale on purpose (the jury's machines), so number
 * formatting / hydration bugs that only show up outside en-US are caught.
 */
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const BASE = (process.env.BASE ?? "https://stash1099.vercel.app").replace(/\/$/, "");
const REPO = process.env.REPO ?? "Dossm04/stash1099";
const LOCAL_SHA = process.env.LOCAL_SHA ?? "";
const CHROME =
  process.env.CHROME_PATH ??
  {
    win32: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    darwin: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  }[process.platform] ??
  "/usr/bin/google-chrome";

/* ------------------------------ tiny harness ----------------------------- */

const results = [];
let section = "";
async function check(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ section, name, ok: true, ms: Date.now() - t0 });
  } catch (e) {
    results.push({ section, name, ok: false, ms: Date.now() - t0, err: String(e?.message ?? e).slice(0, 200) });
  }
}
function expect(cond, msg) {
  if (!cond) throw new Error(msg);
}
const money = (s) =>
  s == null
    ? NaN
    : Number(
        String(s)
          .replace(/[−–]/g, "-")
          .replace(/[$,\s]/g, ""),
      );
const pad = (n) => String(n).padStart(2, "0");
const now = new Date();
const TODAY = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const DEMO_DAY = TODAY === "2026-11-15"; // exact demo figures were verified for this date
const DUE = ["2026-04-15", "2026-06-15", "2026-09-15", "2027-01-15"];
const daysTo = (iso) => Math.round((Date.parse(iso) - Date.parse(TODAY)) / 86_400_000);
const NEXT_DUE = DUE.find((d) => d >= TODAY);

/* ------------------------------ page helpers ----------------------------- */

const consoleErrors = [];
const hosts = new Set();
function watch(page, label) {
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(`${label}: ${m.text()}`));
  page.on("pageerror", (e) => consoleErrors.push(`${label}: ${e.message}`));
  page.on("request", (r) => {
    const u = r.url();
    if (u.startsWith("http")) hosts.add(new URL(u).host);
  });
}
const text = (page) => page.evaluate(() => document.body.innerText);
const grab = async (page, re) => (await text(page)).match(re)?.[1];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function clickButton(page, matcher) {
  const ok = await page.evaluate((src) => {
    const re = new RegExp(src);
    const b = [...document.querySelectorAll("button, summary, a")].find((x) => re.test(x.textContent.trim()));
    if (!b) return false;
    b.click();
    return true;
  }, matcher.source);
  expect(ok, `button ${matcher} not found`);
  await sleep(250);
}
async function typeInto(page, selector, value) {
  const el = await page.$(selector);
  expect(el, `input ${selector} not found`);
  await el.click({ clickCount: 3 });
  await page.keyboard.press("Backspace");
  if (value !== "") await el.type(String(value));
  await sleep(150);
}
async function inputByLabel(page, labelText) {
  return page.evaluateHandle((t) => {
    const span = [...document.querySelectorAll("label span")].find((s) => s.textContent.trim() === t);
    return span?.closest("label")?.querySelector("input") ?? null;
  }, labelText);
}
async function typeByLabel(page, labelText, value) {
  const h = await inputByLabel(page, labelText);
  const el = h.asElement();
  expect(el, `input labelled "${labelText}" not found`);
  await el.click({ clickCount: 3 });
  await page.keyboard.press("Backspace");
  if (value !== "") await el.type(String(value));
  await sleep(150);
}
async function submitFormOf(page, selector) {
  await page.evaluate((sel) => {
    const f = document.querySelector(sel)?.form;
    f?.querySelector("button")?.click();
  }, selector);
  await sleep(250);
}
async function activatePro(page) {
  await clickButton(page, /^Get my plan$/);
  await clickButton(page, /^Activate Pro \(demo\)$/);
  await sleep(300);
}
const paywallOpen = (page) =>
  page.evaluate(() => !!document.querySelector('[role="dialog"][aria-label="Stash1099 Pro"]'));
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const read = {
  safe: (p) => grab(p, /SAFE TO SPEND[\s\S]{0,80}?(-?\$[\d,]+)/i),
  owed: (p) => grab(p, /Still owed for 2026\s+(\$[\d,]+)/),
  savings: (p) => grab(p, /In tax savings\s+(\$[\d,]+)/),
  shortfall: (p) => grab(p, /April 15 shortfall\s+(\$[\d,]+)/),
  behind: (p) => grab(p, /Behind (\$[\d,]+)/),
  covered: (p) => grab(p, /(\$[\d,]+) covered \(\d+%\)/),
  coveredPct: (p) => grab(p, /covered \((\d+)%\)/),
  needed: (p) => grab(p, /(\$[\d,]+) needed for 2026/),
  total: (p) => grab(p, /Total 2026 tax: (\$[\d,]+)/),
  rate: (p) => grab(p, /WITHHOLD FROM NEW PAYOUTS\s+(\d+)%/i),
  avg: (p) => grab(p, /(\d+)% average for 2026/),
  days: (p) => grab(p, /NEXT IRS DEADLINE\s+(\d+) days/i),
  penalty: (p) => grab(p, /PENALTY SO FAR\s+(\$[\d.,]+)/i),
  aprilPenalty: (p) => grab(p, /IF YOU DO NOTHING\s+(\$[\d.,]+)/i),
  catchUp: (p) => grab(p, /Today — catch up\s+(\$[\d,]+)/),
  jan: (p) => grab(p, /Jan 15, 2027\s+(\$[\d,]+)/),
  received: (p) => grab(p, /Received so far\s+(\$[\d,]+)/),
  rows: (p) => p.evaluate(() => document.querySelectorAll('button[aria-label^="Remove "]').length),
};

/* --------------------------------- run ---------------------------------- */

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--lang=ru-RU", "--no-first-run"],
  env: { ...process.env, LANG: "ru_RU.UTF-8" },
});
const page = await browser.newPage();
watch(page, "main");
await page.setViewport({ width: 1440, height: 1000 });

/* ===== A. Landing ===== */
section = "Landing";
let landingStatus = 0;
let landingMs = 0;
{
  const t0 = Date.now();
  const r = await page.goto(BASE + "/", { waitUntil: "networkidle0" });
  landingMs = Date.now() - t0;
  landingStatus = r.status();
}
await check("HTTP 200", () => expect(landingStatus === 200, `got ${landingStatus}`));
const nav = await page.evaluate(() => {
  const n = performance.getEntriesByType("navigation")[0];
  return {
    ttfb: Math.round(n.responseStart),
    dcl: Math.round(n.domContentLoadedEventEnd),
    load: Math.round(n.loadEventEnd),
  };
});
await check(
  `Page ready in < 2.5 s (TTFB ${nav.ttfb} ms, DOM ready ${nav.dcl} ms, load ${nav.load} ms; cold start wall ${landingMs} ms)`,
  () => expect(nav.dcl < 2500, `${nav.dcl} ms`),
);
await check("Title says safe-to-spend message", async () =>
  expect(/actually yours/.test(await page.title()), await page.title()),
);
await check("Meta description present", async () => {
  const d = await page.$eval('meta[name="description"]', (m) => m.content);
  expect(/safe to spend/i.test(d), d);
});
await check("Exactly one H1 with the core promise", async () => {
  const h = await page.$$eval("h1", (x) => x.map((e) => e.textContent));
  expect(h.length === 1 && /Nobody withholds your taxes/.test(h[0]), JSON.stringify(h));
});
await check("Main CTA → 60-second quiz (/start)", async () => {
  const href = await page.$$eval("a", (as) =>
    as.find((a) => /Take the 60-second check/.test(a.textContent))?.getAttribute("href"),
  );
  expect(href === "/start", href);
});
await check("Demo link → /plan?demo=maya", async () => {
  const href = await page.$$eval("a", (as) =>
    as.find((a) => /Maya.s example/.test(a.textContent))?.getAttribute("href"),
  );
  expect(href === "/plan?demo=maya", href);
});
await check("Countdown = days to next IRS deadline", async () => {
  const d = Number(await grab(page, /DEADLINE\s+(\d+)\s*days/i));
  expect(d === daysTo(NEXT_DUE), `${d} vs ${daysTo(NEXT_DUE)}`);
});
await check("Market stats shown (74.9M, 58%, 3.16M)", async () => {
  const t = await text(page);
  expect(
    ["74.9M", "58%", "3.16M"].every((s) => t.includes(s)),
    "missing stat",
  );
});
await check("Every stat has a source line", async () => {
  const t = await text(page);
  expect(/MBO Partners/.test(t) && /IRS Data Book 2025/.test(t) && /SHED 2025/.test(t), "source missing");
});
await check("Pricing: 1/4/12-week plans priced per day", async () => {
  const t = await text(page);
  expect(
    /1 week/.test(t) && /4 weeks/.test(t) && /12 weeks/.test(t) && /\$0\.71/.test(t) && /per day/.test(t),
    "pricing missing",
  );
});
await check("Hero widget: two numbers → what is really yours (real engine)", async () => {
  await typeInto(page, 'input[placeholder="48,000"]', "48000");
  const owed = await grab(page, /Tax already owed on that income\s+(\$[\d,]+)/i);
  await typeInto(page, 'input[placeholder="4,200"]', "4200");
  const yours = await grab(page, /Really yours\s+(-?\$[\d,]+)/i);
  expect(owed && yours && (!DEMO_DAY || (owed === "$9,271" && yours === "-$5,071")), `${owed} / ${yours}`);
});
await check("Disclaimer: not tax advice", async () =>
  expect(/not tax, legal or financial/.test(await text(page)), "no disclaimer"),
);
await check("No horizontal overflow (desktop)", async () => expect(await noOverflow(page), "overflow"));
await check("<html lang> set", async () => expect((await page.$eval("html", (h) => h.lang)) === "en", "lang"));
await check("Viewport meta for mobile", async () => expect(await page.$('meta[name="viewport"]'), "no viewport meta"));
await check("Browser really runs in ru locale (test validity)", async () => {
  const loc = await page.evaluate(() => Intl.NumberFormat().resolvedOptions().locale);
  expect(loc.startsWith("ru"), loc);
});

/* ===== B. Demo numbers ===== */
section = "Demo (Maya)";
await page.goto(BASE + "/plan?demo=maya", { waitUntil: "networkidle0" });
await page.evaluate(() => localStorage.clear());
await page.goto(BASE + "/plan?demo=maya", { waitUntil: "networkidle0" });
await sleep(400);

await check("Safe to spend is negative (spent IRS money)", async () =>
  expect(money(await read.safe(page)) < 0, await read.safe(page)),
);
await check("Safe = balance − unstashed tax (= $4,200 − behind)", async () => {
  expect(money(await read.safe(page)) === 4200 - money(await read.behind(page)), "mismatch");
});
await check("Shortfall = still owed − tax savings", async () => {
  expect(
    money(await read.shortfall(page)) === money(await read.owed(page)) - money(await read.savings(page)),
    "mismatch",
  );
});
await check("Still owed = total tax − paid to IRS ($2,000)", async () => {
  expect(money(await read.owed(page)) === money(await read.total(page)) - 2000, "mismatch");
});
await check("Year target ('needed') = breakdown total", async () => {
  expect(money(await read.needed(page)) === money(await read.total(page)), "mismatch");
});
await check("Covered = $3,000 (stashed) and % consistent", async () => {
  const c = money(await read.covered(page));
  const pct = Number(await read.coveredPct(page));
  expect(c === 3000 && pct === Math.round((3000 / money(await read.total(page))) * 100), `${c} ${pct}`);
});
await check("Marginal rate > average rate", async () =>
  expect(Number(await read.rate(page)) > Number(await read.avg(page)), "no"),
);
await check("Next deadline days correct", async () =>
  expect(Number(await read.days(page)) === daysTo(NEXT_DUE), "days"),
);
await check("Penalty so far > 0 and smaller than April penalty", async () => {
  const a = money(await read.penalty(page));
  const b = money(await read.aprilPenalty(page));
  expect(a > 0 && b > a, `${a} ${b}`);
});
await check("Catch-up today = Q2+Q3 shortfalls ($1,100 + $1,550)", async () =>
  expect(money(await read.catchUp(page)) === 2650, await read.catchUp(page)),
);
await check("Jan 15 safe-harbor installment = $6,200 / 4", async () =>
  expect(money(await read.jan(page)) === 1550, await read.jan(page)),
);
await check("Skipping Jan 15 costs more than following the plan", async () => {
  const m = (await text(page)).match(/grows to (\$[\d,]+\.\d\d) instead of (\$[\d,]+\.\d\d)/);
  expect(m && money(m[1]) > money(m[2]), m?.[0]);
});
for (const [q, s] of [
  ["Q1", "Paid"],
  ["Q2", "Missed"],
  ["Q3", "Missed"],
  ["Q4", "Upcoming"],
]) {
  await check(`Schedule ${q} = ${s}`, async () => {
    const st = await page.evaluate((qq) => {
      const li = [...document.querySelectorAll("ol li")].find((l) => l.textContent.startsWith(qq));
      return li?.innerText ?? "";
    }, q);
    expect(st.includes(s), st);
  });
}
await check("15 payouts in the log, received $51,610", async () => {
  expect((await read.rows(page)) === 15 && money(await read.received(page)) === 51610, "log");
});
if (DEMO_DAY) {
  await check("Exact demo figures for the pitch (−$1,257 / $7,935 / $6,935 / 23% / 17%)", async () => {
    const got = [
      await read.safe(page),
      await read.owed(page),
      await read.shortfall(page),
      await read.rate(page),
      await read.avg(page),
    ];
    expect(JSON.stringify(got) === JSON.stringify(["-$1,257", "$7,935", "$6,935", "23", "17"]), JSON.stringify(got));
  });
}
await check("Tax-ready score shown with its 4 parts (100 points)", async () => {
  const t = await text(page);
  const sc = Number(await grab(page, /Tax-ready score[\s\S]{0,40}?(\d+)/));
  expect(
    /Tax-ready score/.test(t) && /At risk|Almost there|IRS-ready/.test(t) && (!DEMO_DAY || /\b47\b/.test(t)),
    `score ${sc}`,
  );
});
await check("Pro features are visibly locked for a free user", async () => {
  const t = await text(page);
  expect(/Unlock the catch-up plan/.test(t) && /Upgrade/.test(t), "no lock");
});
await check("No NaN / Infinity / undefined on screen", async () =>
  expect(!/NaN|Infinity|undefined/.test(await text(page)), "bad value"),
);
await check("Numbers use US format even in ru browser", async () =>
  expect(/\$51,610/.test(await text(page)), "format"),
);

/* ===== C. Interactions ===== */
section = "Interactions";
await check("I just got paid $1,200 → pay stub: $923 yours / $277 withheld", async () => {
  await typeInto(page, 'input[placeholder="1,200"]', "1200");
  await page.keyboard.press("Enter");
  await sleep(400);
  const y = money(await grab(page, /Yours to spend\s+(\$[\d,]+)/));
  const s = money(await grab(page, /Move to tax savings\s+(\$[\d,]+)/));
  const se = money(await grab(page, /self-employment tax\)\s+(\$[\d,]+)/));
  const fit = money(await grab(page, /Federal income tax\s+(\$[\d,]+)/));
  expect(y + s === 1200 && se + fit === s && (!DEMO_DAY || (y === 923 && s === 277)), `${y}/${s} (${se}+${fit})`);
});
await check("Payout raises checking by $1,200 and safe-to-spend by exactly the take-home", async () => {
  const t = await text(page);
  const safe = money(t.match(/SAFE TO SPEND\s+(-?\$[\d,]+)/i)?.[1] ?? "x");
  const y = money(await grab(page, /Yours to spend\s+(\$[\d,]+)/));
  expect(!DEMO_DAY || Math.abs(safe - (-1257 + y)) <= 1, `safe ${safe}, take-home ${y}`);
});
await check("Payout added to the log (16 rows, +$1,200)", async () => {
  expect((await read.rows(page)) === 16 && money(await read.received(page)) === 52810, "not added");
});
await check("'I moved' logs the stash and raises covered", async () => {
  const before = money(await read.covered(page));
  await clickButton(page, /^I moved \$/);
  const t = await text(page);
  expect(/✓ \$[\d,]+ logged/.test(t) && money(await read.covered(page)) > before, "not logged");
});
await check("Moving the withheld part to savings leaves safe-to-spend unchanged", async () => {
  const t = await text(page);
  const safe = money(t.match(/SAFE TO SPEND\s+(-?\$[\d,]+)/i)?.[1] ?? "x");
  expect(!DEMO_DAY || Math.abs(safe - (-1257 + 923)) <= 1, `safe ${safe}`);
});
await check("'Pay it all now' covers the full federal balance", async () => {
  await clickButton(page, /^Pay it all now$/);
  const jan = money(await read.jan(page));
  const owed = money(await read.owed(page));
  await clickButton(page, /^Penalty-proof minimum$/);
  expect(Math.abs(jan + 2650 - owed) <= 2, `${jan}+2650 vs ${owed}`);
});
let singleTotal = 0;
await check("Married filing jointly lowers total tax", async () => {
  singleTotal = money(await read.total(page));
  await clickButton(page, /^Married filing jointly$/);
  const mfj = money(await read.total(page));
  expect(mfj < singleTotal, `${mfj} vs ${singleTotal}`);
});
await check("Head of household lowers total tax", async () => {
  await clickButton(page, /^Head of household$/);
  expect(money(await read.total(page)) < singleTotal, "no");
});
await check("Back to Single restores the exact total", async () => {
  await clickButton(page, /^Single$/);
  expect(money(await read.total(page)) === singleTotal, "not restored");
});
await check("State rate adds state tax (5% default)", async () => {
  await clickButton(page, /^My state.s rate$/);
  const t = money(await read.total(page));
  await clickButton(page, /^None \(TX/);
  expect(t > singleTotal && money(await read.total(page)) === singleTotal, `${t}`);
});
await check("W-2 withholding $3,000 lowers 'still owed' by $3,000", async () => {
  const before = money(await read.owed(page));
  await clickButton(page, /^Also have a W-2 job\?$/);
  await typeByLabel(page, "Federal tax withheld", "3000");
  const after = money(await read.owed(page));
  await typeByLabel(page, "Federal tax withheld", "");
  expect(before - after === 3000, `${before} → ${after}`);
});
await check("Removing a payout lowers income by its amount", async () => {
  const before = money(await read.received(page));
  const ok = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button[aria-label^="Remove "]')].find((x) =>
      /Fintech/.test(x.getAttribute("aria-label")),
    );
    b?.click();
    return !!b;
  });
  await sleep(250);
  expect(ok && before - money(await read.received(page)) === 7200, "not removed");
});
await check("Paste: 3 good lines imported, bad line explained", async () => {
  const before = await read.rows(page);
  await clickButton(page, /^📋 Paste lines/);
  await page.type("textarea", "Mar 3 Upwork 2,400\n2026-03-05, DoorDash, $412.50\n03/09 Uber Eats 312\noops no amount");
  await clickButton(page, /^Import lines$/);
  const t = await text(page);
  expect((await read.rows(page)) === before + 3 && /Line 4: No amount/.test(t), "paste failed");
});
await check("Manual add row (+$500)", async () => {
  const before = money(await read.received(page));
  await typeInto(page, 'input[aria-label="Source"]', "Test client");
  await typeInto(page, 'input[aria-label="Amount"]', "500");
  await submitFormOf(page, 'input[aria-label="Source"]');
  expect(money(await read.received(page)) - before === 500, "not added");
});
await check("Stash transfer $1,000 raises tax savings", async () => {
  const before = money(await read.savings(page));
  await typeInto(page, 'input[aria-label="Moved to tax savings amount"]', "1000");
  await submitFormOf(page, 'input[aria-label="Moved to tax savings amount"]');
  expect(money(await read.savings(page)) - before === 1000, "no");
});
await check("Paying the catch-up removes it from the plan", async () => {
  const c = money(await read.catchUp(page));
  await typeInto(page, 'input[aria-label="Paid to the IRS for 2026 amount"]', String(c));
  await submitFormOf(page, 'input[aria-label="Paid to the IRS for 2026 amount"]');
  expect((await read.catchUp(page)) === undefined, "still there");
});
await check("Bank CSV sample: Chase detected, 10 deposits, 5 outflows skipped", async () => {
  await clickButton(page, /^try a sample Chase export$/);
  await sleep(1200);
  expect(/Chase: 10 deposits found, 5 spending rows ignored/.test(await text(page)), "csv");
});
await check("Bank CSV: duplicates of logged payouts flagged", async () => {
  const n = ((await text(page)).match(/Already in your income log/g) || []).length;
  expect(n === 2, `dupes ${n}`);
});
await check("Free user: adding imported payouts opens the Pro paywall (plans priced per day)", async () => {
  const before = money(await read.received(page));
  await clickButton(page, /^Add \d+ payouts/);
  const t = await text(page);
  expect(
    (await paywallOpen(page)) &&
      /Bank import is part of Pro/.test(t) &&
      /\$0\.71/.test(t) &&
      money(await read.received(page)) === before,
    "no paywall",
  );
});
await check("Paywall: demo checkout says nothing is charged, then unlocks Pro", async () => {
  await clickButton(page, /^Get my plan$/);
  const t = await text(page);
  expect(/nothing is charged/i.test(t), "no honesty note");
  await clickButton(page, /^Activate Pro \(demo\)$/);
  await sleep(300);
  expect(!(await paywallOpen(page)) && /Pro \(demo\) ✓/.test(await text(page)), "not unlocked");
});
await check("Bank CSV: 'Add N payouts' adds exactly that sum", async () => {
  const before = money(await read.received(page));
  const label = await page.evaluate(() =>
    [...document.querySelectorAll("button")].map((b) => b.textContent).find((t) => /^Add \d+ payouts/.test(t)),
  );
  const sum = money(label?.split("·")[1]);
  await clickButton(page, /^Add \d+ payouts/);
  expect(Math.abs(money(await read.received(page)) - before - sum) <= 1, `${label}`); // button shows whole dollars
});
await check("Calendar export: deadlines + weekly check-in at the app's rate", async () => {
  await page.evaluate(() => {
    window.__ics = null;
    const orig = URL.createObjectURL;
    URL.createObjectURL = (b) => {
      b.text().then((t) => (window.__ics = t));
      return orig(b);
    };
    HTMLAnchorElement.prototype.click = function () {
      window.__dl = this.download;
    };
  });
  await clickButton(page, /Add deadlines \+ weekly check-in/);
  await sleep(500);
  const { ics, dl } = await page.evaluate(() => ({ ics: window.__ics, dl: window.__dl }));
  const rate = await read.rate(page);
  expect(dl === "irs-estimated-tax-2026.ics" && /RRULE:FREQ=WEEKLY/.test(ics) && ics.includes(`move ${rate}%`), "ics");
});
await check("Calendar events carry 3-day alarms", async () => {
  const ics = await page.evaluate(() => window.__ics);
  expect(/TRIGGER:-P3D/.test(ics) && /SUMMARY:Pay IRS estimated tax: \$[\d,]+/.test(ics), "alarm");
});
await check("Pro catch-up plan: spread the gap over the next payouts", async () => {
  const t0 = await text(page);
  if (!/Behind \$/.test(t0)) {
    await typeInto(page, 'input[placeholder="1,200"]', "9000");
    await page.keyboard.press("Enter");
    await sleep(300);
  }
  const t = await text(page);
  expect(/Hold back \d+% of your next 8 payouts/.test(t), "no catch-up plan");
});
await check("Weekly payday check-in starts a streak", async () => {
  await clickButton(page, /^Finish this week.s payday check-in$/);
  const t = await text(page);
  expect(/Checked in this week/.test(t) && /1-week streak/.test(t), "no streak");
});
await check("Tax-pro export (Pro) downloads a CSV with the income log and estimates", async () => {
  await page.evaluate(() => {
    window.__csv = null;
    const orig = URL.createObjectURL;
    URL.createObjectURL = (b) => {
      b.text().then((t) => (window.__csv = t));
      return orig(b);
    };
    HTMLAnchorElement.prototype.click = function () {
      window.__dl = this.download;
    };
  });
  await clickButton(page, /^Download summary \(CSV\)$/);
  await sleep(500);
  const { csv, dl } = await page.evaluate(() => ({ csv: window.__csv, dl: window.__dl }));
  expect(dl === "stash1099-2026-summary.csv" && /1099 INCOME LOG/.test(csv) && /Self-employment tax,/.test(csv), "csv");
});
let shareLink = "";
await check("Share link copies a private URL (#s=…)", async () => {
  await page.evaluate(() =>
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: async (t) => (window.__copied = t) },
      configurable: true,
    }),
  );
  await clickButton(page, /^Share link$/);
  shareLink = await page.evaluate(() => window.__copied);
  expect(/\/plan#s=[A-Za-z0-9_-]+$/.test(shareLink), shareLink?.slice(0, 60));
});
await check("Share link restores the same plan in a fresh browser", async () => {
  const ctx = await browser.createBrowserContext();
  const p2 = await ctx.newPage();
  watch(p2, "share");
  await p2.goto(shareLink.replace("https://stash1099.vercel.app", BASE), { waitUntil: "networkidle0" });
  await sleep(400);
  const same =
    (await read.received(p2)) === (await read.received(page)) && (await read.safe(p2)) === (await read.safe(page));
  await ctx.close();
  expect(same, "different");
});
await check("Plan survives a reload (local storage)", async () => {
  const r = await read.received(page);
  await page.reload({ waitUntil: "networkidle0" });
  await sleep(400);
  expect((await read.received(page)) === r, "lost");
});
await check("Reset clears everything back to quick start", async () => {
  await clickButton(page, /^Reset$/);
  const t = await text(page);
  expect(/How much of your money is actually yours/.test(t) && /Your plan shows up here/.test(t), "not reset");
});

/* ===== D. Quick start (fresh visitor) ===== */
section = "Quick start";
const fresh = await (await browser.createBrowserContext()).newPage();
watch(fresh, "fresh");
await fresh.setViewport({ width: 1440, height: 1000 });
await fresh.goto(BASE + "/plan", { waitUntil: "networkidle0" });
await sleep(300);
await check("Fresh visitor sees quick start, not empty results", async () => {
  const t = await text(fresh);
  expect(/How much of your money is actually yours/.test(t) && !/Your payment plan/.test(t), "wrong state");
});
await check("Start button disabled until income entered", async () =>
  expect(
    await fresh.evaluate(
      () => [...document.querySelectorAll("button")].find((b) => /Show my safe-to-spend/.test(b.textContent))?.disabled,
    ),
    "enabled",
  ),
);
await check("Letters are ignored in money fields", async () => {
  await typeInto(fresh, 'input[placeholder="48,000"]', "abc");
  expect((await fresh.$eval('input[placeholder="48,000"]', (i) => i.value)) === "", "accepted letters");
});
await check("3 answers → safe-to-spend appears", async () => {
  await typeInto(fresh, 'input[placeholder="48,000"]', "48000");
  await typeInto(fresh, 'input[placeholder="4,200"]', "4200");
  await clickButton(fresh, /^Show my safe-to-spend$/);
  await sleep(400);
  const s = await read.safe(fresh);
  expect(s && (!DEMO_DAY || s === "-$5,071"), s);
});
await check("Full plan visible after quick start", async () => {
  const t = await text(fresh);
  expect(
    /Your payment plan/.test(t) && /2026 quarterly deadlines/.test(t) && !/How much of your money/.test(t),
    "no plan",
  );
});
await check("Extreme income ($1,000,000) stays sane", async () => {
  await clickButton(fresh, /^Reset$/);
  await typeInto(fresh, 'input[placeholder="48,000"]', "1000000");
  await clickButton(fresh, /^Show my safe-to-spend$/);
  await sleep(400);
  const t = await text(fresh);
  const r = Number(await read.rate(fresh));
  expect(!/NaN|Infinity/.test(t) && r >= 35 && r <= 50, `rate ${r}`);
});
await check("Zero-income edge: results hidden, no NaN", async () => {
  await clickButton(fresh, /^Reset$/);
  expect(!/NaN|Infinity/.test(await text(fresh)), "NaN");
});

await check("Real file upload: a Bank of America CSV through the file picker", async () => {
  const file = join(tmpdir(), "stash1099-e2e-boa.csv");
  writeFileSync(
    file,
    [
      "Date,Description,Amount,Running Bal.",
      `10/05/2026,"LYFT INC DES:PAYMENT ID:1",310.20,1310.20`,
      `10/06/2026,"TARGET T-1234",-45.00,1265.20`,
      `10/07/2026,"ZELLE PAYMENT FROM JOHN",200.00,1465.20`,
    ].join("\n"),
  );
  const input = await fresh.$("input[type=file]");
  expect(input, "file input not found");
  await input.uploadFile(file);
  await sleep(700);
  expect(/Bank of America: 2 deposits found, 1 spending rows ignored/.test(await text(fresh)), "file not parsed");
  await clickButton(fresh, /^Add 1 payouts/);
  if (await paywallOpen(fresh)) {
    await activatePro(fresh);
    await clickButton(fresh, /^Add 1 payouts/);
  }
  await sleep(300);
  expect(money(await read.received(fresh)) === 310 && /Your payment plan/.test(await text(fresh)), "payout not added");
});

/* ===== D2. Quiz funnel ===== */
section = "Quiz funnel";
const quiz = await (await browser.createBrowserContext()).newPage();
watch(quiz, "quiz");
await quiz.setViewport({ width: 1440, height: 1000 });
await quiz.goto(BASE + "/start", { waitUntil: "networkidle0" });
await sleep(300);
await check("Quiz opens at step 1 with a progress bar", async () => {
  const t = await text(quiz);
  expect(/Step 1 of \d/.test(t) && (await quiz.$('[role="progressbar"]')), "no quiz");
});
await check("Quiz: 7 steps answered end to end", async () => {
  await clickButton(quiz, /^Both clients and gig apps$/);
  await typeInto(quiz, 'input[placeholder="48,000"]', "48000");
  await clickButton(quiz, /^Continue$/);
  await clickButton(quiz, /^Head of household$/);
  await clickButton(quiz, /^1$/);
  await clickButton(quiz, /^Continue$/);
  await clickButton(quiz, /^No \(Texas/);
  await clickButton(quiz, /^Nothing yet$/);
  await typeInto(quiz, 'input[placeholder="4,200"]', "4200");
  await clickButton(quiz, /^Continue$/);
  await clickButton(quiz, /^I owed more than I expected$/);
  await clickButton(quiz, /^Show my numbers$/);
  await sleep(2200);
  expect(/Your 2026 tax picture/.test(await text(quiz)), "no result");
});
await check("Result: personal headline, safe to spend, April bill, score", async () => {
  const t = await text(quiz);
  expect(
    /already spent \$[\d,]+ of the IRS/.test(t) &&
      /SAFE TO SPEND/i.test(t) &&
      /April 15 bill/i.test(t) &&
      /Tax-ready score: \d+ \/ 100/.test(t),
    t.slice(0, 200),
  );
});
await check("Result: next $1,000 payout shown as a pay stub that adds up", async () => {
  const se = money(await grab(quiz, /self-employment tax\)\s+(\$[\d,]+)/));
  const fit = money(await grab(quiz, /Federal income tax\s+(\$[\d,]+)/));
  const home = money(await grab(quiz, /Take-home: yours to spend\s+(\$[\d,]+)/));
  expect(se + fit + home === 1000, `${se}+${fit}+${home}`);
});
await check("Child tax credit lowers the bill (HoH with 1 child vs none)", async () => {
  const withKid = money(await grab(quiz, /April 15 bill at this pace\s+(\$[\d,]+)/i));
  expect(withKid > 0 && withKid < 10_866, `${withKid}`);
});
await check("Result: 'See Pro plans' opens the paywall; 'Not now' closes it", async () => {
  await clickButton(quiz, /^See Pro plans$/);
  const open = await paywallOpen(quiz);
  await clickButton(quiz, /^Not now, continue with Free$/);
  expect(open && !(await paywallOpen(quiz)), "paywall");
});
await check("Free plan carries the quiz answers into the app", async () => {
  await clickButton(quiz, /^Continue with the free plan$/);
  await sleep(1500);
  const t = await text(quiz);
  expect(
    quiz.url().endsWith("/plan") && money(await read.received(quiz)) === 48000 && /Head of household/.test(t),
    quiz.url(),
  );
});

/* ===== E. Mobile ===== */
section = "Mobile 375px";
const mobile = await (await browser.createBrowserContext()).newPage();
watch(mobile, "mobile");
await mobile.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
for (const [name, path] of [
  ["Quiz", "/start"],
  ["Landing", "/"],
  ["Demo", "/plan?demo=maya"],
  ["Quick start", "/plan"],
]) {
  await check(`${name}: no horizontal scroll`, async () => {
    await mobile.goto(BASE + path, { waitUntil: "networkidle0" });
    await sleep(300);
    expect(await noOverflow(mobile), "overflow");
  });
}
await check("Demo on phone: Safe to spend shown before the form", async () => {
  await mobile.goto(BASE + "/plan?demo=maya", { waitUntil: "networkidle0" });
  await sleep(300);
  const ok = await mobile.evaluate(() => {
    const top = (re) =>
      [...document.querySelectorAll("h2")].find((h) => re.test(h.textContent))?.getBoundingClientRect().top ?? 1e9;
    return top(/Safe to spend/i) < top(/About you/);
  });
  expect(ok, "form first");
});
await check("Main CTA is a comfortable tap target (≥ 44px)", async () => {
  await mobile.goto(BASE + "/", { waitUntil: "networkidle0" });
  const h = await mobile.evaluate(
    () =>
      [...document.querySelectorAll("a")]
        .find((a) => /Take the 60-second check/.test(a.textContent))
        ?.getBoundingClientRect().height,
  );
  expect(h >= 44, `${h}px`);
});

/* ===== F. Accessibility basics ===== */
section = "Accessibility";
await page.goto(BASE + "/plan?demo=maya", { waitUntil: "networkidle0" });
await sleep(300);
await check("Every input has a label", async () => {
  const bad = await page.evaluate(() =>
    [...document.querySelectorAll("input, textarea")]
      .filter((i) => i.type !== "hidden" && i.type !== "file")
      .filter((i) => !i.getAttribute("aria-label") && !i.closest("label") && !i.getAttribute("placeholder"))
      .map((i) => i.outerHTML.slice(0, 60)),
  );
  expect(bad.length === 0, bad.join(" | "));
});
await check("Every button has a name", async () => {
  const bad = await page.evaluate(
    () =>
      [...document.querySelectorAll("button")].filter((b) => !b.textContent.trim() && !b.getAttribute("aria-label"))
        .length,
  );
  expect(bad === 0, `${bad} unnamed`);
});
await check("Progress bar exposes its value", async () =>
  expect(await page.$eval('[role="progressbar"]', (e) => e.getAttribute("aria-valuenow") !== null), "no value"),
);

/* ===== G. Privacy, errors, HTTP ===== */
section = "Privacy & errors";
await check("Only our own domain was contacted (no trackers, no data leaves)", async () => {
  const allowed = new URL(BASE).host;
  const others = [...hosts].filter((h) => h !== allowed);
  expect(others.length === 0, others.join(", "));
});
await check("No hydration errors in a ru-RU browser", async () =>
  expect(!consoleErrors.some((e) => /#418|#423|#425|[Hh]ydration/.test(e)), consoleErrors.join(" | ").slice(0, 200)),
);
await check("No console errors at all", async () =>
  expect(consoleErrors.length === 0, consoleErrors.join(" | ").slice(0, 200)),
);

const head = async (path) => fetch(BASE + path, { redirect: "manual" });
await check("Unknown page returns 404", async () =>
  expect((await head("/definitely-not-here")).status === 404, "not 404"),
);
await check("Sample CSV served as text/csv with Chase header", async () => {
  const r = await head("/sample-chase-export.csv");
  const body = await r.text();
  expect(
    r.status === 200 && /text\/csv/.test(r.headers.get("content-type")) && body.startsWith("Details,Posting Date"),
    "csv",
  );
});
await check("Favicon served", async () => expect((await head("/favicon.ico")).status === 200, "no favicon"));
if (BASE.startsWith("https"))
  await check("HTTPS with HSTS", async () =>
    expect(!!(await head("/")).headers.get("strict-transport-security"), "no HSTS"),
  );
await check("/start (quiz) is served", async () => expect((await head("/start")).status === 200, "no quiz page"));
await check("/plan is prerendered static HTML", async () => {
  const html = await (await head("/plan")).text();
  expect(/Stash1099/.test(html) && /<html lang="en"/.test(html), "not prerendered");
});

/* ===== H. Repository & pitch ===== */
section = "Repo & PDF";
const gh = (p) => fetch(`https://api.github.com/repos/${REPO}${p}`, { headers: { "User-Agent": "stash1099-e2e" } });
const repo = await (await gh("")).json();
await check("Repo is public and not archived", async () =>
  expect(repo.private === false && repo.archived === false, "private/archived"),
);
await check("Repo homepage = live product", async () =>
  expect(repo.homepage === "https://stash1099.vercel.app", repo.homepage),
);
await check("README explains live link and how to run tests", async () => {
  const md = await (await fetch(`https://raw.githubusercontent.com/${REPO}/main/README.md`)).text();
  expect(md.includes("https://stash1099.vercel.app") && md.includes("npm test"), "readme");
});
const tree = await (await gh(`/git/trees/main?recursive=1`)).json();
const paths = (tree.tree ?? []).map((t) => t.path);
await check("No secrets or env files committed", async () =>
  expect(
    !paths.some((p) => /(^|\/)\.env|\.vercel\/|\.pem$|id_rsa/.test(p)),
    paths.filter((p) => /env|vercel/.test(p)).join(","),
  ),
);
await check("Unit tests are in the repo (≥ 4 test files)", async () =>
  expect(paths.filter((p) => /\.test\.ts$/.test(p)).length >= 4, "few tests"),
);
await check("Pitch PDF in repo, ≤ 10 slides", async () => {
  const buf = Buffer.from(
    await (await fetch(`https://github.com/${REPO}/raw/main/docs/Stash1099-pitch.pdf`)).arrayBuffer(),
  );
  const pages = (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  expect(buf.subarray(0, 4).toString() === "%PDF" && pages >= 1 && pages <= 10, `${pages} pages`);
});
if (LOCAL_SHA) {
  await check("GitHub main = local HEAD (what you tested is what jury reads)", async () => {
    const c = await (await gh("/commits/main")).json();
    expect(c.sha?.startsWith(LOCAL_SHA), `${c.sha?.slice(0, 7)} vs ${LOCAL_SHA}`);
  });
}

await browser.close();

/* -------------------------------- report -------------------------------- */
let last = "";
for (const r of results) {
  if (r.section !== last) {
    console.log(`\n${r.section}`);
    last = r.section;
  }
  console.log(`  ${r.ok ? "✓" : "✗"} ${r.name}${r.ok ? "" : `  →  ${r.err}`}`);
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed against ${BASE} (${TODAY})`);
process.exit(failed ? 1 : 0);
