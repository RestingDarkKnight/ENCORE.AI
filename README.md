# ENCORE Landing Page

Static single-page site for ENCORE — an AI-native hiring co-pilot for technical interviews. No build step, no frameworks.

https://restingdarkknight.github.io/ENCORE.AI/

## Quick start

Open `index.html` in a browser, or serve locally:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## File structure

```
├── index.html      # Page markup and inline SVG assets
├── styles.css      # Editorial design system and responsive layout
├── script.js       # Email capture → Google Forms redirect
├── images/         # Illustrations (you provide)
├── README.md
└── .gitignore
```

## Customize before launch

### 1. Google Form URL (`script.js`)

Replace `GOOGLE_FORM_URL` with your real pre-filled form URL. The placeholder uses `EMAIL_PLACEHOLDER` — keep that token; it gets swapped with `encodeURIComponent(email)` at redirect time.

```js
const GOOGLE_FORM_URL =
  'https://docs.google.com/forms/d/e/YOUR_FORM_ID/viewform?usp=pp_url&entry.YOUR_ENTRY_ID=EMAIL_PLACEHOLDER';
```

### 2. Images (`images/`)

Add these files (referenced in `index.html`):

| File | Used in |
|------|---------|
| `hero-illustration.png` | Hero (right column) |
| `struggle.png` | Pain card 1 |
| `cost.png` | Pain card 2 |
| `missing.png` | Pain card 3 |
| `solution.png` | Solution section |
| `roles-grid.png` | Roles section |
| `partner.png` | Partner section |
| `og-image.png` | Open Graph / LinkedIn preview |
| `favicon.ico` | Browser tab icon |

### 3. Contact & SEO

- Update `mailto:hello@encore.com` in the footer when you have a real address.
- Set `og:url` in `index.html` to your production domain.
- Replace placeholder `images/og-image.png` and `images/favicon.ico`.

## Design tokens

| Token | Hex |
|-------|-----|
| Deep navy | `#1A2B4A` |
| Dark maroon (CTAs) | `#781414` |
| Cream | `#FAF7F0` |
| Charcoal | `#2A2A2A` |
| Border grey | `#E8E2D5` |
| White | `#FFFFFF` |
| Maroon accent | `#781414` |

Fonts: [Fraunces](https://fonts.google.com/specimen/Fraunces) (headlines), [Inter](https://fonts.google.com/specimen/Inter) (body).

## Email capture flow

1. User submits email on hero or waitlist form.
2. Form is replaced with a short success message.
3. After 1.5s, browser redirects to Google Forms with email pre-filled.
4. Submission is logged to `console` (swap for analytics later).

No backend — email is only passed to Google Forms.

## License

© 2026 ENCORE. All rights reserved.
