import { test, expect, type Page } from "@playwright/test";
import { aggregateCommits, normalizeStore, updateAccount, type AuthStatus, type Report, type ReportStore } from "../shared/report.js";
import { readFile } from "node:fs/promises";

const fixture: Report = {
  version: 1,
  user: { login: "example", avatarUrl: "", url: "https://github.com/example" },
  generatedAt: "2026-10-02T04:00:00Z",
  range: {
    start: "2025-10-03",
    end: "2026-10-02",
    until: "2026-10-02T04:00:00Z",
  },
  timezone: "Asia/Taipei",
  partial: false,
  excludedForks: 1,
  repositories: ["alpha", "beta"].map((name, i) => ({
    name,
    fullName: `example/${name}`,
    private: true,
    url: `https://github.com/example/${name}`,
    branch: "main",
    language: "TypeScript",
    languageColor: "#3178c6",
    status: "complete",
    ...aggregateCommits(
      i === 0
        ? [
            {
              oid: "old",
              committedDate: "2026-09-01T00:00:00Z",
              additions: 8000,
              deletions: 800,
              parents: { totalCount: 1 },
            },
            {
              oid: "first",
              committedDate: "2026-09-29T00:00:00Z",
              additions: 100,
              deletions: 10,
              parents: { totalCount: 1 },
            },
            {
              oid: "second",
              committedDate: "2026-10-01T00:00:00Z",
              additions: 200,
              deletions: 30,
              parents: { totalCount: 1 },
            },
          ]
        : [
            {
              oid: "third",
              committedDate: "2026-10-01T00:00:00Z",
              additions: 50,
              deletions: 5,
              parents: { totalCount: 1 },
            },
          ],
      "2025-10-03",
      "2026-10-02",
    ),
  })),
};

const authFixture: AuthStatus = {
  accounts: [{ login: "example", active: true, state: "success" }],
  running: false, operation: null, code: null, verificationUrl: null, error: null, message: null,
  configuration: { clientId: "publisher-client-id", appId: "1234", appUrl: "https://github.com/apps/test-gitrecord", configured: true, storage: "keychain" },
  installation: { state: "ready", url: "https://github.com/settings/installations/99", repositoryCount: 2, selection: "selected" },
};

async function mockAuth(page: Page, status = authFixture) {
  await page.route(/\/api\/auth(?:\?.*)?$/, (route) => route.fulfill({ json: status }));
}

async function mock(
  page: Page,
  report: Report | ReportStore | null = fixture,
  error: string | null = null,
) {
  await mockAuth(page);
  await page.route("**/api/report", (route) =>
    route.fulfill({
      status: report ? 200 : 404,
      json: report ?? { error: "尚未同步" },
    }),
  );
  await page.route("**/api/sync/status", (route) =>
    route.fulfill({
      json: { running: false, total: 0, completed: 0, current: "", error },
    }),
  );
  await page.route("**/api/sync", (route) =>
    route.fulfill({
      status: 202,
      json: {
        running: true,
        total: 2,
        completed: 0,
        current: "alpha",
        error: null,
      },
    }),
  );
  await page.goto("/");
}

test("主題切換立即更新圖表、保留篩選並記住選擇，列印維持白底", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mock(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByLabel("篩選 Repository", { exact: true }).selectOption("example/alpha");
  const toggle = page.getByRole("button", { name: "切換為淺色模式", exact: true });
  await toggle.focus();
  await toggle.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
  await expect(page.locator(".stat-card").first()).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.locator(".recharts-area-curve").first()).toHaveCSS("stroke", "rgb(40, 117, 60)");
  await expect(page.getByLabel("篩選 Repository", { exact: true })).toHaveValue("example/alpha");
  await expect(page.getByTestId("ADDITIONS")).toHaveText("+300");
  await page.getByLabel("篩選 Repository", { exact: true }).selectOption("all");
  await page.reload();
  await expect(page.getByRole("button", { name: "切換為深色模式", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#f5f7f5");
  await expect(page.getByTestId("ADDITIONS")).toHaveText("+350");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/theme-light-${info.project.name}.png`, fullPage: true });
  if (info.project.name === "mobile") {
    await page.setViewportSize({ width: 320, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole("button", { name: "切換為深色模式", exact: true })).toBeVisible();
  }
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("html")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.locator(".recharts-area-curve").first()).toHaveCSS("stroke", "rgb(38, 114, 57)");
  await expect(page.locator(".theme-toggle")).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  await page.getByRole("button", { name: "切換為深色模式", exact: true }).click();
  await expect(page.locator(".recharts-area-curve").first()).toHaveCSS("stroke", "rgb(169, 224, 176)");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(errors).toEqual([]);
});

test("英文介面保留篩選與主題，保存語言並涵蓋圖表、熱圖與列印", async ({ page }, info) => {
  const errors: string[] = [];
  let syncs = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => { if (request.url().endsWith("/api/sync")) syncs++; });
  await mock(page);
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hant");
  await page.getByRole("button", { name: "90 天", exact: true }).click();
  await page.getByLabel("篩選 Repository", { exact: true }).selectOption("example/alpha");
  await page.getByRole("button", { name: "切換為淺色模式", exact: true }).click();
  await page.getByRole("button", { name: "Switch to English", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page).toHaveTitle("GitRecord · GitHub Activity");
  await expect(page.getByRole("heading", { name: "Every line of progress." })).toBeVisible();
  await expect(page.getByLabel("Filter Repository", { exact: true })).toHaveValue("example/alpha");
  await expect(page.getByRole("button", { name: "90 days", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("ADDITIONS")).toHaveText("+8,300");
  await expect(page.getByRole("region", { name: "Account sync status" })).toContainText("Authorized account: example");
  await expect(page.locator(".day-name").first()).toHaveText("Fri");
  await expect(page.locator(".heatmap-months")).toContainText("Oct");
  await expect(page.getByRole("img", { name: /^Daily additions and deletions/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^2026-10-01: 200 lines added/ })).toHaveCount(1);
  await page.getByRole("button", { name: "切換為繁體中文", exact: true }).click();
  await expect(page.getByLabel("篩選 Repository", { exact: true })).toHaveValue("example/alpha");
  await expect(page.getByTestId("ADDITIONS")).toHaveText("+8,300");
  await page.getByRole("button", { name: "Switch to English", exact: true }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByTestId("ADDITIONS")).toHaveText("+350");
  const copy = await page.locator("body").innerText();
  expect(copy.replace("中", "")).not.toMatch(/[\p{Script=Han}]/u);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/english-light-${info.project.name}.png`, fullPage: true });
  if (info.project.name === "mobile") {
    await page.setViewportSize({ width: 320, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole("button", { name: "切換為繁體中文", exact: true })).toBeVisible();
  }
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".print-context")).toContainText("Data timestamps by account:");
  await expect(page.getByRole("columnheader", { name: "Lines added", exact: true })).toBeVisible();
  await expect(page.locator("tbody tr:visible")).toHaveCount(30);
  await expect(page.locator(".language-toggle")).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  await page.getByRole("button", { name: "Switch to dark mode", exact: true }).click();
  await page.screenshot({ path: `artifacts/english-dark-${info.project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: "切換為繁體中文", exact: true }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hant");
  expect(syncs).toBe(0);
  expect(errors).toEqual([]);
});

test("OAuth 進行中切換英文保留授權碼，取消訊息也會翻譯", async ({ page }) => {
  let canceled = false;
  const running: AuthStatus = { ...authFixture, accounts: [], running: true,
    operation: "login", code: "ABCD-1234", verificationUrl: "https://github.com/login/device",
  };
  await mock(page);
  await mockAuth(page, running);
  await page.route("**/api/auth/cancel", (route) => {
    canceled = true;
    return route.fulfill({ json: { ...running, running: false, operation: null, code: null,
      verificationUrl: null, error: "授權已取消。",
    } });
  });
  await page.reload();
  await expect(page.getByLabel("GitHub 授權碼", { exact: true })).toHaveText("ABCD-1234");
  await page.getByRole("button", { name: "Switch to English", exact: true }).click();
  await expect(page.getByLabel("GitHub authorization code", { exact: true })).toHaveText("ABCD-1234");
  await expect(page.getByRole("button", { name: "Copy code and open GitHub", exact: true })).toBeVisible();
  await expect(page.getByText(/Check that the app on GitHub matches your configured GitHub App/)).toBeVisible();
  await page.getByRole("button", { name: "Cancel sign-in", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Authorization canceled.");
  expect(canceled).toBe(true);
});

test("英文翻譯同步錯誤與保存的失敗狀態，切回中文保留原訊息", async ({ page }) => {
  const store = normalizeStore(fixture);
  store.accounts[0].syncError = "GitHub API 已達速率上限，請稍後重試。";
  await mock(page, store, "GitHub 連線逾時或網路不可用，請稍後重試。");
  await mockAuth(page, { ...authFixture, message: "GitHub 授權完成，可以同步此帳號。" });
  await page.reload();
  await page.getByRole("button", { name: "Switch to English", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("GitHub connection timed out or the network is unavailable.");
  await expect(page.getByRole("region", { name: "Account sync status" })).toContainText("GitHub API rate limit reached.");
  await expect(page.getByRole("region", { name: "Account sync status" })).toContainText("GitHub authorization complete.");
  await page.getByRole("button", { name: "切換為繁體中文", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("GitHub 連線逾時或網路不可用");
  await expect(page.getByRole("region", { name: "帳號同步狀態" })).toContainText("GitHub API 已達速率上限");
});

test("發布者可設定公開 GitHub App，普通使用者沿用設定直接連接", async ({ page }, info) => {
  let configured = false;
  await mock(page);
  await page.route(/\/api\/auth(?:\?.*)?$/, (route) => route.fulfill({ json: {
    ...authFixture, accounts: [], configuration: { ...authFixture.configuration!, clientId: configured ? "new-publisher-client-id" : "", configured },
  } }));
  await page.route("**/api/auth/config", (route) => {
    expect(route.request().postDataJSON()).toEqual({ clientId: "new-publisher-client-id", appId: "1234", appUrl: "https://github.com/apps/test-gitrecord" });
    configured = true;
    return route.fulfill({ json: { ...authFixture, accounts: [],
      configuration: { ...authFixture.configuration!, clientId: "new-publisher-client-id" },
      message: "GitHub App 設定已保存，可以連接帳號。",
    } });
  });
  await page.reload();
  await expect(page.getByRole("button", { name: "連接 GitHub 帳號", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Switch to English", exact: true }).click();
  await expect(page.getByText("Set up GitRecord's GitHub App", { exact: true })).toBeVisible();
  await page.getByLabel("App ID", { exact: true }).fill("1234");
  await page.getByLabel("Client ID", { exact: true }).fill("new-publisher-client-id");
  await page.getByLabel("GitHub App public URL", { exact: true }).fill("https://github.com/apps/test-gitrecord");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/oauth-setup-${info.project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  await expect(page.getByRole("button", { name: "Connect GitHub account", exact: true })).toBeEnabled();
  await expect(page.getByText("GitHub App settings saved. You can now connect an account.")).toBeVisible();
  expect(await page.locator("body").innerText()).not.toContain("GitHub CLI");
  await page.reload();
  await expect(page.getByRole("button", { name: "Connect GitHub account", exact: true })).toBeEnabled();
  await expect(page.locator("#oauth-client-id")).toBeHidden();
});

test("移除本機登入保留統計，session 憑證模式會說明重啟需再授權", async ({ page }) => {
  let forgotten = false;
  await mock(page);
  await page.route(/\/api\/auth(?:\?.*)?$/, (route) => route.fulfill({ json: {
    ...authFixture, accounts: forgotten ? [] : authFixture.accounts,
    configuration: { ...authFixture.configuration!, storage: "session" },
  } }));
  await page.route("**/api/auth/forget", (route) => {
    expect(route.request().postDataJSON()).toEqual({ login: "example" });
    forgotten = true;
    return route.fulfill({ json: { ...authFixture, accounts: [],
      configuration: { ...authFixture.configuration!, storage: "session" },
      message: "已移除本機登入，保存的統計資料仍保留。",
    } });
  });
  await page.reload();
  await page.getByRole("button", { name: "Switch to English", exact: true }).click();
  await expect(page.getByText(/Authorization lasts for this session only/)).toBeVisible();
  await page.getByRole("button", { name: "Remove sign-in", exact: true }).click();
  await expect(page.getByText("Local sign-in removed. Saved statistics are still kept.")).toBeVisible();
  await expect(page.getByTestId("ADDITIONS")).toHaveText("+350");
  await expect(page.getByRole("button", { name: "Connect GitHub account", exact: true })).toBeEnabled();
  expect(forgotten).toBe(true);
});

test("真實操作的範圍／repo 篩選、摘要、熱圖與每日表一致", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mock(page);
  await expect(page.getByTestId("ADDITIONS")).toHaveText("+350");
  await expect(page.getByTestId("DELETIONS")).toHaveText("−45");
  await expect(page.getByTestId("NET CHANGE")).toHaveText("+305");
  await page.getByRole("button", { name: "90 天", exact: true }).click();
  await expect(page.getByTestId("ADDITIONS")).toHaveText("+8,350");
  await page.getByRole("button", { name: "7 天", exact: true }).click();
  await expect(page.locator("#start-date")).toHaveValue("2026-09-26");
  await page
    .getByLabel("篩選 Repository", { exact: true })
    .selectOption("example/alpha");
  await expect(page.getByTestId("ADDITIONS")).toHaveText("+300");
  await expect(page.getByTestId("COMMITS")).toHaveText("2");
  await page.getByRole("button", { name: /^2026-10-01：/ }).click();
  await expect(page.locator("#start-date")).toHaveValue("2026-10-01");
  await expect(page.locator("#end-date")).toHaveValue("2026-10-01");
  await expect(page.getByTestId("ADDITIONS")).toHaveText("+200");
  await expect(page.locator("tbody tr:visible")).toHaveCount(1);
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("多帳號合計、單帳號／同名 repo 篩選、CSV 與列印一致", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const other = structuredClone(fixture);
  other.user = { id: "OTHER", login: "work-account", avatarUrl: "", url: "https://github.com/work-account" };
  other.repositories = [{
    ...other.repositories[0], fullName: "work-account/alpha",
    ...aggregateCommits([
      { oid: "work", committedDate: "2026-10-01T00:00:00Z", additions: 40, deletions: 4, parents: { totalCount: 1 } },
    ], other.range.start, other.range.end),
  }];
  const store = updateAccount(normalizeStore(fixture), other);
  await mock(page, store);
  const profile = page.locator(".github-profile-link");
  await expect(profile).toHaveCount(1);
  await expect(page.locator(".sidebar-user a")).toHaveCount(0);
  await expect(profile).toHaveAttribute("href", "https://github.com/example");
  await expect(profile).toHaveAttribute("title", /example.*目前授權帳號/);
  await page.getByLabel("篩選帳號", { exact: true }).selectOption("work-account");
  await expect(profile).toHaveAttribute("href", "https://github.com/work-account");
  await expect(profile).toHaveAccessibleName("開啟 work-account 的 GitHub 個人頁");
  await page.getByLabel("篩選帳號", { exact: true }).selectOption("all");
  await expect(profile).toHaveAttribute("href", "https://github.com/example");
  await expect(page.getByTestId("ADDITIONS")).toHaveText("+390");
  await expect(page.getByTestId("DELETIONS")).toHaveText("−49");
  await expect(page.getByTestId("COMMITS")).toHaveText("4");
  await expect(page.getByText("2 個活躍日 / 30 天", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "帳號同步狀態" })).toContainText("已保存 2 個帳號");
  await page.getByLabel("篩選 Repository", { exact: true }).selectOption("work-account/alpha");
  await expect(page.getByTestId("ADDITIONS")).toHaveText("+40");
  await page.getByLabel("篩選帳號", { exact: true }).selectOption("example");
  await expect(page.getByLabel("篩選 Repository", { exact: true })).toHaveValue("all");
  await expect(page.getByTestId("ADDITIONS")).toHaveText("+350");
  await expect(page.getByLabel("篩選 Repository", { exact: true }).locator("option")).toHaveCount(3);
  await page.getByLabel("篩選帳號", { exact: true }).selectOption("all");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "匯出 CSV" }).click();
  const text = await readFile((await (await downloadPromise).path())!, "utf8");
  expect(text).toContain("example; work-account");
  expect(text).toContain("work-account=2026-10-02T04:00:00Z");
  expect(text.trim().split("\r\n").slice(1).reduce((sum, row) => sum + Number(row.split(",")[3]), 0)).toBe(390);
  await expect(page.getByRole("button", { name: "新增 GitHub 帳號", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/multi-account-${info.project.name}.png`, fullPage: true });
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".print-context")).toContainText("example + work-account");
  await expect(page.locator(".print-context")).toContainText("各帳號資料時間");
  await expect(page.locator("tbody tr:visible")).toHaveCount(30);
  expect(errors).toEqual([]);
});

test("帳號失敗與不同涵蓋日期可見，單帳號報告恢復正確狀態", async ({ page }) => {
  const older = structuredClone(fixture);
  older.user = { ...older.user, login: "older" };
  older.range.end = "2026-10-01";
  older.generatedAt = "2026-10-01T04:00:00Z";
  older.repositories = older.repositories.map((repo) => ({ ...repo, fullName: `older/${repo.name}`, daily: repo.daily.filter((day) => day.date <= older.range.end) }));
  const store = updateAccount(normalizeStore(fixture), older);
  store.accounts.find((entry) => entry.report.user.login === "older")!.syncError = "測試帳號失敗";
  await mock(page, store);
  await expect(page.getByText("部分帳號尚未涵蓋選取日期", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "帳號同步狀態" })).toContainText("同步失敗 · 保留上次資料");
  await expect(page.getByRole("region", { name: "帳號同步狀態" })).toContainText("測試帳號失敗");
  await page.getByLabel("篩選帳號", { exact: true }).selectOption("example");
  await expect(page.getByText("部分帳號尚未涵蓋選取日期", { exact: true })).toBeHidden();
  await expect(page.getByTestId("ADDITIONS")).toHaveText("+350");
  await page.getByLabel("篩選帳號", { exact: true }).selectOption("older");
  await expect(page.locator("#end-date")).toHaveValue("2026-10-01");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "匯出 CSV" }).click();
  const text = await readFile((await (await downloadPromise).path())!, "utf8");
  expect(text).toContain('"partial"');
  expect(text).toContain("older: 測試帳號失敗");
});

test("CSV 匯出合計與當期資料一致，列印包含全部日期", async ({ page }) => {
  await mock(page);
  await expect(page.getByTestId("COMMITS")).toHaveText("3");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "匯出 CSV" }).click();
  const download = await downloadPromise;
  const text = await readFile((await download.path())!, "utf8");
  expect(download.suggestedFilename()).toBe("github-2026-09-03-2026-10-02.csv");
  const rows = text
    .trim()
    .split("\r\n")
    .slice(1)
    .map((line) => line.split(","));
  expect(rows).toHaveLength(30);
  expect(rows.reduce((sum, row) => sum + Number(row[3]), 0)).toBe(350);
  expect(rows.reduce((sum, row) => sum + Number(row[4]), 0)).toBe(45);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("tbody tr:visible")).toHaveCount(30);
  await expect(page.locator(".print-context")).toBeVisible();
  await expect(page.getByRole("button", { name: "匯出 CSV" })).toBeHidden();
});

test("空活動日期提供零統計，完整明細可展開與收合", async ({ page }) => {
  await mock(page);
  await expect(page.getByTestId("COMMITS")).toHaveText("3");
  await page.getByRole("button", { name: "查看全部日期" }).click();
  await expect(page.locator("tbody tr:visible")).toHaveCount(30);
  await page.getByRole("button", { name: "收合明細" }).click();
  await expect(page.locator("tbody tr:visible")).toHaveCount(10);
  await page.getByRole("button", { name: /^2026-10-02：/ }).click();
  await expect(page.getByTestId("COMMITS")).toHaveText("0");
  await expect(page.getByText("這段期間沒有 repository 活動。")).toBeVisible();
});

test("舊快取的 CLI 登入錯誤改成網頁重新授權指引，中英文均可讀", async ({ page }) => {
  await mock(page, fixture, "GitHub 登入失效，請在終端機執行 gh auth login。");
  await expect(page.getByRole("alert")).toContainText("GitHub 登入失效，請重新新增帳號授權。");
  expect(await page.locator("body").innerText()).not.toContain("gh auth login");
  await page.getByRole("button", { name: "Switch to English", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Add the account again to authorize it.");
});

test("部分同步、全域錯誤與同步進度可見", async ({ page }) => {
  const partial = structuredClone(fixture);
  partial.partial = true;
  partial.repositories[1] = {
    ...partial.repositories[1],
    status: "error",
    error: "測試 repo 失敗",
    daily: [],
  };
  await mock(page, partial, "測試連線失敗");
  await expect(page.getByRole("alert")).toContainText("測試連線失敗");
  await expect(page.getByText("部分資料 · 1 個 repo 未完成同步")).toBeVisible();
  await expect(page.getByTestId("ADDITIONS")).toHaveText("+300");
  await page
    .getByRole("button", { name: "同步 GitHub 資料", exact: true })
    .click();
  await expect(page.getByText("正在同步", { exact: false })).toBeVisible();
});

test("沒有快取時自動同步，進度完成後顯示報告", async ({ page }) => {
  await mockAuth(page);
  let ready = false,
    polls = 0,
    started = false;
  await page.route("**/api/report", (route) =>
    route.fulfill({
      status: ready ? 200 : 404,
      json: ready ? fixture : { error: "尚未同步" },
    }),
  );
  await page.route("**/api/sync", (route) => {
    started = true;
    return route.fulfill({
      status: 202,
      json: {
        running: true,
        total: 2,
        completed: 0,
        current: "alpha",
        error: null,
      },
    });
  });
  await page.route("**/api/sync/status", (route) => {
    if (started) {
      polls++;
      if (polls >= 2) ready = true;
    }
    return route.fulfill({
      json: {
        running: started && !ready,
        total: 2,
        completed: ready ? 2 : 0,
        current: "alpha",
        error: null,
      },
    });
  });
  await page.goto("/");
  await expect(page.getByText("正在同步", { exact: false })).toBeVisible();
  await expect(page.getByTestId("ADDITIONS")).toHaveText("+350");
  await expect(page.getByText("正在同步", { exact: false })).toBeHidden();
});

test("沒有任何登入帳號也能從 OAuth 開始，授權完成自動同步", async ({ page }) => {
  let started = false, authorized = false, synced = false, polls = 0;
  await page.route(/\/api\/auth(?:\?.*)?$/, (route) => {
    if (started && !authorized && ++polls > 2) authorized = true;
    return route.fulfill({ json: {
      ...authFixture,
      accounts: authorized ? authFixture.accounts : [],
      running: started && !authorized,
      operation: started && !authorized ? "login" : null,
      code: started && !authorized ? "ABCD-1234" : null,
      verificationUrl: started && !authorized ? "https://github.com/login/device" : null,
      message: authorized ? "GitHub 授權完成，可以同步此帳號。" : null,
    } });
  });
  await page.route("**/api/auth/login", (route) => {
    started = true;
    return route.fulfill({ status: 202, json: {
      ...authFixture, accounts: [], running: true, operation: "login", code: null,
    } });
  });
  await page.route("**/api/report", (route) => route.fulfill({
    status: synced ? 200 : 404, json: synced ? fixture : { error: "尚未同步" },
  }));
  await page.route("**/api/sync/status", (route) => route.fulfill({
    json: { running: false, completed: 0, total: 0, current: "", error: null },
  }));
  await page.route("**/api/sync", (route) => {
    expect(authorized).toBe(true);
    synced = true;
    return route.fulfill({ status: 202, json: { running: true, completed: 0, total: 0, current: "", error: null } });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "連接 GitHub 帳號", exact: true })).toBeEnabled();
  expect(synced).toBe(false);
  await page.getByRole("button", { name: "連接 GitHub 帳號", exact: true }).click();
  await expect(page.getByLabel("GitHub 授權碼", { exact: true })).toHaveText("ABCD-1234");
  await expect(page.getByRole("button", { name: "複製授權碼並開啟 GitHub", exact: true })).toBeVisible();
  await expect(page.getByTestId("ADDITIONS")).toHaveText("+350");
  await expect(page.getByRole("region", { name: "帳號同步狀態" })).toContainText("目前授權帳號：example");
});

test("網頁切換已授權帳號後自動同步，登入帳號與統計篩選分開", async ({ page }) => {
  await mock(page);
  let switched = false, syncs = 0;
  await page.route(/\/api\/auth(?:\?.*)?$/, (route) => route.fulfill({ json: {
    ...authFixture, accounts: [
      { login: "example", active: !switched, state: "success" },
      { login: "other", active: switched, state: "success" },
    ],
  } }));
  await page.route("**/api/auth/switch", (route) => {
    expect(route.request().postDataJSON()).toEqual({ login: "other" });
    switched = true;
    return route.fulfill({ status: 202, json: {
      ...authFixture, accounts: [{ login: "other", active: true, state: "success" }],
      message: "已切換至 other，可以同步此帳號。",
    } });
  });
  await page.route("**/api/sync", (route) => {
    syncs++;
    return route.fulfill({ status: 202, json: { running: false, completed: 0, total: 0, current: "", error: null } });
  });
  await page.reload();
  await page.getByLabel("切換登入帳號", { exact: true }).selectOption("other");
  await page.getByRole("button", { name: "切換並同步", exact: true }).click();
  await expect(page.getByRole("region", { name: "帳號同步狀態" })).toContainText("目前授權帳號：other");
  await expect(page.locator(".github-profile-link")).toHaveAttribute("href", "https://github.com/other");
  await expect.poll(() => syncs).toBe(1);
  await expect(page.getByLabel("篩選帳號", { exact: true })).toHaveValue("all");
  await expect(page.getByTestId("ADDITIONS")).toHaveText("+350");
});

test("首次選擇 repos 前阻止同步，安裝完成自動同步且保留既有報告", async ({ page }, info) => {
  let installed = false, syncs = 0;
  await mock(page);
  await page.route(/\/api\/auth(?:\?.*)?$/, (route) => route.fulfill({ json: {
    ...authFixture, installation: installed ? authFixture.installation : {
      state: "missing", url: "https://github.com/apps/test-gitrecord/installations/new", selection: null, repositoryCount: 0,
    },
  } }));
  await page.context().route("https://github.com/apps/test-gitrecord/installations/new", (route) => route.fulfill({ contentType: "text/html", body: "Installation fixture" }));
  await page.route("**/api/sync", (route) => {
    expect(installed).toBe(true); syncs++;
    return route.fulfill({ status: 202, json: { running: false, completed: 0, total: 0, current: "", error: null } });
  });
  await page.reload();
  await expect(page.getByRole("button", { name: "同步 GitHub 資料", exact: true })).toBeDisabled();
  await expect(page.getByTestId("ADDITIONS")).toHaveText("+350");
  expect(syncs).toBe(0);
  await page.getByRole("button", { name: "Switch to English", exact: true }).click();
  await page.getByRole("button", { name: "Switch to light mode", exact: true }).click();
  const install = page.getByRole("link", { name: "Select repos on GitHub", exact: true });
  await expect(install).toHaveAttribute("href", "https://github.com/apps/test-gitrecord/installations/new");
  await expect(page.getByText("Select repositories to include", { exact: true })).toBeVisible();
  const popupPromise = page.waitForEvent("popup");
  await install.click();
  const popup = await popupPromise;
  await expect(page.getByText("Waiting for GitHub setup…", { exact: true })).toBeVisible();
  expect(syncs).toBe(0);
  installed = true;
  await popup.close();
  // A check may run before installation finishes; allow the next five-second poll and rendering.
  await expect(page.getByText("Connected · Repositories available: 2", { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => syncs).toBe(1);
  await expect(page.getByRole("button", { name: "Sync GitHub data", exact: true })).toBeEnabled();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/github-app-ready-${info.project.name}.png`, fullPage: true });
});

function incompleteAccounts() {
  const older = structuredClone(fixture);
  older.user = { ...older.user, login: "older", url: "https://github.com/older" };
  older.generatedAt = "2026-10-01T04:00:00Z";
  older.range = { ...older.range, end: "2026-10-01", until: older.generatedAt };
  older.repositories = older.repositories.map((repo) => ({ ...repo, fullName: `older/${repo.name}`, daily: repo.daily.filter((day) => day.date <= older.range.end) }));
  return updateAccount(normalizeStore(fixture), older);
}

test("帳號區塊可鍵盤收合、保留選擇並記住狀態，支援中英文與手機", async ({ page }, info) => {
  let syncs = 0;
  page.on("request", (request) => { if (request.url().endsWith("/api/sync")) syncs++; });
  await mock(page);
  await mockAuth(page, { ...authFixture, accounts: [
    ...authFixture.accounts, { login: "other", active: false, state: "success" },
  ] });
  await page.reload();
  const panel = page.getByRole("region", { name: "帳號同步狀態", exact: true });
  await panel.getByLabel("切換登入帳號", { exact: true }).selectOption("other");
  await page.getByLabel("篩選 Repository", { exact: true }).selectOption("example/alpha");
  const collapse = panel.getByRole("button", { name: "收合帳號區塊", exact: true });
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  await collapse.focus();
  await collapse.press("Enter");
  const expand = panel.getByRole("button", { name: "展開帳號區塊", exact: true });
  await expect(expand).toHaveAttribute("aria-expanded", "false");
  await expect(panel.locator(".account-cards")).toBeHidden();
  await expect(panel.getByLabel("切換登入帳號", { exact: true })).toBeHidden();
  await expect(panel.getByText("目前授權帳號：example", { exact: true })).toBeVisible();
  await expect(page.getByTestId("ADDITIONS")).toHaveText("+300");
  const controls = (await expand.getAttribute("aria-controls"))!.split(" ");
  expect(await page.evaluate((ids) => ids.every((id) => document.getElementById(id)?.hidden), controls)).toBe(true);
  await expand.press("Space");
  await expect(panel.getByLabel("切換登入帳號", { exact: true })).toHaveValue("other");
  await collapse.click();
  await page.getByRole("button", { name: "Switch to English", exact: true }).click();
  await page.getByRole("button", { name: "Switch to light mode", exact: true }).click();
  const englishPanel = page.getByRole("region", { name: "Account sync status", exact: true });
  await expect(englishPanel.getByRole("button", { name: "Expand account panel", exact: true })).toBeVisible();
  await englishPanel.screenshot({ path: `artifacts/accounts-collapsed-${info.project.name}.png` });
  await page.reload();
  await expect(englishPanel.getByRole("button", { name: "Expand account panel", exact: true })).toHaveAttribute("aria-expanded", "false");
  await expect(englishPanel.locator(".account-cards")).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (info.project.name === "mobile") {
    await page.setViewportSize({ width: 320, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await englishPanel.getByRole("button", { name: "Expand account panel", exact: true }).click();
  await expect(englishPanel.locator(".account-cards")).toBeVisible();
  expect(syncs).toBe(0);
});

test("帳號區塊收合後不遺失設定，登入授權／安裝／錯誤會自動展開", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gitrecord-account-panel-collapsed", "true"));
  await mock(page);
  const panel = page.getByRole("region", { name: "帳號同步狀態", exact: true });
  await panel.getByRole("button", { name: "展開帳號區塊", exact: true }).click();
  await panel.getByRole("button", { name: "GitHub App 設定", exact: true }).click();
  await panel.getByLabel("App ID", { exact: true }).fill("5678");
  await panel.getByRole("button", { name: "收合帳號區塊", exact: true }).click();
  await expect(panel.getByLabel("App ID", { exact: true })).toBeHidden();
  await panel.getByRole("button", { name: "展開帳號區塊", exact: true }).click();
  await expect(panel.getByLabel("App ID", { exact: true })).toHaveValue("5678");
  await mockAuth(page, { ...authFixture, running: true, operation: "login", code: "ABCD-1234", verificationUrl: "https://github.com/login/device" });
  await page.reload();
  await expect(panel.getByRole("button", { name: "收合帳號區塊", exact: true })).toHaveAttribute("aria-expanded", "true");
  await expect(panel.getByLabel("GitHub 授權碼", { exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "取消登入", exact: true })).toBeVisible();
  await mockAuth(page, { ...authFixture, installation: { state: "missing", url: "https://github.com/apps/test-gitrecord/installations/new", repositoryCount: 0, selection: null } });
  await page.reload();
  await expect(panel.getByRole("link", { name: "前往 GitHub 選擇 repos", exact: true })).toBeVisible();
  await mockAuth(page, { ...authFixture, error: "GitHub 登入失效，請重新新增帳號授權。" });
  await page.reload();
  await expect(panel.getByRole("alert")).toBeVisible();
  await mockAuth(page, { ...authFixture, accounts: [], installation: null });
  await page.reload();
  await expect(panel.getByRole("button", { name: "連接 GitHub 帳號", exact: true })).toBeVisible();
});

test("涵蓋提示重新檢查目前帳號，即使安裝就緒也會同步並清除提示", async ({ page }, info) => {
  let store = incompleteAccounts(), refreshes = 0, syncs = 0;
  await mock(page, store);
  await page.route(/\/api\/auth(?:\?.*)?$/, (route) => {
    if (new URL(route.request().url()).searchParams.get("refresh") === "true") refreshes++;
    return route.fulfill({ json: { ...authFixture, accounts: [
      { login: "example", active: false, state: "success" }, { login: "older", active: true, state: "success" },
    ] } });
  });
  await page.route("**/api/report", (route) => route.fulfill({ json: store }));
  await page.route("**/api/sync", (route) => {
    syncs++;
    const updated = structuredClone(store.accounts.find((entry) => entry.report.user.login === "older")!.report);
    updated.generatedAt = fixture.generatedAt; updated.range = { ...fixture.range };
    store = updateAccount(store, updated);
    return route.fulfill({ status: 202, json: { running: true, completed: 0, total: 1, current: "alpha", error: null } });
  });
  await page.reload();
  const recovery = page.getByRole("region", { name: "資料涵蓋與修復", exact: true });
  await expect(recovery).toContainText("older");
  await expect(recovery).toContainText("2026-10-01");
  await expect(recovery.getByRole("link", { name: "開啟 older 的 GitHub 存取設定" })).toHaveAttribute("href", "https://github.com/settings/installations/99");
  expect(syncs).toBe(0);
  await page.getByRole("button", { name: "Switch to English", exact: true }).click();
  await page.getByRole("button", { name: "Switch to light mode", exact: true }).click();
  const englishRecovery = page.getByRole("region", { name: "Data coverage and recovery", exact: true });
  await expect(englishRecovery).toContainText("Data coverage:");
  expect(await englishRecovery.innerText()).not.toMatch(/[\p{Script=Han}]/u);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/coverage-recovery-${info.project.name}.png`, fullPage: true });
  await englishRecovery.screenshot({ path: `artifacts/coverage-notice-${info.project.name}.png` });
  if (info.project.name === "mobile") {
    await page.setViewportSize({ width: 320, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  const before = refreshes;
  await englishRecovery.getByRole("button", { name: "Check and sync older", exact: true }).click();
  await expect.poll(() => syncs).toBe(1);
  expect(refreshes).toBeGreaterThan(before);
  await expect(englishRecovery).toBeHidden();
  await expect(page.getByLabel("Filter accounts", { exact: true })).toHaveValue("all");
});

test("涵蓋提示指定舊帳號切換並同步，避免更新到其他帳號", async ({ page }) => {
  let switched = false, syncs = 0;
  await mock(page, incompleteAccounts());
  await page.route(/\/api\/auth(?:\?.*)?$/, (route) => route.fulfill({ json: { ...authFixture, accounts: [
    { login: "example", active: !switched, state: "success" }, { login: "older", active: switched, state: "success" },
  ] } }));
  await page.route("**/api/auth/switch", (route) => {
    expect(route.request().postDataJSON()).toEqual({ login: "older" }); switched = true;
    return route.fulfill({ status: 202, json: { ...authFixture, accounts: [
      { login: "example", active: false, state: "success" }, { login: "older", active: true, state: "success" },
    ] } });
  });
  await page.route("**/api/sync", (route) => {
    expect(switched).toBe(true); syncs++;
    return route.fulfill({ status: 202, json: { running: true, completed: 0, total: 1, current: "alpha", error: null } });
  });
  await page.route("**/api/sync/status", (route) => route.fulfill({ json: { running: syncs > 0, completed: 0, total: 1, current: "alpha", error: null } }));
  await page.reload();
  const recovery = page.getByRole("region", { name: "資料涵蓋與修復", exact: true });
  await expect(recovery.getByRole("link", { name: "開啟 older 的 GitHub 存取設定" })).toHaveAttribute("href", "https://github.com/apps/test-gitrecord/installations/new");
  const check = recovery.getByRole("button", { name: "重新檢查並同步 older", exact: true });
  await check.click();
  await expect.poll(() => syncs).toBe(1);
  await expect(check).toBeDisabled();
  await expect(page.getByRole("region", { name: "帳號同步狀態" })).toContainText("目前授權帳號：older");
  await expect(page.getByLabel("篩選帳號", { exact: true })).toHaveValue("all");
});

test("涵蓋提示安裝連結可等候完成，未安裝時重新檢查不會誤同步", async ({ page }) => {
  let installed = false, syncs = 0;
  await mock(page, incompleteAccounts());
  await page.route(/\/api\/auth(?:\?.*)?$/, (route) => route.fulfill({ json: { ...authFixture, accounts: [
    { login: "example", active: false, state: "success" }, { login: "older", active: true, state: "success" },
  ], installation: installed ? authFixture.installation : {
    state: "missing", url: "https://github.com/apps/test-gitrecord/installations/new", repositoryCount: 0, selection: null,
  } } }));
  await page.context().route("https://github.com/apps/test-gitrecord/installations/new", (route) => route.fulfill({ contentType: "text/html", body: "Installation fixture" }));
  await page.route("**/api/sync", (route) => {
    expect(installed).toBe(true); syncs++;
    return route.fulfill({ status: 202, json: { running: true, completed: 0, total: 1, current: "alpha", error: null } });
  });
  await page.reload();
  const recovery = page.getByRole("region", { name: "資料涵蓋與修復", exact: true });
  const check = recovery.getByRole("button", { name: "重新檢查並同步 older", exact: true });
  await check.click();
  await expect(check).toBeEnabled();
  expect(syncs).toBe(0);
  await expect(page.getByTestId("ADDITIONS")).toHaveText("+700");
  const popupPromise = page.waitForEvent("popup");
  await recovery.getByRole("link", { name: "開啟 older 的 GitHub 存取設定" }).click();
  const popup = await popupPromise;
  await expect(page.getByText("正在等待 GitHub 完成設定…", { exact: true })).toBeVisible();
  installed = true;
  await popup.close();
  await expect.poll(() => syncs).toBe(1);
});

test("涵蓋提示重新檢查失敗保留資料，重試可同步；未登入帳號提供連接入口", async ({ page }) => {
  let failNextCheck = false, syncs = 0;
  await mock(page, incompleteAccounts());
  await page.route(/\/api\/auth(?:\?.*)?$/, (route) => {
    if (failNextCheck) {
      failNextCheck = false;
      return route.fulfill({ status: 503, json: { error: "Unavailable" } });
    }
    return route.fulfill({ json: { ...authFixture, accounts: [{ login: "older", active: true, state: "success" }] } });
  });
  await page.route("**/api/sync", (route) => {
    syncs++;
    return route.fulfill({ status: 202, json: { running: true, completed: 0, total: 1, current: "alpha", error: null } });
  });
  await page.reload();
  const recovery = page.getByRole("region", { name: "資料涵蓋與修復", exact: true });
  const check = recovery.getByRole("button", { name: "重新檢查並同步 older", exact: true });
  await expect(check).toBeEnabled();
  failNextCheck = true;
  await check.click();
  await expect(page.getByRole("alert")).toContainText("無法取得 GitHub 登入狀態");
  expect(syncs).toBe(0);
  await expect(page.getByTestId("ADDITIONS")).toHaveText("+700");
  await check.click();
  await expect.poll(() => syncs).toBe(1);
  await mockAuth(page, { ...authFixture, accounts: [], installation: null });
  await page.reload();
  await expect(recovery.getByRole("button", { name: "連接 older 的 GitHub 帳號", exact: true })).toBeEnabled();
});
