import { IconAlertTriangle, IconBrandGithub, IconRefresh } from "@tabler/icons-react";
import type { AccountReport } from "../../shared/report";
import { useLanguage } from "../i18n";
import type { useAuth } from "../useAuth";

export function CoverageNotice({ accounts, auth, syncRunning }: {
  accounts: AccountReport[];
  auth: ReturnType<typeof useAuth>;
  syncRunning: boolean;
}) {
  const { t } = useLanguage();
  const { status, loading, action, refresh, waitForInstallation } = auth;
  const active = status.accounts.find((account) => account.active)?.login;
  const busy = loading || status.running || syncRunning;
  const installationUrl = status.configuration?.configured
    ? `${status.configuration.appUrl}/installations/new` : null;
  const recheck = (login: string) => {
    if (busy) return;
    if (!status.accounts.some((account) => account.login === login)) void action("login");
    else if (active !== login) void action("switch", login);
    else void refresh(true);
  };
  return (
    <section className="notice notice-warning notice-coverage no-print" aria-label={t("資料涵蓋與修復")}>
      <IconAlertTriangle size={19} aria-hidden="true" />
      <div className="coverage-details">
        <strong>{t("部分帳號尚未涵蓋選取日期")}</strong>
        <p>{t("合計只包含已保存的活動；缺少的日期不代表零活動。")}</p>
        <p>{t("按「重新檢查」確認存取並同步；若尚未安裝 App，請先到 GitHub 選擇對應帳號設定 repo 存取。")}</p>
        <div className="coverage-accounts">
          {accounts.map(({ report }) => {
            const login = report.user.login;
            const connected = status.accounts.some((account) => account.login === login);
            const url = active === login && status.installation?.url
              ? status.installation.url : installationUrl;
            return (
              <div className="coverage-account" key={report.user.id ?? login}>
                <div className="coverage-account-summary">
                  <strong>{login}</strong>
                  <span>{t("資料涵蓋：{start} — {end}", { start: report.range.start, end: report.range.end })}</span>
                </div>
                <div className="coverage-actions">
                  {url && <a className="button button-quiet" href={url} target="_blank" rel="noopener noreferrer"
                    aria-label={t("開啟 {login} 的 GitHub 存取設定", { login })} onClick={() => {
                      if (active === login && status.installation?.state !== "ready" && !busy) waitForInstallation();
                    }}>
                    <IconBrandGithub size={15} />{t("GitHub 存取設定")}
                  </a>}
                  <button className="button button-quiet" disabled={busy} onClick={() => recheck(login)}
                    aria-label={t(connected ? "重新檢查並同步 {login}" : "連接 {login} 的 GitHub 帳號", { login })}>
                    <IconRefresh size={15} />{t(connected ? "重新檢查" : "連接帳號")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
