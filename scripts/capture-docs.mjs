import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { access, mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname, sep } from "node:path";
import { aggregateCommits, normalizeStore, updateAccount, dateRange } from "../dist-server/shared/report.js";

// Documentation uses synthetic data only. This server serves built assets and
// never loads the application's cache, credentials, or real GitHub API.
const root = fileURLToPath(new URL("../", import.meta.url));
const build = resolve(root, "dist");
await access(resolve(build, "index.html"));
const output = resolve(root, "docs", "images");
await mkdir(output, { recursive: true });
const start = "2025-10-05", end = "2026-10-04";
const identifiers = new Set();
function account(index) {
  const login = `docs-account-${index}`;
  identifiers.add(login);
  const repositories = [0, 1, 2].map((n) => {
    const name = `docs-project-${index}-${n + 1}`;
    const fullName = `${login}/${name}`;
    identifiers.add(name); identifiers.add(fullName);
    const seed = index * 17 + n * 7;
    const commits = dateRange(start, end).flatMap((date, i) => {
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      const value = (i * 23 + seed * 11) % 41;
      if (value % (n + 3) || (weekday === 0 && value < 34)) return [];
      return Array.from({ length: value % 4 + 1 }, (_, c) => ({
        oid: `demo-${index}-${n}-${i}-${c}`, committedDate: `${date}T03:00:00+08:00`,
        additions: (value + 2) * (n + 1) * (c + 1) * 9,
        deletions: (value % 7) * (c + 1) * 6, parents: { totalCount: 1 },
      }));
    });
    return {
      name, fullName, private: true, url: `https://github.com/${fullName}`,
      branch: "main", language: ["TypeScript", "Python", "HTML"][n],
      languageColor: ["#3178c6", "#3572a5", "#e34c26"][n], status: "complete",
      ...aggregateCommits(commits, start, end),
    };
  });
  return {
    version: 1, user: { id: `demo-user-${index}`, login, avatarUrl: "", url: `https://github.com/${login}` },
    generatedAt: "2026-10-04T08:00:00Z", timezone: "Asia/Taipei", partial: false, excludedForks: 0,
    range: { start, end, until: "2026-10-04T08:00:00Z" }, repositories,
  };
}
const store = updateAccount(normalizeStore(account(1)), account(2));
const auth = {
  accounts: [1, 2].map((i) => ({ login: `docs-account-${i}`, active: i === 1, state: "success" })),
  running: false, operation: null, code: null, verificationUrl: null, error: null, message: null,
  configuration: { clientId: "demo-public-client", appId: "1234", appUrl: "https://github.com/apps/demo-gitrecord", configured: true, storage: "keychain" },
  installation: { state: "ready", url: "https://github.com/settings/installations/99", repositoryCount: 3, selection: "selected" },
};
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const file = resolve(build, path === "/" ? "index.html" : `.${path}`);
    if (!file.startsWith(build + sep)) { response.writeHead(403).end(); return; }
    const data = await readFile(file);
    response.writeHead(200, { "Content-Type": mime[extname(file)] ?? "application/octet-stream" });
    response.end(data);
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ channel: "msedge" });
  const shots = [
    { file: "dashboard-dark-en.png", language: "en", theme: "dark" },
    { file: "dashboard-light-zh-TW.png", language: "zh-Hant", theme: "light" },
    { file: "activity-dark-en.png", language: "en", theme: "dark", crop: "activity" },
    { file: "comparison-dark-en.png", language: "en", theme: "dark", tab: 1, crop: "workspace" },
    { file: "review-light-zh-TW.png", language: "zh-Hant", theme: "light", crop: "workspace" },
    { file: "goals-mobile-en.png", language: "en", theme: "light", tab: 2, crop: "workspace", mobile: true },
    { file: "accounts-light-zh-TW.png", language: "zh-Hant", theme: "light", crop: "accounts", expanded: true },
  ];
  for (const shot of shots) {
    const context = await browser.newContext({ viewport: { width: shot.mobile ? 390 : 1440, height: shot.mobile ? 844 : 1280 }, deviceScaleFactor: 1 });
    await context.addInitScript(({ language, theme, expanded }) => {
      localStorage.setItem("gitrecord-language", language);
      localStorage.setItem("gitrecord-theme", theme);
      localStorage.setItem("gitrecord-account-panel-collapsed", String(!expanded));
      localStorage.setItem("gitrecord-weekly-goals", JSON.stringify({ combined: 4 }));
    }, shot);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", (route) => {
      const request = route.request(), path = new URL(request.url()).pathname;
      const json = path === "/api/report" ? store : path === "/api/auth" ? auth : path === "/api/sync/status" ? { running: false, completed: 0, total: 0, current: "", error: null } : null;
      if (request.method() !== "GET" || !json) { errors.push(`Unexpected API request: ${request.method()} ${path}`); return route.abort(); }
      return route.fulfill({ json });
    });
    await page.goto(baseURL, { waitUntil: "networkidle" });
    const workspace = page.locator("#reflection");
    await workspace.waitFor();
    await page.locator(".recharts-surface").waitFor();
    if (shot.tab) await workspace.getByRole("tab").nth(shot.tab).click();
    await page.addStyleTag({ content: ".docs-redacted { display:inline-block; width:9ch; max-width:100%; height:.7em; vertical-align:baseline; background:var(--secondary); border-radius:2px; }" });
    const masks = await page.evaluate((names) => {
      const pattern = new RegExp(names.sort((a, b) => b.length - a.length).map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      let count = 0;
      for (const node of nodes) {
        if (["SCRIPT", "STYLE"].includes(node.parentElement?.tagName)) continue;
        const value = node.textContent ?? "";
        const matches = [...value.matchAll(pattern)];
        if (!matches.length) continue;
        count += matches.length;
        if (node.parentElement?.tagName === "OPTION") { node.textContent = value.replace(pattern, "[REDACTED]"); continue; }
        const fragment = document.createDocumentFragment();
        let offset = 0;
        for (const match of matches) {
          fragment.append(document.createTextNode(value.slice(offset, match.index)));
          const mask = document.createElement("span");
          mask.className = "docs-redacted";
          mask.setAttribute("aria-label", "Redacted account or project name");
          fragment.append(mask);
          offset = match.index + match[0].length;
        }
        fragment.append(document.createTextNode(value.slice(offset)));
        node.replaceWith(fragment);
      }
      if (names.some((name) => document.body.textContent.includes(name))) throw new Error("Unredacted label remains");
      return count;
    }, [...identifiers]);
    if (!masks || errors.length) throw new Error(`Screenshot validation failed: ${shot.file}`);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error("Page overflow");
    if (shot.crop) await page.locator(shot.crop === "accounts" ? ".account-panel" : shot.crop === "activity" ? ".charts-row" : "#reflection").screenshot({ path: resolve(output, shot.file) });
    else { await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: resolve(output, shot.file) }); }
    console.log(JSON.stringify({ file: shot.file, masks, errors }));
    await context.close();
  }
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
