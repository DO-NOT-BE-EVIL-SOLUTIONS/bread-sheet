# GEMINI Project Context

This document provides a summary of the BreadSheet project to be used as context for the Gemini assistant.

## Project Overview

**BreadSheet** is a cross-platform mobile application for social food rating. It allows users to rate food products, scan barcodes to get product details, and share their ratings within private groups.

## Technology Stack

The project is a monorepo with three main parts: a mobile app, a backend server, and infrastructure-as-code.

### Frontend (`bread-sheet-app`)

*   **Framework:** React Native with [Expo](https://expo.dev/)
*   **Language:** TypeScript
*   **UI:** Standard React Native components.
*   **State Management:** Zustand
*   **Key Libraries:**
    *   `expo-camera` for barcode scanning.
    *   React Navigation for routing.

### Backend (`server`)

*   **Runtime:** Node.js
*   **Framework:** Express.js
*   **Language:** TypeScript
*   **Database:** PostgreSQL
*   **ORM:** Prisma
*   **Authentication:** The project is considering Firebase Auth or Supabase Auth.
*   **External APIs:** [Open Food Facts API](https://openfoodfacts.org/) for fetching product data from barcodes.

### Infrastructure & DevOps

*   **Local Development:** Docker Compose is used to orchestrate the local development environment, including the backend server, a PostgreSQL database, and [LocalStack](https://www.localstack.cloud/) to emulate AWS services.
*   **Infrastructure as Code (IaC):** [Terraform](https://www.terraform.io/) is used to define and provision cloud infrastructure on AWS.
    *   **Cloud Provider:** AWS
    *   **Key Resources:** Amazon EKS (Kubernetes), S3 (for file storage), and Lambda.
*   **Deployment:** The project uses a GitOps workflow with [ArgoCD](https://argo-cd.readthedocs.io/en/stable/) for continuous deployment to the Kubernetes cluster. Kubernetes manifests are located in the `terraform/k8s` directory.

## Project Structure Highlights

*   `bread-sheet-app/`: The Expo-based React Native mobile application.
*   `server/`: The Node.js backend API.
*   `terraform/`: Terraform code for AWS infrastructure.
*   `docs/`: Project documentation.
*   `ARCHITECTURE.md`: Provides a detailed overview of the system architecture.
*   `README.md`: Contains setup instructions and general information about the project.

## Getting Started

The recommended way to run the project locally is by using Docker Compose from the root directory:

```bash
docker compose --profile app-dev up -d --build
```

This command builds the server, starts the PostgreSQL database, and runs LocalStack for AWS service emulation.

The mobile app can be started from the `bread-sheet-app/` directory using `npx expo start`.
