# Neo-Brutalism Style Guide

## Goal

Use a Neo-Brutalism visual language with strong contrast, hard borders, hard shadows, and dense information hierarchy. Avoid rounded "soft-tech" styles and glassmorphism.

## Visual Principles

- Strong contrast: black/white as the base, fluorescent lime as primary accent.
- Hard outlines: all core cards, buttons, and inputs use thick borders.
- Hard shadows: use offset hard shadows, not soft blur shadows.
- Strong hierarchy: headings and key metrics use extra-heavy weight, uppercase, and tight spacing.
- Minimal visual grammar: consistent primitive style, no component style drift.

## Color and Theme

- Primary background: `#FFFFFF`
- Primary text: `#000000`
- Primary accent: `#CCFF00`
- Neutrals: `#F6F6F6` / `#E2E2E2` / `#5B5B5B`
- Semantic colors:
- Success: keep accent color family.
- Warning: highlighted yellow background + black text.
- Error: `#B02500` / `#F95630`.

## Typography

- Primary font: `Public Sans`
- Headings: `font-weight: 800~900`, uppercase, tight letter spacing.
- Body: `font-weight: 400~500`.
- Labels/status text: `font-weight: 700`, small-size uppercase.

## Shape, Border, and Shadow

- Border radius: small radius only (`4px`), avoid large rounded corners.
- Standard border: `2px solid #000`.
- Standard shadow (hard shadow): `4px 4px 0 0 #000`.
- Accent shadow: `4px 4px 0 0 #CCFF00`.
- Pressed state: shrink shadow and add positive translation.

## Component Style Baseline

- Buttons: black border + hard shadow + uppercase bold text; hover may increase brightness.
- Cards: white background with black border; key cards may use black background + accent text.
- Inputs: black hard frame; low-contrast gray placeholder text.
- Tabs/Filters: active state must use obvious block background or underline emphasis.
- Tables: compact row height, uppercase bold header, high contrast for key columns.
- Status badges: small uppercase blocks, solid fills only, no gradients.

## Motion

- Motion style: short and direct (`100~150ms`).
- Disallow: soft easing, blur transitions, complex spring animations.
- Suggested: hover color switch, press translation, lightweight panel fade-in.

## Responsive Rules

- Desktop (`>=1280`): left navigation + two-column main content.
- Tablet (`>=768`): partially collapsed sidebar, main panel prioritized.
- Mobile (`<768`): single-column stack, control panel becomes drawer/collapse.
- Keep hard-border and hard-shadow style on mobile.

## Shadow Modes

Use one of these two shadow systems consistently in a product area.

### Mode A: Layered Double Shadow

- Visual characteristic: white separation layer + black hard shadow.
- Best for: high-emphasis primary CTA buttons.

```html
<button
  class="
  flex items-center gap-3 px-8 py-3
  text-black text-sm font-black tracking-widest
  bg-[#CCFF00] border-2 border-black rounded
  shadow-[4px_4px_0px_-2px_rgba(255,255,255,1),4px_4px_0px_0px_rgba(0,0,0,1)]
  transition-all duration-50 ease-out
  hover:brightness-[1.05]
  active:translate-x-0.5 active:translate-y-0.5
  active:shadow-none
"
>
  TEXT
</button>
```

### Mode B: Classic Hard Shadow

- Visual characteristic: single black hard shadow.
- Best for: regular action buttons and dense toolbars.

```html
<button
  class="
  bg-[#CCFF00] border-2 border-black rounded px-6 py-2
  text-black text-sm font-black tracking-widest
  shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]
  transition-all duration-50 ease-out
  hover:brightness-[1.05]
  active:translate-x-0.5 active:translate-y-0.5
  active:shadow-none
"
>
  Text
</button>
```
