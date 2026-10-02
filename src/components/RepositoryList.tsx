import { IconGitBranch, IconLock } from "@tabler/icons-react";
import type { viewReport } from "../../shared/report";

type Ranked = ReturnType<typeof viewReport>["repositories"];

export function RepositoryList({
  repositories,
  onSelect,
}: {
  repositories: Ranked;
  onSelect: (name: string) => void;
}) {
  const visible = repositories
    .filter((repo) => repo.totals.commits > 0 || repo.status === "error")
    .slice(0, 6);
  const max = Math.max(1, ...visible.map((repo) => repo.totals.changed));
  return (
    <section className="panel repository-panel" id="repositories">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">REPOSITORIES</span>
          <h2>變更集中在哪裡</h2>
        </div>
        <span className="quiet-chip">
          {repositories.filter((repo) => repo.totals.commits > 0).length} 個活躍
          repo
        </span>
      </div>
      <div className="repository-list">
        {visible.length ? (
          visible.map((repo, index) => (
            <button
              className="repository-row"
              key={repo.fullName}
              onClick={() => onSelect(repo.fullName)}
              aria-label={`篩選 ${repo.name}`}
            >
              <span className="repo-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="repo-data">
                <div className="repo-name">
                  <span title={repo.fullName}>{repo.name}</span>
                  {repo.private && (
                    <IconLock size={13} aria-label="私人 repository" />
                  )}
                </div>
                <div className="repo-meta">
                  {repo.language && (
                    <>
                      <i
                        style={{ background: repo.languageColor ?? "#a9e0b0" }}
                      />
                      {repo.language}
                    </>
                  )}
                  <span>
                    <IconGitBranch size={12} />
                    {repo.branch ?? "空 repository"}
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
                  <span className="error-text" title={repo.error}>
                    同步失敗
                  </span>
                ) : (
                  <>
                    <strong>{repo.totals.changed.toLocaleString()}</strong>
                    <small>
                      <span className="positive">
                        +{repo.totals.additions.toLocaleString()}
                      </span>
                      <span className="negative">
                        −{repo.totals.deletions.toLocaleString()}
                      </span>
                    </small>
                  </>
                )}
              </div>
            </button>
          ))
        ) : (
          <div className="empty-inline">這段期間沒有 repository 活動。</div>
        )}
      </div>
      <div className="panel-footnote">
        依新增與刪除行數合計排序 · 顯示前 6 名
      </div>
    </section>
  );
}
