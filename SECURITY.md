# Security policy

## Supported source

Security fixes are maintained on the current `main` branch. Use the latest source;
older snapshots do not have a separate maintenance guarantee.

## Report a vulnerability privately

Use GitHub's **[Report a vulnerability](https://github.com/danieltsai0423/gitrecord/security/advisories/new)**
to send a private report. Do not disclose exploit details in public issues or PRs
before the report has been assessed.

Include the affected commit, operating system, Node.js version, reproduction
steps, expected impact, and a minimal example using synthetic data. Do not send
live access tokens, refresh tokens, authorization codes, credential exports, or
private repository data.

Normal functional bugs and feature requests belong in
[GitHub Issues](https://github.com/danieltsai0423/gitrecord/issues).

## Scope and data handling

GitRecord is a single-user loopback application. Relevant security boundaries
include GitHub App installation access, identity checks during synchronization,
OS credential storage, local API origin / Host validation, and accidental disclosure
through reports or exports. It is not designed as an authenticated public website.

The [README](README.md#privacy-and-security) describes current storage and permission
behavior. Keep `.cache/` and real-data screenshots out of Git. If a token is exposed,
revoke its GitHub App authorization or installation as appropriate; deleting a file
alone does not revoke access.

## 繁體中文

資安問題請使用上方 **Report a vulnerability** 私下通報，不要先公開 exploit。
請提供影響的 commit、環境、重現步驟與範例資料，不要附上真人 token、授權碼、
憑證或私人專案資料。一般功能問題請至 GitHub Issues。

目前維護 `main` 分支；程式供單一使用者在本機執行。資料保存與權限詳見
[繁體中文 README](README.zh-TW.md#隱私與安全)。
