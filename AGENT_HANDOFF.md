# 專案進度

日期：2026-10-02（Asia/Taipei）

- 使用者要求建立好看的 GitHub 每日代碼增刪行數 Dashboard，並更新到新的 GitHub repo。
- GitHub CLI 已登入 `renewclincdaniel-coder`。
- 使用者已確認規格目錄 `specs/github-dashboard` 與目前帳號。
- spec.md、plan.md、tasks.md 均已獲使用者確認，T001–T009 已完成。
- 統計只讀取 repository metadata 與 commit 數值，不取得原始碼、patch、commit 訊息、email 或憑證。
- 對外建立與推送 repo 前，先完成可審閱成果；建議 PRIVATE `github-code-dashboard`。

## 已完成與驗證

- React／TypeScript／Vite Dashboard、Node／Express 本機服務、gh GraphQL 同步。
- 近一年 31 個非 fork repos 完整同步，partial=false；資料在忽略的 `.cache/report.json`。
- 台北日期歸日、固定 HEAD 分頁、作者 ID 篩選、merge 排除、去重、補零、CSV 與列印。
- 桌面／手機日期和 repo 篩選、趨勢圖、全年熱圖、排行、每日明細、載入與錯誤狀態。
- `npm.cmd test`：10 項通過；`npm.cmd run build`：型別與 build 通過。
- `npm.cmd run test:e2e`：桌面／手機 10 項通過（13.1s）。
- 真實統計核對：單一 repo 2026-10-02 為 3 commits、+1,821／-26，與獨立查詢一致。
- `node scripts/capture-preview.mjs`：1440px／390px 均無整頁溢出或 pageerror；已查看實際截圖。
- 預覽服務為 `http://127.0.0.1:4317`；若已停止，執行 `npm.cmd start`。
- `README.md` 提供完整安裝、資料規則、限制與驗證指令。

## 待辦

- Git 已初始化為 main；35 個 source／文件已暫存。快取、截圖與 build 均排除；憑證模式檢查 0 命中，`git diff --cached --check` 通過。
- 確認 PRIVATE repo 名稱與推送，建立後核對遠端 HEAD。
