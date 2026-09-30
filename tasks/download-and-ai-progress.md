# Downloads that work everywhere + an AI assistant that shows its work

Branch `claude/download-and-ai-progress` (worktree — the main checkout has a
parallel session's uncommitted staff work).

## Findings

- **Ask assistant looks frozen.** It streams, but only text and tool starts.
  Adaptive thinking at high effort is silent for 20–40 s per round, and the UI
  shows one static "Working through the records…" line throughout.
- **Fee receipt (admin)** fetches, then `window.open(blobUrl)` after two awaits.
  The click's user activation has lapsed by then; Safari and strict popup
  settings block it silently (`noopener` returns null, so nothing notices).
- **Fee receipt (student/parent)** `window.open`s the API URL: any failure is a
  raw `{"error":…}` tab, and inside an installed iOS PWA `_blank` leaves the
  app's cookie jar, so it is 401 every time.
- **Receipt prints "₹" in Helvetica**, which has no such glyph → garbage.
- **AI "Download CSV" always 401s**: plain `<a href>` to a Bearer-only route,
  and with no `target` it navigates the ERP tab away to a JSON error.
- **`downloadBlob` revokes its URL in the same tick as the click** — Safari/iOS
  can abort the download. Hits every `TableExportButton` export.
- Timetable / teacher timetable / substitution sheets: same popup-after-await
  pattern as the admin receipt.
- Green / white sheet, blank marks list: `alert()` on error, no network catch.
  Admit cards, PTM format/notes: missing catch or loading state.
- Marks CSV export / marks template: `window.open` to API, raw JSON on error.

## Plan

- [x] `downloadBlob`: revoke on a delay
- [x] Shared `saveResponse(res, fallback)` + `responseError(res)` helpers
      (filename from Content-Disposition; server error text surfaced)
- [x] Receipt route: `attachment`, filename sanitised, "Rs." not "₹", log the
      real query error
- [x] Receipt buttons (admin, student, parent): fetch → save → toast, per-row spinner
- [x] AI CSV export: `adminFetch` + save, spinner, toast
- [x] AI progress: runner reports tool totals + human tool labels; client shows a live
      checklist (understanding → fetching X → found N → writing → preparing
      table) with an elapsed timer and a "still working" reassurance
- [x] Student bulk upload: "Reading your file…" state while the workbook parses
- [x] Convert remaining download sites to the shared helpers (timetable sheets,
      green/white/blank sheets, admit cards, PTM, marks CSV)
- [x] typecheck, lint, check:mobile, check:colors, check:guide, check:pwa, `next build`
- [ ] Browser pass — needs a signed-in session; not done (see Review)

## Not changed (flagged)

- `/api/fees/receipt` admits `staff` without the `fees` permission the page
  requires; cookie routes don't check `must_change_password`.
- Transport application signed URLs expire 10 min after the list loads.

## Review

- **Verified:** typecheck (3/3), lint (0 errors), check:guide / mobile /
  colors / pwa all OK, ERP `next build` succeeds. The receipt PDF was rendered
  offline with sample data: it prints "Rs. 12,345.50" where it used to print a
  broken glyph. The progress reducer was driven through a full turn (preamble,
  two parallel lookups with one failing, answer, table) and every stage came
  out as it should.
- **Not verified:** clicking through in a signed-in browser. The preview pane
  can't sign in with real credentials, and Vercel runtime logs returned 403,
  so the receipt failure was diagnosed from code. The admin popup blocked after
  an await, and the portals' `window.open` to a cookie route, are the likely
  causes. The database side is clean: all 1,992 receipt numbers are plain
  ASCII.
- **Also changed:**
  - Report-card and admit-card fee-dues refusals now carry the full sentence
    (with the amount) in `error`.
  - The timetable "Print" buttons are now "Download PDF" / "Download sheet",
    with the guide updated to match.

