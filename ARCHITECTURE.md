# Architecture

This document outlines the architecture of the BreadSheet application, a social food rating mobile app.

## 1. High-Level Overview

BreadSheet is built on a **client-server model** composed of three main pillars:

1. **Frontend (`bread-sheet-app`):** A cross-platform mobile application built with **Expo (React Native)**. It provides the user interface for rating foods, scanning barcodes, and interacting with social groups.
2. **Backend (`server`):** A **Node.js/Express.js** RESTful API that serves as the application's backbone. It manages business logic, user data, authentication, and communication with the database.
3. **Infrastructure (`terraform` & `docker`):** An "Infrastructure as Code" setup using **Terraform** to define cloud resources (like S3 and Lambda) and **Docker Compose** to orchestrate a consistent local development environment that mimics the cloud setup using **LocalStack**.

![High-Level Architecture Diagram](https://i.imgur.com/example.png)  <!-- Placeholder for a real diagram -->

---

## 2. Component Deep-Dive

### a. Frontend (`bread-sheet-app`)

The mobile app is the primary entry point for users.

- **Framework:** **Expo (React Native)** allows for a single TypeScript/JavaScript codebase to build for both iOS and Android.
- **Directory Structure:** The `app` directory uses Expo's file-based routing system.

  ``` text
  bread-sheet-app/
  ├── app/
  │   ├── (app)/       # Authenticated routes
  │   ├── (tabs)/      # Main tab navigator layout and screens
  │   ├── _layout.tsx  # Root layout
  │   └── modal.tsx    # Example of a modal screen
  ├── components/      # Shared, reusable UI components
  ├── constants/       # Theme, colors, and other static values
  ├── features/        # Business-logic-specific modules (auth, food, groups)
  └── hooks/           # Reusable React hooks
  ```

- **State Management:** Zustand is used for lightweight, simple global state management.
- **UI:** The UI is built with standard React Native components, potentially extended with a library like React Native Paper or Tamagui as hinted in the `README.md`.
- **Navigation:** **React Navigation** handles all in-app navigation, including the main tab bar and nested stacks.

### b. Backend (`server`)

The server is a standard Node.js application responsible for all core logic.

- **Framework:** **Express.js** provides a robust foundation for routing, middleware, and API endpoint creation.
- **Language:** Written in **TypeScript** for type safety and better maintainability.
- **Directory Structure:**

  ``` text
  server/
  ├── src/
  │   ├── configs/       # Environment variables and configurations
  │   ├── controllers/   # Request/response handlers (the "C" in MVC)
  │   ├── middlewares/   # Express middleware (e.g., error handling)
  │   ├── models/        # Data structures and types
  │   ├── routes/        # API route definitions
  │   └── services/      # Business logic and external service integrations
  ├── Dockerfile         # Defines the container for the server
  └── index.ts           # Application entry point
  ```

- **Database Interaction:** It likely uses an ORM like **Prisma** (as suggested in the `README.md`) to interact with the PostgreSQL database, providing a type-safe data access layer.
- **API:** Exposes a RESTful API for the mobile client to consume. Endpoints cover functionalities like user authentication, creating ratings, managing groups, and fetching product information.

### c. Infrastructure (`terraform` & `docker`)

This pillar ensures that the application is deployable and that development is consistent.

- **Docker (`docker-compose.yml`):**
  - Orchestrates the multi-container local development environment.
  - Manages services like the **PostgreSQL database** and **LocalStack**.
  - **LocalStack** is a key component, emulating AWS services (S3, Lambda) locally. This allows developers to test cloud integrations without needing an actual AWS account or incurring costs.
- **Terraform (`/terraform`):**
  - Contains `.tf` files that define the AWS infrastructure required to run the application in a real cloud environment.
  - Manages the provisioning of resources like:
    - **Amazon S3:** For storing user-generated content like images.
    - **AWS Lambda:** For running serverless functions, possibly for background processing or specific API tasks.
  - Using Terraform ensures the infrastructure is version-controlled, repeatable, and easy to manage.

---

## 3. Data Flow

1. **User Action:** A user performs an action in the **React Native app** (e.g., submitting a rating).
2. **API Request:** The app sends an HTTPS request to the **Node.js/Express server**.
3. **Business Logic:** The server processes the request, validates the data, and performs the required business logic.
4. **Database Interaction:** The server communicates with the **PostgreSQL database** to create, read, update, or delete records.
5. **External Services (Optional):** If the request requires it (e.g., scanning a barcode), the server may call an external API like the **Open Food Facts API**. If it involves file uploads, it interacts with **Amazon S3** (or LocalStack during development).
6. **API Response:** The server sends a response back to the client.
7. **UI Update:** The client receives the response and updates its state and UI accordingly.

---

## 4. External Services

- **Open Food Facts API:** Used to enrich product data by fetching information based on a scanned barcode. This offloads the need to maintain a massive food database internally.
- **Firebase/Supabase Auth (Potential):** The `README.md` suggests using a managed service for authentication to simplify user management and security.