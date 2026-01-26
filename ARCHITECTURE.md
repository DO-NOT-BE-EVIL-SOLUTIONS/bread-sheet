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
  - Manages the provisioning of core cloud resources like:
    - **Amazon EKS (Elastic Kubernetes Service):** The managed Kubernetes cluster where the application will run.
    - **Amazon S3:** For storing user-generated content like images.
    - **AWS Lambda:** For running serverless functions, possibly for background processing or specific API tasks.
  - Using Terraform ensures the infrastructure is version-controlled, repeatable, and easy to manage.
- **Kubernetes Manifests (`/k8s`):**
  - A new directory containing YAML files that declare the desired state of the application within the Kubernetes cluster (e.g., Deployments, Services, Ingress). This is the "source of truth" that ArgoCD will use.

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

---

## 5. Deployment Strategy (GitOps with EKS and ArgoCD)

This section outlines the GitOps process for deploying the backend services to AWS using EKS and ArgoCD. This is a "pull-based" model, where the cluster actively synchronizes itself with the state defined in a Git repository.

### a. Infrastructure as Code (IaaC) Rollout

The `terraform` directory is the single source of truth for the application's infrastructure.

1. **Environment Scaffolding:** Deployment should start by applying the Terraform configuration to provision all necessary cloud resources. This is typically done via a CI/CD pipeline.
   - **Command:** `terraform apply`
   - **Resources Provisioned:**
     - **Networking:** VPC, subnets, and security groups suitable for EKS.
     - **Kubernetes Cluster:** An **Amazon EKS Cluster** with managed node groups.
     - **Database:** A managed PostgreSQL instance, such as **AWS RDS**.
     - **Container Registry:** An **Amazon ECR (Elastic Container Registry)** repository to store the server's Docker images.
     - **Storage & Serverless:** The **S3 bucket** and **Lambda function**.

2. **ArgoCD Installation:** ArgoCD is installed onto the EKS cluster. It is then configured to monitor the Git repository where the Kubernetes manifests are stored. This is typically a one-time setup.

### b. Application Deployment (The GitOps Loop)

The deployment of the application code follows a CI/CD pipeline that integrates with the GitOps workflow.

**CI Pipeline Trigger:** A push or merge to the `main` branch.

**CI Pipeline Steps (e.g., GitHub Actions):**

1. **Build & Test:**
   - The pipeline checks out the code and runs all automated tests.

2. **Build Docker Image:**
   - A new Docker image of the `server` application is built.
   - `docker build -t my-registry/bread-sheet-server:$GIT_SHA .`

3. **Push to ECR:**
   - The image is tagged (e.g., with the Git commit SHA) and pushed to the Amazon ECR repository.
   - `docker push my-registry/bread-sheet-server:$GIT_SHA`

4. **Update Manifests in Git:**
   - The pipeline checks out the repository containing the Kubernetes manifests (this can be the same application repo or a separate "ops" repo).
   - It updates the `image` tag in the `deployment.yaml` file to point to the new image pushed in the previous step.
   - It commits and pushes this change back to the Git repository.

**Continuous Deployment (ArgoCD):**

1. **Detect Change:** ArgoCD, which is constantly monitoring the manifest repository, detects the commit pushed by the CI pipeline. It sees that the desired state (the `deployment.yaml`) has changed.
2. **Sync & Deploy:** ArgoCD "pulls" this change and applies it to the EKS cluster. Kubernetes then performs a rolling update, creating new pods with the new Docker image and safely terminating the old ones.

### c. Database Migrations

Database migrations must be handled carefully before the application pods are updated. This is typically done as a **Kubernetes Job** or an `initContainer` within the main application's Deployment manifest.

- **Option A (Job):** The CI pipeline can trigger a Kubernetes Job that runs `npx prisma migrate deploy` and waits for it to complete before updating the image tag in the main deployment manifest.
- **Option B (initContainer):** An `initContainer` in the `deployment.yaml` runs the migration command. The main application container will only start after the migration container succeeds. This is simpler but can be risky if multiple pods start at once and all try to run the migration.

This automated GitOps flow ensures that every change is tested and that the state of the live cluster is always in sync with the version-controlled manifests in Git.
