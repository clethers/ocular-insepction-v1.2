# 📌 Parked Plan: Saved Drafts & Form History Hub Enhancement

> **Status:** Parked for future execution  
> **Target Module:** OIMS — Form History & Draft Management (`history.html` / `historyPage.js`)

---

## 📖 Executive Summary

Transform the current static **Saved Drafts & Form History** page (`history.html`) into an interactive, full-featured **Executive Draft & Form Management Hub**.

Currently, history records are displayed as simple text cards without actions. This plan outlines the technical specifications to enable:
- **Resuming / editing** saved drafts directly in the form wizard.
- **Viewing full Executive Docket summaries** in interactive modals.
- **Direct PDF exporting** of official EcoWorks audit & handover certificates.
- **Deleting / managing** local and cloud-synced records.
- **Live filtering & searching** across clients, RN numbers, and installation IDs.

---

## 🎯 Key Capabilities & Design Features

### 1. Executive Dashboard & Metrics Bar
- Top counter summary tiles:
  - `Total Saved Records`
  - `In-Progress Drafts`
  - `Ready for Installation`
  - `Commissioned & Handed Over`

### 2. Search & Category Filters
- **Live Search Input**: Instant filter by Client Name, RN Number, or Installation Number.
- **Category Tabs**:
  - `All Records`
  - `In-Progress Drafts`
  - `Ready for Installation`
  - `Commissioned & Handed Over`

### 3. Record Action Controls on Every Card
Each record card will feature 4 distinct action buttons:
- ⚡ **`Resume / Edit Draft`**: Navigates to `ocular.html` or `installation.html` and pre-fills all fields, photos, and signatures.
- 👁️ **`View Docket`**: Opens a clean modal displaying the complete Executive Summary Docket table.
- 🖨️ **`Print / Export PDF`**: Triggers immediate certificate printing/PDF export (`window.print()`).
- 🗑️ **`Delete Record`**: Removes the draft/record from local storage with confirmation.

---

## 📐 Technical Architecture & Component Changes

### A. Form Storage Enhancements (`js/components/formStorage.js`)
- Add `deleteDraft(formId)` to remove specific drafts.
- Add `deleteReadyInstallation(id)` to remove ready installation entries.
- Add `setResumeDraft(formId, data)` to set a temporary payload in `sessionStorage` or `localStorage` when clicking "Resume / Edit".

### B. Form Hydration (`js/forms/ocularForm.js` & `js/forms/installationForm.js`)
- Update `OcularForm.render()` and `InstallationForm.render()` to check for an active resume draft payload.
- Automatically populate form fields, radio selections, GPS pin location, uploaded photo previews, and signatures.

### C. History Page Engine (`js/pages/historyPage.js`)
- Replace static list with dynamic render function `renderHistoryView(container)`.
- Wire up search input, category tab switching, modal popup for docket previews, delete confirmation handlers, and print triggers.

### D. CSS Styling (`css/forms.css`)
- Add visual styling for history search input, metric counter cards, action button groups (`btn-gold`, `btn-outline`, `btn-danger`), and status badges:
  - 🟠 `DRAFT IN-PROGRESS`
  - 🔵 `READY FOR INSTALLATION`
  - 🟢 `COMMISSIONED & HANDED OVER`

---

## 🧪 Verification & Acceptance Checklist

When ready to execute this parked plan:

1. [ ] **Save Draft Test**: Save an incomplete Ocular Inspection draft with photos and signatures.
2. [ ] **History Dashboard Test**: Confirm the draft appears in `history.html` with correct timestamp and status.
3. [ ] **Resume Draft Test**: Click "Resume / Edit" and verify all form fields, photos, and signatures restore properly in `ocular.html`.
4. [ ] **Export PDF Test**: Click "Print / Export PDF" from the history card and verify PDF document generation.
5. [ ] **Delete Draft Test**: Click "Delete Record", confirm prompt, and ensure card is removed from history.
6. [ ] **Build Verification**: Run `npm run build` to ensure all modules bundle cleanly with zero errors.

---

*Drafted for future execution.*
