# Project Backlog & Tickets

## Phase 1: Data Foundation & Authentication

### [TICKET-001] Define Database Schema (Prisma)
**Goal:** Define the shape of data in `server/prisma/schema.prisma` and initialize the database.
**Key Models:**
- `User`: ID, email, username, avatar.
- `Product`: Barcode (unique), name, brand, image_url, generic_name.
- `Rating`: UserID, ProductID, taste_score, texture_score, value_score, comment.
- `Group`: Name, invite_code.
**Acceptance Criteria:**
- [ ] Schema defined in `server/prisma/schema.prisma`.
- [ ] Migration created and applied via `npx prisma migrate dev`.
- [ ] Database tables exist in local PostgreSQL.

### [TICKET-002] Implement Authentication Strategy
**Goal:** Secure the app and link ratings to users using Firebase Auth or Supabase Auth.
**Implementation:**
- **Backend:** Create middleware to verify tokens on protected API routes.
- **Frontend:** Create Login/Signup screens.
- **Routing:** Modify `app/_layout.tsx` to conditionally render the main `(tabs)` or an `(auth)` stack based on login status.
**Acceptance Criteria:**
- [ ] User can sign up and log in.
- [ ] Backend rejects requests without valid tokens.
- [ ] User identity is available in the app state.

## Phase 2: The "Scan & Discover" Loop

### [TICKET-003] Open Food Facts Integration (Backend)
**Goal:** Retrieve product details via barcode, caching results locally.
**Logic:**
- Create endpoint `GET /products/:barcode`.
- Step 1: Check local DB for product.
- Step 2: If missing, fetch from Open Food Facts API.
- Step 3: Save to local DB (cache) and return to client.
**Acceptance Criteria:**
- [ ] API returns product data for valid barcodes.
- [ ] Data is cached in the `Product` table after the first fetch.

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