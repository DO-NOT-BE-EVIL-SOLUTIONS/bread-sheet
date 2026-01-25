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

## 🚀 Getting Started

### Prerequisites

* Node.js (v18+)
* npm or yarn
* Expo Go app on your physical device (iOS/Android) or an Emulator.

### Installation

1. **Clone the repository**

    ```bash
    git clone [https://github.com/your-username/tastebud.git](https://github.com/your-username/tastebud.git)
    cd tastebud
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
        DATABASE_URL="postgresql://user:password@localhost:5432/tastebud"
        JWT_SECRET="your_secret_key"
        ```

5. **Run the App**
    * **Server:** `npm run dev` (inside `/server`)
    * **Client:** `npx expo start` (inside `/client`)