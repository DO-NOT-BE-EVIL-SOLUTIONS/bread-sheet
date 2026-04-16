# Project Backlog & Tickets
## Phase 1: Data Foundation & Authentication

### [TICKET-P1-001] Define Database Schema (Prisma)
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

### [TICKET-P1-002] Implement Authentication Strategy
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

### [TICKET-P2-001] Open Food Facts Integration (Backend)
**Goal:** Retrieve product details via barcode, caching results locally.
**Logic:**
- Create endpoint `GET /products/:barcode`.
- Step 1: Check local DB for product.
- Step 2: If missing, fetch from Open Food Facts API.
- Step 3: Save to local DB (cache) and return to client.
**Acceptance Criteria:**
- [x] API returns product data for valid barcodes.
- [x] Data is cached in the `Product` table after the first fetch.

### [TICKET-P2-002] Barcode Scanner (Frontend)
**Goal:** Allow the user to scan a product using the device camera.
**Tech:** `expo-camera`.
**UI:** A dedicated tab or modal (accessible from FAB) that opens the camera.
**Acceptance Criteria:**
- [x] Camera permission handling.
- [x] Successful scan captures barcode string.
- [x] Navigation to **Product Detail** screen upon scan.

## Phase 3: The Rating Core

### [TICKET-P3-001] Product Detail & Rating UI
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

## Phase 4: History

### [TICKET-P4-001] User History
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

## Phase 5: Product Contributions

### [TICKET-P5-001] Missing Product Detection & Add-Product Entry Point
**Goal:** When a scanned barcode yields no result, surface a clear call-to-action so the user can contribute the missing product instead of hitting a dead end.
**Logic:**
- `GET /products/:barcode` already returns `404` for unknown barcodes.
- The product screen must distinguish between "loading", "found", and "not found" states.
- In the "not found" state, render a dedicated empty-state UI that differs by auth state:
  - **Registered user:** a message ("This product isn't in the database yet") and a prominent **"Add this product"** button that navigates to the Add Product screen (`app/(app)/add-product.tsx`), pre-filled with the scanned barcode.
  - **Anonymous/guest user:** the same "This product isn't in the database yet" message, a secondary explanation ("Sign up to help add it"), and a **"Sign up"** button. Do **not** redirect automatically — the user stays on the product-not-found screen and chooses whether to act.
**Post-signup navigation (deep-link return):**
- When a guest taps "Sign up" from this screen, navigate to `/(auth)/signup` and pass the current barcode as a route parameter: `/(auth)/signup?returnTo=/product/[barcode]`.
- The sign-up screen must accept and persist the `returnTo` parameter through the entire signup flow (email entry → verification → completion).
- On successful account creation, instead of the default redirect to `/(tabs)`, the auth completion logic checks for `returnTo` and navigates there instead — landing the user back on the product-not-found screen, now authenticated, where the "Add this product" button is visible.
- If signup is abandoned or fails, `returnTo` is discarded and normal post-auth routing applies.
**Acceptance Criteria:**
- [ ] Scanning an unknown barcode shows a "Product not found" state (not an error/crash).
- [ ] Registered users see the "Add this product" button; tapping navigates to the Add Product screen with the barcode pre-filled.
- [ ] Anonymous users see the product-not-found message and a "Sign up" button — they are not automatically redirected.
- [ ] Tapping "Sign up" navigates to the sign-up screen with `returnTo=/product/[barcode]` in the route params.
- [ ] After completing signup, the user is returned to the product-not-found screen for that barcode, now seeing the "Add this product" button.
- [ ] Abandoning signup mid-flow does not navigate to the product screen; normal post-auth routing applies.
- [ ] Known products continue to render normally — no regression.

### [TICKET-P5-002] Add Product Screen — Camera-Assisted & Manual Entry
**Goal:** Allow users to submit a new product with display image, nutritional label photo, and structured data, with on-device OCR + AI-assisted extraction reducing manual effort.
**UI Flow:**
1. **Photos step** — two capture slots:
   - *Product photo* — what appears in listings/ratings (front of packaging).
   - *Nutritional label photo* — used for extraction (ingredients/nutrition table).
   - Each slot shows a camera icon; tapping opens `expo-image-picker` or in-app camera.
2. **Extraction step** — after the label photo is captured:
   - Run `@react-native-ml-kit/text-recognition` on-device (no network call, works offline). This uses Google ML Kit on Android and Apple's Vision framework on iOS — both on-device, no image leaves the phone at this stage.
   - If the extracted raw text is sufficiently long (e.g. > 50 chars), POST only the text to `POST /products/extract-label` for AI structuring — no image upload needed.
   - If on-device OCR yields too little text (blurry photo, poor lighting), fall back to uploading the label image itself so the backend can run vision inference.
   - Show a loading indicator during the backend structuring call. If both paths fail, or the user skips, proceed with empty fields.
3. **Review & fill step** — structured form fields (name, brand, generic name, energy kcal, carbs, fat, protein, salt, serving size). Three modes selectable by the user:
   - **"Fill manually"** — all fields start blank; extraction result is discarded.
   - **"Pre-fill & edit"** (default when extraction succeeded) — fields are pre-populated from extracted result; user can correct any value.
   - **"Accept all"** — fields are locked and shown read-only; user can still switch back to pre-fill mode.
4. **Submit step** — "Submit product" button posts to backend.
**Access control:**
- The Add Product screen is only reachable by registered (non-anonymous) users. This is normally enforced upstream in P5-001, but as a safety net: if an anonymous user navigates directly to the route (e.g. via a deep link), show a full-screen prompt ("You need an account to add products") with a "Sign up" button. Pass the current route (including the barcode param) as `returnTo` so the same post-signup return flow from P5-001 applies.
- Check registration status via the session hook (`hooks/use-session.tsx`); Supabase anonymous sessions carry `is_anonymous: true` in their JWT claims.
**Technical notes:**
- `@react-native-ml-kit/text-recognition` is an on-device library; add to `bread-sheet-app/` dependencies. Requires no API key.
- Form validation: name and barcode are required; numeric nutrient fields must be non-negative.
- Product display photo uploads go to S3 via pre-signed URL (reuse `imageService.ts` pattern). The label photo is only uploaded as a fallback if on-device OCR fails — not stored permanently.
**Image processing (client-side, before any upload):**
- Use `expo-image-manipulator` to resize and compress every image before it leaves the device:
  - *Product display photo*: resize to max 1200 px on the longest side, compress to JPEG at 85% quality.
  - *Label photo (OCR fallback)*: resize to max 1600 px on the longest side (higher res aids OCR accuracy), compress to JPEG at 90% quality.
- Run manipulation after capture/selection, before showing the preview — the preview should already display the processed version.
- If the processed file still exceeds **5 MB**, show an inline error ("Photo is too large — please try again in better lighting or closer to the subject") and block the upload.
**Acceptance Criteria:**
- [ ] User can photograph the product and the nutritional label from within the screen.
- [ ] On-device OCR runs locally after the label photo is captured (no network request at this stage).
- [ ] If OCR text is sufficient, only the raw text (not the image) is sent to the backend.
- [ ] If OCR text is insufficient, the label image is sent as a fallback for backend vision inference.
- [ ] All images are resized and compressed client-side before upload using `expo-image-manipulator`.
- [ ] Images exceeding 5 MB after compression show an inline error and are not uploaded.
- [ ] All three fill modes work correctly (manual, pre-fill+edit, accept-all).
- [ ] Required-field validation prevents submission of incomplete data.
- [ ] Product display photo uploads to S3; URL is included in the submission payload.

### [TICKET-P5-003] Backend: Label Extraction, Submission, & Peer Verification
**Goal:** Provide three backend capabilities: (1) structure nutritional data from on-device OCR text (primary) or a label image (fallback); (2) validate and normalise incoming images server-side; (3) accept product submissions from registered users and gate promotion to `VERIFIED` behind peer review by a second registered user.
**Endpoints:**
- `POST /products/extract-label` — accepts either `{ rawText: string }` (primary path, from on-device OCR) or a multipart label image (fallback path, when OCR was insufficient). Returns structured JSON of extracted fields. Uses Claude text API for the text path (cheap); falls back to Claude vision API only when an image is provided. Returns best-effort partial results on low-confidence extractions; never blocks the user flow.
- `POST /products` — accepts full product payload from the app, runs AI plausibility checks, persists the product as `status: PENDING_REVIEW`, and returns immediately. Only registered users may call this endpoint (see registration gate below).
- `POST /products/:barcode/verify` — a registered user who is **not** the original submitter confirms the product data looks correct. Records a `ProductVerification` row (`userId`, `barcode`, `createdAt`). Once **2 distinct verifications** exist for a product, the backend automatically promotes it to `status: VERIFIED` and enqueues the Open Food Facts sync job. Submitters attempting to verify their own submission receive `403 Forbidden`.
- `DELETE /products/:barcode/verify` — allows a verifier to retract their own verification before the threshold is reached (e.g. they spotted an error after the fact).
**Visibility rules for `PENDING_REVIEW` products:**
- Visible immediately to the submitter in their own history.
- Visible to all other registered users in scan/search results, but flagged with an `unverified: true` field in the response so the client can render a "Needs review" badge and a "Looks correct" action.
- Hidden from anonymous users — `GET /products/:barcode` returns `404` when the only match is `PENDING_REVIEW`.
**Image validation & normalisation (API-side, applies to all image uploads):**
- **Registration gate:** `POST /products` and `POST /products/extract-label` must be protected by a `requireRegistered` middleware that checks the Supabase JWT claim `is_anonymous !== true`. Anonymous tokens are rejected with `403 Forbidden` and a message directing the user to create an account. This is a defence-in-depth measure alongside the client-side gate.
- **Size gate (pre-processing):** Reject any multipart image field exceeding **8 MB** raw with `413 Payload Too Large` before touching the bytes. Configure via `multer` (or equivalent) `limits.fileSize`. This acts as a hard server-side ceiling even if the client-side 5 MB check is bypassed.
- **Format normalisation:** Inspect the actual file signature (magic bytes via `file-type` or `sharp` metadata), not just the `Content-Type` header. If the image is not already JPEG or WebP, convert it to JPEG using the existing `sharp` pipeline in `imageService.ts`. Unsupported formats (SVG, PDF, etc.) are rejected with `415 Unsupported Media Type`.
- **Resize normalisation:** Even if the client already resized, apply a server-side cap: max 1200 px longest side for product photos, max 1600 px for label images (fallback OCR path). This ensures consistent dimensions for S3 storage and OFF submission regardless of client behaviour.
- **Output format:** Always store as JPEG (`.jpg`) in S3 — WebP can be added later once OFF support is confirmed. Return the canonical S3 URL in the response.
**Plausibility checks (AI-assisted):**
- Nutritional values within realistic ranges (e.g. calories per 100 g typically 0–900 kcal, protein + fat + carbs ≤ 100 g).
- Barcode format matches expected GS1 structure.
- Name/brand fields are not empty or clearly nonsensical (gibberish detection via LLM).
- Flag (but don't hard-reject) values that are unusual but plausible (e.g. very high fat content for butter/oil).
**Schema changes:**
- Add `status` enum to `Product`: `VERIFIED` (from Open Food Facts cache or peer-approved), `PENDING_REVIEW` (user-submitted, awaiting verification), `REJECTED`.
- Add `submittedByUserId: String?` to `Product` — references the registerd user who created the submission.
- Add `plausibilityFlag: Boolean` to `Product` (default `false`) — set when AI considers data unusual but acceptable.
- Add new model `ProductVerification`: `userId`, `barcode`, `createdAt` — composite unique key on `(userId, barcode)` to prevent duplicate votes.
**Acceptance Criteria:**
- [ ] Anonymous users calling `POST /products` or `POST /products/extract-label` receive `403`.
- [ ] Images larger than 8 MB are rejected with `413` before any processing occurs.
- [ ] Images in unexpected formats are converted to JPEG via `sharp`; unsupported formats return `415`.
- [ ] Format detection uses magic bytes, not `Content-Type`.
- [ ] All stored images are capped at their respective max dimensions server-side.
- [ ] `POST /products/extract-label` accepts raw OCR text and returns structured nutritional fields via Claude text API.
- [ ] `POST /products/extract-label` also accepts a label image as a fallback and runs Claude vision inference.
- [ ] The text path is used whenever `rawText` is provided; the image path is only invoked when no text is present.
- [ ] `POST /products` persists a user-submitted product with `status: PENDING_REVIEW`.
- [ ] AI plausibility check runs synchronously before the response; clearly implausible submissions return a `422` with a human-readable reason.
- [ ] Suspicious-but-plausible submissions are flagged (`plausibilityFlag: true`) but accepted.
- [ ] `POST /products/:barcode/verify` records a verification from a registered non-submitter; returns `403` if the caller is the submitter.
- [ ] After 2 distinct verifications, the product is automatically promoted to `VERIFIED` and the OFF sync is enqueued.
- [ ] `DELETE /products/:barcode/verify` removes the caller's verification if the threshold has not yet been reached.
- [ ] `PENDING_REVIEW` products return `unverified: true` in the response and are hidden from anonymous users.
- [ ] A migration adds the `status` field with a default of `VERIFIED` for existing Open Food Facts-sourced products.

### [TICKET-P5-004] Open Food Facts Contribution Sync
**Goal:** Automatically contribute user-verified product data back to the Open Food Facts (OFF) project using their write API, closing the loop between local submissions and the upstream open dataset.
**Logic:**
- After a `PENDING_REVIEW` product passes plausibility checks, enqueue it for OFF submission.
- Sync runs as a background job (Lambda or a scheduled task via existing `server/` worker):
  1. Fetch all `PENDING_REVIEW` products not yet attempted (or with `retryAt <= now`).
  2. Submit each to the OFF Product Add/Edit API (`POST https://world.openfoodfacts.org/cgi/product_jqm2.pl`) using a registered OFF bot account.
  3. On success: mark product `status: VERIFIED`, store the OFF product page URL.
  4. On failure: increment `syncAttempts`, set `retryAt` (exponential back-off), log the error. After 5 failures, mark `status: REJECTED` and notify the submitter (in-app or email).
- Image assets (product photo, label photo) are also pushed to OFF's image upload endpoint.
**Schema additions to `Product`:**
- `offSyncStatus`: `QUEUED | SYNCING | SYNCED | FAILED`
- `offSyncAttempts: Int`
- `offRetryAt: DateTime?`
- `offProductUrl: String?`
**Notes:**
- OFF requires an account with edit rights; credentials stored in server env vars (`OFF_USERNAME`, `OFF_PASSWORD`).
- Respect OFF's rate limits (no more than ~100 writes/hour for bot accounts).
- All sync activity should be idempotent — re-running on the same product must not create duplicates (use barcode as the OFF product key).
**Acceptance Criteria:**
- [ ] Accepted `PENDING_REVIEW` products are automatically submitted to Open Food Facts.
- [ ] Peer-verified product edits (from P5-005) are synced to OFF as updates to the existing product entry, not as new submissions.
- [ ] Product images are uploaded to OFF alongside structured data.
- [ ] Sync failures retry with exponential back-off and cap at 5 attempts.
- [ ] After 5 failed attempts, the product is marked `REJECTED` and the submitter is notified.
- [ ] Sync is idempotent — re-submitting the same barcode to OFF does not create a duplicate entry.
- [ ] `OFF_USERNAME` and `OFF_PASSWORD` are stored in env vars, never hard-coded.

### [TICKET-P5-005] Product Editing & Peer-Review of Changes
**Goal:** Allow registered users to propose corrections to existing product data. Changes are not applied immediately — two other registered users must review and confirm the diff before it takes effect. Verified edits are synced back to Open Food Facts.
**Frontend — Edit entry point:**
- On the Product Detail screen, show an **"Edit product"** icon/button for registered users. Hidden entirely for anonymous users (no tooltip, no disabled state — just absent).
- Tapping navigates to `app/(app)/edit-product/[barcode].tsx`, pre-filled with the current product values.
- The edit form is identical in layout to the Add Product screen (P5-002) but all fields start pre-populated. The barcode field is read-only.
- On submit, POST the changed fields to the backend. If the user has not changed anything, the submit button is disabled.
**Frontend — Reviewer diff screen:**
- When a registered user opens a product that has a `PENDING_EDIT`, show a non-intrusive banner: "Someone suggested a change to this product — want to review it?"
- Tapping opens a **diff screen** (`app/(app)/review-edit/[editId].tsx`) showing old value → new value for every changed field, highlighted clearly (e.g. strikethrough old, bold new).
- Three actions:
  - **"Looks correct"** — casts an approval vote.
  - **"Something's wrong"** — casts a rejection vote.
  - **"Dismiss"** — hides the banner for this edit on this device; the edit remains pending for other users. Does not count as a vote.
- The diff screen is only shown once per edit per user (until dismissed or voted). Users who authored the edit do not see the review banner for their own submission.
- Show the current vote tally (e.g. "1 of 2 approvals needed") to give context, but do not reveal who voted.
**Backend — Endpoints:**
- `POST /products/:barcode/edits` — accepts a partial product payload (only changed fields). Creates a `ProductEdit` record with `status: PENDING`. Only registered users; returns `403` for anonymous tokens. Returns `409` if a `PENDING` edit already exists for this product (one open edit at a time per product).
- `GET /products/:barcode/edits/pending` — returns the current pending edit for a product (fields: `editId`, `proposedChanges` as a diff object, vote counts). Used by the client to decide whether to show the review banner.
- `POST /products/edits/:editId/votes` — body `{ vote: "APPROVE" | "REJECT" }`. Records a `ProductEditVote`. Returns `403` if the caller is the edit author. Composite unique key on `(userId, editId)` prevents double-voting.
- `DELETE /products/edits/:editId/votes` — retracts the caller's vote if the edit is still `PENDING`.
**Edit resolution logic (triggered after each new vote):**
- **2 approvals** → apply the proposed changes to the `Product` record, mark edit `status: APPLIED`, enqueue OFF sync for the updated fields (including any new images). Notify the author (in-app).
- **2 rejections** → mark edit `status: REJECTED`, discard proposed changes. Notify the author.
- Tie-breaking: if votes are mixed (e.g. 1 approve + 1 reject), wait for a third voter to reach 2 on either side.
- Edits that receive no votes within **30 days** are automatically expired (`status: EXPIRED`) by a scheduled cleanup job.
**OFF sync for edits:**
- Reuses the P5-004 sync infrastructure. On `APPLIED`, enqueue an OFF update for the changed fields only (partial update via the OFF product write API). Image fields are re-uploaded to OFF if they changed.
- Sync is idempotent — uses the barcode as the OFF product key, so repeated syncs update rather than duplicate.
**Schema additions:**
- New model `ProductEdit`: `id`, `barcode` (FK → Product), `authorUserId`, `proposedChanges` (JSON — field name → new value), `status` (`PENDING | APPLIED | REJECTED | EXPIRED`), `createdAt`, `expiresAt`.
- New model `ProductEditVote`: `id`, `editId` (FK → ProductEdit), `userId`, `vote` (`APPROVE | REJECT`), `createdAt`. Composite unique key on `(editId, userId)`.
- Constraint: only one `ProductEdit` with `status: PENDING` allowed per barcode at a time (enforced at DB level with a partial unique index).
**Acceptance Criteria:**
- [ ] Registered users see an "Edit product" button on the Product Detail screen; anonymous users do not.
- [ ] The edit form is pre-populated with current product values; the barcode field is read-only.
- [ ] Submitting unchanged data is blocked client-side (submit button disabled).
- [ ] `POST /products/:barcode/edits` returns `403` for anonymous users and `409` if a pending edit already exists.
- [ ] A registered non-author user sees the review banner on a product with a pending edit.
- [ ] The diff screen clearly shows old vs. new values for every changed field.
- [ ] "Looks correct" and "Something's wrong" record votes; "Dismiss" hides the banner locally without voting.
- [ ] A user cannot vote on their own edit (`403`).
- [ ] A user cannot vote twice on the same edit (duplicate vote returns `409`).
- [ ] 2 approvals apply the edit, notify the author, and enqueue an OFF sync.
- [ ] 2 rejections discard the edit and notify the author.
- [ ] Mixed votes (1–1) wait for a third voter rather than resolving early.
- [ ] Pending edits with no votes after 30 days are expired by a cleanup job.
- [ ] Verified edits are synced to OFF as updates to the existing product entry.

## Phase 6: Social

### [TICKET-P6-001] Group Management
**Goal:** Enable private sharing contexts.
**Logic:**
- Users create a group -> generate shareable code.
- Other users join via code.
- Feed filtering: "My Groups" vs "Global".
**Acceptance Criteria:**
- [ ] User can create a group.
- [ ] User can join a group with a code.
- [ ] Ratings can be filtered by group context.

## Phase 7: Auth Enhancements

### [TICKET-P7-001] Social Login Providers (Google, Apple)
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

### [TICKET-P7-002] API Authorization — Roles & Resource Ownership
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
- [ ] Ownership guards are implemented as composable middleware, not adD-hoc per-controller checks.
- [ ] All new authorization rules are covered by integration tests.