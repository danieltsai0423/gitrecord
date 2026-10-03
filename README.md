# GitRecord · GitHub 活動紀錄

以真實 GitHub commit 資料查看每日新增、刪除、淨增行數與活動趨勢。介面為繁體中文，支援桌面與手機。私人 repository 的統計只保存在本機。

原始碼：[danieltsai0423/gitrecord](https://github.com/danieltsai0423/gitrecord)（private repo）。

## 啟動

需要 Node.js 22.12 以上、GitHub CLI，以及能讀取目標 repositories 的 GitHub 登入狀態。這個專案使用目前 `gh` 登入的帳號，不需要填入或讀出 token。

在專案資料夾的 PowerShell 執行：

```powershell
# 尚未登入時，請自行完成 GitHub CLI 登入
gh auth login

npm.cmd ci
npm.cmd run build
npm.cmd start
```

開啟 [本機 Dashboard](http://127.0.0.1:4317)。第一次開啟會自動同步近一年資料；同步時間取決於 repo 數量與 GitHub 回應速度。已有快取時直接顯示保存的報告，按「同步」取得最新資料。

若預設埠被占用：

```powershell
npm.cmd start -- --port 4320
```

也可以只同步資料：

```powershell
npm.cmd run sync
```

CLI 同步不會通知已開啟的頁面，完成後重新整理即可。請勿同時啟動多個寫入相同快取的程序。

## 查看報告

- 7、30、90、365 日與自訂日期；可篩選單一 repo。
- 新增、刪除、淨增、commit 數與活躍日摘要。
- 每日增刪趨勢與全年活動熱圖；點選熱圖日期查看當日。
- 依變更行數排序的 repo 排行；點選 repo 即可篩選。
- 每日明細、CSV 與列印報告。CSV 包含全部篩選日期、台北時區、同步時間及 complete／partial 狀態。
- 點「列印」後，可在瀏覽器列印對話框選擇「另存為 PDF」；列印包含當期全部明細日期。

日期篩選會同步影響摘要、趨勢、排行與每日明細；全年熱圖保留年度上下文，以邊框標記目前日期範圍。熱圖亮度以變更行數的對數分級呈現，滑鼠提示與鍵盤焦點可查看準確數值。手機熱圖與明細表可水平捲動。

## 統計規則

| 項目 | 定義 |
|---|---|
| Repository 範圍 | 目前登入者擁有、可讀取的公開與私人 repos；排除 fork 與組織名下 repos |
| 分支範圍 | 每個 repo 的預設分支；同步開始時固定其 HEAD oid，再完整分頁 |
| 作者 | 使用 GitHub user ID 篩選該帳號作者；不讀取 email 或推測其他身份 |
| Commit 範圍 | 排除多個 parent 的 merge commits；每 repo 依 oid 去重，保留根 commit |
| 每日日期 | `committedDate` 轉 `Asia/Taipei`（UTC+8），並非 authored date 或 push date |
| 涵蓋期間 | 同步當日及往前 364 日；當日截至本次同步開始時間 |
| 新增／刪除 | GitHub Commit 的 `additions`／`deletions` |
| 淨增／變更 | 新增減刪除／新增加刪除 |
| 活躍日 | 至少一個符合條件的 commit，包含零行數 commit |
| 前期比較 | 緊接在當期之前的等長期間；超出快取範圍時顯示無前期資料 |

行數包含所有文字檔案，包含文件、產生檔案與 lockfiles。二進位內容沒有可加總的文字行數。未合併到預設分支的工作、未與 GitHub 帳號關聯的作者不會計入；重新編寫歷史、squash 或搬移 repo 可能改變結果。這份報告呈現代碼變更量，不能直接視為生產力或程式碼品質評分。

GitHub 欄位定義可見 [Commit 與 CommitAuthor 官方文件](https://docs.github.com/en/graphql/reference/commits#commit)，API 額度見 [GraphQL 限制](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api)。

## 同步與資料保存

後端只使用 `gh api graphql` 查詢帳號／repo metadata 及 commit 數值，不 clone 其他 repo，不取得原始碼、檔案內容、patch、commit 訊息或作者 email。GitHub CLI 自行處理已存在的登入憑證；程式不執行 `gh auth token`，也不儲存 token。

快取位於 `.cache/report.json`，包含帳號、repo metadata、每日聚合數字及涵蓋狀態；快取、截圖、build 與測試產物皆由 `.gitignore` 排除。CSV 與列印報告可能包含私人 repo 名稱，分享時請自行選擇對象。

單一 repo 失敗時，報告標為 partial，列出原因，該 repo 不使用上一輪資料混入本次統計；全域同步或快取寫入失敗時保留上次成功報告，介面顯示錯誤。可按「同步」或「重試」重新查詢。

服務只監聽 `127.0.0.1`，限制本機 Host、拒絕跨來源 API 請求，並禁止嵌入外部 frame。本次交付為本機程式，GitHub repo 用於保存原始碼；尚無線上部署或自動排程。

## 開發與驗證

```powershell
# 同時啟動本機 API 與 Vite；開啟 http://127.0.0.1:5173
npm.cmd run dev

# 核心統計、分頁、同步與 API 測試
npm.cmd test

# 型別檢查與 production build
npm.cmd run build

# 桌面／手機 E2E（Windows Microsoft Edge）
npm.cmd run test:e2e

# 一次執行全部驗證
npm.cmd run validate
```

E2E 使用明確的測試資料與 API mocks，涵蓋篩選、合計、CSV、列印、空資料、partial、錯誤與首次自動同步；不依賴私人帳號或 GitHub 憑證。Playwright 目前指定本機 Microsoft Edge。若使用其他作業系統，請調整 `playwright.config.ts` 的 browser channel 並安裝對應瀏覽器。

實際資料的畫面檢查需要先啟動 `npm.cmd start`：

```powershell
node scripts/capture-preview.mjs
```

截圖儲存至忽略的 `artifacts/`。

## 原始碼配置

```text
src/                  React、圖表、熱圖、篩選與列印樣式
shared/report.ts      型別、日期、聚合、篩選與 CSV
server/github.ts      GitHub CLI、固定 HEAD 與完整分頁
server/app.ts         本機 API、同步鎖與快取
server/index.ts       Production 啟動入口
scripts/              開發、CLI 同步與畫面驗證
tests/                核心測試與瀏覽器 E2E
specs/github-dashboard/  使用者已確認的規格、計畫與任務
```

圖示來自 Tabler Icons；授權見 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
