# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BreadSheet is a food rating/social app. Users scan barcodes, discover products, rate them (taste, texture, value), and share within groups. The monorepo has three main pillars:

- `bread-sheet-app/` — React Native/Expo mobile frontend
- `server/` — Node.js/Express REST API backend
- `terraform/` — AWS infrastructure (EKS, RDS, S3, Lambda) + LocalStack for local dev

## Commands

### Frontend (`bread-sheet-app/`)

```sh
npm start           # Expo dev server
npm run ios         # iOS emulator
npm run android     # Android emulator
npm run web         # Web browser
npm run lint        # ESLint
```

### Backend (`server/`)

```sh
npm run dev                # Dev server with nodemon hot-reload
npm run build              # Compile TypeScript to dist/
npm start                  # Run compiled server
npm run lint               # ESLint
npm run prisma:generate    # Regenerate Prisma client (after schema changes)
npm run prisma:migrate     # Create and apply new migration (dev)
npm run db:deploy          # Deploy migrations + generate client (prod/CI)
```

### Local Infrastructure

```sh
# Start DB + LocalStack (default)
docker compose up -d

# Start DB + LocalStack + server (app-dev profile)
docker compose --profile app-dev up -d

# Inspect the database
cd server && npx prisma studio
```

## Architecture

### Frontend

**Routing:** Expo Router (file-based, like Next.js). Route groups:
- `(auth)/` — unauthenticated screens (login, signup, guest)
- `(tabs)/` — main app tab navigation (authenticated)
- `(app)/` — additional authenticated screens

**Auth gate:** `app/_layout.tsx` wraps the app in `<SessionProvider>`. The session hook (`hooks/use-session.tsx`) listens to `supabase.auth.onAuthStateChange()` and drives redirects — no session → `/(auth)/login`, session → `/(tabs)`.

**Supabase client** is initialized in `lib/supabase.ts` using `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

**Feature modules** live in `features/` (auth, food, groups) — keep business logic there, not in route files.

### Backend

**Pattern:** Routes → Controllers → Services → Database (MVC)

**Middleware stack** (in order in `app.ts`):
1. Rate limiting: `apiLimiter` (100 req/15min) on `/api/*`, `authLimiter` (10 req/hr) on auth endpoints
2. `requireAuth` — verifies Supabase Bearer token, injects `user` into `req`
3. Controllers handle request/response
4. `errorHandler` — centralized error middleware

**Prisma client** is generated to a custom location: `src/generated/prisma_client`. Always import from there, not from `@prisma/client` directly.

**Image processing:** `services/imageService.ts` uses `sharp` for resizing; files stored in S3 (LocalStack locally).

### Data Model (Prisma schema at `server/prisma/schema.prisma`)

Core models: `User`, `Product` (barcode/brand/image), `Rating` (taste/texture/value scores + comments), `Group`, `GroupMember` (roles: ADMIN/MEMBER), `Item`.

### Auth Flow

1. Guest: `supabase.auth.signInAnonymously()` — immediate access, email is optional
2. Registered: `signInWithPassword()` / `signUp()`
3. Backend: `authMiddleware.ts` validates the Bearer JWT via Supabase and populates `req.user`

### Infrastructure

Local dev uses Docker Compose:
- PostgreSQL 18-Alpine on port 5432 (`admin:password@localhost:5432/breadsheet`)
- LocalStack on port 4566 (emulates S3, Lambda, IAM, STS)

Production runs on EKS (Terraform-provisioned) with ArgoCD for GitOps. Database migrations run as a Kubernetes Job or initContainer before the server pod starts.

## Key Environment Variables

**Server (`server/.env`):**
```
PORT=3000
NODE_ENV=development
DATABASE_URL="postgresql://admin:password@localhost:5432/breadsheet"
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
```

**Frontend (`bread-sheet-app/.env` or `app.config.js`):**
```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

## ADRs

Architecture decisions are tracked in `docs/architecture-decision-records/`. Current ADRs:
- `0001-auth-provider.md` — Why Supabase Auth was chosen over alternatives
