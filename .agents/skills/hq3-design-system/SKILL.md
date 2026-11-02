---
name: hq3-design-system
description: Apply the 4EIGN Content HQ 3.0 Liquid Glass × Subtle Grunge design system to recovered application screens and components.
---

# HQ3 design system

## Before editing

- Read the root `AGENTS.md` and inspect the recovered application's components, styles, assets, and package scripts.
- Work only on `feat/hq3-liquid-glass-workspace`. Preserve historical versions. Do not merge into main, publish production, modify the existing HQ Site, or modify the Dragon Ball Hunt project.
- Reuse the existing stack and official brand assets. If source archives or the official logo are missing, report that precisely; do not invent a recovered source or substitute an unofficial logo without labeling it.

## Visual implementation

- Express Liquid Glass × Subtle Grunge through warm white surfaces, lavender accents, translucent panels, iridescent chrome borders, restrained film grain, and soft shadows. Keep body text crisp and readable over every surface.
- Define reusable semantic tokens for surfaces, text, borders, accents, statuses, spacing, typography, radii, elevation, and motion. Adapt existing tokens before introducing duplicates.
- Use premium typography available in the recovered project or properly licensed assets. Provide a system-font fallback and avoid layout shifts from font loading.
- Keep navigation to Calendar, Media Library, and Feed Preview. Use a floating glass treatment that respects safe-area insets and does not obscure content or focused controls.
- Make the mobile layout primary. Avoid fixed content widths, excessive nested panels, and hover-only affordances. Use at least 44 × 44 CSS pixel touch targets for primary controls.
- Prefer a static lightweight grain overlay and limited backdrop filtering. Do not animate blur or apply expensive filters across large scrolling surfaces.

## Motion and accessibility

- Microinteractions: 150–250 ms. Panels: 250–450 ms. Major transitions: 450–700 ms.
- Prefer transform and opacity animation; preserve focus through transitions. Respect `prefers-reduced-motion` by removing nonessential motion and smooth scrolling.
- Use semantic buttons, labels, headings, landmarks, visible focus, and meaningful loading, error, and empty states. Text contrast must reach WCAG AA; verify contrast against the actual composited glass background.
- Preserve browser zoom and keyboard navigation. A translucent appearance must not obscure status or rely on color alone.

## Verification and handoff

Render real screens at mobile and desktop sizes; inspect overflow, glass contrast, keyboard focus, reduced motion, and navigation clearance. Capture requested screenshots only from the running application. Report missing assets, untested interactions, and any deviations from the recovered reference explicitly.
