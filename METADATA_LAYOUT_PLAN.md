# Metadata Layout & Accordion Redesign — Implementation Plan

> **Status:** Planned — not yet started
> **Goal:** Replace inline metadata sections and the internal scrollbar with a
> consistent accordion pattern. All metadata for a file lives in one collapsible
> section hierarchy. No scroll trap inside the panel — the page scrolls naturally.

---

## Problem Summary

| Location                      | Current issue                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `MetadataViewer.tsx`          | `max-h-96 overflow-y-auto` traps content in a fixed-height scroll box                            |
| `MetadataViewer.tsx`          | Quick Reference and Complete XML Data are always visible — no collapse                           |
| `DriveBrowser.tsx` file cards | XML Metadata / Proxy File / Video File sections are always expanded, adding height to every card |
| `DriveBrowser.tsx`            | "View Complete XML Data" uses a one-off click handler duplicated per card                        |
| `main.css`                    | No reusable `.accordion` component class exists                                                  |

---

## Architecture

### Shared `Accordion` component

Create `src/renderer/src/components/metadata/Accordion.tsx` (the `metadata/` folder
already exists and is empty — the right place for this).

```tsx
interface AccordionProps {
  title: string
  defaultOpen?: boolean
  accent?: 'blue' | 'green' | 'orange' | 'muted' // maps to border-left color tokens
  children: React.ReactNode
}
```

- Renders a clickable header row with a chevron that rotates on open/close
- Uses `useState` for open/closed state
- `defaultOpen` controls initial state (e.g. Quick Reference opens by default; raw XML is
  closed by default)
- `accent` drives the left-border color using the existing `meta-section-*` tokens

Add `.accordion-header` and `.accordion-body` to `main.css` so the interaction styles
(hover, chevron rotation, focus ring) are defined once and not repeated as inline Tailwind
in every usage.

---

## Phase A — Shared Component & CSS

**A1. `src/renderer/src/components/metadata/Accordion.tsx`** (new file)

```tsx
export function Accordion({
  title,
  defaultOpen = false,
  accent = 'muted',
  children
}: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`meta-section meta-section-${accent}`}>
      <button className="accordion-header" onClick={() => setOpen((o) => !o)}>
        <span className="section-label">{title}</span>
        <ChevronIcon open={open} />
      </button>
      {open && <div className="accordion-body">{children}</div>}
    </div>
  )
}
```

**A2. `src/renderer/src/assets/main.css`** — add to `@layer components`:

```css
.accordion-header {
  @apply w-full flex items-center justify-between
         py-1.5 text-left cursor-pointer
         hover:text-app-white transition-colors;
}

.accordion-body {
  @apply pt-1 pb-1 space-y-0.5;
}
```

**Files:** `src/renderer/src/components/metadata/Accordion.tsx` (new),
`src/renderer/src/assets/main.css`
**Effort:** Small

---

## Phase B — Rework `MetadataViewer.tsx`

**Current structure:**

```
<div class="panel max-h-96 overflow-y-auto">   ← scroll trap
  <h3> Title </h3>
  Quick Reference  (always visible)
  Complete XML     (always visible)
</div>
```

**Target structure:**

```
<div class="panel p-4">                         ← natural height, no scroll trap
  <Accordion title="Quick Reference" defaultOpen accent="blue">
    … key/value rows …
  </Accordion>
  <Accordion title="Complete XML Data" defaultOpen={false} accent="muted">
    … raw XML tree …
  </Accordion>
  <div class="mt-2 text-special text-muted"> Source: … </div>
</div>
```

Changes:

- Remove `max-h-96 overflow-y-auto` from the outer `<div>`
- Remove the sticky `<h3>` title bar (title becomes the `MetadataViewer` prop passed as
  a heading above the panel at the call site)
- Replace both sections with `<Accordion>` using the new component
- Quick Reference opens by default; Complete XML is closed by default

**Files:** `MetadataViewer.tsx`
**Effort:** Small

---

## Phase C — Rework DriveBrowser File Card Metadata

**Current structure in each file card** (`DriveBrowser.tsx`):

```
meta-section-blue  "XML Metadata"   — always visible
meta-section-green "Proxy File"     — always visible (conditional)
meta-section-orange "MXF File"      — always visible
[separate one-off accordion] "View Complete XML Data"
```

**Target structure:**

```
<Accordion title="XML Metadata"  defaultOpen accent="blue">   ← open by default
<Accordion title="Proxy File"    defaultOpen accent="green">  ← open if proxy exists
<Accordion title="MXF File"      defaultOpen={false} accent="orange">
<Accordion title="Complete XML"  defaultOpen={false} accent="muted">
```

Changes:

- Replace all four `meta-section-*` + the one-off XML button with `<Accordion>`
- Remove the `expandedMetadataFile` state and its `setExpandedMetadataFile` calls —
  each `Accordion` manages its own open state independently
- The `MetadataViewer` inside the Complete XML accordion no longer needs its own scroll
  trap (covered by Phase B)

**Files:** `DriveBrowser.tsx`
**Effort:** Medium (many JSX lines replaced, but mechanical)

---

## Phase D — PhotoMetadataAccordion (DriveBrowser photos)

The photo `PhotoMetadataAccordion` component inside `DriveBrowser.tsx` already uses a
one-off accordion pattern (click-to-expand with a chevron). Replace it with the new
shared `Accordion` component so there is a single accordion implementation in the codebase.

**Files:** `DriveBrowser.tsx`
**Effort:** Small

---

## Scrollbar Policy

- Remove `overflow-y-auto` and `max-h-*` from inside metadata panels.
- The page-level scroll (the sidebar column in DriveBrowser) keeps its `overflow-y-auto`
  — that is intentional and should stay.
- Scrollbars only appear at the column/page level, not inside individual cards or panels.

The global scrollbar style in `main.css` (`::-webkit-scrollbar`) is fine and stays.
What is removed is the **localised scroll traps** inside metadata sections.

---

## Effort Summary

| Phase                               | Files                                      | Effort |
| ----------------------------------- | ------------------------------------------ | ------ |
| A — Accordion component + CSS       | `metadata/Accordion.tsx` (new), `main.css` | Small  |
| B — MetadataViewer                  | `MetadataViewer.tsx`                       | Small  |
| C — DriveBrowser file card metadata | `DriveBrowser.tsx`                         | Medium |
| D — PhotoMetadataAccordion          | `DriveBrowser.tsx`                         | Small  |

**Suggested order:** A → B → C → D.
After Phase A, run `npm run build` to confirm types compile before wiring into consumers.
