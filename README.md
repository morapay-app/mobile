# mobile

Expo (React Native) app for Morapay. Scaffolded with `create-expo-app` on the `blank-typescript`
template. Standalone package — sibling to `backend/`, `core/`, `dashboard/`, `frontend/`, `sdk/`
under `morapay/`, with its own git repo, `pnpm-lock.yaml`, and `node_modules` (not part of the
`frontend` Turborepo workspace).

## Run

```bash
cd mobile
pnpm install
pnpm start        # Expo dev server (scan QR with Expo Go, or press i/a)
pnpm ios          # open in iOS Simulator
pnpm android      # open in Android emulator
pnpm web          # open in browser
pnpm test         # jest (jest-expo preset)
pnpm typecheck    # tsc --noEmit
```

## Design reference

Visual language (colors, type, spacing, radii, motion) is pulled from the
[munckins-web](/Users/kaleel/Documents/projects/startups/munckins-web) marketing site —
dark near-black backgrounds, lowercase Manrope/Instrument Sans typography, a single
`#0052FF` accent, hairline white/10 borders, and `rounded-full` pill buttons.

The theme lives in [`src/theme/`](src/theme):
- `colors.ts`, `spacing.ts`, `radii.ts`, `motion.ts`, `typography.ts` — individual token files
- `theme.ts` — combines them into one `theme` object
- `ThemeProvider.tsx` / `useTheme()` — context access to the theme
- `useAppFonts.ts` — loads the Manrope/Instrument Sans/Cormorant weights via `expo-font`

Reusable primitives that apply the theme live in [`src/components/`](src/components)
(`Text`, `Button`, `Screen`). Build new screens out of these rather than hardcoding
colors/fonts/spacing inline — see [`src/screens/HomeScreen.tsx`](src/screens/HomeScreen.tsx)
for the pattern.

## Notes

- SDK: Expo 57 / React Native 0.86 / React 19.2.
- `AGENTS.md` in this folder is Expo's own scaffolded reminder that the Expo 57 APIs
  changed recently — check the versioned docs before relying on memory for Expo APIs.
- `@testing-library/react-native@14`'s `render()` is async — always `await render(...)` in tests.
