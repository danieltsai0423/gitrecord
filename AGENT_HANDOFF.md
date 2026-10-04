# GitRecord — 專案交接

更新日期：2026-10-05（Asia/Taipei）

- **版面順序**：回顧與節奏移至每日報告下方、頁尾之前，側欄入口也排在最後。README 兩張總覽展示圖完整涵蓋代碼變更趨勢及年度活動熱圖，截圖高度依熱圖底部決定。文件與 `specs/reflection-workspace/spec.md` 同步更新；本次 production build、56 項桌面／手機 E2E 通過，7 張範例截圖重新產生，無殘留名稱、整頁溢出或 pageerror，已查看深淺總覽、期間回顧與手機目標。

- **開源版文件**：英文入口 `README.md`，繁體中文 `README.zh-TW.md`，授權 `LICENSE`（MIT）。已加入 `CONTRIBUTING.md`、`SECURITY.md` 及 Windows／Node 22 自動驗證。`docs/images/` 的 7 張文件截圖只使用範例資料，帳號與所有專案名稱於截圖前以不透明遮罩取代；重建命令 `npm.cmd run docs:screenshots`，不讀取 `.cache/` 或真人憑證。Git 歷史與待提交檔案需先通過憑證模式／本機資料檢查；實際帳號截圖仍留在忽略的 `artifacts/`。
- **回顧與節奏工作台已完成**：Daniel 要求借鑑同類工具的優點並依 GitRecord 用途調整改進。三個分頁整合期間摘要、相同日期／尺度的帳號對照、週活躍日目標；新增多帳號共同活躍日，跨帳號日期去重。目標預設未設定，依 user ID／合計範圍在瀏覽器保存，涵蓋選取結束日所在的週一至週日，使用帳號範圍的全部 repos、不受 repo 篩選影響。資料不足不當成零，也不推算 streak 或前期變化。回顧卡支援本機 PNG／Markdown、預覽與固定資料快照，預設遮住帳號和私人 repo 名稱，保留各帳號的同步時間／涵蓋。未增加 API 權限或套件。需求見 `specs/reflection-workspace/spec.md`，模型見 `shared/reflection.ts`，使用方式見 README。
- 此次驗證：**48 項核心／API、production build 與 56 項桌面／手機 E2E 全數通過**。新功能包含 8 項模型與桌面／手機共 10 項 E2E，涵蓋缺資料、零行數 commit、等長前期、跨年週界、目標保存及儲存受限、匯出遮名與鍵盤；查看 320px 英文淺色和 390px／1440px 中文畫面。既有安裝輪詢測試的等待時間調為 10 秒，讓五秒檢查間隔加上回應／畫面更新不會超過測試預設五秒期限。實際預覽 `http://127.0.0.1:4322` 的兩帳號工作台和一年期回顧卡已查看，無整頁溢出、pageerror 或同步寫入；檢查僅使用已保存資料。
- 2026-10-04 Daniel 明確要求使用時連 GitHub CLI 都不用安裝。現在直接使用 GitHub OAuth device flow、REST `/user` 與 GraphQL；不再執行 `gh`。憑證由 `@napi-rs/keyring` 保存於 OS keychain（Windows Credential Manager），不可用時只保留程序記憶體並提示；支援到期更新、身份核對、取消及移除本機登入，報告沿用。
- **發布設定已完成**：Daniel 提供公開 GitHub App `gitrecord-by-daniel`，App ID `5185425`、Client ID `Iv23lii6E7ARszfJ36kg`，已寫入 `oauth.config.json`。實際公開 API 核對一致，權限只有 Contents／Metadata read。Daniel 已完成兩個真人帳號的授權與安裝，兩份報告均成功更新至 2026-10-04，partial=false、無同步錯誤。一般使用者不用建立 App 或填 ID，只按連接、在 GitHub 授權與首次安裝選取 repos。不需要 client secret／私鑰；舊 CLI／OAuth App 登入需在此 App 重新授權，快取沿用。步驟與設定優先序見 `README.md`。
- GitHub App user token 不請求 `repo` scope。授權完成後核對本人安裝，未安裝／空範圍／暫停／非唯讀時阻止同步，提供安裝入口並輪詢完成後自動同步。每次同步重新取得安裝 repo 白名單，GraphQL 只查詢這些 node ID，未選取的公開 repos 不納入；org／其他帳號安裝排除。管理 repo 存取範圍後需按同步更新。實作見 `server/installation.ts`，驗收見 `specs/multi-account/spec.md`。
- 日期涵蓋提示已加入每個待更新帳號的「GitHub 存取設定」與「重新檢查」。檢查目前帳號就緒後同步，其他帳號先切換再同步，未連接者提供登入入口；未安裝不誤同步，失敗保留資料且可重試，報告篩選維持獨立。入口見 `src/components/CoverageNotice.tsx`，中英文與深淺主題皆支援。
- 帳號區塊右上角新增向上／向下收合按鈕；收合保留帳號摘要，隱藏操作及詳細資料。localStorage 記住手動選擇，保留選單／表單值，登入／切換／安裝／設定與授權錯誤自動展開。鍵盤 Enter／Space、aria-expanded／aria-controls、中英文、深淺主題與手機皆可使用。
- GitHub App 遷移的 40 項核心／API 測試已通過；此次前端更新後桌面／手機共 46 項 E2E、production build 與測試程式型別檢查通過，包含收合保存與自動展開、重新檢查、指定帳號切換、安裝等候、失敗重試及未登入入口。安裝輪詢測試允許下一次五秒檢查及畫面更新的時間。測試 API 不含 token；Windows 憑證測試僅操作獨立暫存服務名稱。實際預覽 `http://127.0.0.1:4322` 已載入兩帳號報告，1440px／390px 無整頁溢出或 pageerror，已查看展開與收合截圖。下方舊的 CLI 實作及驗證紀錄屬歷史背景，當前架構以此段與 README 為準。
- 2026-10-04 已加入右上角「EN／中」繁體中文與英文切換；預設繁體中文，語言保存於瀏覽器 localStorage。翻譯集中於 `src/i18n.tsx`，涵蓋帳號／OAuth 操作、圖表與熱圖、日期、列印及已知服務訊息；切換時保留篩選、主題與進行中的授權／同步。TypeScript、production build 及桌面／手機 26 項 E2E 通過；已查看英文深淺色截圖，320px／390px 無整頁溢出。
- 2026-10-04 已加入淺色主題與右上角太陽／月亮切換按鈕，初次預設深色，選擇保存於瀏覽器 localStorage；無法使用 storage 時仍可切換。卡片、圖表、熱圖、表格及提示均隨主題換色，列印維持白底。TypeScript、production build 與桌面／手機 20 項 E2E 通過；已查看淺色截圖，320px／390px 無整頁溢出。
- 2026-10-03 已加入多帳號整合：每次只取代此次授權帳號資料，預設合計所有已保存帳號，可篩選帳號／repo。需求與驗收見 `specs/multi-account/spec.md`。
- 快取新版為 version 2 帳號報告集合；舊版 version 1 自動載入，不需刪除。CSV／列印包含各帳號同步時間、涵蓋範圍與失敗狀態。
- Daniel 後續要求將登入全部改為 OAuth 網頁操作。已加入「使用 GitHub 登入／新增 GitHub 帳號」、一次性授權碼、取消與重試、登入帳號選擇、「切換並同步」，授權或切換成功自動同步。初版以 CLI 實作，目前已改成上述直接 OAuth。
- OAuth／多帳號驗證：22 項核心／API 測試、TypeScript 與 production build、桌面／手機 18 項 E2E 通過。以無任何登入紀錄的暫存 GH_CONFIG_DIR 實際取得 OAuth code 後取消，未登入新帳號、未變更使用者憑證。測試資料畫面已查看，無整頁橫向溢出。
- Daniel 已確認名稱為 **GitRecord**，網頁品牌、GitHub repo 與本地資料夾統一改名。
- 遠端 repo 為 `danieltsai0423/gitrecord`，預設分支 `main`；早期 private 交付紀錄屬歷史背景，目前位置與可見性以 Git remote／GitHub 為準。
- 本地專案入口：`C:\Users\User\Desktop\Road to AU\GitRecord`。安裝、執行、資料規則與驗證以 `README.md` 為準。
- 同步使用 GitRecord「同步帳號」選中的身份；讀取真實資料前先確認 Dashboard 授權狀態。報告快取留在本機 `.cache/`，憑證不寫入快取。
- 下方及 `specs/github-dashboard/` 記錄原始工作帳號的交付背景；其中帳號與 repo 名稱屬歷史資料，當前位置以上方與 Git remote 為準。

## 原始交付紀錄

日期：2026-10-02（Asia/Taipei）

- 使用者要求建立好看的 GitHub 每日代碼增刪行數 Dashboard，並更新到新的 GitHub repo。
- GitHub CLI 已登入 `renewclincdaniel-coder`。
- 使用者已確認規格目錄 `specs/github-dashboard` 與目前帳號。
- spec.md、plan.md、tasks.md 均已獲使用者確認，T001–T010 全部完成。
- 統計只讀取 repository metadata 與 commit 數值，不取得原始碼、patch、commit 訊息、email 或憑證。
- 使用者已確認建立私人 repo 並推送；repo 為 https://github.com/renewclincdaniel-coder/github-code-dashboard ，default branch 為 main。

## 已完成與驗證

- React／TypeScript／Vite Dashboard、Node／Express 本機服務、gh GraphQL 同步。
- 初次同步近一年 31 個非 fork repos；新 repo 建立後透過本機 API 再同步，32/32 完成、error=null、partial=false，Dashboard repo 狀態 complete。資料在忽略的 `.cache/report.json`。
- 台北日期歸日、固定 HEAD 分頁、作者 ID 篩選、merge 排除、去重、補零、CSV 與列印。
- 桌面／手機日期和 repo 篩選、趨勢圖、全年熱圖、排行、每日明細、載入與錯誤狀態。
- `npm.cmd test`：10 項通過；`npm.cmd run build`：型別與 build 通過。
- `npm.cmd run test:e2e`：桌面／手機 10 項通過（13.1s）。
- 真實統計核對：單一 repo 2026-10-02 為 3 commits、+1,821／-26，與獨立查詢一致。
- `node scripts/capture-preview.mjs`：1440px／390px 均無整頁溢出或 pageerror；已查看實際截圖。
- 預覽服務為 `http://127.0.0.1:4317`；若已停止，執行 `npm.cmd start`。
- `README.md` 提供完整安裝、資料規則、限制與驗證指令。

## Git 與交付

- Git 已初始化為 main；35 個 source／文件已提交。快取、截圖與 build 均排除；憑證模式檢查 0 命中，`git diff --cached --check` 通過。
- 首次 source commit `ef45e1e` 已推送，遠端 main 與本機 HEAD 核對一致，可見性 PRIVATE。
- 後續完成紀錄提交請以 `git rev-parse HEAD` 和 `git ls-remote --heads origin main` 核對。
- 本機報告可按「同步」更新；新建的 Dashboard repo 也會納入後續統計。
