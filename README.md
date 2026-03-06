# WhereBaro Backend

An **Azure Functions** (Node.js / TypeScript) backend for the WhereBaro app — tracking Baro Ki'Teer's visits, managing community reviews and likes, and sending push notifications when the void trader arrives.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
- [Database](#database)
- [API Reference](#api-reference)
- [Scheduled Jobs](#scheduled-jobs)
- [Services](#services)
- [Testing](#testing)
- [Deployment](#deployment)
- [Configuration](#configuration)

---

## Features

- **Baro Ki'Teer tracking** — automatic data fetching from warframestat.us on Baro's schedule
- **Item management** — auto-resolves new items via `@wfcd/items`, tracks offering history
- **Reviews & likes** — full CRUD for community reviews, like/unlike per item
- **Push notifications** — Expo SDK-powered notifications for Baro arrival, departure, departing soon, and wishlist matches
- **Wishlist targeting** — per-item push token tracking so users only get notified about items they care about
- **Unknown item logging** — unresolved items are logged for manual review
- **Scheduled automation** — timer-triggered jobs handle the full Baro visit lifecycle

---

## Tech Stack

| Category | Technology |
|---|---|
| Runtime | Azure Functions v4 (Node.js) |
| Language | TypeScript (ES2022 target) |
| Database | MongoDB (via `mongodb` driver) |
| Notifications | Expo Server SDK |
| Item Data | `@wfcd/items` (Warframe community data) |
| Web Scraping | Cheerio (wiki ingest) |
| Testing | Jest + ts-jest |

---

## Getting Started

### Prerequisites

- **Node.js** v18+
- **Azure Functions Core Tools** v4 (`npm i -g azure-functions-core-tools@4`)
- **MongoDB** instance (local or Atlas)
- A `.env` file or `local.settings.json` with the required environment variables

### Installation

```bash
cd wherebaro-backend
npm install
```

### Environment Variables

Add these to your `.env` file or Azure Function App settings:

| Variable | Required | Description |
|---|---|---|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `FUNCTIONS_WORKER_RUNTIME` | Yes | Must be `node` |
| `AzureWebJobsStorage` | Yes | Azure Storage connection (or `UseDevelopmentStorage=false` for local) |

### Running Locally

```bash
npm run build       # Compile TypeScript
npm start           # Start Azure Functions host (auto-builds)
npm run watch       # Watch mode (recompile on changes)
```

Or use the VS Code tasks:
- **func: host start** — builds, watches, and starts the function host
- **npm watch (functions)** — TypeScript watch mode only

### Testing

```bash
npm test            # Run all tests
```

---

## Project Structure

```
wherebaro-backend/
├── host.json                   # Azure Functions host config
├── local.settings.json         # Local environment settings
├── package.json                # Dependencies and scripts
├── tsconfig.json               # TypeScript config (ES2022, CommonJS)
├── jest.config.ts              # Jest config (ts-jest preset)
│
└── src/
    ├── db/
    │   └── database.service.ts     # MongoDB connection + collection refs
    │
    ├── functions/
    │   ├── api/                    # HTTP-triggered Azure Functions (21 endpoints)
    │   │   ├── getAllItems.ts
    │   │   ├── getCurrent.ts
    │   │   ├── getLikes.ts
    │   │   ├── getReviews.ts
    │   │   ├── likeItem.ts
    │   │   ├── unlikeItem.ts
    │   │   ├── postReview.ts
    │   │   ├── updateReview.ts
    │   │   ├── deleteReview.ts
    │   │   ├── reportReview.ts
    │   │   ├── registerPushToken.ts
    │   │   ├── removePushToken.ts
    │   │   ├── addWishlistPushToken.ts
    │   │   ├── removeWishlistPushToken.ts
    │   │   ├── bulkSyncWishlistPushToken.ts
    │   │   ├── baroVisitUpdateManual.ts
    │   │   ├── baroNotificationCheckManual.ts
    │   │   ├── sendTestNotification.ts
    │   │   ├── seedDBFunction.ts
    │   │   ├── backfillUniqueNames.ts
    │   │   └── mockBaroAbsent.ts
    │   │
    │   └── jobs/                   # Timer-triggered Azure Functions (4 schedules)
    │       ├── baroVisitUpdate.ts
    │       ├── baroArrivalNotification.ts
    │       ├── baroDepartingSoonNotification.ts
    │       └── baroDepartureNotification.ts
    │
    ├── jobs/                       # Business logic (called by functions)
    │   ├── getAllItems.job.ts
    │   ├── getCurrent.job.ts
    │   ├── getLikes.job.ts
    │   ├── getReviews.job.ts
    │   ├── like.job.ts
    │   ├── postReview.job.ts
    │   ├── updateReview.job.ts
    │   ├── deleteReview.job.ts
    │   ├── reportReview.job.ts
    │   ├── registerPushToken.job.ts
    │   ├── removePushToken.job.ts
    │   ├── updateCurrent.job.ts
    │   ├── baroNotification.job.ts
    │   ├── testNotification.job.ts
    │   ├── seedDB.job.ts
    │   ├── backfillUniqueNames.job.ts
    │   └── wishlistPushTokens.job.ts
    │
    ├── models/                     # Data models
    │   ├── Item.ts
    │   ├── Like.ts
    │   ├── Review.ts
    │   └── PushToken.ts
    │
    ├── services/                   # Core business logic
    │   ├── baroApiService.ts       #   Warframestat.us API client
    │   ├── currentService.ts       #   Baro status management
    │   ├── itemService.ts          #   Item resolution + CRUD
    │   ├── likeService.ts          #   Like/unlike operations
    │   ├── reviewService.ts        #   Review CRUD + reporting
    │   ├── notificationService.ts  #   Expo push notification sender
    │   ├── pushTokenService.ts     #   Push token lifecycle
    │   ├── wishlistService.ts      #   Per-item wishlist push tokens
    │   ├── seedDBService.ts        #   Bulk item seeding
    │   └── wikiIngestService.ts    #   Wiki scraper
    │
    ├── utils/
    │   ├── itemMappings.ts         #   Manual uniqueName mappings + ignored items
    │   └── mapItem.ts              #   Raw wiki data → Item model mapper
    │
    └── __tests__/
        ├── jobs/                   #   2 test files
        ├── models/                 #   1 test file
        ├── services/               #   9 test files
        └── utils/                  #   2 test files
```

---

## Architecture

### Request Flow

```
Client (mobile app)
  → Azure Functions HTTP trigger (src/functions/api/)
    → Job file (src/jobs/) — validates input, parses payload
      → Service (src/services/) — business logic
        → MongoDB (src/db/database.service.ts)
```

### Scheduled Job Flow

```
Azure Timer Trigger (CRON schedule)
  → Job file (src/jobs/) — orchestrates the workflow
    → Baro API Service — fetches from warframestat.us
    → Current Service — updates Baro status in DB
    → Notification Service — sends push notifications via Expo
```

### Layered Architecture

| Layer | Directory | Responsibility |
|---|---|---|
| **Triggers** | `functions/api/`, `functions/jobs/` | HTTP/timer triggers, request/response handling |
| **Jobs** | `jobs/` | Input validation, payload parsing, orchestration |
| **Services** | `services/` | Core business logic, database operations |
| **Models** | `models/` | TypeScript data classes |
| **Database** | `db/` | MongoDB connection management, collection references |

---

## Database

### MongoDB Collections

| Collection | Purpose | Key Fields |
|---|---|---|
| `items` | All Baro items ever sold | `name`, `image`, `link`, `creditPrice`, `ducatPrice`, `type`, `offeringDates[]`, `likes[]`, `reviews[]`, `uniqueName`, `wishlistPushTokens[]`, `wishlistCount` |
| `current` | Single document tracking Baro's status | `isActive`, `activation`, `expiry`, `location`, `items[]` (ObjectId refs) |
| `reviews` | User reviews on items | `item_oid`, `uid`, `user`, `content`, `date`, `time`, `reportCount` |
| `likes` | User likes on items | `item_oid`, `uid` |
| `pushTokens` | Registered Expo push tokens | `token`, `deviceId`, `createdAt`, `lastUsed`, `isActive` |
| `unknownItems` | Unresolved Baro inventory items | `uniqueName`, `apiItemName`, `ducats`, `credits`, `isNewItem`, `firstSeen`, `lastSeen` |

### Indexes

- `reviews` — unique compound index on `{ item_oid, uid }` (one review per user per item)
- `likes` — unique compound index on `{ item_oid, uid }` (one like per user per item)
- `pushTokens` — unique index on `{ token }`, index on `{ isActive }`
- `unknownItems` — unique index on `{ uniqueName }`

---

## API Reference

### Items

| Method | Route | Description |
|---|---|---|
| GET | `/getAllItems` | Returns all items from the database |
| GET | `/getCurrent` | Returns Baro's current status, schedule, location, and active inventory |

### Reviews

| Method | Route | Body | Description |
|---|---|---|---|
| GET | `/getReviews?item_id={id}` | — | Get all reviews for an item |
| POST | `/postReview` | `{ item_oid, user, content, date, time, uid }` | Create a review |
| POST | `/updateReview` | `{ review_id, uid, content, date, time }` | Update a review (owner only) |
| POST | `/deleteReview` | `{ review_id, uid }` | Delete a review (owner only) |
| POST | `/reportReview` | `{ review_id }` | Report a review (increments report count) |

### Likes

| Method | Route | Body | Description |
|---|---|---|---|
| GET | `/getLikes?item_id={id}` | — | Get likes for an item |
| POST | `/likeItem` | `{ item_oid, uid }` | Like an item |
| POST | `/unlikeItem` | `{ item_oid, uid }` | Unlike an item |

### Push Notifications

| Method | Route | Body | Description |
|---|---|---|---|
| POST | `/registerPushToken` | `{ token, deviceId? }` | Register/update push token |
| POST | `/removePushToken` | `{ token }` | Remove push token |

### Wishlist

| Method | Route | Body | Description |
|---|---|---|---|
| POST | `/addWishlistPushToken` | `{ item_id, token }` | Subscribe to notifications for an item |
| POST | `/removeWishlistPushToken` | `{ item_id, token }` | Unsubscribe from item notifications |
| POST | `/bulkSyncWishlistPushToken` | `{ add_item_ids[], remove_item_ids[], token }` | Bulk sync subscriptions |

### Admin / Manual

| Method | Route | Description |
|---|---|---|
| GET | `/baroVisitUpdateManual` | Manually trigger Baro data update |
| GET | `/baroNotificationCheckManual?type={type}` | Manually trigger notifications (`arrival`, `departingSoon`, `departure`, `all`) |
| POST | `/sendTestNotification` | Send test notification to all devices |
| GET | `/seedDBFunction` | Seed DB from wiki scrape |
| GET | `/backfillUniqueNames` | Backfill `uniqueName` on existing items |
| GET | `/mockBaroAbsent` | DEV: Returns mock Baro-absent data |

---

## Scheduled Jobs

The backend runs four CRON-triggered jobs aligned to Baro Ki'Teer's biweekly visit schedule. All times are UTC (EST + 5).

| Job | CRON (UTC) | EST Equivalent | What it does |
|---|---|---|---|
| **baroVisitUpdate** | `10 0 14 * * Fri` | Fri 9:00:10 AM | Fetches Baro data from warframestat.us, resolves inventory items, updates `current` document |
| **baroArrivalNotification** | `0 0 14 * * Fri` | Fri 9:00 AM | Checks if Baro arrived → sends arrival notification + wishlist match notifications |
| **baroDepartingSoonNotification** | `0 0 11 * * Sun` | Sun 6:00 AM | Checks if Baro is leaving within ~3 hours → sends departing-soon reminder |
| **baroDepartureNotification** | `10 0 14 * * Sun` | Sun 9:00:10 AM | Checks if Baro departed → sends departure notification, then updates `current` |

### Notification Types

| Type | Recipients | Content |
|---|---|---|
| **Arrival** | All active push tokens | "Baro Ki'Teer has arrived at {location} with {count} items!" |
| **Wishlist Match** | Users with matching wishlist tokens | "Baro has {item} on sale!" |
| **Departing Soon** | All active push tokens | "Baro Ki'Teer is leaving soon!" |
| **Departure** | All active push tokens | "Baro Ki'Teer has departed" |

---

## Services

### baroApiService
Fetches Baro Ki'Teer data from the warframestat.us public API. Provides an `isBaroActive()` helper that checks activation/expiry dates.

### currentService
Manages the single `current` document in MongoDB. On read (`fetchCurrent`), populates item ObjectIds with full item objects when Baro is active. On update (`updateCurrentFromApi`), fetches from the Baro API, resolves inventory items, and upserts the document.

### itemService
Resolves Baro API inventory items to database records. Uses `uniqueName` suffix matching first, then falls back to `@wfcd/items` metadata lookup. Creates new items for unknown entries and logs truly unresolved items to the `unknownItems` collection.

### likeService
Adds/removes likes with bidirectional sync — updates both the `likes` collection and the item's `likes[]` array.

### reviewService
Full CRUD for reviews with ownership enforcement on updates/deletes. Post creates a review and pushes the ObjectId into the item's `reviews[]` array. Delete removes from both the `reviews` collection and the item's array. Report increments `reportCount`.

### notificationService
Sends push notifications via the Expo Server SDK. Handles message chunking, ticket/receipt processing, and automatic deactivation of unregistered device tokens. Provides specialized methods for each Baro notification type.

### pushTokenService
Manages the push token lifecycle — register (upsert), deactivate, remove, and cleanup of inactive tokens older than 90 days.

### wishlistService
Manages per-item `wishlistPushTokens[]` arrays for targeted notifications. Supports add, remove, bulk sync, and token replacement. `getWishlistMatchesForCurrentInventory()` cross-references active Baro items against wishlist subscriptions to find which users should be notified.

---

## Testing

```bash
npm test    # Run all tests (Jest + ts-jest)
```

### Test Coverage

| Layer | Test Files | Coverage |
|---|---|---|
| Jobs | 2 | Baro notification flow, job delegation |
| Models | 1 | Model construction |
| Services | 9 | All services (baroApi, current, item, like, review, notification, pushToken, wishlist, seedDB) |
| Utils | 2 | Item mappings, wiki data mapping |

Tests use mocked MongoDB collections and Expo SDK to verify business logic in isolation.

---

## Deployment

The backend deploys as an **Azure Function App** (Node.js runtime).

### Build

```bash
npm run build    # Compiles TypeScript to dist/
```

The compiled output goes to `dist/src/functions/` which Azure Functions discovers automatically via the `main` field in `package.json`.

### Azure Configuration

Set these **Application Settings** in the Azure Function App:

| Setting | Value |
|---|---|
| `FUNCTIONS_WORKER_RUNTIME` | `node` |
| `MONGODB_URI` | Your MongoDB Atlas connection string |
| `AzureWebJobsStorage` | Azure Storage connection string |

### CI/CD

Deploy via Azure Functions Core Tools:

```bash
func azure functionapp publish <your-app-name>
```

Or configure GitHub Actions / Azure DevOps pipelines to auto-deploy on push.

---

## Configuration

### host.json
- Route prefix removed (routes are at root, e.g., `/getAllItems` not `/api/getAllItems`)
- Application Insights sampling disabled for full telemetry
- Extension bundle v4.x

### tsconfig.json
- Target: ES2022, Module: CommonJS
- Strict mode enabled
- Output: `dist/`
- Tests excluded from compilation

---

## License

MIT License — see [LICENSE](LICENSE) for details.
