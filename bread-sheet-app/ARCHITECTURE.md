# BreadSheet App — Architecture

## Overview

React Native / Expo mobile app using **Expo Router** for file-based navigation and **Supabase** for authentication. The project is structured around four concerns: routing, auth state, feature logic, and shared UI.

---

## Directory Structure

```
bread-sheet-app/
├── app/                    # Expo Router file-based routes (screens only — no business logic)
│   ├── (auth)/             # Unauthenticated route group (login, signup, post-signup flows)
│   ├── (tabs)/             # Primary authenticated tab navigation
│   └── (app)/              # Authenticated screens rendered without the tab bar
├── features/               # Business logic grouped by domain
│   └── auth/               # Auth actions and validation (no UI)
├── hooks/                  # React context and custom hooks
├── lib/                    # Third-party client singletons (Supabase, API)
├── components/             # Shared UI components and design primitives
│   └── ui/                 # Platform-bridging components (icons, etc.)
└── constants/              # Design tokens (colours, theme)
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
lib/supabase.ts              ← Supabase client (singleton)
       ↓
features/auth/               ← All auth actions + validation helpers
       ↓
hooks/use-session.tsx        ← Session state + real-time subscription
       ↓
app/_layout.tsx              ← Navigation guard (redirects based on session)
       ↓
app/(auth)/ + app/(app)/     ← Screens — call features/auth, handle UI only
```

### 1. Supabase Client — `lib/supabase.ts`

A single `supabase` client created from env vars at startup:

```
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
```

Throws at startup if either var is missing. Only `features/auth/` and `hooks/use-session.tsx` import the client directly — screens never reach for it.

### 2. Auth Feature — `features/auth/`

All Supabase auth calls and shared validation live here. Screens import named functions from this module instead of calling Supabase directly. This keeps route files free of SDK details and makes auth logic easy to find and change in one place.

Responsibilities:
- Wrapping every Supabase auth operation (sign in, sign up, guest sign-in, account upgrade, sign out)
- Shared input validation (e.g. email format)

### 3. Session Context — `hooks/use-session.tsx`

`SessionProvider` wraps the app and exposes `{ session, isLoading, isAnonymous }` via React context.

| Field | Type | Description |
|-------|------|-------------|
| `session` | `Session \| null` | Full Supabase session (includes `session.user`) |
| `isLoading` | `boolean` | `true` until the initial session restore completes |
| `isAnonymous` | `boolean` | `true` when the signed-in user is a guest (no email) |

On mount it:
1. Calls `supabase.auth.getSession()` to restore any persisted session (handles app re-opens)
2. Subscribes to `supabase.auth.onAuthStateChange()` to react to all future auth events (login, logout, token refresh)

`isLoading` is `true` until the initial `getSession()` resolves, preventing premature redirects.

### 4. Navigation Guard — `app/_layout.tsx`

`RootLayoutNav` runs a `useEffect` whenever `session`, `isLoading`, or `segments` changes:

```
isLoading = true                        → render null (splash/loading state)
session + not in authenticated group    → router.replace('/(tabs)')
no session                              → router.replace('/(auth)/login')
```

Authenticated groups are `(tabs)` and `(app)`. Any new authenticated route group must be added to the `AUTHENTICATED_GROUPS` constant in `app/_layout.tsx`.

---

## Auth Flows

### Guest

```
features/auth → signInAsGuest()
  → onAuthStateChange fires
  → session becomes non-null, isAnonymous = true
  → guard redirects to /(tabs)
```

### Email / Password Sign In

```
features/auth → signIn(email, password)
  → onAuthStateChange fires
  → guard redirects to /(tabs)
```

### Sign Up (new user)

```
features/auth → signUp(email, password)
  → email verification required before session is active
  → screen navigates to post-signup confirmation screen in (auth)/
```

### Upgrade (guest → registered)

Anonymous users can link an email and password to their existing account from the Profile tab. This preserves all their data — the Supabase user ID stays the same.

```
features/auth → upgradeAccount(email, password)
  → verification email sent to new address
  → screen shows inline confirmation state
  → on verification: isAnonymous becomes false, profile screen updates
```

### Sign Out

```
features/auth → signOut()
  → onAuthStateChange fires, session becomes null
  → guard redirects to /(auth)/login
```

---

## Profile & Account Management

The **Profile tab** is a settings-style screen that adapts to the user's account state:

**Guest users** see:
- Avatar with "?" and "Guest account" label
- "Create Account" row leading to the upgrade flow in `(app)/`
- Sign Out (warns about data loss)

**Registered users** see:
- Avatar with email initial and email address
- "Change Email" and "Change Password" rows, both in `(app)/`
- Sign Out

On web, confirmation dialogs use `window.confirm` since `Alert.alert` with buttons is not supported. On native, `Alert.alert` is used.

---

## Icons

`components/ui/` contains a platform-bridging icon component that maps SF Symbols (iOS) to Material Icons (Android/web). New icons require a mapping entry in that component.

---

## Theme

`useColorScheme` detects system light/dark preference. Colour tokens are defined in `constants/` and used throughout components. The root layout wraps the app in React Navigation's `ThemeProvider`.

---

## Key Patterns

- **Route files are UI-only.** Business logic belongs in `features/` modules. Screens import from feature modules, handle loading/error state, and navigate — nothing more.
- **Supabase is the single source of truth** for auth state — never manage session tokens manually.
- **`isAnonymous`** from `useSession()` is the canonical way to branch UI between guest and registered users — do not inspect `session.user` directly in screens.
- **New authenticated route groups** must be added to `AUTHENTICATED_GROUPS` in the root layout to avoid being redirected back to the main tab screen.
- **Email validation** is centralised in `features/auth/` — do not duplicate the regex in screens.
