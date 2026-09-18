# R5 date entry points

The supported historical URLs use the same Singapore civil-date calendar as the current planner. Their time fields remain native time controls; route calculation and preference handling are unchanged.

| Entry point | Calendar fields |
| --- | --- |
| `/` and `/multimodal.html` | Current planner departure and arrival dates, through the existing time-picker mount |
| `/?legacy=1` | Rail departure and arrival dates |
| `/multimodal.html?legacy=1` | Multimodal departure and arrival dates |
| `/replay.html` | Travel date in Edit trip |
| Historical Saved routes & places | Date used to calculate a saved journey again |

`mountDatePickers` reuses an existing mount and exposes `destroy()` for replaced forms. Destruction discards drafts, removes the dialog, controls and input listeners, restores native date input types, and prevents queued close events from applying a draft or focusing a detached control. The legacy forms destroy their picker before replacement or modal removal. Saved-route controls do the same on personal-data rerenders.

Applying a date triggers the legacy form's change handler, clearing any prepared journey and marking old results stale. Cancelling a date draft leaves the input and prepared journey unchanged and returns focus to the opener. When a matching arrival date follows a changed departure date, its formatted button refreshes too. Saved senior fare and step-free requirements survive reopening and subsequent date edits.

The submitted civil date still passes the existing rail, multimodal, replay or saved-template validator. Hiding the native input does not bypass those validators or expand timetable coverage. Date values remain `YYYY-MM-DD` in Singapore civil time; the calendar does not reinterpret them in the browser's local timezone.

## Verification

The focused calendar, personal-state and legacy-preference unit suites passed 12 tests. Desktop Edge 153.0.4234.32 browser checks passed:

| Suite | Checks |
| --- | ---: |
| Expanded legacy calendar and saved-preference flows | 37 |
| Retained rail flows | 29 |
| Rail with real browser networking disabled | 15 |
| Retained replay flows | 30 |
| Retained multimodal flows, including offline searches | 28 |
| Total | 139 |

All suites recorded zero uncaught page errors. The legacy checks cover Escape cancellation and focus return in both saved-route controls and planners, replay's nested modal, applied-date invalidation, synchronized arrival-date labels, retained native times, absence of leaked dialogs, and preserved accessibility/fare preferences. Rail and replay calendars were visually inspected at 390 × 844 pixels. These are browser-emulation results, not physical-phone or assistive-technology certification.

Evidence: [legacy-date-verification.json](evidence/r5/legacy-date-verification.json), [rail calendar](evidence/r5/legacy-rail-calendar-mobile.png), and [replay calendar](evidence/r5/legacy-replay-calendar-mobile.png). Source run paths are recorded in the JSON. The initial rail offline test used the current root URL; changing the harness to the supported `/?legacy=1` entry point resolved that timeout, and all 15 actual offline checks passed on rerun.

The legacy multimodal coverage panel also uses the current routable availability counts: 391 directional patterns, 297 exact service numbers and 4,826 stops. Its 416-pattern compiled source registry is identified separately because some patterns have no usable day and frequency timing.
