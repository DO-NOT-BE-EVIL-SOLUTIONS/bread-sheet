# BreadSheet App — Architecture

## Overview

React Native / Expo mobile app using **Expo Router** for file-based navigation and **Supabase** for authentication. The project is structured around three concerns: routing, auth state, and feature screens.

---

## Directory Structure

```
bread-sheet-app/
├── app/                    # Expo Router file-based routes
│   ├── _layout.tsx         # Root layout — auth guard + navigation shell
│   ├── modal.tsx           # Shared modal screen
│   ├── (auth)/             # Unauthenticated route group
│   │   ├── _layout.tsx
│   │   ├── login.tsx
│   │   └── signup.tsx
│   ├── (tabs)/             # Primary authenticated tab navigation
│   │   ├── _layout.tsx
│   │   ├── index.tsx       # Home tab
│   │   └── explore.tsx     # Explore tab
│   └── (app)/              # Secondary authenticated screens (no tab bar)
├── hooks/
│   ├── use-session.tsx     # Supabase session context + provider
│   ├── use-color-scheme.ts
│   └── use-theme-color.ts
├── lib/
│   └── supabase.ts         # Supabase client singleton
├── components/             # Shared UI components
│   ├── themed-text.tsx
│   ├── themed-view.tsx
│   ├── parallax-scroll-view.tsx
│   └── ui/
│       ├── icon-symbol.tsx
│       └── collapsible.tsx
├── features/               # Feature modules (auth, food, groups)
└── constants/
    └── theme.ts
```

---

## Routing

Expo Router maps the file system to routes. Route groups (folders wrapped in parentheses) are invisible in the URL — they exist only to apply a shared layout.

| Group | Auth required | Layout |
|-------|--------------|--------|
| `(auth)/` | No | Stack navigator, no header |
| `(tabs)/` | Yes | Bottom tab bar |
| `(app)/` | Yes | Stack navigator, no tab bar |

---

## Auth Architecture

### Layers

```
lib/supabase.ts          ← Supabase client (singleton)
       ↓
hooks/use-session.tsx    ← Session state + real-time subscription
       ↓
app/_layout.tsx          ← Navigation guard (redirects based on session)
```

### 1. Supabase Client — [`lib/supabase.ts`](lib/supabase.ts)

A single `supabase` client created from env vars at startup:

```
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
```

Throws at startup if either var is missing. Imported wherever Supabase calls are needed.

### 2. Session Context — [`hooks/use-session.tsx`](hooks/use-session.tsx)

`SessionProvider` wraps the app and exposes `{ session, isLoading }` via React context.

On mount it:
1. Calls `supabase.auth.getSession()` to restore any persisted session (handles app re-opens)
2. Subscribes to `supabase.auth.onAuthStateChange()` to react to all future auth events (login, logout, token refresh)

`isLoading` is `true` until the initial `getSession()` resolves, preventing premature redirects.

### 3. Navigation Guard — [`app/_layout.tsx`](app/_layout.tsx)

`RootLayoutNav` runs a `useEffect` whenever `session`, `isLoading`, or `segments` changes:

```
isLoading = true       → render null (splash/loading state)
session + not in authenticated group → router.replace('/(tabs)')
no session             → router.replace('/(auth)/login')
```

Authenticated groups are `(tabs)` and `(app)`. Any new authenticated route group must be added to the `AUTHENTICATED_GROUPS` constant in `_layout.tsx`.

---

## Sign-in Flows

### Guest

```
supabase.auth.signInAnonymously()
  → onAuthStateChange fires
  → session becomes non-null
  → guard redirects to /(tabs)
```

### Email / Password

```
supabase.auth.signInWithPassword({ email, password })
  → onAuthStateChange fires
  → guard redirects to /(tabs)
```

### Sign Up (new user)

```
supabase.auth.signUp({ email, password })
  → email verification required before session is active
```

### Sign Up (upgrading a guest)

If the current user is anonymous, signup calls `supabase.auth.updateUser()` instead of `signUp()`, preserving the existing user record and any data associated with it.

---

## Theme

`useColorScheme` detects system light/dark preference. `Colors` from `constants/theme.ts` are used throughout components. The root layout wraps the app in `ThemeProvider` from React Navigation, which applies the correct theme to all navigators.

---

## Key Patterns

- **Feature logic** belongs in `features/` modules, not in route files. Route files should only wire up UI and call into feature modules.
- **Supabase is the single source of truth** for auth state — never manage session tokens manually.
- **New authenticated route groups** must be added to `AUTHENTICATED_GROUPS` in `app/_layout.tsx` to avoid being redirected back to `/(tabs)`.
