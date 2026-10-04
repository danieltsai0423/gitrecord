import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { reflectionMessages } from "./reflectionMessages";

export type Language = "zh-Hant" | "en";
const storageKey = "gitrecord-language";

const messages = {
  ...reflectionMessages,
  "切換為淺色模式": "Switch to light mode",
  "切換為深色模式": "Switch to dark mode",
  "開啟 {login} 的 GitHub 個人頁": "Open {login}'s GitHub profile",
  "（目前授權帳號）": " (authorized account)",
  "開啟 GitHub": "Open GitHub",
  "GitHub 帳號": "GitHub account",
  "個人工作空間": "Personal workspace",
  "工作空間": "Workspace",
  "Dashboard 導覽": "Dashboard navigation",
  "總覽": "Overview",
  "活動紀錄": "Activity",
  "每日報告": "Daily report",
  "資料來自你的 GitHub": "Your GitHub data",
  "透過 GitHub 授權同步，支援私人 repo。統計資料保留在這台電腦。": "Sync through GitHub authorization, including private repos. Statistics stay on this computer.",
  "本機資料": "Local data",
  "所有帳號合計": "All accounts combined",
  "{count} 個帳號的統計": "Accounts in this view: {count}",
  "個人帳號": "Personal account",
  "代碼的每一份進展": "Every line of progress",
  "看見每天的新增、修整，以及持續累積的軌跡。": "See your daily additions, edits, and progress over time.",
  "列印": "Print",
  "匯出 CSV": "Export CSV",
  "帳號：": "Accounts: ",
  "期間：": "Period: ",
  "全部 repositories": "All repositories",
  "部分資料": "Partial data",
  "完整資料": "Complete data",
  "各帳號資料時間：": "Data timestamps by account:",
  "涵蓋": "Coverage",
  "部分同步": "Partially synced",
  "同步失敗：": "Sync failed: ",
  "同步未完成": "Sync incomplete",
  " 畫面仍顯示上次保存的資料。": " The last saved data is still displayed.",
  "重試": "Retry",
  "部分資料 · {count} 個 repo 未完成同步": "Partial data · {count} repositories could not be synced",
  "部分帳號尚未涵蓋選取日期": "Some accounts do not cover the selected dates",
  "資料涵蓋與修復": "Data coverage and recovery",
  "合計只包含已保存的活動；缺少的日期不代表零活動。": "Totals include saved activity only. Missing dates do not mean zero activity.",
  "按「重新檢查」確認存取並同步；若尚未安裝 App，請先到 GitHub 選擇對應帳號設定 repo 存取。": "Choose “Check again” to verify access and sync. If the app is not installed, select the matching account on GitHub and set repository access first.",
  "資料涵蓋：{start} — {end}": "Data coverage: {start} — {end}",
  "開啟 {login} 的 GitHub 存取設定": "Open GitHub access settings for {login}",
  "GitHub 存取設定": "GitHub access settings",
  "重新檢查並同步 {login}": "Check and sync {login}",
  "連接 {login} 的 GitHub 帳號": "Connect GitHub account {login}",
  "連接帳號": "Connect account",
  "合計只包含已保存的活動；缺少的日期不代表零活動。請切換至該帳號並同步。": "Totals include saved activity only. Missing dates do not mean zero activity. Switch to the affected account and sync.",
  "正在同步": "Syncing",
  "正在載入你的工作空間": "Loading your workspace",
  "連接你的代碼軌跡": "Connecting your code history",
  "準備好查看你的 GitHub": "Explore your GitHub activity",
  "第一次同步會讀取近一年的 commit 統計，完成後就能查看完整報告。": "The first sync collects commit statistics for the past year. Your report will appear when it finishes.",
  "按上方「連接 GitHub 帳號」，完成授權並選擇 repositories 後便會自動同步，支援私人 repos。": "Choose “Connect GitHub account” above. Authorize the app and select repositories to sync automatically, including private repos.",
  "同步 GitHub 資料": "Sync GitHub data",
  "統計帳號": "View accounts",
  "篩選帳號": "Filter accounts",
  "統計期間": "Reporting period",
  "一年": "1 year",
  "{count} 天": "{count} days",
  "開始日期": "Start date",
  "結束日期": "End date",
  "篩選 Repository": "Filter Repository",
  "（同步失敗）": " (sync failed)",
  "（尚未登入）": "(not signed in)",
  "同步目前授權帳號 {login}，保留其他帳號的資料": "Sync the authorized account {login} and keep other accounts' data",
  "同步目前帳號": "Sync current account",
  "{count} 天的代碼活動": "{count} days of code activity",
  "已同步": "Synced",
  "最近更新": "Updated",
  "期間統計摘要": "Summary for the selected period",
  "新增行數": "Lines added",
  "刪除行數": "Lines deleted",
  "淨增行數": "Net change",
  "無前期資料": "No previous data",
  "與前期相同": "Same as previous period",
  "前期無活動": "No previous activity",
  "{value}% 較前期": "{value}% vs. previous period",
  "{count} 行總變更": "{count} total lines changed",
  "{active} 個活躍日 / {days} 天": "{active} active days / {days} days",
  "代碼變更趨勢": "Code change trends",
  "新增": "Added",
  "刪除": "Deleted",
  "行變更": "lines changed",
  "最高活動日 {date} · {count} 行": "Peak day {date} · {count} lines",
  "這段期間沒有 commit 活動": "No commit activity in this period",
  "載入趨勢圖…": "Loading chart…",
  "每日統計 · 包含全部文字檔案的新增與刪除": "Daily totals · Additions and deletions across all text files",
  "把每一天攤開來看": "A closer look at each day",
  "每日新增、刪除、淨增、變更及 commit 數量": "Daily additions, deletions, net change, total changes, and commits",
  "日期": "Date",
  "變更比例": "Change ratio",
  "{count} 行變更": "{count} lines changed",
  "期間合計": "Period total",
  "{count} 行": "{count} lines",
  "顯示 {shown} / {total} 天": "Showing {shown} / {total} days",
  "收合明細": "Collapse details",
  "查看全部日期": "Show all dates",
  "統計你在各 repo": "Counts your commits on each repository's",
  "預設分支": "default branch",
  "上的提交，排除 merge commits、fork 與其他作者。時間以 Asia/Taipei 計算。": ". Excludes merge commits, forks, and other authors. Dates use Asia/Taipei.",
  "共 {repos} 個 repo · 排除 {forks} 個 fork · 行數包含所有文字檔案，未合併分支與未關聯帳號的作者不計入。": "Repositories: {repos} · Excluded forks: {forks} · Line counts include all text files. Unmerged branches and authors not linked to the account are excluded.",
  "帳號同步狀態": "Account sync status",
  "展開帳號區塊": "Expand account panel",
  "收合帳號區塊": "Collapse account panel",
  "已保存 {count} 個帳號": "Saved accounts: {count}",
  "正在確認登入狀態…": "Checking sign-in status…",
  "目前授權帳號：{login}": "Authorized account: {login}",
  "尚未授權帳號，登入 GitHub 即可開始。": "No authorized account yet. Sign in with GitHub to get started.",
  "同步帳號": "Sync account",
  "切換登入帳號": "Switch signed-in account",
  "（目前）": " (current)",
  "切換並同步": "Switch and sync",
  "新增 GitHub 帳號": "Add GitHub account",
  "使用 GitHub 登入": "Sign in with GitHub",
  "連接 GitHub 帳號": "Connect GitHub account",
  "更新登入狀態": "Refresh sign-in status",
  "重新確認 GitHub 登入狀態": "Check GitHub sign-in status again",
  "正在切換登入帳號…": "Switching account…",
  "在 GitHub 確認授權": "Authorize on GitHub",
  "正在準備 GitHub OAuth 授權…": "Preparing GitHub OAuth authorization…",
  "授權碼：": "Authorization code: ",
  "GitHub 授權碼": "GitHub authorization code",
  "請確認 GitHub 頁面的授權應用與設定的 OAuth App 相符，並選擇要新增的帳號；完成授權後會自動同步。": "Check that the authorization app on GitHub matches your configured OAuth App, then select the account to add. Sync starts automatically after authorization.",
  "私人 repo 統計需要 GitHub 的 repo 權限，該權限包含讀寫；GitRecord 僅查詢統計，不修改 repository。": "Private repository statistics require GitHub's repo scope, which includes read and write access. GitRecord only reads statistics and never modifies repositories.",
  "OAuth 設定": "OAuth settings",
  "GitHub App 設定": "GitHub App settings",
  "設定 GitRecord 的 GitHub App": "Set up GitRecord's GitHub App",
  "發布者只需設定一次 GitHub App。一般使用者沿用預設設定，連接帳號並選擇 repos 即可；不需要 client secret 或私鑰。": "The publisher sets up the GitHub App once. Users connect their account and select repos using the default settings. No client secret or private key is needed.",
  "建立 GitHub App": "Create a GitHub App",
  "GitHub App 公開頁網址": "GitHub App public URL",
  "請確認 GitHub 頁面的應用與設定的 GitHub App 相符，只輸入此頁產生的授權碼。": "Check that the app on GitHub matches your configured GitHub App. Only enter a code generated on this page.",
  "GitRecord 使用 repository 唯讀權限；連接帳號後會檢查存取範圍，完成後自動同步。": "GitRecord uses read-only repository permissions. After connecting your account, it checks access and syncs automatically when ready.",
  "已連接 · {count} 個可統計的 repo": "Connected · Repositories available: {count}",
  "管理 repo 存取範圍": "Manage repository access",
  "選擇要統計的 repositories": "Select repositories to include",
  "正在確認 App 的安裝與存取權限，請重新檢查。": "The app's installation and access are not yet confirmed. Check again.",
  "App 安裝已暫停，請在 GitHub 恢復存取。": "The app installation is suspended. Restore access on GitHub.",
  "App 權限尚未符合唯讀設定，請發布者檢查 Contents 權限。": "The app permissions do not match the read-only setup. Ask the publisher to check Contents permissions.",
  "只需首次在 GitHub 選擇 repositories。完成後此頁會自動同步，不用到 Developer settings 設定。": "Select repositories on GitHub once. This page syncs automatically when ready. No Developer settings are needed.",
  "請在 GitHub 選擇 {login} 的個人帳號。": "Select the personal account for {login} on GitHub.",
  "前往 GitHub 選擇 repos": "Select repos on GitHub",
  "重新檢查": "Check again",
  "正在等待 GitHub 完成設定…": "Waiting for GitHub setup…",
  "停止等待": "Stop waiting",
  "移除登入": "Remove sign-in",
  "設定 GitRecord 的 OAuth 應用": "Set up GitRecord's OAuth App",
  "發布者只需建立一次 OAuth App，啟用 Device Flow，並填入公開的 Client ID。不需要 client secret；一般使用者可沿用發布者的設定。": "The publisher registers an OAuth App once, enables Device Flow, and supplies its public Client ID. No client secret is needed. Users can use the publisher's configuration.",
  "建立 GitHub OAuth App": "Create a GitHub OAuth App",
  "保存設定": "Save settings",
  "系統憑證庫無法使用，授權只保留在本次執行；重新啟動後需再次登入。統計資料仍保存在本機。": "The system credential store is unavailable. Authorization lasts for this session only; sign in again after restarting. Statistics are still saved locally.",
  "複製授權碼並開啟 GitHub": "Copy code and open GitHub",
  "若無法自動複製，可手動複製上方授權碼；登入與雙重驗證都在 GitHub 完成。": "If copying fails, copy the code above manually. Sign-in and two-factor authentication take place on GitHub.",
  "取消登入": "Cancel sign-in",
  "同步失敗 · 保留上次資料": "Sync failed · Previous data kept",
  "最後同步：": "Last sync: ",
  "涵蓋：{start} — {end} · {count} 個 repo": "Coverage: {start} — {end} · Repositories: {count}",
  "變更集中在哪裡": "Where changes happen",
  "{count} 個活躍 repo": "Active repositories: {count}",
  "篩選 {name}": "Filter {name}",
  "私人 repository": "Private repository",
  "空 repository": "Empty repository",
  "同步失敗": "Sync failed",
  "這段期間沒有 repository 活動。": "No repository activity in this period.",
  "依新增與刪除行數合計排序 · 顯示前 6 名": "Ranked by additions plus deletions · Top 6",
  "每日新增與刪除行數趨勢，完整數值可於每日明細查看": "Daily additions and deletions. Exact values are available in the daily breakdown.",
  "每一日的積累": "Activity, day by day",
  "{count} 個活躍日": "Active days: {count}",
  "全年代碼活動熱圖，點選日期查看當日資料": "Annual code activity heatmap. Select a date to view that day's data.",
  "{date}：新增 {added} 行、刪除 {deleted} 行、{commits} commits，查看當日": "{date}: {added} lines added, {deleted} lines deleted, {commits} commits. View this day.",
  "{date} · {changed} 行變更 · {commits} commits": "{date} · {changed} lines changed · {commits} commits",
  "{start} — {end} · 點選一天查看明細": "{start} — {end} · Select a day for details",
  "少": "Less",
  "多": "More",
  "最近涵蓋日期：{date}。完整統計可匯出 CSV。": "Latest covered date: {date}. Export CSV for complete statistics.",
} as const;

// API responses and saved reports keep their original messages. Translate them
// at display time so switching languages never restarts a sync or sign-in.
const serviceMessages: Record<string, string> = {
  "無效的 GitHub App ID。": "Invalid GitHub App ID.",
  "請填入有效的 GitHub App 公開頁網址。": "Enter a valid GitHub App public URL.",
  "GitHub App 設定由環境變數提供，請更新啟動設定。": "GitHub App settings are provided by environment variables. Update the startup configuration.",
  "GitHub App 設定已保存，可以連接帳號。": "GitHub App settings saved. You can now connect an account.",
  "請先設定 GitRecord 的 GitHub App 資訊。": "Set up GitRecord's GitHub App first.",
  "GitHub 帳號已連接。": "GitHub account connected.",
  "GitHub App 安裝已暫停，請在 GitHub 恢復存取。": "The GitHub App installation is suspended. Restore access on GitHub.",
  "請先在 GitHub App 安裝設定選擇要統計的 repositories。": "Select repositories in the GitHub App installation settings first.",
  "無法讀取 GitHub App 安裝狀態，請確認權限並重試。": "Unable to read GitHub App installation status. Check permissions and try again.",
  "GitHub App ID、Client ID 與公開頁網址不一致，請檢查設定。": "The GitHub App ID, Client ID, and public URL do not match. Check the settings.",
  "請將 GitHub App 的 Contents 設為 Read-only，並移除寫入權限。": "Set the GitHub App's Contents permission to Read-only and remove write permissions.",
  "GitHub App 存取範圍在查詢期間改變，請重新同步。": "GitHub App access changed during the query. Sync again.",
  "GitHub App 回傳其他帳號的 repository，已停止同步。": "The GitHub App returned a repository owned by another account. Sync stopped.",
  "GitHub App 清單過大，請縮小存取範圍後重試。": "The GitHub App list is too large. Reduce access and try again.",
  "請在 GitHub App 設定啟用 Device Flow。": "Enable Device Flow in the GitHub App settings.",
  "等待安裝已逾時，完成後請按「重新檢查」。": "Waiting for installation timed out. Choose “Check again” after setup is complete.",
  "無法移除本機授權憑證，請重試。": "Unable to remove the local credential. Please retry.",
  "OAuth 設定無效，請檢查 oauth.config.json。": "Invalid OAuth configuration. Check oauth.config.json.",
  "無效的 OAuth Client ID。": "Invalid OAuth Client ID.",
  "無法保存 OAuth 設定，請確認本機資料夾可寫入。": "Unable to save OAuth settings. Check that the local folder is writable.",
  "請在 GitHub OAuth App 設定啟用 Device Flow。": "Enable Device Flow in the GitHub OAuth App settings.",
  "OAuth Client ID 無效，請檢查應用設定。": "Invalid OAuth Client ID. Check the app settings.",
  "GitHub 登入失效，請重新新增帳號授權。": "GitHub authorization has expired. Add the account again to authorize it.",
  "授權帳號與保存的身份不一致，請重新授權。": "The authorized account does not match the saved identity. Authorize it again.",
  "OAuth Client ID 由環境變數提供，請更新啟動設定。": "The OAuth Client ID is set by an environment variable. Update the startup configuration.",
  "OAuth 應用設定已保存，可以登入 GitHub。": "OAuth App settings saved. You can now sign in with GitHub.",
  "請先設定 GitRecord 的 OAuth Client ID。": "Set up GitRecord's OAuth Client ID first.",
  "已移除本機登入，保存的統計資料仍保留。": "Local sign-in removed. Saved statistics are still kept.",
  "無法取得 GitHub 登入狀態，請重新整理。": "Unable to load GitHub sign-in status. Refresh the page.",
  "授權連線中斷": "Authorization connection interrupted",
  "無法開始 GitHub 授權。": "Unable to start GitHub authorization.",
  "GitHub 授權失敗": "GitHub authorization failed",
  "GitHub 授權失敗，請重試。": "GitHub authorization failed. Please retry.",
  "無法取得登入帳號": "Unable to load signed-in accounts",
  "無法取得報告，請確認本機服務正在執行。": "Unable to load the report. Check that the local service is running.",
  "無法讀取同步狀態。": "Unable to read sync status.",
  "無法開始同步，請確認本機服務。": "Unable to start syncing. Check the local service.",
  "無法取得同步狀態。": "Unable to load sync status.",
  "無法載入報告": "Unable to load the report",
  "無法讀取同步進度。": "Unable to read sync progress.",
  "連線中斷": "Connection interrupted",
  "只允許本機存取。": "Only local access is allowed.",
  "拒絕跨來源的本機 API 請求。": "Cross-origin local API requests are blocked.",
  "尚未同步 GitHub 資料。": "GitHub data has not been synced yet.",
  "同步或帳號操作正在進行，請完成後再新增帳號。": "Wait for the current sync or account operation to finish before adding an account.",
  "同步或帳號操作正在進行，請完成後再切換帳號。": "Wait for the current sync or account operation to finish before switching accounts.",
  "無效的 GitHub 帳號。": "Invalid GitHub account.",
  "同步或帳號操作已在進行中。": "A sync or account operation is already running.",
  "準備同步": "Preparing sync",
  "同步失敗，請重試。": "Sync failed. Please retry.",
  "無法保存失敗狀態，原報告仍保留。": "Unable to save the failure status. The previous report is still kept.",
  "授權已取消。": "Authorization canceled.",
  "GitHub 授權或查詢逾時，請重試。": "GitHub authorization or query timed out. Please retry.",
  "GitHub 授權已逾時，請重新新增帳號。": "GitHub authorization timed out. Add the account again.",
  "GitHub 授權未獲允許，請重試。": "GitHub authorization was denied. Please retry.",
  "尚未登入 GitHub，請按「新增 GitHub 帳號」。": "You are not signed in to GitHub. Choose “Add GitHub account”.",
  "GitHub 授權或帳號查詢失敗，請重試。": "GitHub authorization or account lookup failed. Please retry.",
  "GitHub 授權完成，可以同步此帳號。": "GitHub authorization complete. This account can now be synced.",
  "此帳號尚未登入，請先新增 GitHub 帳號。": "This account is not signed in. Add it first.",
  "帳號操作已在進行中。": "An account operation is already running.",
  "快取格式無效；請將 .cache/report.json 移至備份位置後重新同步。": "Invalid cache format. Back up .cache/report.json, then sync again.",
  "快取包含重複帳號，請先備份後重新同步。": "The cache contains duplicate accounts. Back it up, then sync again.",
  "無效的提交時間": "Invalid commit timestamp",
  "無效的日期": "Invalid date",
  "開始日期不能晚於結束日期": "The start date cannot be later than the end date",
  "最多支援 366 日": "The maximum supported range is 366 days",
  "GitHub 回傳無效的行數": "GitHub returned an invalid line count",
  "日期超出資料涵蓋範圍": "The date is outside the available coverage",
  "找不到指定的 repository": "The selected repository was not found",
  "GitHub API 已達速率上限，請稍後重試。": "GitHub API rate limit reached. Try again later.",
  "GitHub 連線逾時或網路不可用，請稍後重試。": "GitHub connection timed out or the network is unavailable. Try again later.",
  "GitHub 查詢失敗，請確認登入帳號與 repository 讀取權限。": "GitHub query failed. Check the signed-in account and repository permissions.",
  "GitHub 查詢逾時，請稍後重試。": "GitHub query timed out. Try again later.",
  "GitHub 回應過大，無法完成查詢。": "The GitHub response is too large to complete the query.",
  "GitHub 回傳無效資料，請重試。": "GitHub returned invalid data. Please retry.",
  "GitHub 分頁游標重複或缺失，已停止避免漏計。": "GitHub pagination returned a duplicate or missing cursor. Sync stopped to avoid incomplete counts.",
  "讀取帳號與 repository 清單": "Loading account and repositories",
  "讀取 repository 清單": "Loading repositories",
  "已確認登入帳號": "Account confirmed",
  "同步途中 GitHub 帳號變更，請重新同步；本次資料未保存。": "The GitHub account changed during sync. This report was not saved. Sync again.",
  "同步途中 GitHub 帳號變更，請重新同步。": "The GitHub account changed during sync. Sync again.",
  "GitHub 未回傳帳號。": "GitHub did not return an account.",
  "無法讀取預設分支的 commit 歷史。": "Unable to read commit history from the default branch.",
  "所有 repositories 同步失敗；請確認網路、API 額度與帳號權限。": "All repositories failed to sync. Check the network, API limits, and account permissions.",
};
// Old caches may retain CLI failure messages. Give current recovery steps in
// either language without changing historical report data.
const legacyMessages: Record<string, string> = {
  "GitHub CLI 回應過大，請重試。": "GitHub 回應過大，無法完成查詢。",
  "無法啟動 GitHub CLI，請確認已安裝 gh。": "尚未登入 GitHub，請按「新增 GitHub 帳號」。",
  "無法啟動 GitHub CLI，請先安裝 gh 並執行 gh auth login。": "尚未登入 GitHub，請按「新增 GitHub 帳號」。",
  "GitHub CLI 回傳無效的帳號清單。": "GitHub 授權或帳號查詢失敗，請重試。",
  "無法將查詢傳送至 GitHub CLI。": "GitHub 查詢失敗，請確認登入帳號與 repository 讀取權限。",
  "GitHub 登入失效，請在終端機執行 gh auth login。": "GitHub 登入失效，請重新新增帳號授權。",
  "目前以環境變數指定 GitHub 帳號，無法由網頁新增或切換帳號。": "尚未登入 GitHub，請按「新增 GitHub 帳號」。",
};
const serviceEntries = Object.entries({ "同步失敗": "Sync failed", ...serviceMessages }).sort(([a], [b]) => b.length - a.length);
type MessageKey = keyof typeof messages;
type Params = Record<string, string | number>;

export function readLanguage(): Language {
  try { return localStorage.getItem(storageKey) === "en" ? "en" : "zh-Hant"; }
  catch { return "zh-Hant"; }
}

export function applyLanguage(language: Language) {
  document.documentElement.lang = language;
  document.title = language === "en" ? "GitRecord · GitHub Activity" : "GitRecord · GitHub 活動紀錄";
  document.querySelector('meta[name="description"]')?.setAttribute("content", language === "en"
    ? "Your GitHub daily code additions, deletions, activity heatmap, and repository statistics."
    : "你的 GitHub 每日代碼增刪行數、活動熱圖與 repository 統計報告。");
}

function createLocale(language: Language) {
  const locale = language === "en" ? "en-US" : "zh-TW";
  const t = (key: MessageKey, params: Params = {}) => {
    const template = language === "en" ? messages[key] : key;
    return template.replace(/\{(\w+)\}/g, (match, name: string) => String(params[name] ?? match));
  };
  const number = (value: number) => value.toLocaleString(locale);
  const shortDate = (value: string) => language === "en"
    ? new Date(`${value}T00:00:00+08:00`).toLocaleDateString(locale, { timeZone: "Asia/Taipei", month: "short", day: "numeric" })
    : `${Number(value.slice(5, 7))}月${Number(value.slice(8))}日`;
  const syncTime = (value: string, withYear = true) => new Date(value).toLocaleString(locale, {
    timeZone: "Asia/Taipei", ...(withYear ? { year: "numeric" as const } : {}),
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const message = (value: string | undefined | null) => {
    if (!value) return "";
    for (const [old, current] of Object.entries(legacyMessages)) value = value.replaceAll(old, current);
    if (language !== "en") return value;
    let translated = value.replace(/^已切換至 (.+)，可以同步此帳號。$/, "Switched to $1. This account can now be synced.");
    for (const [source, english] of serviceEntries) translated = translated.replaceAll(source, english);
    return translated;
  };
  return { language, locale, t, number, shortDate, syncTime, message };
}

const LanguageContext = createContext({ ...createLocale("zh-Hant"), toggleLanguage: () => {} });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState(readLanguage);
  const value = useMemo(() => ({ ...createLocale(language), toggleLanguage: () => {
    const next = language === "en" ? "zh-Hant" : "en";
    applyLanguage(next);
    try { localStorage.setItem(storageKey, next); } catch { /* Still switch when storage is blocked. */ }
    setLanguage(next);
  } }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);
