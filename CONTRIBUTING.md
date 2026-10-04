# Contributing to GitRecord

Thank you for helping improve GitRecord. Start with the [English README](README.md)
or [繁體中文說明](README.zh-TW.md) for setup, statistics rules, and known limits.

## Report a bug or propose a feature

Open a [GitHub issue](https://github.com/danieltsai0423/gitrecord/issues) with:

- A short description and steps to reproduce.
- Expected and actual behavior.
- OS, Node.js version, browser, and the relevant commit or version.
- Whether the report is complete or partial, if the problem concerns statistics.
- Redacted screenshots or synthetic data when useful.

Do not attach tokens, authorization codes, credential exports, `.cache/` reports,
or screenshots containing private account or repository names. For security
vulnerabilities, use [SECURITY.md](SECURITY.md) instead of a public issue.

## Prepare a pull request

1. Fork the repository and create a branch for your change.
2. Install dependencies with `npm.cmd ci` on Windows.
3. Keep changes focused and follow the existing React / TypeScript conventions.
4. Add meaningful tests for changes to statistics, authentication, synchronization,
   or data boundaries. Use mocks and synthetic reports, not personal credentials.
5. Run `npm.cmd run validate` for code changes. Microsoft Edge is required for
   the current desktop / mobile E2E suite.
6. Keep English and Traditional Chinese documentation and UI strings consistent.
7. Describe the problem, resulting behavior, verification, and relevant limits.

For documentation-only changes, check links and displayed images; no new tests
are needed simply to reproduce the text. Rebuild and run `npm.cmd run docs:screenshots`
when updated UI images are required. This command safely generates masked demo
images without reading your cache or GitHub credentials.

## Preserve the data contract

- Keep report filtering independent of the account used for synchronization.
- Do not interpret missing data as zero activity or add old counts to a fresh sync.
- Preserve repository access boundaries and the App's read-only permissions.
- Keep access / refresh tokens out of browser responses, reports, URLs, and logs.
- Maintain source timestamps and coverage in exports.
- Treat activity volume as a descriptive statistic, not a productivity score.

Architecture and feature requirements are in `specs/`. The original specification
records historical scope; the current README and subsequent feature specs describe
current behavior.

Contributions are submitted under the repository's [MIT License](LICENSE).
