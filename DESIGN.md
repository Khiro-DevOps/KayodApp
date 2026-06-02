---
name: Kayod Design System
colors:
  surface: '#faf8ff'
  surface-dim: '#dad9e1'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f3fb'
  surface-container: '#eeedf5'
  surface-container-high: '#e8e7ef'
  surface-container-highest: '#e2e2e9'
  on-surface: '#1a1b21'
  on-surface-variant: '#484551'
  inverse-surface: '#2f3036'
  inverse-on-surface: '#f1f0f8'
  outline: '#797582'
  outline-variant: '#c9c4d2'
  surface-tint: '#5f52a5'
  primary: '#332477'
  on-primary: '#ffffff'
  primary-container: '#4a3d8f'
  on-primary-container: '#bbafff'
  inverse-primary: '#c9bfff'
  secondary: '#5d5b78'
  on-secondary: '#ffffff'
  secondary-container: '#dfdcff'
  on-secondary-container: '#61607d'
  tertiary: '#32296a'
  on-tertiary: '#ffffff'
  tertiary-container: '#494183'
  on-tertiary-container: '#bab1fb'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e5deff'
  primary-fixed-dim: '#c9bfff'
  on-primary-fixed: '#1b0360'
  on-primary-fixed-variant: '#473a8c'
  secondary-fixed: '#e2dfff'
  secondary-fixed-dim: '#c6c3e5'
  on-secondary-fixed: '#191932'
  on-secondary-fixed-variant: '#454460'
  tertiary-fixed: '#e5deff'
  tertiary-fixed-dim: '#c8bfff'
  on-tertiary-fixed: '#1a0e52'
  on-tertiary-fixed-variant: '#463e7f'
  background: '#faf8ff'
  on-background: '#1a1b21'
  surface-variant: '#e2e2e9'
typography:
  h1:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 32px
  h2:
    fontFamily: Plus Jakarta Sans
    fontSize: 17px
    fontWeight: '600'
    lineHeight: 24px
  h3:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  body-md:
    fontFamily: DM Sans
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  body-sm:
    fontFamily: DM Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-caps:
    fontFamily: DM Sans
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
  h1-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 28px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  container-margin: 24px
  gutter: 16px
  card-padding: 20px
  stack-xs: 4px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 24px
---

## Brand & Style

The design system is built for a B2B SaaS HRIS environment where clarity, efficiency, and trust are paramount. The brand personality is **Modern Airy**, prioritizing a sense of calm and organization within complex data-driven workflows. 

The visual style leans into **Corporate Modernism** with a focus on:
- **Clarity:** Generous white space and clear typographic hierarchies to reduce cognitive load for HR professionals.
- **Structure:** A layered "Canvas & Card" approach that separates the global application environment from specific functional tasks.
- **Sophistication:** A palette of deep purples and soft lavenders that feels professional yet distinct from generic corporate blues.
- **Precision:** Controlled radii and consistent spacing that signal a reliable, well-engineered tool.

## Colors

The color strategy uses a hierarchy of purples to define the application's structural layers and interactive focal points.

- **Structural Layers:** The top navigation utilizes **Deep Purple (#2E2566)** to ground the application. The primary workspace sits on a **Canvas (#F5F4FC)** background, while active data containers and work surfaces use **Pure White (#FFFFFF)**.
- **Interactivity:** **Main Purple (#4A3D8F)** is the primary action color for buttons, active states, and focus indicators. **Light Lavender (#D1CEF0)** serves as a soft accent for hover states and secondary elements.
- **Semantic Feedback:** Statuses use a "Muted Tint" system. Text and icons use a high-contrast dark shade, while the background uses a 10-15% opacity tint of the same hue to ensure legibility and a sophisticated aesthetic.

## Typography

This design system employs a dual-font strategy to balance character with utility.

- **Headings:** **Plus Jakarta Sans** provides a bold, geometric structure for page titles and section headers. Its contemporary feel aligns with modern SaaS aesthetics.
- **UI & Data:** **DM Sans** is utilized for all body text, data points, labels, and metrics. Its low-contrast, highly legible letterforms are optimized for reading long lists of employee names and complex financial figures.
- **Data Densitiy:** Use `label-caps` for secondary metadata (e.g., Department names or Table Headers) to create clear visual separation from primary data.

## Layout & Spacing

The layout follows a **Fluid Grid** model with fixed-width sidebars.

- **Global Top Nav:** Fixed height (64px), spanning the full viewport width.
- **Sidebar:** Fixed width (240px), utilizing a vertical list of navigation items.
- **Main Canvas:** A fluid area that reflows based on browser width. It uses a 12-column system for dashboard layouts.
- **Spacing Rhythm:** Based on a 4px baseline. Use 16px (stack-md) for most standard element separations and 24px (stack-lg) for section spacing.
- **Mobile Adaptivity:** At 768px, the sidebar collapses into a hamburger menu. Margins reduce from 24px to 16px to maximize screen real estate for data tables.

## Elevation & Depth

Hierarchy is established through **Tonal Layers** rather than heavy shadows to maintain the "airy" feel.

- **Level 0 (Canvas):** The #F5F4FC background represents the lowest floor.
- **Level 1 (Cards/Tables):** Pure white surfaces with a subtle 1px border (#E8E6F8). A very soft, diffused shadow (0px 4px 12px rgba(46, 37, 102, 0.05)) is applied only to primary cards.
- **Level 2 (Dropdowns/Modals):** Elements that float above the main UI use a more defined shadow to indicate physical separation and focus.
- **Sidebar Depth:** The sidebar is visually separated from the canvas by a vertical divider or a subtle tonal shift, rather than a shadow, keeping the interface flat and modern.

## Shapes

The design system uses a **Variable Radii Scale** to distinguish between functional roles:

- **Inputs & Form Elements:** 4px (Soft) for a precise, "utility-first" feel that fits cleanly into tight table rows.
- **Primary Actions:** 8px (Rounded) for buttons, giving them a friendlier, more clickable appearance.
- **Containment:** 12px (Rounded-LG) for cards and main content areas to soften the overall layout.
- **Statuses:** 20px (Pill) for badges and tags, making them instantly recognizable as distinct, non-interactive (or semi-interactive) indicators.

## Components

### Global Top Nav
- **Background:** Deep Purple #2E2566.
- **Elements:** Branding (Kayod), Entity Switcher (e.g., Engineering), User Profile/Role, and Global Notifications.
- **Text/Icons:** Always white (#FFFFFF) with high-contrast visibility.

### Sidebar Navigation
- **Active State:** Main Purple #4A3D8F background for the list item with White text.
- **Inactive State:** Transparent background with Main Purple or Dark Slate text and icons.
- **Iconography:** Use 20px line-icons centered within a 32px hit area.

### Data Cards & Metrics
- **Surface:** White #FFFFFF.
- **Padding:** 20px.
- **Metric Styling:** Use H1 (Plus Jakarta Sans) for primary numbers and Label-Caps for the metric title.

### Status Badges
- **Shape:** Full Pill (20px radius).
- **Styling:** Use the semantic background tints with the corresponding dark text.
- **Padding:** 4px vertical, 12px horizontal.
- **Icon:** Include a small 8px solid dot or 12px line icon to the left of the text for accessibility.

### Buttons
- **Primary:** #4A3D8F background, White text.
- **Secondary:** Transparent background, #4A3D8F border (1px), #4A3D8F text.
- **Tertiary/Ghost:** No border, #4A3D8F text, subtle lavender background on hover.