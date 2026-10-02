# 技術計畫：GitHub 每日代碼增修 Dashboard

**對應規格**：`specs/github-dashboard/spec.md`
**日期**：2026-10-02
**狀態**：已確認（使用者於 2026-10-02 確認）

## 技術背景與既有資產

資料夾無既有原始碼。已確認 Node.js v24.13.0、npm 11.6.2、Git 與 GitHub CLI 可用；沿用 GitHub CLI 登入狀態，不取得或儲存憑證。GitHub 實際查詢確認 31 個非 fork repositories，且 CommitAuthor 支援以 GitHub user ID 篩選。

前端採 React、TypeScript、Vite 與 Recharts；後端採 Node.js／Express。使用 `visual-design-foundations` 設計色彩、字級與間距；圖示依 `better-icons` 選用同一系列。Dashboard 為本機專案，透過新 GitHub repo 交付。

## 架構

瀏覽器 → 本機 HTTP API → GitHub CLI `gh api graphql` → GitHub commit 數值 → 本機快取 → 前端篩選與圖表。

- 本機 API 預設只監聽 `127.0.0.1`。讀取快取、查同步狀態、手動開始同步。
- 先查 viewer 與其 OWNER、非 fork repositories（完整分頁）。
- 以每個 repo 預設分支的固定 HEAD oid 分頁讀取近 365 日 history，依 viewer ID 篩選作者；只取 oid、committedDate、additions、deletions、parents.totalCount。
- 排除多父 commit，於每個 repo 以 oid 去重；提交時間轉 Asia/Taipei 歸日，補零。
- 單 repo 失敗保留明確錯誤與 partial 狀態，不沿用舊值偽裝本次成功。全域同步失敗保留上次成功快取。
- 快取寫入 `.cache/report.json`，使用暫存檔替換；不進版控，不包含憑證、代碼、patch、email 或 commit 訊息。
- 頁面開啟時無快取就同步；已有快取直接顯示並提供手動同步。

## 檔案與模組

| 路徑 | 職責 |
|---|---|
| `src/App.tsx`、`src/styles.css` | Dashboard、篩選、匯出、列印、載入與錯誤狀態 |
| `src/components/` | 趨勢圖、全年熱圖、repository 排行與明細 |
| `shared/report.ts` | 型別、台北日期歸日、去重、聚合、篩選與 CSV |
| `server/github.ts` | gh GraphQL 查詢、作者篩選、固定 HEAD、完整分頁與同步 |
| `server/app.ts`、`server/index.ts` | API、同步鎖、快取、production 靜態檔案與本機啟動 |
| `tests/` | 統計邊界、分頁、錯誤、API 與 UI 操作驗證 |
| `.gitignore` | 排除 `.cache`、build、測試產物、所有 env 與憑證相關檔案 |
| `README.md`、`AGENT_HANDOFF.md` | Windows 啟動指令、統計限制、驗證與交接 |

## 設計決策

1. 使用 GraphQL 取得 commit 的行數欄位，避免 clone 其他專案或讀取原始碼；也减少逐個 commit 的 REST 往返。
2. 使用 committedDate，與 history 時間篩選一致；採台北當日零點與涵蓋期間邊界，避免 UTC 跨日錯誤。
3. 每 repo 固定 HEAD oid，避免同步過程分支更新造成分頁重複或缺漏。
4. 本機 gh 驗證適合私人 repo；雲端部署無法直接使用本機登入狀態，因此本次提供本機啟動與完整 repo。
5. 視覺採石墨深色、薄邊框、綠色新增／橘紅刪除，固定側欄與高密度主面板；手機改為單欄。保留全年熱圖作為年度上下文，篩選期以邊框標示。
6. CSV 與列印報告從同一份篩選資料產生，避免畫面與匯出不一致。

## 規範符合性與簡化性

未建立額外 constitution；遵守使用者安全與 Windows 規則。只引入實作圖表、前端、HTTP 服務與驗證所需套件；無資料庫、token 管理或多帳號登入。

## 風險與因應

- GitHub 速率或網路錯誤：節制查詢、顯示可重試原因與 partial 狀態。
- 大型文字檔／lockfile 會使增刪行數較大：明示全文字檔統計、不稱為生產力。
- author 未與 GitHub 帳號關聯：不推測身份、不收集 email；明示可能漏計。
- 預設分支之外的 commits 不涵蓋：畫面與 README 明示統計範圍。
- 新 repo 外部寫入：先完成成果與驗證，再確認具體 PRIVATE repo 名稱與推送。

## 驗證策略

- TypeScript 型別檢查、production build。
- 使用 Node test runner 驗證台北跨日、零日補齊、merge／其他作者排除、去重、日期／repo 篩選、CSV 合計、分頁與 partial 錯誤。
- API 驗證同步鎖、錯誤恢復與來源檢查。
- 真實 GitHub 同步並用獨立 REST 統計數值核對一個 commit，不讀取 patch。
- 使用桌面與手機瀏覽器檢查圖表、篩選、CSV、列印樣式、空結果及頁面溢出。
