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
* **Database:** PostgreSQL (via Supabase or local instance)
* **ORM:** Prisma
* **Authentication:** Firebase Auth or Supabase Auth
* **External Data:** Open Food Facts API
* **Infrastructure:** Kubernetes (Amazon EKS), Terraform, ArgoCD
* **Local Dev:** Docker Compose, LocalStack (for AWS service emulation)

## 🚀 Getting Started

### Prerequisites

* Node.js (v24)
* npm or yarn
* Expo Go app on your physical device (iOS/Android) or an Emulator.
* Terraform (for infrastructure)

### Installation

1. **Clone the repository**

    ```bash
    git clone [https://github.com/your-username/bread-sheet.git](https://github.com/your-username/bread-sheet.git)
    cd bread-sheet
    ```

2. **Install Client Dependencies**

    ```bash
    cd client
    npm install
    ```

3. **Install Server Dependencies**

    ```bash
    cd ../server
    npm install
    ```

4. **Environment Setup**
    * Create a `.env` file in the `server` directory.
    * Add port as variable, e.g, PORT=3000
    * Add your database URL and API keys:

        ```env
        DATABASE_URL="postgresql://user:password@localhost:5432/breadsheet"
        JWT_SECRET="your_secret_key"
        ```

5. **Docker Setup**
    From the project root:

    * **Option A: Server Development** (Database in Docker, Server Local)

      ```bash
      docker compose up -d
      ```

    * **Option B: App Development** (Database & Server in Docker)

      ```bash
      docker compose --profile app-dev up -d
      ```

    * **Note on AWS:** This setup includes **LocalStack** running on port `4566`.
      The server is pre-configured to use this for S3/Lambda calls during development.

6. **Run the App**
    * **Server:** `npm run dev` (inside `/server`) - *Only required for Option A.*
    * **Client:** `npx expo start` (inside `/client`)

### Infrastructure (Terraform)

To deploy the infrastructure locally to LocalStack:

1. Navigate to the terraform directory: `cd terraform`
2. Initialize Terraform: `terraform init`
3. Apply the configuration: `terraform apply --auto-approve`

This will create the S3 bucket and Lambda function inside the LocalStack container.