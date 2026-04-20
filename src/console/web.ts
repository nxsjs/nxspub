/**
 * @en Build the preview web app HTML with inline CSS/JS.
 * @zh 构建内联 CSS/JS 的预览网页 HTML。
 *
 * @param sessionToken
 * @en One-time session token required by API requests.
 * @zh API 请求所需的一次性会话令牌。
 *
 * @returns
 * @en Full HTML document string.
 * @zh 完整 HTML 文档字符串。
 */
export function renderPreviewWebPage(sessionToken: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>NXSPUB Preview</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;700;800;900&display=swap" rel="stylesheet" />
    <style>
      :root {
        --neo-accent: #ccff00;
        --neo-black: #000000;
        --neo-white: #ffffff;
        --neo-gray-100: #f6f6f6;
        --neo-gray-300: #e2e2e2;
        --neo-gray-600: #5b5b5b;
        --neo-error: #b02500;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--neo-white);
        color: var(--neo-black);
        font-family: "Public Sans", sans-serif;
      }
      .neo-border { border: 2px solid var(--neo-black); border-radius: 4px; }
      .neo-shadow { box-shadow: 4px 4px 0 0 var(--neo-black); }
      .neo-shadow-accent { box-shadow: 4px 4px 0 0 var(--neo-accent); }
      .neo-pressable:active { transform: translate(2px, 2px); box-shadow: 2px 2px 0 0 var(--neo-black); }
      .app { max-width: 1360px; margin: 0 auto; padding: 20px; }
      .topbar {
        display: flex; gap: 12px; align-items: center; justify-content: space-between;
        background: var(--neo-white); padding: 12px 16px; margin-bottom: 16px;
      }
      .brand { display: flex; align-items: center; gap: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.03em; }
      .brand img { width: 34px; height: 34px; border: 2px solid var(--neo-black); background: var(--neo-white); }
      .control-row { display: flex; flex-wrap: wrap; gap: 10px; }
      input, select, button {
        font: inherit; padding: 8px 10px; border: 2px solid var(--neo-black); border-radius: 4px; background: var(--neo-white);
      }
      button { font-weight: 800; text-transform: uppercase; cursor: pointer; }
      button.primary { background: var(--neo-accent); }
      .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
      .card { background: var(--neo-white); padding: 12px; min-height: 82px; }
      .card h3 { margin: 0 0 8px; font-size: 11px; letter-spacing: 0.07em; text-transform: uppercase; font-weight: 900; }
      .card p { margin: 0; font-size: 24px; font-weight: 900; }
      .panel { margin-top: 16px; padding: 14px; }
      .panel h2 { margin: 0 0 10px; font-size: 14px; text-transform: uppercase; font-weight: 900; letter-spacing: 0.05em; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; text-transform: uppercase; }
      th, td { border: 2px solid var(--neo-black); padding: 8px; vertical-align: top; }
      th { background: var(--neo-gray-100); font-weight: 900; }
      pre { margin: 0; white-space: pre-wrap; word-break: break-word; background: var(--neo-gray-100); padding: 12px; border: 2px solid var(--neo-black); }
      .muted { color: var(--neo-gray-600); font-size: 12px; text-transform: uppercase; font-weight: 700; }
      .check { margin: 8px 0; padding: 8px; border: 2px solid var(--neo-black); }
      .check.blocker { background: #ffd9cf; border-color: var(--neo-error); }
      .check.warn { background: #fff5cd; }
      .check.info { background: #f5ffe0; }
      .stack { display: grid; gap: 12px; }
      .error { margin-top: 8px; color: var(--neo-error); font-weight: 800; text-transform: uppercase; font-size: 12px; }
      @media (max-width: 1024px) {
        .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 768px) {
        .grid { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <div class="app">
      <header class="topbar neo-border neo-shadow">
        <div class="brand">
          <img src="/logo.svg" alt="NXSPUB Logo" />
          <span>NXSPUB Preview</span>
        </div>
        <div class="muted" id="ctx">Loading context...</div>
      </header>

      <section class="panel neo-border neo-shadow">
        <h2>Controls</h2>
        <div class="control-row">
          <input id="branch" placeholder="branch (optional)" />
          <button class="neo-pressable primary" id="refreshBtn">Refresh</button>
          <button class="neo-pressable" id="checksBtn">Run Checks</button>
          <button class="neo-pressable" id="draftsBtn">Draft Health</button>
          <button class="neo-pressable" id="exportBtn">Export JSON</button>
        </div>
        <div id="error" class="error"></div>
      </section>

      <section class="grid" id="summary"></section>

      <section class="panel neo-border neo-shadow">
        <h2>Version Plan</h2>
        <div id="plan"></div>
      </section>

      <section class="stack">
        <div class="panel neo-border neo-shadow">
          <h2>Pre-release Checks</h2>
          <div id="checks" class="muted">No check results yet.</div>
        </div>
        <div class="panel neo-border neo-shadow">
          <h2>Changelog Preview</h2>
          <pre id="changelog">No changelog preview yet.</pre>
        </div>
        <div class="panel neo-border neo-shadow">
          <h2>Draft Health</h2>
          <div id="drafts" class="muted">No draft health yet.</div>
        </div>
      </section>
    </div>
    <script>
      const SESSION_TOKEN = ${JSON.stringify(sessionToken)};
      let lastPreview = null;

      async function request(url, method = "GET", body) {
        const response = await fetch(url, {
          method,
          headers: {
            "content-type": "application/json",
            "x-nxspub-preview-token": SESSION_TOKEN
          },
          body: body ? JSON.stringify(body) : undefined
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data?.error?.message || "Request failed");
        }
        return response.json();
      }

      function setError(message) {
        document.getElementById("error").textContent = message || "";
      }

      function renderSummary(preview) {
        const rows = [
          ["Current Version", preview.currentVersion || "-"],
          ["Target Version", preview.targetVersion || "-"],
          ["Commits", String(preview.commitCount || 0)],
          ["Release Packages", String(preview.releasePackageCount || 0)]
        ];
        document.getElementById("summary").innerHTML = rows
          .map(([label, value]) => \`<div class="card neo-border neo-shadow"><h3>\${label}</h3><p>\${value}</p></div>\`)
          .join("");
      }

      function renderPlan(preview) {
        if (!preview.packages || preview.packages.length === 0) {
          document.getElementById("plan").innerHTML = \`<div class="muted">Mode: \${preview.mode.toUpperCase()} | Policy: \${preview.policy.policy || "UNCONFIGURED"}</div>\`;
          return;
        }
        const rows = preview.packages
          .map((item) => \`
            <tr>
              <td>\${item.name}</td>
              <td>\${item.currentVersion}</td>
              <td>\${item.nextVersion || "-"}</td>
              <td>\${item.bumpType || "-"}</td>
              <td>\${item.isPassive ? "YES" : "NO"}</td>
              <td>\${(item.passiveReasons || []).join(", ") || "-"}</td>
            </tr>\`)
          .join("");
        document.getElementById("plan").innerHTML = \`
          <table>
            <thead>
              <tr><th>Name</th><th>Current</th><th>Next</th><th>Bump</th><th>Passive</th><th>Reasons</th></tr>
            </thead>
            <tbody>\${rows}</tbody>
          </table>\`;
      }

      function renderChangelog(preview) {
        const text = preview.changelog?.entryPreview || "No changelog content.";
        document.getElementById("changelog").textContent = text;
      }

      function renderDrafts(preview) {
        const draft = preview.draftHealth;
        if (!draft) {
          document.getElementById("drafts").innerHTML = '<div class="muted">No draft health yet.</div>';
          return;
        }
        document.getElementById("drafts").innerHTML = \`
          <div class="muted">TARGET: \${draft.target}</div>
          <div class="muted">MATCHING: \${draft.matching} | BEHIND: \${draft.behind} | AHEAD: \${draft.ahead} | INVALID: \${draft.invalid}</div>
          <div class="muted">MALFORMED: \${draft.malformedFileCount}</div>
          <div class="muted">SAMPLES: \${(draft.behindSamples || []).join(", ") || "-"}</div>\`;
      }

      function renderChecks(checks) {
        if (!checks || checks.length === 0) {
          document.getElementById("checks").innerHTML = '<div class="muted">No check results yet.</div>';
          return;
        }
        document.getElementById("checks").innerHTML = checks
          .map((item) => \`<div class="check \${item.level}"><strong>\${item.title}</strong><br/>\${item.message}</div>\`)
          .join("");
      }

      async function loadContext() {
        const data = await request("/api/context");
        const ctx = data.data;
        document.getElementById("ctx").textContent =
          \`\${ctx.mode.toUpperCase()} | PM: \${ctx.packageManager.toUpperCase()} | BRANCH: \${ctx.currentBranch}\`;
      }

      async function loadPreview() {
        setError("");
        const branch = document.getElementById("branch").value.trim();
        const data = await request("/api/preview", "POST", {
          branch: branch || undefined,
          includeChangelog: true
        });
        lastPreview = data.data;
        renderSummary(lastPreview);
        renderPlan(lastPreview);
        renderChangelog(lastPreview);
        renderDrafts(lastPreview);
      }

      async function runChecks() {
        setError("");
        const branch = document.getElementById("branch").value.trim();
        const data = await request("/api/checks", "POST", { branch: branch || undefined });
        renderChecks(data.data.checks || []);
      }

      async function loadDraftHealth() {
        setError("");
        const target = lastPreview?.targetVersion?.split("-")[0];
        const data = await request("/api/drafts" + (target ? ("?target=" + encodeURIComponent(target)) : ""));
        const draft = data.data;
        document.getElementById("drafts").innerHTML =
          \`<div class="muted">TARGET: \${draft.target}</div>
           <div class="muted">MATCHING: \${draft.matching} | BEHIND: \${draft.behind} | AHEAD: \${draft.ahead} | INVALID: \${draft.invalid}</div>
           <div class="muted">MALFORMED: \${draft.malformedFileCount}</div>\`;
      }

      document.getElementById("refreshBtn").addEventListener("click", () => loadPreview().catch((e) => setError(e.message)));
      document.getElementById("checksBtn").addEventListener("click", () => runChecks().catch((e) => setError(e.message)));
      document.getElementById("draftsBtn").addEventListener("click", () => loadDraftHealth().catch((e) => setError(e.message)));
      document.getElementById("exportBtn").addEventListener("click", async () => {
        try {
          const data = await request("/api/export.json");
          const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: "application/json" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "nxspub-preview.json";
          a.click();
          URL.revokeObjectURL(a.href);
        } catch (e) {
          setError(e.message);
        }
      });

      Promise.resolve()
        .then(loadContext)
        .then(loadPreview)
        .catch((e) => setError(e.message));
    </script>
  </body>
</html>`
}
