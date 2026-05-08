## Font Families

Use exactly **2 font families** — no more.

| Family     | Variable            | Use case                                     |
| ---------- | ------------------- | -------------------------------------------- |
| Geist Sans | `--font-geist-sans` | All body text, labels, navigation, buttons   |
| Geist Mono | `--font-geist-mono` | Statistics, numbers, code blocks, box scores |

Both fonts are loaded as local variable fonts in `apps/web/src/app/layout.tsx` and exposed as CSS custom properties.

**Do not** introduce a third font family. If a design requires visual contrast, use weight, size, or color instead.

---

## Font Sizes

Use exactly **5 distinct sizes** from Tailwind's default scale:

| Tailwind class | rem   | px (16px base) | Use case                            |
| -------------- | ----- | -------------- | ----------------------------------- |
| `text-sm`      | 0.875 | 14px           | Helper text, footnotes, timestamps  |
| `text-base`    | 1.0   | 16px           | Body copy, table cells, form inputs |
| `text-lg`      | 1.125 | 18px           | Sub-headings, section labels        |
| `text-xl`      | 1.25  | 20px           | Page section titles                 |
| `text-2xl`     | 1.5   | 24px           | Page headings, player names (hero)  |

**Do not** use `text-xs`, `text-3xl`, or any other Tailwind size class. If a design needs something smaller than 14px or larger than 24px, discuss first.

---

## Colors

All colors must be expressed as **6-digit hex values** (`#XXXXXX`).

- ✅ `#171717`
- ✅ `#3B82F6`
- ❌ `blue-500` (Tailwind named color — use the hex equivalent instead)
- ❌ `rgb(59, 130, 246)` — never use `rgb()`
- ❌ `hsl(217, 91%, 60%)` — never use `hsl()`
- ❌ `color: blue` — never use CSS named colors

### Registering New Colors

Add new colors in one of two places:

1. **CSS custom properties** (`apps/web/src/app/globals.css`) for theme-aware values (light/dark mode):

   ```css
   :root {
     --color-brand: #1d4ed8;
   }
   @media (prefers-color-scheme: dark) {
     :root {
       --color-brand: #3b82f6;
     }
   }
   ```

2. **Tailwind config** (`apps/web/tailwind.config.ts`) for static design tokens:
   ```ts
   colors: {
     brand: '#1D4ED8',
   }
   ```

### Current Palette

| Token          | Light mode | Dark mode | Purpose         |
| -------------- | ---------- | --------- | --------------- |
| `--background` | `111111`   | `#0a0a0a` | Page background |
| `--foreground` | `#171717`  | `#ededed` | Primary text    |

---

## Tailwind Usage Notes

- Use Tailwind utility classes for all spacing, layout, and color.
- When a color must be hardcoded inline (e.g., a dynamic style attribute), use the hex literal.
- Avoid arbitrary values (e.g., `text-[13px]`, `bg-[#abc123]`). If you need a new value, add it to the config.
