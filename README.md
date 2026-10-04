# GitRecord · GitHub 活動紀錄

以真實 GitHub commit 資料查看每日新增、刪除、淨增行數與活動趨勢。介面支援繁體中文與英文，可用於桌面與手機。私人 repository 的統計只保存在本機。

原始碼：[danieltsai0423/gitrecord](https://github.com/danieltsai0423/gitrecord)（private repo）。

## 啟動

需要 Node.js 22.12 以上。**不需要安裝 GitHub CLI，也不需要手動輸入 token。** 首次登入、新增帳號、切換與同步都在 Dashboard 操作；程式直接使用 GitHub OAuth device flow 與 REST／GraphQL API。

在專案資料夾的 PowerShell 執行：

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd start
```

開啟 [本機 Dashboard](http://127.0.0.1:4317)，按「連接 GitHub 帳號」。在 GitHub 完成授權，首次再按「前往 GitHub 選擇 repos」安裝 App 並選擇要統計的 repositories；保持 Dashboard 開啟，完成後會自動同步近一年資料。已安裝者直接同步，不必重新選擇。同步時間取決於 repo 數量與 GitHub 回應速度。已有快取時直接顯示保存的報告，按「同步目前帳號」取得最新資料。

若預設埠被占用：

```powershell
npm.cmd start -- --port 4320
```

也可以只同步資料：

```powershell
npm.cmd run sync
```

這個可選的命令直接使用 GitRecord 已保存的 OAuth 憑證，不會執行 `gh`。需先在 Dashboard 授權，且本機憑證管理可用；完成後重新整理頁面即可。一般使用者直接按頁面上的同步按鈕。請勿同時啟動多個寫入相同快取的程序。

## GitHub App 設定（發布者一次完成）

專案已預設使用公開的 [GitRecord by Daniel](https://github.com/apps/gitrecord-by-daniel)，App ID `5185425`、Client ID `Iv23lii6E7ARszfJ36kg`。**下載本 repo 的使用者無需建立 App 或填寫上述資料**，只需連接帳號、授權與選擇 repositories。App 權限為 `Contents: read` 與 `Metadata: read`；使用者可選部分 repos 或全部 repos。授權與安裝是 GitHub 的兩個步驟，每個帳號第一次各完成一次。

Fork 後若要使用自己的 App，發布者可依下列方式設定：

1. 開啟 [建立 GitHub App](https://github.com/settings/apps/new)，填入未被使用的名稱與專案 URL，勾選 **Enable Device Flow** 與 **Expire user access tokens**。
2. 關閉 Webhook，取消 **Request user authorization (OAuth) during installation**；本程式先透過 device flow 授權，再引導安裝。不使用 callback 或 Setup URL，可留空。
3. Repository permissions 只設定 **Contents: Read-only**；Metadata 自動為 Read-only。其他 repository／organization／account 權限不設定，不訂閱事件。
4. 選 **Any account** 讓其他使用者也能安裝。已建立為 private App 可在 Advanced 將 App 改為 public。
5. Dashboard「GitHub App 設定」填 App ID、Client ID 與 `https://github.com/apps/<slug>`。程式先向 GitHub 核對三項資訊與唯讀權限，通過才保存。
6. 將公開 `clientId`、`appId`、`appSlug` 寫入根目錄 `oauth.config.json`，隨原始碼發布。不要建立或加入 client secret、私鑰。

App ID、Client ID 與 App URL 是公開識別資訊，不是存取憑證。設定優先序為環境變數 `GITRECORD_GITHUB_CLIENT_ID`／`GITRECORD_GITHUB_APP_ID`／`GITRECORD_GITHUB_APP_SLUG`、本機 `.cache/oauth.json`、根目錄 `oauth.config.json`。本機 App 設定以整組覆蓋預設值，不混用不同 App 的欄位；檔案只有公開 App 設定與目前帳號 ID。切換 App 時登入清單改用該 App 的憑證，保存的報告不受影響。

GitHub 授權頁會顯示 App 名稱，請核對名稱與發布者，只輸入本機 Dashboard 產生的授權碼。設定見 [GitHub App 官方文件](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app)，授權流程見 [GitHub App user access token／device flow 文件](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)。

### 從舊版本升級

原本透過 GitHub CLI 或舊 OAuth App 授權的帳號，需要在 GitHub App 重新授權一次。程式不匯入其他工具的憑證。若曾自行設定舊 OAuth App，請在「GitHub App 設定」填入上面的預設 App 資訊或自己的 App 資訊。已有 `.cache/report.json`、多帳號統計與篩選繼續可用；重新授權及同步後接續更新同一帳號資料，改為只包含安裝範圍內的 repos。

## 多帳號整合

1. 沒有任何登入紀錄也可以按「連接 GitHub 帳號」；已有帳號則按「新增 GitHub 帳號」。
2. 頁面顯示一次性 OAuth 授權碼，按「複製授權碼並開啟 GitHub」，在 GitHub 輸入授權碼、登入目標帳號並確認授權。若複製受瀏覽器限制，可手動複製頁面顯示的碼。
3. 回到 Dashboard，程式會核對帳號與 App 安裝。若尚未安裝或未選擇個人 repos，按「前往 GitHub 選擇 repos」，選擇剛授權的個人帳號並安裝。頁面每 5 秒檢查一次，存取就緒後自動同步；等候超過 10 分鐘或曾停止等待時，可按「重新檢查」。
4. 已授權且安裝完成的帳號選擇「切換登入帳號」，按「切換並同步」即可使用，不需再次 OAuth 授權。可用「管理 repo 存取範圍」修改選取範圍，回來按「同步目前帳號」重新查詢；每次同步都重新核對安裝與範圍。

Dashboard 預設顯示「所有帳號合計」，可用「篩選帳號」查看單一帳號，再篩選 repo。**統計篩選只改變畫面，不會切換登入帳號**；上方「目前授權帳號」決定此次同步來源。切換只更新 GitRecord 的帳號選擇；同步與帳號操作互斥，整次同步固定同一身份。可按「更新登入狀態」重新核對 GitHub 身份。

瀏覽器登入與雙重驗證只在 GitHub 進行。GitRecord 的本機 Node 服務交換及更新 OAuth token，使用作業系統憑證管理保存；Windows 使用 Credential Manager。若憑證管理不可用，token 只留在目前程序記憶體，介面會提示重新啟動後需要再授權，不會回退成明文檔案。瀏覽器 API 只取得帳號 metadata 與一次性 user code，不取得 access／refresh token。

GitHub App user token 不請求 OAuth `repo` scope，權限由 App 與使用者安裝範圍決定。GitRecord 要求 Contents／Metadata 唯讀，遇到寫入權限或暫停安裝會停止同步。Contents 唯讀授權本身允許讀取所選 repo 原始碼；GitRecord 的實作只查詢 metadata 與 commit 統計。按「移除登入」刪除該帳號的本機憑證，仍保留統計；GitHub 端可於 [Authorized GitHub Apps](https://github.com/settings/apps/authorizations) 撤銷授權，或於 [Installed GitHub Apps](https://github.com/settings/installations) 修改／移除安裝。

再次同步會取代該帳號的報告，保留其他帳號；不會把前一次資料再累加。新增、刪除與 commit 數依 repo 統計合計，活躍日依日期去重。不同帳號的同名 repo 以完整的 `owner/name` 區分。GitHub user ID 用於辨認帳號更名，舊快取首次同步時則以 username 接續。

帳號卡片會顯示各自的最後同步時間、涵蓋日期與同步狀態。合計最多顯示最新保存報告結束日期往前 365 日；帳號尚未涵蓋的日期明示為部分資料，不能當成零活動。各帳號同一天也可能同步於不同時間，請參考卡片時間。CSV 與列印包含目前篩選帳號、各帳號同步時間和涵蓋範圍。

遇到「部分帳號尚未涵蓋選取日期」，提示會列出需要更新的帳號與資料日期。可直接按該帳號的「GitHub 存取設定」，在 GitHub 選擇對應帳號並完成安裝／repo 存取設定；回來按「重新檢查」，程式會切換到該帳號，核對授權與 App 存取，確認就緒後同步。未連接的帳號提供「連接帳號」入口。同步期間按鈕停用，失敗保留舊資料，統計篩選不因重新檢查而切換。

同步過程請勿切換登入帳號；若偵測到帳號變更，會中止本次同步並保留原報告。同步失敗會保留該帳號上次資料；在已辨認帳號的情況下保存失敗狀態，下次成功同步會清除。新帳號首次失敗尚無可保存的報告，錯誤會顯示在同步訊息。

## 查看報告

- 帳號區塊右上角的向上／向下按鈕可收合或展開帳號操作與詳細資料；收合時仍顯示帳號數與目前授權帳號，瀏覽器會記住選擇。需要連接、安裝、設定或處理授權錯誤時會自動展開。收合不清除下拉選單與設定表單的內容。
- 右上角「EN／中」按鈕即時切換繁體中文與英文，瀏覽器會記住語言；初次預設繁體中文。包含選單、帳號與 OAuth 操作、狀態提示、圖表、熱圖、日期格式及列印，切換時保留篩選與同步狀態。
- 右上角太陽／月亮按鈕切換深色與淺色模式，瀏覽器會記住選擇；初次開啟預設深色。圖表、熱圖與表格同步換色，列印固定白底。
- 7、30、90、365 日與自訂日期；可篩選單一帳號及 repo。
- 新增、刪除、淨增、commit 數與活躍日摘要。
- 每日增刪趨勢與全年活動熱圖；點選熱圖日期查看當日。
- 依變更行數排序的 repo 排行；點選 repo 即可篩選。
- 每日明細、CSV 與列印報告。CSV 包含全部篩選日期、台北時區、同步時間及 complete／partial 狀態。
- 點「列印」後，可在瀏覽器列印對話框選擇「另存為 PDF」；列印包含當期全部明細日期。

日期篩選會同步影響摘要、趨勢、排行與每日明細；全年熱圖保留年度上下文，以邊框標記目前日期範圍。熱圖亮度以變更行數的對數分級呈現，滑鼠提示與鍵盤焦點可查看準確數值。手機熱圖與明細表可水平捲動。

## 統計規則

| 項目 | 定義 |
|---|---|
| Repository 範圍 | 個人帳號 GitHub App 安裝中選取且可讀取的公開與私人 repos；排除 fork 與組織名下 repos，未選取的公開 repos 也不計入 |
| 分支範圍 | 每個 repo 的預設分支；同步開始時固定其 HEAD oid，再完整分頁 |
| 作者 | 使用 GitHub user ID 篩選該帳號作者；不讀取 email 或推測其他身份 |
| Commit 範圍 | 排除多個 parent 的 merge commits；每 repo 依 oid 去重，保留根 commit |
| 每日日期 | `committedDate` 轉 `Asia/Taipei`（UTC+8），並非 authored date 或 push date |
| 涵蓋期間 | 同步當日及往前 364 日；當日截至本次同步開始時間 |
| 新增／刪除 | GitHub Commit 的 `additions`／`deletions` |
| 淨增／變更 | 新增減刪除／新增加刪除 |
| 活躍日 | 至少一個符合條件的 commit，包含零行數 commit |
| 前期比較 | 緊接在當期之前的等長期間；超出範圍、帳號涵蓋不足或同步不完整時顯示無前期資料 |

行數包含所有文字檔案，包含文件、產生檔案與 lockfiles。二進位內容沒有可加總的文字行數。未合併到預設分支的工作、未與 GitHub 帳號關聯的作者不會計入；重新編寫歷史、squash 或搬移 repo 可能改變結果。這份報告呈現代碼變更量，不能直接視為生產力或程式碼品質評分。

GitHub 欄位定義可見 [Commit 與 CommitAuthor 官方文件](https://docs.github.com/en/graphql/reference/commits#commit)，API 額度見 [GraphQL 限制](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api)。

## 同步與資料保存

同步先透過 REST `/user/installations` 核對個人帳號安裝與權限，完整分頁 `/user/installations/{id}/repositories` 取得允許範圍，再向 `https://api.github.com/graphql` 依 repository node ID 分批查詢 metadata 及 commit 數值。不 clone repo，不取得原始碼、檔案內容、patch、commit 訊息或作者 email。登入直接向 GitHub 申請 device code 並輪詢授權結果；遵守輪詢間隔、slow_down、取消與逾時。取得或更新 token 後以 REST `/user` 核對身份，防止不同帳號資料混用。

Access／refresh token 只用於服務端 OAuth 與 API 請求及作業系統憑證管理，不放入 URL、報告、設定、瀏覽器儲存或 API 回應。一次性 device code 與 user code 在授權結束後從程序狀態清除。網路、API 額度、登入失效與 OAuth 設定錯誤會顯示可重試的提示。

快取位於 `.cache/report.json`，version 2 包含各帳號獨立的報告及最後同步嘗試／失敗狀態，整份快取以暫存檔加 rename 保存。舊版 version 1 無需刪除，載入時自動轉換，下一次保存時寫入新版。內容只有帳號、repo metadata、每日聚合數字及涵蓋狀態；快取、截圖、build 與測試產物皆由 `.gitignore` 排除。CSV 與列印報告可能包含私人 repo 名稱，分享時請自行選擇對象。

單一 repo 失敗時，該帳號本輪報告標為 partial，列出原因，該 repo 不使用上一輪資料混入本次統計；全域同步或快取寫入失敗時保留上次報告，介面顯示錯誤。其他帳號的報告保留各自的同步時間，不會冒充已於本次更新。可按「同步」或「重試」重新查詢。

服務只監聽 `127.0.0.1`，限制本機 Host、拒絕跨來源 API 請求，並禁止嵌入外部 frame。本版本供每位使用者下載後在自己的電腦執行；若要部署成多人共用的公開網站，仍需另外設計網站登入、使用者隔離與服務端資料保存。

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

E2E 使用明確的測試資料與 API mocks，涵蓋中英文與深淺主題切換及保存、帳號／repo 篩選、多帳號合計、CSV、列印、帳號區塊收合、日期涵蓋重新檢查、空資料、partial、錯誤、App 設定、零登入、授權／安裝／切換後自動同步、未安裝時禁止同步、session 憑證提示及移除登入。核心測試涵蓋直接 OAuth／HTTP／GraphQL、token 更新與身份核對、安裝隔離、repository 白名單分頁與 App 權限核對；Windows 憑證保存測試使用獨立的暫存服務名稱並於測試後清除。2026-10-04 已通過 40 項核心／API 測試、production build 與 46 項桌面／手機 E2E；兩個真人帳號完成 GitHub App 授權、安裝及同步，報告涵蓋至 2026-10-04，皆無 partial 或同步錯誤。Playwright 目前指定本機 Microsoft Edge。

實際資料的畫面檢查需要先啟動 `npm.cmd start`：

```powershell
node scripts/capture-preview.mjs
```

截圖儲存至忽略的 `artifacts/`。

## 原始碼配置

```text
src/                  React、圖表、熱圖、篩選與列印樣式
shared/report.ts      型別、日期、聚合、篩選與 CSV
server/github.ts      直接 GraphQL、固定 HEAD 與完整分頁
server/oauth.ts       GitHub device flow、身份查詢與 token 更新
server/auth.ts        登入清單、帳號切換、取消與同步憑證
server/installation.ts 公開 App 核對、安裝與 repository 白名單
server/credentials.ts OS 憑證管理與公開 App 設定
server/http.ts        有時限及大小限制的 JSON HTTP 請求
server/app.ts         本機 API、同步鎖與快取
server/index.ts       Production 啟動入口
oauth.config.json     發布者提供的公開 App ID／Client ID／slug
scripts/              開發、可選命令同步與畫面驗證
tests/                核心測試與瀏覽器 E2E
specs/github-dashboard/  使用者已確認的規格、計畫與任務
```

圖示來自 Tabler Icons；本機憑證管理使用 `@napi-rs/keyring`。授權見 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
