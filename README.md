# BreadSheet - Social Food Rating App

**BreadSheet** is a cross-platform mobile application built with Expo and React Native that allows users to rate food products, scan barcodes to retrieve details, and share their culinary discoveries within private groups.

## Key Features

* **Rate by Taste:** Simple, intuitive interface to rate food based on taste, texture, and value.
* **Scan & Discover:** Integrated barcode scanner (EAN/UPC) to instantly find products or fetch metadata via Open Food Facts.
* **Add Products:** Crowdsource the database by adding new items if they don't exist.
* **Social Groups:** Create groups (e.g., "Office Snacks", "Family Dinners") to share ratings and recommendations specifically with them.
* **History:** Keep a personal log of everything you've tasted.

## 🛠 Tech Stack

### Frontend (Mobile)

* **Framework:** [Expo](https://expo.dev/) (React Native)
* **Navigation:** React Navigation (Stack & Tabs)
* **UI Library:** React Native Paper / Tamagui
* **State Management:** Zustand (for lightweight global state)
* **Scanning:** `expo-camera`

### Backend (API)

* **Runtime:** Node.js
* **Framework:** Express.js
* **Database:** PostgreSQL
* **ORM:** Prisma
* **Authentication:** Firebase Auth or Supabase Auth
* **External Data:** Open Food Facts API
* **Infrastructure:** Kubernetes (Amazon EKS), AWS Database, Terraform, ArgoCD
* **Local Dev:** Docker Compose, LocalStack (for AWS service emulation)

## 🚀 Getting Started

### Prerequisites

* Server and App: Node.js (v24) with npm, and docker
* App: Expo Go app on your physical device (iOS/Android) or an Emulator.
* Infrastructure: Terraform

### Local Installation

1. **Clone the repository**
2. **Install React App Dependencies**

    ```bash
    cd bread-sheet-app
    npm install
    ```

3. **Install Server Dependencies**

    ```bash
    cd ../server
    npm install
    ```

4. **Environment Setup**
    * Create an `.env` file in the `./server` directory.

        ```env
        PORT=3000
        NODE_ENV=development
        DATABASE_URL="postgresql://admin:password@localhost:5432/breadsheet"
        ```

5. **Development with Docker**

    The recommended way to run the complete backend stack (PostgreSQL database, Node.js server, and LocalStack for AWS emulation) is with a single Docker Compose command.

    From the project root, run:
    ```bash
    # This single command does it all:
    # 1. Builds the server's Docker image (running `npm install` and `prisma generate`).
    # 2. Starts the PostgreSQL database and LocalStack services.
    # 3. Starts the server, which automatically runs database migrations on startup.
    docker compose --profile app-dev up -d --build
    ```
    Your backend is now running. The server is available at `http://localhost:3000`.

6. **Run the Server/App**
    * **Server:** `npm run dev` (inside `/server`)
    * **Client:** `npx expo start` (inside `/client`)

### Infrastructure (Terraform)

To deploy the infrastructure locally to LocalStack:

1. Navigate to the terraform directory: `cd terraform`
2. Initialize Terraform: `terraform init`
3. Apply the configuration: `terraform apply --auto-approve`

This will create the S3 bucket and Lambda function inside the LocalStack container.
