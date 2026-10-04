import { IconBrandGithub, IconRefresh, IconChevronUp, IconChevronDown } from "@tabler/icons-react";
import { useEffect, useId, useState } from "react";
import type { AccountReport } from "../../shared/report";
import type { useAuth } from "../useAuth";
import { useLanguage } from "../i18n";

const collapseStorageKey = "gitrecord-account-panel-collapsed";
function readCollapsed() {
  try { return localStorage.getItem(collapseStorageKey) === "true"; }
  catch { return false; }
}

export function AccountPanel({ accounts, auth, syncRunning }: {
  accounts: AccountReport[];
  auth: ReturnType<typeof useAuth>;
  syncRunning: boolean;
}) {
  const { t, syncTime, message } = useLanguage();
  const { status, loading, action, refresh, configure, waitingForInstallation, waitForInstallation, stopWaiting } = auth;
  const [clientId, setClientId] = useState("");
  const [appId, setAppId] = useState("");
  const [appUrl, setAppUrl] = useState("");
  const [editConfig, setEditConfig] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const panelId = useId();
  const needsConfig = status.configuration?.configured === false;
  const installation = status.installation;
  const active = status.accounts.find((account) => account.active)?.login;
  const [selectedLogin, setSelectedLogin] = useState("");
  const login = status.accounts.some((account) => account.login === selectedLogin) ? selectedLogin : active ?? status.accounts[0]?.login ?? "";
  const busy = loading || status.running || syncRunning;
  const needsConnection = !loading && status.accounts.length === 0;
  const needsInstallation = !loading && Boolean(active) && installation?.state !== "ready";
  const loginInProgress = status.running && status.operation === "login";
  const switchingAccount = status.running && status.operation === "switch";
  useEffect(() => {
    if (needsConfig || needsConnection || needsInstallation || loginInProgress || switchingAccount ||
      status.error || editConfig || waitingForInstallation) setCollapsed(false);
  }, [needsConfig, needsConnection, needsInstallation, loginInProgress, switchingAccount,
    status.code, status.error, editConfig, waitingForInstallation]);
  const togglePanel = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(collapseStorageKey, String(next)); }
    catch { /* The toggle still works without browser storage. */ }
  };
  const toggleLabel = t(collapsed ? "展開帳號區塊" : "收合帳號區塊");
  const authorize = () => {
    if (!status.code || status.verificationUrl !== "https://github.com/login/device") return;
    void navigator.clipboard?.writeText(status.code).catch(() => {});
    window.open(status.verificationUrl, "_blank", "noopener,noreferrer");
  };
  return (
    <section className="account-panel no-print" aria-label={t("帳號同步狀態")}>
      <div className="account-heading">
        <div>
          <strong><IconBrandGithub size={17} /> {t("已保存 {count} 個帳號", { count: accounts.length })}</strong>
          <p>{loading ? t("正在確認登入狀態…") : active ? t("目前授權帳號：{login}", { login: active }) : t("尚未授權帳號，登入 GitHub 即可開始。")}</p>
        </div>
        <div className="account-actions" id={`${panelId}-actions`} hidden={collapsed}>
          {status.accounts.length > 0 && <>
            <label htmlFor="login-account">{t("同步帳號")}</label>
            <select id="login-account" aria-label={t("切換登入帳號")} value={login} onChange={(event) => setSelectedLogin(event.target.value)} disabled={busy}>
              {status.accounts.map((account) => <option key={account.login} value={account.login}>{account.login}{account.active ? t("（目前）") : ""}</option>)}
            </select>
            <button className="button button-quiet" disabled={busy || !login || login === active} onClick={() => void action("switch", login)}>{t("切換並同步")}</button>
          </>}
          <button className="button button-primary" disabled={busy || needsConfig} onClick={() => void action("login")}>
            <IconBrandGithub size={16} />{t(status.accounts.length ? "新增 GitHub 帳號" : "連接 GitHub 帳號")}
          </button>
          <button className="button button-quiet icon-button" aria-label={t("更新登入狀態")} title={t("重新確認 GitHub 登入狀態")} disabled={busy} onClick={() => void refresh()}>
            <IconRefresh size={16} />
          </button>
          <button className="button button-quiet" disabled={busy} onClick={() => {
            setClientId(status.configuration?.clientId ?? ""); setAppId(status.configuration?.appId ?? "");
            setAppUrl(status.configuration?.appUrl ?? ""); setEditConfig(!editConfig);
          }}>{t("GitHub App 設定")}</button>
          {status.accounts.length > 0 && <button className="button button-quiet" disabled={busy || !login}
            onClick={() => void action("forget", login)}>{t("移除登入")}</button>}
        </div>
        <button className="button button-quiet account-panel-toggle" aria-label={toggleLabel} title={toggleLabel}
          aria-expanded={!collapsed} aria-controls={`${panelId}-actions ${panelId}-details`} onClick={togglePanel}>
          {collapsed ? <IconChevronDown size={19} /> : <IconChevronUp size={19} />}
        </button>
      </div>
      <div className="account-panel-details" id={`${panelId}-details`} hidden={collapsed}>
      {(needsConfig || editConfig) && <form className="oauth-config" onSubmit={(event) => {
        event.preventDefault(); void configure({ clientId: clientId.trim(), appId: appId.trim(), appUrl: appUrl.trim() }).then((saved) => { if (saved) setEditConfig(false); });
      }}>
        <strong>{t("設定 GitRecord 的 GitHub App")}</strong>
        <p>{t("發布者只需設定一次 GitHub App。一般使用者沿用預設設定，連接帳號並選擇 repos 即可；不需要 client secret 或私鑰。")}</p>
        <p><a href="https://github.com/settings/apps/new" target="_blank" rel="noopener noreferrer">{t("建立 GitHub App")}</a></p>
        <label htmlFor="github-app-id">App ID</label>
        <div className="oauth-config-fields">
          <input id="github-app-id" value={appId} onChange={(event) => setAppId(event.target.value)}
            placeholder={status.configuration?.appId || "App ID"} inputMode="numeric" pattern="[1-9][0-9]{0,15}" required disabled={busy} />
        </div>
        <label htmlFor="oauth-client-id">Client ID</label>
        <div className="oauth-config-fields">
          <input id="oauth-client-id" value={clientId} onChange={(event) => setClientId(event.target.value)}
            placeholder={status.configuration?.clientId || "Client ID"} minLength={10} maxLength={100}
            pattern="[a-zA-Z0-9._-]{10,100}" autoComplete="off" required disabled={busy} />
        </div>
        <label htmlFor="github-app-url">{t("GitHub App 公開頁網址")}</label>
        <div className="oauth-config-fields">
          <input id="github-app-url" type="url" value={appUrl} onChange={(event) => setAppUrl(event.target.value)}
            placeholder={status.configuration?.appUrl || "https://github.com/apps/your-app"} required disabled={busy} />
          <button className="button button-primary" disabled={busy}>{t("保存設定")}</button>
        </div>
      </form>}
      {status.configuration?.storage === "session" && <p role="status">
        {t("系統憑證庫無法使用，授權只保留在本次執行；重新啟動後需再次登入。統計資料仍保存在本機。")}
      </p>}
      {status.running && <div className="oauth-state" role="status">
        {status.operation === "refresh" ? <p>{t("正在確認登入狀態…")}</p> : status.operation === "switch" ? <p>{t("正在切換登入帳號…")}</p> : <>
          <strong>{t(status.code ? "在 GitHub 確認授權" : "正在準備 GitHub OAuth 授權…")}</strong>
          {status.code && <>
            <p>{t("授權碼：")}<code aria-label={t("GitHub 授權碼")}>{status.code}</code></p>
            <p>{t("請確認 GitHub 頁面的應用與設定的 GitHub App 相符，只輸入此頁產生的授權碼。")}</p>
            <p>{t("GitRecord 使用 repository 唯讀權限；連接帳號後會檢查存取範圍，完成後自動同步。")}</p>
            <button className="button button-primary" onClick={authorize}>{t("複製授權碼並開啟 GitHub")}</button>
            <p>{t("若無法自動複製，可手動複製上方授權碼；登入與雙重驗證都在 GitHub 完成。")}</p>
          </>}
          <button className="button button-quiet" disabled={loading} onClick={() => void action("cancel")}>{t("取消登入")}</button>
        </>}
      </div>}
      {!needsConfig && active && installation && !status.running && <div className="oauth-state installation-state" role="status">
        {installation.state === "ready" ? <>
          <p className="positive">{t("已連接 · {count} 個可統計的 repo", { count: installation.repositoryCount })}</p>
          <a href={installation.url} target="_blank" rel="noopener noreferrer">{t("管理 repo 存取範圍")}</a>
        </> : <>
          <strong>{t("選擇要統計的 repositories")}</strong>
          <p>{t(installation.state === "unknown" ? "正在確認 App 的安裝與存取權限，請重新檢查。" :
            installation.state === "suspended" ? "App 安裝已暫停，請在 GitHub 恢復存取。" :
            installation.state === "permissions" ? "App 權限尚未符合唯讀設定，請發布者檢查 Contents 權限。" :
            "只需首次在 GitHub 選擇 repositories。完成後此頁會自動同步，不用到 Developer settings 設定。")}</p>
          <p>{t("請在 GitHub 選擇 {login} 的個人帳號。", { login: active })}</p>
          <a className="button button-primary" href={installation.url} target="_blank" rel="noopener noreferrer" onClick={waitForInstallation}>{t("前往 GitHub 選擇 repos")}</a>
          <button className="button button-quiet" disabled={busy} onClick={() => void refresh()}>{t("重新檢查")}</button>
        </>}
        {waitingForInstallation && <>
          <p>{t("正在等待 GitHub 完成設定…")}</p>
          <button className="button button-quiet" onClick={stopWaiting}>{t("停止等待")}</button>
        </>}
      </div>}
      {status.error && <p className="error-text" role="alert">{message(status.error)}</p>}
      {status.message && <p role="status">{message(status.message)}</p>}
      {accounts.length > 0 && <div className="account-cards">
        {accounts.map(({ report, lastAttemptAt, syncError }) => (
          <div className="account-card" key={report.user.id ?? report.user.login}>
            <div>
              <a href={report.user.url || `https://github.com/${report.user.login}`} target="_blank" rel="noreferrer">
                {report.user.login}
              </a>
              <span className={syncError || report.partial ? "error-text" : "positive"}>
                {t(syncError ? "同步失敗 · 保留上次資料" : report.partial ? "部分同步" : "已同步")}
              </span>
            </div>
            <p>{t("最後同步：")}{syncTime(report.generatedAt)}</p>
            <p>{t("涵蓋：{start} — {end} · {count} 個 repo", { start: report.range.start, end: report.range.end, count: report.repositories.length })}</p>
            {syncError && <p className="error-text">{syncTime(lastAttemptAt)}: {message(syncError)}</p>}
          </div>
        ))}
      </div>}
      </div>
    </section>
  );
}
