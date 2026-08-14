---
name: ui-ux-design-system
description: Design system guidelines and rules for building state-of-the-art corporate web interfaces, executive summary dockets, high-contrast visual hierarchy, modern card layouts, and interactive form controls.
---

# UI/UX Design System & Executive Summary Guidance

This skill defines the mandatory design principles and layout guidelines for building world-class corporate web application interfaces, form summaries, executive audit dockets, and interactive components.

## 1. Visual Hierarchy & Color Palette

- **Brand Colors**:
  - Primary Brand Cyan: `#00AEEF` (used for highlights, active tabs, focus rings, primary badges)
  - Dark Navy Accent: `#0B1220` / `#0f172a` (used for titles, major section headings, high-emphasis text)
  - Success Green: `#10b981` / `#dcfce7` (used for verified statuses, completion badges)
  - Warm Surface Light: `#ffffff` / `#f8fafc` / `#f1f5f9` (used for clean card backgrounds and subtle section contrasts)
- **Typography & Scale**:
  - Page Titles: `1.25rem` – `1.5rem`, `font-weight: 800`, `letter-spacing: -0.02em`
  - Section Headers: `0.85rem` – `0.95rem`, `font-weight: 800`, `text-transform: uppercase`, `letter-spacing: 0.05em`
  - Body Values: `0.9rem` – `0.95rem`, `font-weight: 700`, `color: #0f172a`
  - Sub-labels: `0.7rem` – `0.75rem`, `font-weight: 700`, `color: #64748b`, `letter-spacing: 0.04em`

## 2. Executive Summary & Audit Docket Architecture

When presenting pre-signature summaries or audit dockets to users, use a **Certified Executive Docket Layout**:

1. **Top Audit Docket Header**:
   - Include an official verification badge (`✓ TECHNICAL AUDIT VERIFIED`), live timestamp, and Reference/Installation Tracking IDs.
2. **Structured Key-Value Table Sections**:
   - Group data into numbered engineering categories:
     - `1. Client & Site Identification`
     - `2. Electrical Feeder & Panelboard`
     - `3. EV Charger & Roughin Specifications`
   - Use clean 2-column or 3-column key-value rows with subtle borders (`1px solid #e2e8f0`) and alternating light row background fills for effortless scannability.
3. **Status Badges & Indicators**:
   - Display color-coded pill tags (`#dcfce7` green fill for verified parameters, `#e0f2fe` cyan fill for location data, `#dbeafe` blue fill for sign-off readiness).

## 3. Interactive Component Standards

- Minimum touch/click target size of `48px` for buttons, inputs, and option cards.
- Smooth CSS transitions (`all 0.2s cubic-bezier(0.4, 0, 0.2, 1)`).
- Focus outline ring: `box-shadow: 0 0 0 3px rgba(0, 174, 239, 0.18); border-color: #00AEEF;`.
