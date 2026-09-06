/**
 * A self-contained stub Live App, embedded as a data: URL.
 *
 * Swap and Earn are remote web apps. Mock mode can fake accounts and devices,
 * but it cannot serve someone else's website, so pointing a mock manifest at
 * the real URL leaves the tab showing a load error with no network - or the
 * real app talking to real backends with network.
 *
 * This stub is served from the manifest itself, so the tab always opens
 * something: it renders the parameters Ledger Live passed in and talks the
 * wallet-api (JSON-RPC 2.0 over postMessage) back to the app to list the mock
 * accounts. That exercises the entry point, the webview, the parameter plumbing
 * and the wallet-api bridge without any network.
 *
 * It deliberately does not implement a real swap or earn: quoting, routing and
 * settlement are provider-side, and faking them would demo a fiction.
 */

const page = (title: string, blurb: string) => `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; padding:16px; background:#131214; color:#e8e8ea;
         font-family: -apple-system, system-ui, sans-serif; font-size:14px; }
  h1 { font-size:16px; margin:0 0 4px; }
  .tag { display:inline-block; background:#3a3aff; color:#fff; border-radius:4px;
         padding:2px 6px; font-size:10px; letter-spacing:.5px; }
  .card { background:#1e1e22; border:1px solid #333; border-radius:8px;
          padding:12px; margin-top:12px; }
  .muted { color:#8a8a92; font-size:12px; line-height:1.5; }
  .row { display:flex; justify-content:space-between; gap:8px; padding:4px 0;
         border-bottom:1px solid #26262b; font-size:12px; }
  .row:last-child { border-bottom:0; }
  .k { color:#8a8a92; } .v { color:#fff; text-align:right; word-break:break-all; }
  button { width:100%; margin-top:12px; padding:10px; border-radius:6px;
           border:1px solid #3a3aff; background:#3a3aff; color:#fff; font-size:13px; }
</style></head>
<body>
  <span class="tag">MOCK</span>
  <h1>${title}</h1>
  <div class="muted">${blurb}</div>

  <div class="card">
    <div class="muted" style="margin-bottom:6px">Parameters received</div>
    <div id="params"></div>
  </div>

  <div class="card">
    <div class="muted" style="margin-bottom:6px">Accounts via wallet-api</div>
    <div id="accounts" class="muted">requesting…</div>
    <button id="reload">Request accounts</button>
  </div>

<script>
(function () {
  var paramsEl = document.getElementById("params");
  var accountsEl = document.getElementById("accounts");

  // Show everything Ledger Live passed in, so parameter plumbing is verifiable.
  var qs = new URLSearchParams(window.location.search);
  var rows = [];
  qs.forEach(function (value, key) {
    rows.push('<div class="row"><span class="k">' + key + '</span><span class="v">' + value + "</span></div>");
  });
  paramsEl.innerHTML = rows.length ? rows.join("") : '<div class="muted">none</div>';

  // The host is React Native WebView on mobile and a plain window on desktop.
  function send(msg) {
    var raw = JSON.stringify(msg);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(raw);
    else window.parent.postMessage(raw, "*");
  }

  var nextId = 1;
  var pending = {};

  function call(method, params) {
    return new Promise(function (resolve, reject) {
      var id = nextId++;
      pending[id] = { resolve: resolve, reject: reject };
      send({ jsonrpc: "2.0", id: id, method: method, params: params || {} });
      setTimeout(function () {
        if (pending[id]) {
          delete pending[id];
          reject(new Error("timed out"));
        }
      }, 8000);
    });
  }

  function onHostMessage(event) {
    var data = typeof event.data === "string" ? event.data : null;
    if (!data) return;
    var msg;
    try { msg = JSON.parse(data); } catch (e) { return; }
    var entry = msg && msg.id != null ? pending[msg.id] : null;
    if (!entry) return;
    delete pending[msg.id];
    if (msg.error) entry.reject(new Error(msg.error.message || "wallet-api error"));
    else entry.resolve(msg.result);
  }

  // Mobile delivers to document, desktop to window.
  window.addEventListener("message", onHostMessage);
  document.addEventListener("message", onHostMessage);

  function listAccounts() {
    accountsEl.innerHTML = "requesting…";
    call("account.list", {})
      .then(function (result) {
        var accounts = (result && result.rawAccounts) || (result && result.accounts) || [];
        if (!accounts.length) {
          accountsEl.innerHTML = '<div class="muted">no accounts returned</div>';
          return;
        }
        accountsEl.innerHTML = accounts
          .slice(0, 12)
          .map(function (a) {
            return '<div class="row"><span class="k">' + (a.currency || a.currencyId || "?") +
              '</span><span class="v">' + (a.balance != null ? a.balance : "") + "</span></div>";
          })
          .join("");
      })
      .catch(function (e) {
        accountsEl.innerHTML = '<div class="muted">wallet-api call failed: ' + e.message + "</div>";
      });
  }

  document.getElementById("reload").addEventListener("click", listAccounts);
  listAccounts();
})();
</script>
</body></html>`;

/** Builds the data: URL a mock manifest points at. */
const asDataUrl = (html: string) =>
  `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

export const MOCK_SWAP_URL = asDataUrl(
  page(
    "Swap (mock)",
    "Stub app standing in for the Swap Live App. Quoting and settlement are provider-side and are not simulated.",
  ),
);

export const MOCK_EARN_URL = asDataUrl(
  page(
    "Earn (mock)",
    "Stub app standing in for the Earn Live App. Providers and yields are backend-driven and are not simulated.",
  ),
);
