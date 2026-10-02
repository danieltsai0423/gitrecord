import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

await mkdir("artifacts", { recursive: true });
const browser = await chromium.launch({ channel: "msedge" });
for (const [name, width, height] of [
  ["desktop", 1440, 1100],
  ["mobile", 390, 844],
]) {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:4317", { waitUntil: "networkidle" });
  await page.getByTestId("ADDITIONS").waitFor();
  await page.locator(".recharts-surface").waitFor();
  await page.screenshot({ path: `artifacts/${name}.png`, fullPage: true });
  console.log(
    JSON.stringify({
      name,
      overflow: await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      errors,
    }),
  );
  await page.close();
}
await browser.close();
