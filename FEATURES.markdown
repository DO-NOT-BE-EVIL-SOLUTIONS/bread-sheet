# Project Backlog & Tickets
## Phase 1: Data Foundation & Authentication

### [TICKET-001] Define Database Schema (Prisma)
**Goal:** Define the shape of data in `server/prisma/schema.prisma` and initialize the database.
**Key Models:**
- `User`: ID, email (optional), username, avatar.
- `Product`: Barcode (unique), name, brand, image_url, generic_name.
- `Rating`: UserID, ProductID, taste_score, texture_score, value_score, comment.
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
- [ ] Camera permission handling.
- [ ] Successful scan captures barcode string.
- [ ] Navigation to **Product Detail** screen upon scan.

## Phase 3: The Rating Core

### [TICKET-005] Product Detail & Rating UI
**Goal:** Display product info and allow users to submit ratings.
**UI:**
- Header with Product Image and Name.
- Sliders or Star inputs for Taste, Texture, and Value.
- "Submit" button.
**State:** Use `zustand` for form state if complex.
**Acceptance Criteria:**
- [ ] User can view product details.
- [ ] User can adjust rating values.
- [ ] Submit button sends `POST` request to backend.
User History

## Phase 4: Social & History

### [TICKET-006] User History
**Goal:** Display a list of items the user has previously rated.
**UI:** A simple `FlatList` in a profile/history tab.
**Backend:** Endpoint `GET /users/me/ratings`.
**Acceptance Criteria:**
- [ ] List displays product name, image, and user's score.
- [ ] Clicking an item navigates to details.

### [TICKET-007] Group Management
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

### [TICKET-008] Social Login Providers (Google, Apple)
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