# Documentation screenshots

These images show GitRecord with deterministic synthetic data. They contain no
real account activity, local reports, OAuth tokens, or user credentials.
Every account and project label is replaced with an opaque mask before capture,
including public project names. The capture script rejects unmasked labels,
unexpected API requests, page errors, and page overflow.

The English dark and Traditional Chinese light overview images show the page
from its header through the full code-change trend and annual activity heatmap.
Their height follows the heatmap's bottom edge rather than a fixed viewport.
Review & rhythm appears below the daily report and last in the sidebar; its
review, account-comparison, and goals images are captured separately.

Regenerate on Windows with Microsoft Edge installed:

```powershell
npm.cmd run build
npm.cmd run docs:screenshots
```

The script serves the built frontend on a temporary loopback port and mocks its
API. It does not start the application's backend, read `.cache/`, or connect to
GitHub. Images are saved here; live-data preview artifacts remain gitignored.
