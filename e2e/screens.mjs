/**
 * Capture the screens used in the pitch deck from a live deployment.
 *   node e2e/screens.mjs <outDir>
 */
import puppeteer from "puppeteer-core";

const BASE = (process.env.BASE ?? "https://stash1099.vercel.app").replace(/\/$/, "");
const OUT = process.argv[2] ?? ".";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const click = async (page, re) => {
  await page.evaluate((src) => {
    const r = new RegExp(src);
    [...document.querySelectorAll("button, a")].find((b) => r.test(b.textContent.trim()))?.click();
  }, re.source);
  await sleep(400);
};
const type = async (page, sel, v) => {
  const el = await page.$(sel);
  await el.click({ clickCount: 3 });
  await el.type(String(v));
  await sleep(200);
};

// 1. Landing with the hero widget filled
{
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(BASE + "/", { waitUntil: "networkidle0" });
  await type(page, 'input[placeholder="48,000"]', 48000);
  await type(page, 'input[placeholder="4,200"]', 4200);
  await page.screenshot({ path: `${OUT}/s-landing.png` });
  await page.close();
}

// 2. Quiz result (mobile width, full page)
{
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 2, isMobile: true });
  await page.goto(BASE + "/start", { waitUntil: "networkidle0" });
  await page.screenshot({ path: `${OUT}/s-quiz-q1.png` });
  await click(page, /^Both clients and gig apps$/);
  await type(page, 'input[placeholder="48,000"]', 48000);
  await click(page, /^Continue$/);
  await click(page, /^Continue$/);
  await click(page, /^No \(Texas/);
  await click(page, /^Nothing yet$/);
  await type(page, 'input[placeholder="4,200"]', 4200);
  await click(page, /^Continue$/);
  await click(page, /^I owed more than I expected$/);
  await click(page, /^Show my numbers$/);
  await sleep(2400);
  await page.screenshot({ path: `${OUT}/s-quiz-result.png` });
  await click(page, /^See Pro plans$/);
  await sleep(500);
  await page.screenshot({ path: `${OUT}/s-paywall.png` });
  await ctx.close();
}

// 3. App with Maya: pay stub after "I just got paid $1,200"
{
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 1 });
  await page.goto(BASE + "/plan?demo=maya", { waitUntil: "networkidle0" });
  await type(page, 'input[placeholder="1,200"]', 1200);
  await page.keyboard.press("Enter");
  await sleep(600);
  await page.screenshot({ path: `${OUT}/s-app.png` });
  await ctx.close();
}

await browser.close();
console.log("screens saved to", OUT);
