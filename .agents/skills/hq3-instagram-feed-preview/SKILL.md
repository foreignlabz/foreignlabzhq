---
name: hq3-instagram-feed-preview
description: Implement Current Feed and Future Feed visual planning for 4EIGN Content HQ accounts without publishing to Instagram.
---

# HQ3 Instagram feed preview

## Scope

- Read `AGENTS.md` and recovered feed-preview code, source screenshots, media authorization, and post/account relationships.
- Work on `feat/hq3-liquid-glass-workspace`. Never merge main, publish production, modify the existing HQ Site, or modify the Dragon Ball Hunt project.
- Account support for `@dragonballhuntpr` is limited to a representation inside HQ's planner. It does not authorize editing that separate project or automatically publishing to either Instagram account.

## Required behavior

- Provide account selection for `@4eignlabz` and `@dragonballhuntpr`, plus clearly distinguished Current Feed and Future Feed modes.
- Display planned publications in a responsive three-column Instagram-style grid. Reuse actual provided screenshot-derived thumbnails when available; record their source and observation date. Do not describe screenshots or mock data as a live synchronized feed.
- Keep image cropping predictable and preserve aspect ratios. Provide meaningful alt text and keyboard-operable tiles that open accessible details.
- Compose Future Feed from the available current snapshot and scheduled posts according to an explicitly documented ordering rule. Handle equal publication times deterministically and explain where the next planned post appears.
- Represent a collaborative post as one canonical post with multiple account associations. It should appear once in each applicable account's preview without duplicating its metadata or edit state.
- Respect status and scheduling rules; do not silently show drafts as already published. Clarify unknown or missing current-feed data through an empty state.
- Keep feed thumbnails behind the same authorization boundary as their media sources. Do not introduce public Drive permissions or external image proxies that expose private assets.
- No Instagram publication, account mutation, or scraping is part of this preview workflow. Do not add a publish control that implies unsupported integration.

## Verification

Check both account selectors, both modes, three-column behavior on mobile/desktop, planned ordering, missing thumbnails, unscheduled posts, and collaborative-post consistency. Verify read-only members cannot alter posts through preview actions. Capture Feed Preview screenshots from the running application and identify whether the displayed feed uses recovered screenshots, fixtures, or verified live data.
