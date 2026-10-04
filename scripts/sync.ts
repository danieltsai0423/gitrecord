import { syncGithub } from "../server/github.js";
import { loadReport, saveReport } from "../server/app.js";
import { AuthManager } from "../server/auth.js";
import {
  accountFailure, updateAccount, viewReport, type Report, type ReportStore,
} from "../shared/report.js";

let user: Report["user"] | undefined;
let syncing = true;
const attemptedAt = new Date().toISOString();
let store: ReportStore = { version: 2, accounts: [] };
try {
  store = (await loadReport()) ?? store;
  const auth = new AuthManager();
  const source = await auth.source();
  const report = await syncGithub(source.query, (done, total, current, account) => {
    if (account) user = account;
    console.log(`[${done}/${total}] ${user ? `${user.login} / ` : ""}${current}`);
  }, new Date(), source.repositoryIds);
  syncing = false;
  const next = updateAccount(store, report);
  await saveReport(next);
  console.log(
    JSON.stringify(
      {
        account: report.user.login,
        savedAccounts: next.accounts.map((account) => account.report.user.login),
        repositories: report.repositories.length,
        partial: report.partial,
        range: report.range,
        totals: viewReport(report, report.range.start, report.range.end).totals,
      },
      null,
      2,
    ),
  );
} catch (error) {
  const message = error instanceof Error ? error.message : "同步失敗";
  if (syncing && user && store.accounts.length > 0) {
    try {
      await saveReport(accountFailure(store, user, message, attemptedAt));
    } catch {
      console.error("無法保存失敗狀態，原報告仍保留。");
    }
  }
  console.error(message);
  process.exitCode = 1;
}
