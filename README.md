# BrgyAlert — Unified Mobile Incident Reporting & Analytics Platform

> **A cloud-native, disaster-resilient emergency reporting, dispatch, and communication platform engineered to modernize local governance, disaster risk management, and response at the barangay level (pilot site: Barangay Lepa).**

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Platform Architecture & Navigation Routing](#2-platform-architecture--navigation-routing)
3. [Technology Stack Specification](#3-technology-stack-specification)
4. [Repository Structure](#4-repository-structure)
5. [Comprehensive Feature Specification](#5-comprehensive-feature-specification)
6. [Development Methodology](#6-development-methodology)
7. [Getting Started](#7-getting-started)
8. [Configuration Reference](#8-configuration-reference)

---

## 1. Executive Summary

BrgyAlert is an AI-prioritized, disaster-resilient incident reporting and dispatch system designed specifically for the barangay level of Philippine local government. Rather than managing separate codebases for administrators and citizens, BrgyAlert leverages a **single, unified cross-platform mobile application** (React Native/Expo) that dynamically routes users based on their authenticated database role:

| Client Profile | Target User | Platform | Purpose |
|---|---|---|---|
| **Citizen (Mobile User)** | Residents / Witnesses | iOS & Android (React Native) | Rapid incident reporting with offline SMS gateway fallback, local offline reports feed, automatic background synchronization, and race-condition duplication locking |
| **Admin (Mobile Responder)** | Barangay Officials / Tanods | iOS & Android (React Native) | On-the-go triage queue, responder dispatching, shelter updates, real-time chat, and toggled configuration console |

### Core Value Propositions

- **₱0 Operational Infrastructure** — Fully built on Firebase's free-tier serverless services (Auth, Firestore, Storage, Cloud Functions), eliminating ongoing server lease costs.
- **Disaster-Resilient Offline Fallback** — A Smart SMS Handshake protocol intercepts submissions when citizen devices lose internet/data connectivity, formatting reports into compressed SMS payloads dynamically routed to up to 5 admin-configured gateway numbers, tracked locally in `AsyncStorage` with an `OFFLINE (SMS)` badge, and synchronized automatically once connection recovers (safeguarded by lock guards to prevent duplicates).
- **Orphan Notification Auto-Cleanup** — A background validation system immediately detects deleted Firestore incident alerts, automatically removing orphaned notification items to maintain database integrity and correct unread counts in real-time.
- **Unified App Binary** — A single React Native codebase utilizing Role-Based Access Control (RBAC) simplifies deployment, cross-platform compilation, and field operations.
- **Direct Citizen-Responder Coordination** — Real-time chat channels built into each active report enable responders to provide instruction and gather exact details directly in the field.

---

## 2. Platform Architecture & Navigation Routing

To guarantee fast execution and native hardware interaction, BrgyAlert deploys a single React Native binary that controls views using dynamic navigation routing.

```
                 +---------------------------------------------+
                 |          UNIFIED BRGYALERT MOBILE APP       |
                 |      React Native (Expo) · iOS & Android    |
                 +---------------------------------------------+
                        | (Citizen Auth)            | (Admin Auth)
                        v                           v
             [Citizen UI Screens]           [Admin UI Screens]
             - Report Wizard Form           - Live Priority Queue
             - Live Status Tracker          - Metrics Dashboard
             - Incident Chat                - Dispatch Action Console
                        \                           /
                         \                         /
          (Device Online) \                       / (Device Offline)
        Direct Firestore   v                     v   [NetInfo Trigger]
        SDK Synchronizer  +-----------------------+  Native SMS URI Fallback
             |            |    CLOUDBASE SERVER   |  (Delimiter payload)
             +----------->|  Firebase NoSQL DB    |<---------+
                          +-----------------------+          |
                                      ^                      |
                                      |                      |
                            [Firebase Functions]             |
                             (SMS Gateway Hooks)             |
                                      ^                      |
                                      |                      |
                            [SMS Gateway Gateway] <----------+
                            (Semaphore.co API v4)
```

### Data Flow Summary

1. **Online Route** — When online, the citizen app writes incident documents directly to Cloud Firestore. Administrators receive immediate reactivity via Firestore's real-time snapshot listeners.
2. **Offline Route** — If `NetInfo` registers no internet access during submission, the reporting trigger switches to a native `sms:` URI scheme. The formatted text is sent to an SMS Gateway webhook, which parses the fields and commits the record to Firestore.
3. **Broadcasting Route** — Administrative status mutations trigger Cloud Functions that send automated progress text messages back to the reporter.

---

## 3. Technology Stack Specification

| Layer | Technology | Purpose |
|---|---|---|
| **Mobile Runtime** | React Native (Expo) · Hermes Engine | Cross-platform runtime executing native mobile interfaces with minimal memory footprint |
| **Navigation** | React Navigation | Dynamic stack and drawer navigators switching between citizen and admin portals based on RBAC |
| **Authentication** | Firebase Authentication | Encrypted registration, session persistence, and role-based client routing |
| **Database** | Cloud Firestore (NoSQL) | Real-time document storage for alert feeds, profiles, shelters, and chat channels |
| **Cloud Storage** | Firebase Cloud Storage | Remote bucket storing compressed photo evidence captured from device cameras |
| **Hardware APIs** | `expo-location` · `expo-camera` · `expo-image-picker` | Native GPS coordinate acquisition, image capturing, and local asset rendering |
| **Connectivity** | `@react-native-community/netinfo` | Live network connectivity monitors checking for data drops |
| **Messaging & Push** | Firebase Cloud Messaging (FCM) · Expo Notifications | Automated push notifications alerting admins of new incidents and citizens of status updates |
| **SMS Gateway** | Semaphore.co SMS API | Webhook ingestion and outbound transactional status text broadcasts |

---

## 4. Repository Structure

The workspace is organized as a streamlined mobile monorepo:

```
BrgyAlert/
├── BrgyAlert_Mobile/       # Unified React Native Mobile Application (Citizen & Admin)
│   ├── src/
│   │   ├── components/     # Reusable UI components (custom inputs, buttons, cards)
│   │   ├── context/        # AuthContext.js (Firebase session and RBAC helpers)
│   │   ├── navigation/     # AppNavigator.js (Routing switch for Citizen vs. Admin)
│   │   ├── screens/
│   │   │   ├── common/     # Authentication & Shared Chat screens
│   │   │   ├── citizen/    # Dashboard, ReportWizard, StatusTracker, Shelters list
│   │   │   └── admin/      # LiveQueue, Metrics Dashboard, ActionConsole, ShelterControl
│   │   ├── services/       # Firebase config, location coordinates, media compression
│   │   └── utils/          # SMS formatting scripts, connection monitors
│   └── app.json            # Expo configuration manifest
│
├── BrgyAlert_Backend/      # Firebase Backend-as-a-Service (BaaS) Configurations
│   ├── firestore.rules     # Collection rules restricting read/write permissions by role
│   ├── firestore.indexes.json
│   ├── firebase.json       # Firebase deployment targets
│   └── functions/          # Cloud Functions processing SMS Gateway inputs
│
└── README.md               # ← You are here
```

---

## 5. Comprehensive Feature Specification

### Module 1: Mobile Citizen Portal (Mobile User)

- **Touch-Optimized Reporting Wizard** — Multi-step screen wizard with clear UI controls for selecting incident categories (Fire, Flood, Medical, Crime, Accident, General).
- **GPS Coordinate Acquisition** — Leverages native geolocation hooks to lock onto exact latitude/longitude targets.
- **Asynchronous Photo Pipeline** — Compresses device images locally down to 200KB before uploading to optimize data transfers.
- **Smart SMS Fallback Handshake** — Intercepts offline submissions and formats report metrics into a single 160-character delimiter string (`BA![Cat]![Landmark]![Details]`) passed dynamically to the native SMS app, addressed to all configured gateways.
- **Offline Incident Tracking Feed** — Displays queued offline reports locally with a grey `OFFLINE (SMS)` badge and `#SMS-` prefixed serial codes in the citizen's reports list.
- **Concurrency Locked Background Sync** — Detects network recovery and automatically syncs local reports using a React `useRef` lock (`isSyncingRef`) and immediate queue purging to prevent duplicate writes on Firestore.
- **Live Status Tracker** — Chronological progress timeline representing report states: **Submitted ➔ Under Review ➔ Dispatched ➔ Resolved**.
- **Community Safety Directory** - Lookup lists of local evacuation shelters showing real-time occupant counts and direct-dial emergency hotlines.
- **Incident Chat** - Real-time text communications connected directly to individual reports, allowing reports to send instant updates to assigned responders.
- **Automated Orphan Notification Cleanup** — Background cleaner that validates notification documents and deletes orphaned notifications corresponding to deleted Firestore reports, updating counts in real-time.

### Module 2: Mobile Admin/Responder Portal (Mobile Admin)

- **Admin Metrics Dashboard** — Dynamic counters showing Active, Critical, and Unassigned reports, with a toggle for setting individual responder duty availability.
- **Live Prioritized Incident Queue** — Categorizes and highlights incident requests using local urgency index mappings. Critical alerts are pinned to the top of the queue.
- **Triage Action Console** — Screen showing report descriptions, attached verification photos, and responder assignment selections.
- **External Navigation Routing** — Deep-link buttons automatically launching incident coordinates in Google Maps or Apple Maps for pathfinding.
- **Evacuation Shelter Controls** — Real-time tools for shelter supervisors to modify operational states (Open, Full, Closed) and update active occupant lists.
- **Broadcast Composer** — Form interface enabling administrators to type broadcast alerts that push notifications to citizen devices and broadcast SMS texts to registered numbers.
- **Incident Chat Console** — Two-way chat screen enabling responders to message citizen reporters directly.
- **Toggled Barangay Configuration Card** — Displays configurations (name, hotlines, gateways, response times) as read-only labels by default, with an "Edit Config" button that prompts confirmation and enables interactive inputs with simple cancel/save hooks.
- **Direct Notification Routing** — Replaces dropdown modals with direct navigation link to the dedicated notifications screen, instantly updating unread counts in real-time.

---

## 6. Development Methodology

To complete the application within a **1-month development window managed by two developers**, the project implements an adapted **Agile-Scrum Methodology** split into four (4) single-week sprints:

```
┌──────────────────────┐    ┌──────────────────────┐    ┌──────────────────────┐    ┌──────────────────────┐
│   SPRINT 1 (Week 1)  │───▶│   SPRINT 2 (Week 2)  │───▶│   SPRINT 3 (Week 3)  │───▶│   SPRINT 4 (Week 4)  │
│                      │    │                      │    │                      │    │                      │
│  Firebase Backend,   │    │  Citizen Reporting   │    │  Admin Dashboard,    │    │  Incident Chat,      │
│  RBAC Schemas, and   │    │  UI, Geolocation &   │    │  Priority Queues, &  │    │  Push Notifications  │
│  Auth Screens        │    │  SMS Fallback        │    │  Shelter Controls    │    │  & Final Simulation  │
└──────────────────────┘    └──────────────────────┘    └──────────────────────┘    └──────────────────────┘
```

| Sprint | Focus | Key Deliverables |
|---|---|---|
| **Sprint 1** | Firebase & RBAC Foundation | Establish Firebase Console integration; deploy Security Rules; write RBAC schemas; build login & registration screens |
| **Sprint 2** | Mobile Citizen Portal & SMS | Implement Reporting forms; integrate Geolocation APIs; deploy NetInfo checks; build SMS string-compression triggers |
| **Sprint 3** | Mobile Admin Console | Build Admin queues and metrics; integrate Google/Apple maps deep-linking; deploy shelter status and capacity modifiers |
| **Sprint 4** | Chat & Push Integration | Integrate real-time chat screens; bind Firebase Cloud Messaging; seed test reports and conduct full end-to-end sandbox simulations |

---

## 7. Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+ (LTS recommended)
- [Expo Go App](https://expo.dev/client) installed on a physical iOS or Android device
- [Firebase CLI](https://firebase.google.com/docs/cli) globally installed (`npm install -g firebase-tools`)

### Running the Mobile Application (React Native)

1. Navigate to the mobile directory and install dependencies:
   ```bash
   cd BrgyAlert_Mobile
   npm install
   ```
2. Start the Metro Bundler:
   ```bash
   npm start
   ```
3. Run on a testing target:
   - **Physical Device (Recommended)** — Scan the terminal QR code using the Expo Go app (Android) or default Camera app (iOS) on a device connected to the same local Wi-Fi.
   - **Android Emulator / iOS Simulator** — Press `a` or `i` respectively to boot the emulator instances.

### Deploying Database Rules & Functions

1. Navigate to the backend folder:
   ```bash
   cd BrgyAlert_Backend
   firebase login
   ```
2. Deploy the database parameters:
   ```bash
   firebase deploy
   ```

---

## 8. Configuration Reference

| File | Location | Description |
|---|---|---|
| `firestore.rules` | `BrgyAlert_Backend/` | Firestore security access lists ensuring role-restricted document reads/writes |
| `firestore.indexes.json` | `BrgyAlert_Backend/` | Search index definitions for Firestore queries |
| `firebase.json` | `BrgyAlert_Backend/` | Firebase project environment targets and CLI settings |
| `app.json` | `BrgyAlert_Mobile/` | Expo app manifest configurations including package names, permissions, and icons |

---

<p align="center">
  <sub>BrgyAlert © 2026 · Capstone Project · All Rights Reserved</sub>
</p>
