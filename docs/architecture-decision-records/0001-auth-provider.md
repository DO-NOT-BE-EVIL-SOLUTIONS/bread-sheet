# Auth Provider for User Authentication

* Status: Accepted
* Date: 2026-03-23

## Context and Problem Statement

The BreadSheet application requires a secure authentication system that supports Anonymous Sign-In (Guest mode) and Account Linking. The project stack is React Native (Expo), Node.js, Prisma, and PostgreSQL. We need a solution that integrates well with this stack and our AWS-based infrastructure.

## Decision Drivers

* **Stack Consistency:** We use PostgreSQL as our primary database.
* **Type Safety:** We use TypeScript across the full stack.
* **Infrastructure:** We use Terraform on AWS and want to avoid unnecessary vendor lock-in (e.g., Google Cloud dependencies).
* **Data Integrity:** We use UUIDs for primary keys.

## Considered Options

* **Firebase Auth:** Mature, robust, but introduces Google Cloud dependency and NoSQL-centric paradigms.
* **Supabase Auth:** Open-source, PostgreSQL-native, strong TypeScript support.
* **Custom Auth:** High maintenance, security risks.

## Decision Outcome

Chosen option: **Supabase Auth**.

### Positive Consequences

* **PostgreSQL Native:** Aligns perfectly with our Prisma/Postgres backend.
* **Infrastructure Neutrality:** Can be self-hosted or used as a managed service; does not require a Google Cloud project setup alongside our AWS infrastructure.
* **Type Generation:** Supabase generates TypeScript definitions from the database schema.
* **UUID Support:** Uses standard UUIDs for user IDs, mapping directly to our Prisma schema.