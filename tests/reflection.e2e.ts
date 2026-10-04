import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { aggregateCommits, normalizeStore, updateAccount, type Report } from "../shared/report.js";

const workName = "private-project-with-a-long-name-that-should-stay-on-this-computer";
const personalName = "public-notes";
function account(login: string, dates: string[], privateRepo: boolean): Report {
  const name = privateRepo ? workName : personalName;
  return {
    version: 1, user: { id: login + "-id", login, avatarUrl: "", url: `https://github.com/${login}` },
    generatedAt: "2026-10-02T06:00:00Z", timezone: "Asia/Taipei", partial: false, excludedForks: 0,
    range: { start: "2025-10-03", end: "2026-10-02", until: "2026-10-02T06:00:00Z" },
    repositories: [{
      name, fullName: `${login}/${name}`, private: privateRepo, url: "", branch: "main", language: "TypeScript", languageColor: "", status: "complete",
      ...aggregateCommits(dates.map((date, i) => ({ oid: login + i, committedDate: date + "T00:00:00+08:00", additions: i === 1 ? 0 : 10, deletions: 0, parents: { totalCount: 1 } })), "2025-10-03", "2026-10-02"),
    }],
  };
}
const fixture = () => updateAccount(normalizeStore(account("work-secret", ["2026-09-28", "2026-09-29", "2026-10-01"], true)), account("personal-secret", ["2026-09-29", "2026-10-02"], false));

async function open(page: Page, store = fixture()) {
  let writes = 0;
  page.on("request", (request) => { if (request.url().includes("/api/") && request.method() !== "GET") writes++; });
  await page.route("**/api/report", (route) => route.fulfill({ json: store }));
  await page.route("**/api/sync/status", (route) => route.fulfill({ json: { running: false, completed: 0, total: 0, current: "", error: null } }));
  await page.route(/\/api\/auth(?:\?.*)?$/, (route) => route.fulfill({ json: {
    accounts: [{ login: "work-secret", active: true, state: "success" }], running: false, operation: null, code: null, verificationUrl: null, error: null, message: null,
    configuration: { clientId: "test-client", appId: "1234", appUrl: "https://github.com/apps/test-gitrecord", configured: true, storage: "keychain" },
    installation: { state: "ready", url: "https://github.com/settings/installations/99", repositoryCount: 2, selection: "selected" },
  } }));
  await page.goto("/");
  await expect(page.getByRole("region", { name: "回顧與節奏", exact: true })).toBeVisible();
  return () => writes;
}

test("回顧沿用篩選，帳號對照使用同一期間並顯示交集，切換不呼叫同步", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const writes = await open(page);
  const workspace = page.getByRole("region", { name: "回顧與節奏", exact: true });
  await expect(workspace).toContainText("本期有 4 個活躍日，留下 5 個 commits，投入 2 個專案。");
  await expect(workspace.getByTestId("review-streak")).toHaveText("2 天");
  await workspace.screenshot({ path: `artifacts/reflection-review-${info.project.name}.png` });
  await workspace.getByRole("tab", { name: "帳號對照", exact: true }).click();
  const table = workspace.getByRole("table", { name: "帳號活動對照", exact: true });
  await expect(table.getByRole("row").filter({ hasText: "work-secret" }).getByRole("cell").nth(2)).toHaveText("3");
  await expect(table.getByRole("row").filter({ hasText: "personal-secret" }).getByRole("cell").nth(2)).toHaveText("2");
  await expect(workspace).toContainText("共同活躍日 · 1 天");
  await workspace.getByLabel("對照指標", { exact: true }).selectOption("changed");
  await workspace.screenshot({ path: `artifacts/reflection-comparison-${info.project.name}.png` });
  await page.getByLabel("篩選帳號", { exact: true }).selectOption("personal-secret");
  await expect(table.getByRole("row")).toHaveCount(2);
  await workspace.getByRole("tab", { name: "期間回顧", exact: true }).click();
  await expect(workspace).toContainText("本期有 2 個活躍日，留下 2 個 commits，投入 1 個專案。");
  await workspace.getByRole("button", { name: "近 7 日", exact: true }).click();
  await expect(page.getByLabel("開始日期", { exact: true })).toHaveValue("2026-09-26");
  await expect(page.getByLabel("結束日期", { exact: true })).toHaveValue("2026-10-02");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(writes()).toBe(0);
  expect(errors).toEqual([]);
});

test("週目標跨帳號日期去重、獨立於 repo 篩選並按帳號保存", async ({ page }, info) => {
  const writes = await open(page);
  const workspace = page.getByRole("region", { name: "回顧與節奏", exact: true });
  await workspace.getByRole("tab", { name: "節奏與目標", exact: true }).click();
  const goal = workspace.getByLabel("設定每週活躍天數", { exact: true });
  await expect(goal).toHaveValue("0");
  await goal.selectOption("3");
  await expect(workspace).toContainText("已記錄 4 / 3 天");
  await expect(workspace).toContainText("已達成選取週目標");
  await expect(workspace.getByRole("listitem", { name: "2026-10-03：未納入", exact: true })).toBeVisible();
  await page.getByLabel("篩選 Repository", { exact: true }).selectOption(`work-secret/${workName}`);
  await expect(workspace).toContainText("已記錄 4 / 3 天");
  await page.getByLabel("篩選帳號", { exact: true }).selectOption("work-secret");
  await expect(goal).toHaveValue("0");
  await goal.selectOption("5");
  await expect(workspace).toContainText("已記錄 3 / 5 天");
  await page.reload();
  await workspace.getByRole("tab", { name: "節奏與目標", exact: true }).click();
  await expect(goal).toHaveValue("3");
  await page.getByLabel("篩選帳號", { exact: true }).selectOption("work-secret");
  await expect(goal).toHaveValue("5");
  await page.screenshot({ path: `artifacts/reflection-rhythm-${info.project.name}.png`, fullPage: true });
  expect(writes()).toBe(0);
});

test("回顧預設遮名，Markdown 與 PNG 本機匯出，鍵盤可關閉，中英與淺色可用", async ({ page }, info) => {
  const writes = await open(page);
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { (window as unknown as { copied: string }).copied = text; } } }));
  const create = page.getByRole("button", { name: "產生回顧卡", exact: true });
  await create.click();
  const dialog = page.getByRole("dialog", { name: "分享回顧", exact: true });
  await expect(dialog.getByLabel("隱藏帳號與私人專案名稱", { exact: true })).toBeChecked();
  await dialog.getByText("文字摘要預覽", { exact: true }).click();
  await expect(dialog.locator("pre")).not.toContainText("work-secret");
  await expect(dialog.locator("pre")).not.toContainText("personal-secret");
  await expect(dialog.locator("pre")).not.toContainText(workName);
  await expect(dialog.locator("pre")).toContainText("public-notes");
  await expect(dialog.locator("pre")).toContainText("私人專案 1");
  await dialog.getByRole("button", { name: "複製 Markdown 摘要", exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { copied: string }).copied)).not.toContain(workName);
  const downloadEvent = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "下載 PNG", exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("gitrecord-recap-2026-09-03-2026-10-02.png");
  await download.saveAs(`artifacts/reflection-card-${info.project.name}.png`);
  const bytes = await readFile((await download.path())!);
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  await dialog.getByLabel("隱藏帳號與私人專案名稱", { exact: true }).uncheck();
  await expect(dialog.locator("pre")).toContainText(`work-secret/${workName}`);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(create).toBeFocused();
  await page.getByRole("button", { name: "Switch to English", exact: true }).click();
  await page.getByRole("button", { name: "Switch to light mode", exact: true }).click();
  await page.getByRole("button", { name: "Create recap card", exact: true }).click();
  const english = page.getByRole("dialog", { name: "Share recap", exact: true });
  await expect(english.getByLabel("Hide account and private project names", { exact: true })).toBeChecked();
  await english.getByText("Text summary preview", { exact: true }).click();
  await expect(english.locator("pre")).toContainText("Private project 1");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/reflection-share-light-en-${info.project.name}.png` });
  await english.getByRole("button", { name: "Close recap card", exact: true }).click();
  const workspace = page.getByRole("region", { name: "Review & rhythm", exact: true });
  await workspace.getByRole("tab", { name: "Period review", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(workspace.getByRole("tab", { name: "Account comparison", exact: true })).toBeFocused();
  await expect(workspace.getByRole("tabpanel", { name: "Account comparison", exact: true })).toBeVisible();
  if (info.project.name === "mobile") {
    await page.setViewportSize({ width: 320, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await workspace.screenshot({ path: "artifacts/reflection-comparison-light-en-320.png" });
  }
  expect(writes()).toBe(0);
});

test("缺資料不推算 streak、共同日標示下限，目標不把未知日当休息日", async ({ page }, info) => {
  const store = fixture();
  const old = store.accounts.find((entry) => entry.report.user.login === "work-secret")!;
  old.report.range.end = "2026-09-30";
  old.report.generatedAt = "2026-09-30T06:00:00Z";
  old.report.repositories[0].daily = old.report.repositories[0].daily.filter((day) => day.date <= "2026-09-30");
  await open(page, store);
  const workspace = page.getByRole("region", { name: "回顧與節奏", exact: true });
  await expect(workspace.getByTestId("review-streak")).toHaveText("無法確認");
  await expect(workspace).toContainText("部分資料：以下是已保存的活動，實際活動可能更多。");
  await workspace.getByRole("tab", { name: "帳號對照", exact: true }).click();
  await expect(workspace).toContainText("共同活躍日 · 至少 1 天");
  await workspace.getByRole("tab", { name: "節奏與目標", exact: true }).click();
  await expect(workspace.getByRole("listitem", { name: "2026-10-01：資料不足", exact: true })).toBeVisible();
  await workspace.getByLabel("設定每週活躍天數", { exact: true }).selectOption("5");
  await expect(workspace).toContainText("已記錄 3 / 5 天");
  await page.screenshot({ path: `artifacts/reflection-partial-${info.project.name}.png`, fullPage: true });
  await workspace.getByRole("button", { name: "產生回顧卡", exact: true }).click();
  await page.getByText("文字摘要預覽", { exact: true }).click();
  await expect(page.getByRole("dialog").locator("pre")).toContainText("部分資料");
  await expect(page.getByRole("dialog").locator("pre")).toContainText("最長連續活動: 無法確認");
});

test("空活動與受限瀏覽器儲存仍可設定本次目標和產生回顧", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Storage.prototype, "getItem", { value: () => { throw new Error("blocked"); } });
    Object.defineProperty(Storage.prototype, "setItem", { value: () => { throw new Error("blocked"); } });
  });
  const empty = normalizeStore(account("empty", [], true));
  await open(page, empty);
  const workspace = page.getByRole("region", { name: "回顧與節奏", exact: true });
  await expect(workspace.getByTestId("review-streak")).toHaveText("0 天");
  await expect(workspace).toContainText("這段期間沒有已記錄的活動");
  await workspace.getByRole("tab", { name: "節奏與目標", exact: true }).click();
  await workspace.getByLabel("設定每週活躍天數", { exact: true }).selectOption("3");
  await expect(workspace).toContainText("已記錄 0 / 3 天");
  await expect(workspace).toContainText("設定只保留於本次使用，瀏覽器儲存不可用。");
  await workspace.getByRole("button", { name: "產生回顧卡", exact: true }).click();
  await page.getByText("文字摘要預覽", { exact: true }).click();
  await expect(page.getByRole("dialog").locator("pre")).toContainText("沒有已記錄的專案活動");
});
