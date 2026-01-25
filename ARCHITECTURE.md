# System Architecture

## 1. High-Level Overview

BreadSheet follows a classic **Client-Server architecture**.

* **Client:** An Expo React Native app serving as the presentation layer.
* **Server:** A RESTful API handling business logic, database interactions, and external API calls.
* **Database:** Relational database to manage complex relationships between users, groups, and products.

## 2. Frontend Architecture (Expo)

### Directory Structure

```text
/src
 ├── /components      # Reusable UI components (RatingStars, ScannerOverlay)
 ├── /screens         # Main views (HomeScreen, ScanScreen, GroupScreen)
 ├── /navigation      # Navigators (AppNavigator, AuthNavigator)
 ├── /services        # API service calls (Axios instances)
 ├── /store           # Zustand stores (useUserStore, useGroupStore)
 ├── /hooks           # Custom React hooks
 └── /utils           # Helpers (barcode validation, date formatting)