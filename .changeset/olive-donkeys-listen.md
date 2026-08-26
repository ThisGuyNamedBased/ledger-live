---
"live-mobile": patch
"@devtools/pay-card": minor
"@devtools/bindings": minor
"@features/flow-pay-card-auth": minor
"@features/flow-pay-card": minor
"@devtools/shell": minor
---

Add Card session controls to the Card / Pay DevTool

The panel gains an "Auth session", a "Device secure storage", a "Send API requests" and an "MSW Auth
Renewal Mock" section: the stored tokens, and buttons that call the real session accessors to break a
token, renew, burst or fetch. An MSW handler decides what the Baanx renewal grant answers, and
publishes its counters to the panel.

The mock offers one button per documented response of `POST /v1/auth/oauth2/token`, named by status
code — 200, 400, 422, 498, 499, 500 — plus a slow 200, a 200 the wire schema rejects, and a transport
failure. Each carries the body the Baanx reference documents for it, so a tester matches the panel
against the API docs rather than against a nickname.

`CardLogout` and `Card` gain an optional `onInspectSession`. It makes the signed-in card holder's
details a press target, so a host can reach its own tooling; the mobile app points it at the DevTool
in development builds. Without a host callback the details stay plain text.

`DevTools` gains an optional `initialToolId`, so a host can open the shell straight on one tool
instead of the catalogue. The mobile DevTools route carries the id as a param.

The panel works without MSW, so it runs on a device. The handler stays behind `MSW_ENABLED`.
