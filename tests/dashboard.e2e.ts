import { test, expect, type Page } from "@playwright/test";
import { aggregateCommits, type Report } from "../shared/report.js";
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

async function mock(
  page: Page,
  report: Report | null = fixture,
  error: string | null = null,
) {
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
