# Frontend Architecture

React Native / Expo mobile app using **Expo Router** for file-based navigation and **Supabase** for authentication.

---

## Directory Structure

```
bread-sheet-app/
├── app/                         # Expo Router file-based routes (screens only — no business logic)
│   ├── (auth)/                  # Unauthenticated route group (login, signup, post-signup flows)
│   ├── (tabs)/                  # Primary authenticated tab navigation
│   ├── (app)/                   # Authenticated screens without the tab bar (product detail, add/edit product, review screens)
│   └── (account)/               # Account management screens (change email/password, upgrade, verify)
├── features/                    # Business logic grouped by domain
│   └── auth/                    # Auth actions and validation (no UI)
├── hooks/                       # React context and custom hooks
├── lib/                         # Third-party client singletons + small utilities (Supabase, API, pending-return-to)
├── components/                  # Shared UI components and design primitives
│   └── ui/                      # Platform-bridging components (icons, etc.)
└── constants/                   # Design tokens (colours, theme)
```

---

## Routing

Expo Router maps the file system to routes. Route groups (folders wrapped in parentheses) are invisible in the URL — they exist only to apply a shared layout.

| Group | Auth required | Layout |
|-------|--------------|--------|
| `(auth)/` | No | Stack navigator, no header |
| `(tabs)/` | Yes | Bottom tab bar |
| `(app)/` | Yes | Stack navigator, no tab bar |
| `(account)/` | Yes | Stack navigator, no tab bar |

New authenticated route groups must be added to the `AUTHENTICATED_GROUPS` constant in `app/_layout.tsx` or the navigation guard will redirect them back to `/(tabs)`.

---

## Auth Architecture

### Layer diagram

```
lib/supabase.ts                  ← Supabase client (singleton)
       ↓
features/auth/                   ← All auth actions + validation helpers
       ↓
hooks/use-session.tsx            ← Session state + real-time subscription
       ↓
app/_layout.tsx                  ← Navigation guard (redirects based on session)
       ↓
app/(auth)/ + app/(account)/     ← Screens — call features/auth, handle UI only
```

### 1. Supabase Client — `lib/supabase.ts`

Single `supabase` client created from env vars at startup:

```
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
```

Throws at startup if either var is missing. Only `features/auth/` and `hooks/use-session.tsx` import the client directly — screens never reach for it.

### 2. Auth Feature — `features/auth/`

All Supabase auth calls and shared validation live here. Screens import named functions instead of calling Supabase directly. This keeps route files free of SDK details.

Responsibilities:
- Wrapping every Supabase auth operation (sign in, sign up, guest sign-in, account upgrade, sign out)
- Shared input validation (email format, password rules)

### 3. Session Context — `hooks/use-session.tsx`

`SessionProvider` wraps the app and exposes `{ session, isLoading, isAnonymous }` via React context.

| Field | Type | Description |
|-------|------|-------------|
| `session` | `Session \| null` | Full Supabase session (includes `session.user`) |
| `isLoading` | `boolean` | `true` until the initial session restore completes |
| `isAnonymous` | `boolean` | `true` when the signed-in user is a guest (no email) |

On mount it:
1. Calls `supabase.auth.getSession()` to restore any persisted session (handles app re-opens)
2. Subscribes to `supabase.auth.onAuthStateChange()` to react to all future auth events

`isLoading` stays `true` until the initial `getSession()` resolves, preventing premature redirects.

### 4. Navigation Guard — `app/_layout.tsx`

`RootLayoutNav` runs a `useEffect` whenever `session`, `isLoading`, or `segments` changes:

```
isLoading = true                      → render null (splash state)
session + not in authenticated group  → router.replace('/(tabs)')
no session                            → router.replace('/(auth)/login')
```

Post-signup deep-link return: before any auth call that triggers email verification, the calling screen persists the intended destination to disk via `lib/pending-return-to.ts` (backed by `expo-file-system/legacy` under the key `pendingReturnTo`). On `SIGNED_IN`, the guard reads and clears this key and navigates there instead of `/(tabs)`. A `handlingReturnTo` ref guards the async read against re-entry while the effect is pending.

---

## Auth Flows

### Guest

```
features/auth → signInAsGuest()
  → onAuthStateChange fires (SIGNED_IN, is_anonymous = true)
  → guard redirects to /(tabs)
```

### Email / Password Sign In

```
features/auth → signIn(email, password)
  → onAuthStateChange fires
  → guard redirects to /(tabs)
```

### Sign Up

```
features/auth → signUp(email, password)
  → persist pendingReturnTo via lib/pending-return-to (if returnTo param is set)
  → email verification required before session is active
  → screen navigates to post-signup confirmation screen in (auth)/
  → user clicks magic link → app cold-launches
  → onAuthStateChange fires (SIGNED_IN)
  → guard reads pendingReturnTo, clears it, navigates there (or /(tabs) if absent)
```

### Upgrade (guest → registered)

Anonymous users can link an email and password from the Profile tab. The Supabase user ID stays the same — all ratings, submissions, and group memberships are preserved.

```
features/auth → upgradeAccount(email, password)
  → verification email sent
  → on verification: isAnonymous becomes false, profile screen updates
```

### Sign Out

```
features/auth → signOut()
  → onAuthStateChange fires, session becomes null
  → guard redirects to /(auth)/login
```

---

## HTTP Client — `lib/api.ts`

Thin typed wrapper around `fetch` used by all route files that talk to the backend. Requests automatically attach the Supabase bearer token for the current session.

Errors surface as an `ApiError` class that carries both the HTTP `status` and the parsed response `body`:

```ts
try {
  const product = await api.get<Product>(`/products/${barcode}`);
} catch (err) {
  if (err instanceof ApiError && err.status === 404) {
    // render product-not-found UI
  }
}
```

Keeping the status on the error means routes can branch on HTTP semantics without re-parsing strings. The `lib/api.test.ts` suite covers the happy path, 404 handling, and non-JSON error bodies.

---

## Pending Return-To — `lib/pending-return-to.ts`

Small persistent key-value store for a single deep-link destination, backed by a text file under `expo-file-system/legacy`'s `documentDirectory`. Chosen over `@react-native-async-storage/async-storage` to avoid an extra native dependency — the behaviour is equivalent.

API:

| Function | Purpose |
|----------|---------|
| `setPendingReturnTo(path)` | Persist the intended post-auth destination |
| `getPendingReturnTo()` | Read the persisted destination (or `null`) |
| `clearPendingReturnTo()` | Remove it — called on success and on auth failure |

Used by the signup screen (before calling `signUp()`) and by `app/_layout.tsx` (on the post-signin redirect path). An in-memory cache keeps same-boot reads synchronous-ish; cold starts fall through to disk.

---

## State Management

React Context is used for lightweight global state. All context providers are composed in `app/_layout.tsx`:

| Provider | Hook | State |
|----------|------|-------|
| `SessionProvider` | `useSession()` | Auth session, loading state, anonymous flag |
| `RecentProductsProvider` | `useRecentProducts()` | In-memory list of recently viewed product barcodes |

For server data (ratings, products, groups), hooks fetch directly from the API — no global cache layer. Pull-to-refresh is the primary re-fetch mechanism.

---

## Profile & Account Management

The **Profile tab** adapts to the user's account state:

**Guest users** see:
- Avatar with "?" and "Guest account" label
- "Create Account" row → upgrade flow in `(account)/`
- Sign Out (warns about data loss for anonymous accounts)

**Registered users** see:
- Avatar with email initial and email address
- "Change Email" and "Change Password" rows → `(account)/`
- Sign Out

On web, confirmation dialogs use `window.confirm` (Alert.alert buttons are unsupported). On native, `Alert.alert` is used.

---

## Product Screens

`app/(app)/product/[barcode].tsx` is the single entry point for viewing a product. It fetches `GET /products/:barcode` and renders one of four states:

| State | Trigger | UI |
|-------|---------|----|
| Loading | Initial fetch in flight | Spinner |
| Found | 2xx response | Full product detail + rating UI |
| Not found | `ApiError` with `status === 404` | Dedicated empty state (see below) |
| Error | Any other failure | Error message with the thrown message |

The **not-found** branch adapts to auth state via `useSession().isAnonymous`:

- **Registered users** see an "Add this product" button (`testID="product-not-found-add"`) that navigates to `/(app)/add-product` with the barcode as a param.
- **Anonymous users** see a "Sign up" button (`testID="product-not-found-signup"`) that navigates to `/(auth)/signup?returnTo=/product/[barcode]`. The signup screen persists this via `lib/pending-return-to.ts` and the root layout restores it on `SIGNED_IN` (see Auth Flows above).

`app/(app)/add-product.tsx` is the landing page for adding a new product. P5-001 ships a stub that reads the barcode from route params and renders a placeholder; the full camera-assisted flow is P5-002. The stub enforces the registered-user guard as defence-in-depth if an anonymous user reaches it via a deep link.

---

## Icons

`components/ui/` contains a platform-bridging icon component that maps SF Symbols (iOS) to Material Icons (Android/web). New icons require a mapping entry in that component.

---

## Theme

`useColorScheme` detects system light/dark preference. Colour tokens are in `constants/`. The root layout wraps the app in React Navigation's `ThemeProvider`.

---

## Key Patterns

- **Route files are UI-only.** Business logic belongs in `features/` modules. Screens import from feature modules, handle loading/error state, and navigate — nothing more.
- **Supabase is the single source of truth** for auth state — never manage session tokens manually in app code.
- **`isAnonymous`** from `useSession()` is the canonical way to branch UI between guest and registered users — do not inspect `session.user` directly in screens.
- **Email validation** is centralised in `features/auth/` — do not duplicate in screens.
