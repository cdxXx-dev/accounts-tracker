# accounts-tracker

Web app to keep track of trial accounts: their email, registration date,
subscription expiry (registration + 14 days), and the current state of their
daily / weekly quotas.

## Stack

- [Vite](https://vitejs.dev/) + React 19 + TypeScript
- Plain CSS (no UI library)
- localStorage for persistence (a Neon-backed backend is planned in a follow-up)

## Development

```bash
npm install
npm run dev        # start dev server on http://localhost:5173
npm run build      # type-check + build production bundle into dist/
npm run lint       # eslint
npm run preview    # preview the production build locally
```
