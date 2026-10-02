# 任務清單：GitHub 每日代碼增修 Dashboard

**對應計畫**：`specs/github-dashboard/plan.md`
**日期**：2026-10-02
**狀態**：已確認，實作中（2026-10-02）

## Setup

- [x] T001 在 `package.json`、`tsconfig*.json`、`vite.config.ts`、`.gitignore` 建立前後端、圖表與驗證環境，安裝相依套件。

## Foundational

- [x] T002 在 `shared/report.ts` 實作型別、台北日期、去重、merge 排除、日統計、篩選與 CSV；在 `tests/report.test.ts` 驗證邊界，相依 T001。
- [x] T003 在 `server/github.ts` 實作 gh GraphQL、repository／commit 分頁、作者篩選與 partial 狀態；在 `tests/github.test.ts` 驗證，相依 T002。
- [x] T004 在 `server/app.ts`、`server/index.ts` 實作 API、單次同步鎖、快取與靜態服務；在 `tests/app.test.ts` 驗證，相依 T003。

## User Stories

- [x] T005 在 `src/App.tsx`、`src/styles.css` 與 `src/components/` 建立真實資料 Dashboard、摘要、趨勢、熱圖、repo 排行、每日明細與狀態，相依 T004。
- [x] T006 在 `src/App.tsx` 完成日期／repo 篩選、CSV、列印、手機版與鍵盤操作，相依 T005。
- [x] T007 使用 `server/github.ts` 同步真實帳號資料到忽略的 `.cache/report.json`，核對統計與一個 commit 的獨立數值，相依 T006。

## Polish

- [x] T008 在 `tests/dashboard.e2e.ts` 驗證桌面／手機、篩選、匯出、同步與空結果；執行型別、核心測試、build 與瀏覽器畫面檢查，相依 T007。
- [x] T009 在 `README.md`、`AGENT_HANDOFF.md` 記錄安裝、規則、限制與驗證；逐條對照 `spec.md`，確認 source 不含快取或憑證，相依 T008。
- [ ] T010 完成可審閱成果後確認 PRIVATE `github-code-dashboard` repo 的具體名稱與推送；獲確認後建立、提交、推送並核對遠端，相依 T009。

## 執行規則

按 T001 → T010 順序執行，完成即勾選。失敗先回報並修復該項，不跳過。對外建立／推送以前先完成可審閱結果。
