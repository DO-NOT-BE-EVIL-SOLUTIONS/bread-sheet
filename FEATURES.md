# Project Backlog & Tickets
## Phase 1: Data Foundation & Authentication

### [TICKET-001] Define Database Schema (Prisma)
**Goal:** Define the shape of data in `server/prisma/schema.prisma` and initialize the database.
**Key Models:**
- `User`: ID, email (optional), username, avatar.
- `Product`: Barcode (unique), name, brand, image_url, generic_name.
- `Rating`: UserID, ProductID, taste (Float 0–10 in 0.5 steps), comment.
- `Group`: Name, invite_code.
**Acceptance Criteria:**
- [x] Schema defined in `server/prisma/schema.prisma`.
- [x] Migration created and applied via `npx prisma migrate dev`.
- [x] Database tables exist in local PostgreSQL.
Goal: Define the shape of your data in server/prisma/schema.prisma.
Key Models:
- `User`: ID, email (optional), username, avatar.

### [TICKET-002] Implement Authentication Strategy
**Goal:** Secure the app and link ratings to users using Supabase Auth with support for Anonymous Sign-In.
**Implementation:**
- **Backend:** Create middleware to verify tokens on protected API routes.
- **Frontend:** Create Login/Signup screens.
- **Backend:** Add `express-rate-limit` to prevent API abuse.
- **Frontend:** Implement "Continue as Guest" (Anonymous Auth) and "Sign Up" (Link Account).
- **Routing:** Modify `app/_layout.tsx` to conditionally render the main `(tabs)` or an `(auth)` stack based on login status.
- **Local and Cloud Setup of Supabase** Setup Supabase working for local development and for cloud deployment.
**Acceptance Criteria:**
- [x] User can use app immediately as "Guest" (Anonymous).
- [x] User can upgrade Guest account to Email account.
- [x] Backend rejects requests without valid tokens.
- [x] Rate limiting is active on API routes.
- [x] User identity is available in the app state.
- [x] Setup Supabase working for local development and for cloud deployment. -> Use DEV Supabase stage for development


## Phase 2: The "Scan & Discover" Loop

### [TICKET-003] Open Food Facts Integration (Backend)
**Goal:** Retrieve product details via barcode, caching results locally.
**Logic:**
- Create endpoint `GET /products/:barcode`.
- Step 1: Check local DB for product.
- Step 2: If missing, fetch from Open Food Facts API.
- Step 3: Save to local DB (cache) and return to client.
**Acceptance Criteria:**
- [x] API returns product data for valid barcodes.
- [x] Data is cached in the `Product` table after the first fetch.

### [TICKET-004] Barcode Scanner (Frontend)
**Goal:** Allow the user to scan a product using the device camera.
**Tech:** `expo-camera`.
**UI:** A dedicated tab or modal (accessible from FAB) that opens the camera.
**Acceptance Criteria:**
- [x] Camera permission handling.
- [x] Successful scan captures barcode string.
- [x] Navigation to **Product Detail** screen upon scan.

## Phase 3: The Rating Core

### [TICKET-005] Product Detail & Rating UI
**Goal:** Display product info and allow users to submit a taste rating.
**UI:**
- Header with Product Image and Name.
- Custom `TasteSlider` component: draggable track 0–10 with 0.5-step snapping, large animated score badge (colour-coded amber → green), and −/+ stepper buttons.
- Optional comment field.
- "Submit" button.
**Acceptance Criteria:**
- [x] User can view product details.
- [x] User can set taste score 0–10 in 0.5 increments.
- [x] Submit button sends `POST` request to backend with `{ barcode, taste, comment? }`.
User History

## Phase 4: Social & History

### [TICKET-006] User History
**Goal:** Display a list of items the user has previously rated, and recently opened products.
**UI:** Home tab with two sections: "My Ratings" and "Recently Opened".
**Backend:** Endpoint `GET /users/me/ratings`.
**Implementation:**
- Home tab (`app/(tabs)/index.tsx`) fetches rating history via `GET /api/users/me/ratings` for registered users.
- Each rating card shows product thumbnail, name, brand, star score, optional comment, and relative timestamp.
- "Recently Opened" section is tracked in-memory via `RecentProductsProvider` context (`hooks/use-recent-products.tsx`). The product screen records a view whenever a product loads successfully.
- Guest users see a sign-up prompt instead of ratings; recently opened still works for guests.
- Pull-to-refresh reloads the ratings list.
**Acceptance Criteria:**
- [x] List displays product name, image, and user's score.
- [x] Clicking an item navigates to the product/rating screen.
- [x] Recently opened products are shown even before rating.
- [x] Guest users see a contextual prompt to create an account.

### [TICKET-008] Group Management
**Goal:** Enable private sharing contexts.
**Logic:**
- Users create a group -> generate shareable code.
- Other users join via code.
- Feed filtering: "My Groups" vs "Global".
**Acceptance Criteria:**
- [ ] User can create a group.
- [ ] User can join a group with a code.
- [ ] Ratings can be filtered by group context.

## Phase 5: Auth Enhancements

### [TICKET-009] Social Login Providers (Google, Apple)
**Goal:** Allow users to sign in and upgrade guest accounts using OAuth providers, reducing friction compared to email/password.
**Implementation:**
- **Supabase:** Enable Google and Apple providers in the Supabase dashboard. Configure OAuth credentials from Google Cloud Console and Apple Developer Console.
- **Frontend (web):** Use `supabase.auth.signInWithOAuth()` for redirect-based flow — add to `features/auth/`.
- **Frontend (native):** Web redirect flow does not work on native. Use `expo-auth-session` (Google) and `expo-apple-authentication` (Apple) to obtain tokens natively, then exchange via `supabase.auth.signInWithIdToken()`.
- **Anonymous upgrade:** Extend the upgrade screen with provider buttons using `supabase.auth.linkIdentity()` as an alternative to the email/password path.
- **Platform branching:** `features/auth/` will need platform-aware logic (`Platform.OS`) for web vs native OAuth paths.
**Notes:**
- Apple Sign In is mandatory on iOS if any other third-party social login is offered (App Store guideline 4.8).
- Google and Apple must both ship together on iOS for compliance.
**Acceptance Criteria:**
- [ ] User can sign in with Google on web and native.
- [ ] User can sign in with Apple on iOS.
- [ ] Anonymous user can link a Google or Apple account from the upgrade screen.
- [ ] Linking a provider to an existing anonymous account preserves all user data.

### [TICKET-010] API Authorization — Roles & Resource Ownership
**Goal:** Enforce that users can only access or modify resources they own or are permitted to reach via group membership/role, preventing horizontal privilege escalation.
**Scope:**
- **User resources:** `GET /users/:id`, `PATCH /users/:id`, and any user-scoped sub-resources (ratings, history) must only be accessible by the user themselves. No other user may read or mutate another user's private data.
- **Group resources:** All group endpoints (`GET/PATCH/DELETE /groups/:id`, member lists, invite codes) must verify the requesting user is a member of that group. Write/admin operations (rename, delete group, kick members, regenerate invite code) must additionally require the `ADMIN` role within that group.
- **Rating resources:** `PATCH` and `DELETE` on a rating must verify the rating belongs to the authenticated user.
- **Middleware pattern:** Implement reusable Express middleware / guard helpers (e.g. `requireSelf`, `requireGroupMember`, `requireGroupAdmin`) that can be composed on any route, rather than inlining ownership checks in every controller.
**Implementation:**
- Add `requireSelf(paramName)` middleware: compares `req.user.id` against the route param; throws `403 Forbidden` on mismatch.
- Add `requireGroupMember` middleware: looks up `GroupMember` record for `(req.user.id, groupId)`; throws `403` if not found.
- Add `requireGroupAdmin` middleware: same lookup but also asserts `role === 'ADMIN'`.
- Apply guards in the router layer so controllers receive only already-authorized requests.
- Return `403 Forbidden` (not `404`) when the resource exists but the user is not permitted — leaking resource existence to unauthorized users is a separate concern and can be addressed per-endpoint.
- Add integration tests covering: own resource access succeeds, cross-user access returns `403`, non-member group access returns `403`, member-only group admin action returns `403`.
**Acceptance Criteria:**
- [ ] A user cannot read or modify another user's profile, ratings, or history.
- [ ] A non-member cannot read any data from a group they do not belong to.
- [ ] A group `MEMBER` cannot perform admin-only actions (delete group, manage members, regenerate code).
- [ ] A group `ADMIN` can perform all admin-only actions within their group.
- [ ] Ownership guards are implemented as composable middleware, not ad-hoc per-controller checks.
- [ ] All new authorization rules are covered by integration tests.