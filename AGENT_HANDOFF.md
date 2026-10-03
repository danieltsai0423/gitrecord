# GitRecord — 專案交接

更新日期：2026-10-03（Asia/Taipei）

- Daniel 已確認名稱為 **GitRecord**，網頁品牌、GitHub repo 與本地資料夾統一改名。
- 目前版本屬於個人帳號 `danieltsai0423` 的 private repo；以 `git remote -v` 確認目前位置。
- 本地專案入口：`C:\Users\User\Desktop\Road to AU\GitRecord`。安裝、執行、資料規則與驗證以 `README.md` 為準。
- 同步使用當下 `gh` active account；讀取真實資料前先確認 `gh auth status`。快取留在本機 `.cache/`。
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
