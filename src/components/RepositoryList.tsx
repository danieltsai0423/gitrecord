import { IconGitBranch, IconLock } from "@tabler/icons-react";
import type { viewReport } from "../../shared/report";
import { useLanguage } from "../i18n";

type Ranked = ReturnType<typeof viewReport>["repositories"];

export function RepositoryList({
  repositories,
  onSelect,
  showOwner = false,
}: {
  repositories: Ranked;
  onSelect: (name: string) => void;
  showOwner?: boolean;
}) {
  const { t, number, message } = useLanguage();
  const visible = repositories
    .filter((repo) => repo.totals.commits > 0 || repo.status === "error")
    .slice(0, 6);
  const max = Math.max(1, ...visible.map((repo) => repo.totals.changed));
  return (
    <section className="panel repository-panel" id="repositories">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">REPOSITORIES</span>
          <h2>{t("變更集中在哪裡")}</h2>
        </div>
        <span className="quiet-chip">
          {t("{count} 個活躍 repo", { count: repositories.filter((repo) => repo.totals.commits > 0).length })}
        </span>
      </div>
      <div className="repository-list">
        {visible.length ? (
          visible.map((repo, index) => (
            <button
              className="repository-row"
              key={repo.fullName}
              onClick={() => onSelect(repo.fullName)}
              aria-label={t("篩選 {name}", { name: repo.name })}
            >
              <span className="repo-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="repo-data">
                <div className="repo-name">
                  <span title={repo.fullName}>{showOwner ? repo.fullName : repo.name}</span>
                  {repo.private && (
                    <IconLock size={13} aria-label={t("私人 repository")} />
                  )}
                </div>
                <div className="repo-meta">
                  {repo.language && (
                    <>
                      <i
                        style={{ background: repo.languageColor ?? "var(--green)" }}
                      />
                      {repo.language}
                    </>
                  )}
                  <span>
                    <IconGitBranch size={12} />
                    {repo.branch ?? t("空 repository")}
                  </span>
                </div>
                <div className="repo-bar-track">
                  <span
                    style={{ width: `${(repo.totals.changed / max) * 100}%` }}
                  >
                    <i style={{ flex: repo.totals.additions || 0 }} />
                    <i style={{ flex: repo.totals.deletions || 0 }} />
                  </span>
                </div>
              </div>
              <div className="repo-values">
                {repo.status === "error" ? (
                  <span className="error-text" title={message(repo.error)}>
                    {t("同步失敗")}
                  </span>
                ) : (
                  <>
                    <strong>{number(repo.totals.changed)}</strong>
                    <small>
                      <span className="positive">
                        +{number(repo.totals.additions)}
                      </span>
                      <span className="negative">
                        −{number(repo.totals.deletions)}
                      </span>
                    </small>
                  </>
                )}
              </div>
            </button>
          ))
        ) : (
          <div className="empty-inline">{t("這段期間沒有 repository 活動。")}</div>
        )}
      </div>
      <div className="panel-footnote">
        {t("依新增與刪除行數合計排序 · 顯示前 6 名")}
      </div>
    </section>
  );
}
