---
name: hq3-calendar-workflow
description: Implement and test Today, Week, and Month scheduling workflows in the 4EIGN Content HQ 3.0 calendar.
---

# HQ3 calendar workflow

## Preparation

- Read `AGENTS.md`, recovered calendar code, the post schema, timezone handling, and permission rules first.
- Work on `feat/hq3-liquid-glass-workspace`. Preserve historical data and code; do not merge main, publish production, modify the existing HQ Site, or modify the Dragon Ball Hunt project.
- Reuse existing post statuses and account relationships. Label fixtures as mock data when live integrations are unavailable.

## Required behavior

- Calendar is the default screen after successful authorized login. Week is the default calendar view; Today and Month are selectable through an accessible Liquid Glass segmented control.
- Show thumbnail, title, scheduled time, account, and status on post cards. Provide deliberate loading, no-results, unscheduled, and failure states.
- Keep view selection, date navigation, and account filtering consistent. Collaborative posts must appear once while showing all associated accounts; filtering must include them when any selected account matches.
- Open details in an animated accessible panel. Manage focus on open and close, support Escape, and return focus to the initiating card. Do not lose unsaved caption edits silently.
- Allow caption edits and scheduling only for permitted owners/managers. Render read-only details for brand members and verify backend rejection of forbidden writes.
- Support drag-and-drop scheduling with clear drop targets, progress, failure rollback, and conflict handling. Provide an equally usable keyboard/touch alternative, such as a labeled date/time editor; dragging cannot be the only way to reschedule.
- Store instants unambiguously and display the selected IANA timezone. Preserve the recovered timezone policy; document any default before using it. Test midnight, month boundaries, and daylight-saving transitions where applicable.
- Avoid optimistic success messages before persistence. If concurrent edits conflict, retain the user's work and offer a clear recovery path.

## Interaction and layout

Use 150–250 ms microinteractions and 250–450 ms panel transitions. Respect reduced motion. On narrow screens, keep labels, dates, account filters, and primary actions usable without page-wide horizontal overflow. Preserve safe-area clearance beneath floating navigation.

## Verification

Exercise all three views with empty, single-post, crowded, and multi-account data. Verify date navigation, filter resets, panel focus, successful and failed caption saves, rescheduling persistence, read-only enforcement, and timezone boundaries. Capture Today/Week/Month and mobile screenshots from the rendered application. Distinguish fixture behavior from live Supabase validation.
