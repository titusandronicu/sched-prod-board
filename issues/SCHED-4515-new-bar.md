---
id: SCHED-4515
title: Hold the list still; bring new incidents in with a "N new" bar
status: ready
plan: R1
---

Product watched the ack race at 00:08: a new incident landed, the rows shifted, and the click hit the wrong row.

- The list holds still while it is on screen. Rows never move or are replaced under the pointer.
- New incidents wait behind a "N new" bar (`data-testid="new-bar"`). Clicking it brings them in at the top, newest first.
- Ack stays on the row it was clicked on. The row's own acked mark changes; nothing else does.

Acceptance: with the pointer on a row, a new incident lands and a click at that spot still acks the row that was there.
