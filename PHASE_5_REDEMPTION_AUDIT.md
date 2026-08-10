# Phase 5 — Redemption Architecture Audit

> **Audit Date:** 2026-06-17
> **Platform:** Strike — Food/Merchant Membership
> **Scope:** Full-stack redemption system — backend services + user app frontend
> **Instruction:** Do not implement. Audit and design first.

---

## Table of Contents

1. [API Inventory](#1-api-inventory)
2. [DTO Inventory](#2-dto-inventory)
3. [Entity Inventory](#3-entity-inventory)
4. [Existing Backend Support](#4-existing-backend-support)
5. [Existing Frontend Support](#5-existing-frontend-support)
6. [Missing Components](#6-missing-components)
7. [Recommended V1 Redemption Flow](#7-recommended-v1-redemption-flow)
8. [Recommended UX Flow](#8-recommended-ux-flow)
9. [Recommended Screen Architecture](#9-recommended-screen-architecture)
10. [Recommended Phase 5 Scope](#10-recommended-phase-5-scope)
11. [Complete Backend → Frontend Trace](#11-complete-backend--frontend-trace)

---

## 1. API Inventory

### Redemption Service — port 8085 (`/api/redemptions/**`)

| Method | Path | Required Role | Purpose |
|--------|------|---------------|---------|
| `POST` | `/api/redemptions` | **VENDOR** | Create redemption — deducts balance |
| `GET` | `/api/redemptions/{id}` | USER, VENDOR, ADMIN | Single redemption record |
| `GET` | `/api/redemptions/user/{userId}` | **USER**, ADMIN | User's full redemption history |
| `GET` | `/api/redemptions/subscription/{subId}` | **USER**, ADMIN | History for one subscription |
| `GET` | `/api/redemptions/store/{storeId}` | VENDOR, ADMIN | Store's redemption history |
| `GET` | `/api/admin/redemptions/all` | ADMIN | All redemptions paginated |
| `GET` | `/api/admin/redemptions/stats` | ADMIN | Total count + total amount |

### Card Service — Subscriptions — port 8084 (`/api/subscriptions/**`)

| Method | Path | Required Role | Purpose |
|--------|------|---------------|---------|
| `POST` | `/api/subscriptions` | USER | Purchase subscription |
| `GET` | `/api/subscriptions/my` | USER | All user subscriptions (paginated) |
| `GET` | `/api/subscriptions/my/active` | USER | ACTIVE subscriptions — auto-expires stale |
| `GET` | `/api/subscriptions/{id}` | USER, VENDOR, ADMIN | Subscription detail |
| `GET` | `/api/subscriptions/{id}/menu` | USER | Eligible categories + items for redemption |
| `PATCH` | `/api/subscriptions/{id}/cancel` | USER | Cancel subscription |

### Card Service — Internal (no auth, service-to-service only)

| Method | Path | Called By | Purpose |
|--------|------|-----------|---------|
| `GET` | `/internal/subscriptions/{id}/redemption-context` | redemption-service | Full context in 1 RPC |
| `POST` | `/internal/subscriptions/{id}/deduct` | redemption-service | Atomic balance deduction |
| `GET` | `/internal/subscriptions/{id}/balance` | redemption-service | Balance check |
| `GET` | `/internal/subscriptions/{id}/eligible-category-ids` | redemption-service | Category IDs only |

### Ledger Service — port 8086 (`/api/ledger/**`)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/ledger/transactions` | User transaction history |
| `GET` | `/api/ledger/redemptions` | Redemption-only ledger view |
| `POST` | `/internal/transactions` | Record transaction (internal only) |

### Vendor Service — Internal (used by redemption-service during validation)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/internal/vendors/{vendorId}/owns-store/{storeId}` | Verify vendor owns store |
| `GET` | `/internal/menu-items/store/{storeId}` | Fetch all menu items for validation |
| `GET` | `/internal/menu-items/validate` | Validate item IDs against store + categories |
| `GET` | `/internal/categories/validate` | Validate category IDs against store |

---

## 2. DTO Inventory

### Request DTOs

#### `RedemptionRequest` — sent by vendor app, **NOT user app**
```
subscriptionId : Long        (which membership to charge)
storeId        : Long        (must match subscription's storeId)
items          : [
  { menuItemId: Long, quantity: Integer (min 1) }
]
```

#### `PurchaseSubscriptionRequest` — user app (already implemented)
```
cardDefinitionId : Long
storeId          : Long
```

#### `DeductBalanceRequest` — internal card-service endpoint
```
amount : BigDecimal (min 0.01)
```

### Response DTOs

#### `RedemptionResponse` — what the user app reads from history endpoints
```
id               : Long
subscriptionId   : Long
userId           : Long
storeId          : Long
totalAmount      : BigDecimal
remainingBalance : BigDecimal    ← wallet balance AFTER this redemption
status           : COMPLETED | FAILED | REVERSED
items            : [
  { menuItemId, menuItemName, quantity, unitPrice, totalPrice }
]
createdAt        : LocalDateTime
```

#### `SubscriptionRedemptionContext` — internal, not exposed to user app
```
userId               : Long
storeId              : Long
cardDefinitionId     : Long
status               : String    (e.g. "ACTIVE")
eligibleCategoryIds  : List<Long>
eligibleMenuItemIds  : List<Long>   (nullable — card-specific item restriction)
```

#### `BalanceResponse` — internal card-service
```
subscriptionId : Long
walletBalance  : BigDecimal
```

#### `EligibleMenuResponse` — already used by subscription detail screen
```
subscriptionId : Long
cardName       : String
categories     : [
  {
    categoryId   : Long
    categoryName : String
    items        : [
      { itemId, name, price, itemType, availabilityStatus: "AVAILABLE" }
    ]
  }
]
```

---

## 3. Entity Inventory

### redemption-service

| Entity | Table | Key Fields |
|--------|-------|-----------|
| `RedemptionRecord` | `redemption_records` | id, subscriptionId, userId, storeId, totalAmount, status (COMPLETED / FAILED / REVERSED), failureReason, createdAt |
| `RedemptionItem` | `redemption_items` | id, redemptionRecord (FK), menuItemId, menuItemName, quantity, unitPrice, totalPrice |
| `IdempotencyRecord` | `idempotency_records` | Prevents concurrent duplicate redemptions via `Idempotency-Key` header |

### card-service

| Entity | Table | Key Fields |
|--------|-------|-----------|
| `ActiveSubscription` | `active_subscriptions` | id, userId, cardDefinitionId, storeId, **walletBalance**, status (ACTIVE / EXPIRED / EXHAUSTED / CANCELLED), purchasedAt, expiresAt, updatedAt |
| `CardDefinition` | `card_definitions` | id, vendorId, storeId, name, cardPrice, walletAmount, validityInDays, isActive |
| `CardCategoryMapping` | `card_category_mappings` | cardDefinitionId, categoryId |
| `CardMenuItemMapping` | `card_menu_item_mappings` | cardDefinitionId, menuItemId |

### ledger-service

| Entity | Table | Key Fields |
|--------|-------|-----------|
| `Transaction` | `transactions` | id, storeId, customerId (userId), subscriptionId, transactionType (CARD_PURCHASE / REDEMPTION / REFUND / TOP_UP), amount, remarks, createdAt |

---

## 4. Existing Backend Support

| Feature | Status | Notes |
|---------|--------|-------|
| Redemption creation with full validation chain | ✅ Complete | `RedemptionServiceImpl.redeem()` |
| Balance deduction — atomic | ✅ Complete | `deductBalance()` in card-service |
| EXHAUSTED auto-transition when balance = 0 | ✅ Complete | `status = EXHAUSTED` if newBalance == 0 |
| Eligible category + item validation | ✅ Complete | Validates per card restrictions |
| OUT_OF_STOCK item rejection | ✅ Complete | Checked against vendor-service item status |
| Idempotency (duplicate redemption prevention) | ✅ Complete | `Idempotency-Key` header |
| `remainingBalance` included in response | ✅ Complete | In `RedemptionResponse` |
| Redemption history by user | ✅ Complete | `GET /api/redemptions/user/{userId}` |
| Redemption history by subscription | ✅ Complete | `GET /api/redemptions/subscription/{subscriptionId}` |
| Redemption history by single ID | ✅ Complete | `GET /api/redemptions/{id}` |
| Ledger transaction recording | ✅ Complete | Called from redemption-service after success |
| Notification on redemption | ✅ Best-effort | `/internal/notify/redemption` called |
| Subscription expiry auto-trigger | ✅ Complete | On `getActiveByUser()` and on `deductBalance()` |
| Bulk expiry sweep endpoint | ✅ Complete | `POST /internal/subscriptions/expire` |
| QR code generation or scanning | ❌ None | Not implemented anywhere |
| User-initiated redemption endpoint | ❌ None | Intentionally vendor-only — correct design |
| Real-time balance push to user app | ❌ None | Notification fires but app has no handler |

---

## 5. Existing Frontend Support

### Type files

| File | Status | Detail |
|------|--------|--------|
| `src/types/subscription.ts` | ✅ Correct | `Subscription`, `EligibleMenu`, `EligibleCategory`, `EligibleMenuItem` — all match DTOs |
| `src/types/redemption.ts` | ❌ **Completely stale** | Uses `boxes`, `boxCost`, `restaurantName`, `transactionRef` — none of these fields exist in the actual `RedemptionResponse` DTO. Must be fully rewritten. |

### API client files

| File | Status | Detail |
|------|--------|--------|
| `src/api/subscription.api.ts` | ✅ Complete | Purchase, retrieve, cancel, eligible menu |
| `src/api/redemption.api.ts` | ❌ **Empty (1 line)** | No implementation |
| `src/api/ledger.api.ts` | ❌ **Empty (1 line)** | No implementation |

### Hooks

| File | Status | Detail |
|------|--------|--------|
| `src/hooks/useSubscriptions.ts` | ✅ Complete | `useMyActiveSubscriptions`, `useSubscriptionDetail`, `useEligibleMenu`, `usePurchaseSubscription` |
| Redemption hooks | ❌ **None exist** | No `useSubscriptionRedemptions`, no `useUserRedemptions` |

### Screens

| File | Status | Detail |
|------|--------|--------|
| `src/app/subscriptions/[id].tsx` | ✅ Built | Hero, wallet balance, eligible categories, eligible items, validity, membership details — all in correct hierarchy. Sticky CTA exists. |
| `src/app/(tabs)/cards.tsx` | ✅ Built | Premium wallet — active/expiring/past subscription groups |
| `src/app/cards/[id].tsx` | ✅ Built | Card detail with activation + ownership detection |
| `src/app/subscriptions/success.tsx` | ✅ Built | Post-activation success screen |
| `src/app/(tabs)/history.tsx` | ❌ **Placeholder** | Shows "Coming soon" only — no implementation |
| Redemption presentation screen | ❌ **Does not exist** | "Present at Counter" flow not built |

---

## 6. Missing Components

### Frontend — must build

| Component | Type | Priority |
|-----------|------|----------|
| `src/types/redemption.ts` — full rewrite | Type definition | P0 — blocks everything |
| `src/api/redemption.api.ts` — implement | API client | P0 |
| `src/api/ledger.api.ts` — implement | API client | P1 |
| `src/hooks/useRedemptions.ts` — new file | React Query hooks | P0 |
| `src/app/subscriptions/present.tsx` — new | Screen | P0 — core UX moment |
| "Present at Counter" CTA in `subscriptions/[id].tsx` | Screen enhancement | P0 |
| Redemption history section in `subscriptions/[id].tsx` | Screen enhancement | P1 |
| Balance animation on refresh in `subscriptions/[id].tsx` | Screen enhancement | P1 |
| `src/app/(tabs)/history.tsx` — full rebuild | Screen | P1 |

### Backend — no changes required

The backend is production-complete for V1. All validation, balance deduction, history, and ledger recording are fully implemented.

---

## 7. Recommended V1 Redemption Flow

### The critical architectural constraint

`POST /api/redemptions` requires `hasRole('VENDOR')`. **The user app cannot create a redemption.** The vendor app creates it at the point of sale. This is the correct design — the vendor validates what was actually consumed.

**The user app's role is: surface the membership clearly so the vendor can process it, and show the user what happened afterward.**

### V1 Flow Diagram

```
User opens subscription detail
        │
        ▼
Sees: Remaining Balance + Eligible Items     (already built)
        │
        ▼
Taps: "Present at Counter"                   ← NEW sticky CTA (ACTIVE only)
        │
        ▼
Presentation screen (full-screen dark card)
Shows: Card Name · Membership ID · Balance · Store · Eligible Categories
        │
        ▼
User holds phone up to vendor
        │
        ▼
Vendor reads subscription ID
Enters in vendor app → selects items → confirms
        │
        ▼
Vendor app: POST /api/redemptions
  { subscriptionId, storeId, items: [{ menuItemId, quantity }] }
        │
        ▼
Backend validation chain (all server-side):
  1. Vendor owns store ✓
  2. Subscription is ACTIVE ✓
  3. Subscription belongs to this store ✓
  4. Items are in eligible categories ✓
  5. Items are AVAILABLE ✓
  6. Balance >= total ✓
        │
        ▼
Balance deducted  →  RedemptionRecord saved  →  Ledger entry  →  Notification fired
        │
        ▼
User pulls to refresh on subscription detail
        │
        ▼
Balance animates: ₹500 → ₹320
Redemption history section updates: "Chicken Biryani · ₹180 · Today"
```

### Why not QR code for V1?

- No QR library in `package.json`
- Vendor app QR scanner not confirmed implemented
- The subscription ID is a short auto-incremented number — readable as a code
- QR is a Phase 6 enhancement, not a V1 blocker

### Why not user-initiated redemption?

The backend is intentionally vendor-gated. This prevents:
- Users falsely claiming redemptions
- Balance deductions without actual item delivery
- Fraud

This is the correct design for a point-of-sale product.

---

## 8. Recommended UX Flow

### Subscription Detail Screen — enhanced layout

```
┌─────────────────────────────────────┐
│  ← Membership                       │
├─────────────────────────────────────┤
│  [HERO CARD — dark widget]          │
│  Curry Kingdom Premium              │
│  ₹420 Remaining                     │
│  ████████████░░  84% · Active       │
│  Expires 15 Jan 2026                │
├─────────────────────────────────────┤
│  WALLET BALANCE                     │
│  Remaining ₹420 | Original ₹500    │
├─────────────────────────────────────┤
│  ELIGIBLE CATEGORIES                │
│  [Curry] [Noodles]                  │
├─────────────────────────────────────┤
│  ELIGIBLE ITEMS (5)                 │
│  ● Chicken Biryani         ₹180     │
│  ● Paneer Butter Masala    ₹160     │
│  ● Dal Makhani             ₹140     │
├─────────────────────────────────────┤
│  VALIDITY                           │
│  Valid Until  15 Jan 2026           │
│  Days Remaining  28 days            │
├─────────────────────────────────────┤
│  REDEMPTION HISTORY        ← NEW    │
│  Today · Chicken Biryani · −₹180   │
│  Yesterday · Paneer · −₹160        │
│  See all →                          │
├─────────────────────────────────────┤
│  MEMBERSHIP DETAILS                 │
│  Purchased · Store                  │
└─────────────────────────────────────┘
      [ Present at Counter ]  ← sticky (ACTIVE only)
```

### Present at Counter Screen — new

```
┌─────────────────────────────────────┐
│  ← Back                   [ACTIVE ●]│
│                                     │
│  ┌─────────────────────────────┐    │
│  │  Curry Kingdom              │    │
│  │  Premium Card               │    │
│  │                             │    │
│  │  ₹420 Remaining             │    │
│  │  ████████████░░  84%        │    │
│  └─────────────────────────────┘    │
│                                     │
│  MEMBERSHIP ID                      │
│  ┌───────────────────────��─────┐    │
│  │                             │    │
│  │         # 000042            │    │  ← large, readable
│  │                             │    │
│  └─────────────────────────────┘    │
│                                     │
│  ELIGIBLE FOR                       │
│  [Curry] [Noodles]                  │
│                                     │
│  Show this screen to the vendor     │
│  at the counter to use your balance │
│                                     │
│  Valid until: 15 Jan 2026           │
└─────────────────────────────────────┘
```

### History Tab — rebuilt from placeholder

```
┌─────────────────────────────────────┐
│  History                            │
├─────────────────────────────────────┤
│  TODAY                              │
│  ┌─────────────────────────────┐    │
│  │ [card] Curry Kingdom        │    │
│  │  Chicken Biryani × 1        │    │
│  │  −₹180 used · ₹420 left    │    │
│  │  2:34 PM                    │    │
│  └─────────────────────────────┘    │
├─────────────────────────────────────┤
│  YESTERDAY                          │
│  ┌─────────────────────────────┐    │
│  │ [card] Curry Kingdom        │    │
│  │  Paneer Butter Masala × 1   │    │
│  │  −₹160 used · ₹600 left    │    │
│  │  7:12 PM                    │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

### Post-Redemption Balance Update (on pull-to-refresh)

```
₹500  ──[ spring animation ]──▶  ₹320
```

The hero balance number animates using `Animated.spring` from the cached value to the new value. This makes the value change feel rewarding and confirms the deduction happened.

---

## 9. Recommended Screen Architecture

### New file to create

```
src/app/subscriptions/present.tsx     ← "Present at Counter" full-screen
```

### Files to rebuild (currently placeholder/empty)

```
src/types/redemption.ts               ← rewrite — stale, does not match backend
src/api/redemption.api.ts             ← implement — currently 1 blank line
src/api/ledger.api.ts                 ← implement — currently 1 blank line
src/app/(tabs)/history.tsx            ← rebuild — currently "Coming soon"
```

### New hook file

```
src/hooks/useRedemptions.ts           ← new file
```

Exports:
- `useSubscriptionRedemptions(subscriptionId)` — paginated, used in subscription detail
- `useUserRedemptions()` — used in History tab
- `useRedemptionDetail(id)` — used if tapping a single entry

### Files to enhance

```
src/app/subscriptions/[id].tsx
  + "Present at Counter" sticky CTA  (ACTIVE only, replaces no-CTA)
  + Redemption history section        (at bottom, before Membership Details)
  + Balance animation on refresh      (spring hero number old → new)

src/constants/api.ts
  + REDEMPTIONS.BY_SUBSCRIPTION(id)
  + REDEMPTIONS.BY_USER(userId)
```

### CTA Placement Decision — Spec Question A / B / C

**Recommendation: Option B — Sticky bottom action.**

Reasoning:
- Identical pattern to "Activate Membership" / "View Membership" already built and shipped
- Always visible without interrupting reading the eligible items (which the user needs to see first)
- Users naturally read top-to-bottom: hero → balance → what I can redeem → then act
- Placing it in the hero (A) creates visual clutter on an already-dense card
- Placing it inside the eligible menu section (C) buries it mid-scroll and makes it feel like a form action

Show only when `status === 'ACTIVE'`. For EXPIRED / EXHAUSTED / CANCELLED, the sticky bar is hidden entirely.

---

## 10. Recommended Phase 5 Scope

### Phase 5A — Foundation (no UI, unlocks everything)

1. Rewrite `src/types/redemption.ts` to exactly match `RedemptionResponse` DTO
2. Implement `src/api/redemption.api.ts` — `getBySubscription(id, page)`, `getByUser(userId, page)`, `getById(id)`
3. Add to `src/constants/api.ts` — `REDEMPTIONS.BY_SUBSCRIPTION(id)`, `REDEMPTIONS.BY_USER(userId)`
4. Create `src/hooks/useRedemptions.ts` — `useSubscriptionRedemptions`, `useUserRedemptions`, `useRedemptionDetail`

### Phase 5B — Subscription Detail Enhancements

5. Add "Present at Counter" sticky CTA to `subscriptions/[id].tsx` (ACTIVE only)
6. Add redemption history section at bottom of subscription detail
7. Add balance animation on pull-to-refresh (spring `walletBalance` from stale → fresh value)

### Phase 5C — Present Screen

8. Build `src/app/subscriptions/present.tsx`
   - Premium full-screen dark background
   - Card widget (existing style)
   - Large readable membership ID (`# 000042`)
   - Eligible categories chips
   - "Show to vendor at the counter" instruction
   - Expiry + status indicator

### Phase 5D — History Tab

9. Rebuild `src/app/(tabs)/history.tsx`
   - Grouped by date (Today / Yesterday / This Week / Older)
   - Each entry: card name, item names, amount deducted, balance after, time
   - Tap → redemption detail (inline expansion or modal)
   - Pull-to-refresh
   - Empty state: "No redemptions yet — use your membership at the store"
   - Pagination (load more)

### What Phase 5 does NOT include

- QR code scanning — no library in package.json, vendor app changes out of scope
- User-initiated redemption — backend is intentionally vendor-gated, correct design
- Real-time push notification handling — notification service fires but app has no listener registered
- Reversal / refund UI — backend supports REVERSED status but no V1 business case
- `src/api/ledger.api.ts` full implementation — ledger is a superset of redemption data; use redemption endpoints for history (ledger adds no new user-visible value in V1)

---

## 11. Complete Backend → Frontend Trace

### Full end-to-end redemption (happy path)

```
ActiveSubscription (card-service DB)
  id:             42
  userId:         11
  storeId:        7
  walletBalance:  500.00  →  320.00  (after redemption)
  status:         ACTIVE
  expiresAt:      2026-01-15

                    │
                    │ Vendor app: POST /api/redemptions
                    │ X-User-Id: 5 (vendorId)
                    │ {
                    │   subscriptionId: 42,
                    │   storeId: 7,
                    │   items: [{ menuItemId: 101, quantity: 1 }]
                    │ }
                    ▼

RedemptionServiceImpl.redeem(vendorId=5, request)

  Step 1:  vendorServiceClient.verifyVendorOwnsStore(5, 7)
           → GET /internal/vendors/5/owns-store/7
           → { owned: true } ✓

  Step 2:  cardServiceClient.getRedemptionContext(42)
           → GET /internal/subscriptions/42/redemption-context
           → {
               userId: 11,
               storeId: 7,
               cardDefinitionId: 3,
               status: "ACTIVE",
               eligibleCategoryIds: [3, 4],
               eligibleMenuItemIds: null    (no item-level restriction)
             }
           → status == ACTIVE ✓
           → storeId == 7 ✓

  Step 3:  vendorServiceClient.getMenuItems(storeId=7)
           → GET /internal/menu-items/store/7
           → {
               101: { id:101, name:"Chicken Biryani", price:180, categoryId:3, status:AVAILABLE },
               102: { id:102, name:"Dal Makhani",     price:140, categoryId:3, status:AVAILABLE },
               ...
             }

  Step 4:  Validate item 101:
           → categoryId: 3 ∈ eligibleCategoryIds [3,4] ✓
           → eligibleMenuItemIds is null (no restriction) ✓
           → status: AVAILABLE ✓

  Step 5:  total = 180.00 × 1 = ₹180.00

  Step 6:  cardServiceClient.deductBalance(subscriptionId=42, amount=180)
           → POST /internal/subscriptions/42/deduct { amount: 180 }
           → card-service validates: ACTIVE ✓, expiresAt >= now ✓, balance 500 >= 180 ✓
           → walletBalance: 500 → 320
           → status remains ACTIVE (320 > 0)
           → returns BalanceResponse { subscriptionId:42, walletBalance:320 }

  Step 7:  Save RedemptionRecord {
             subscriptionId: 42,
             userId: 11,
             storeId: 7,
             totalAmount: 180.00,
             status: COMPLETED,
             items: [{ menuItemId:101, menuItemName:"Chicken Biryani", quantity:1, unitPrice:180, totalPrice:180 }]
           }

  Step 8:  ledgerServiceClient.recordRedemption(storeId=7, userId=11, subscriptionId=42, amount=180, remarks="Redemption #77")
           → POST /internal/transactions {
               storeId:7, customerId:11, subscriptionId:42,
               transactionType:REDEMPTION, amount:180
             }

  Step 9:  notificationClient.notifyRedemption(...)   (best-effort, non-blocking)

  Step 10: Return RedemptionResponse {
             id:               77,
             subscriptionId:   42,
             userId:           11,
             storeId:          7,
             totalAmount:      180.00,
             remainingBalance: 320.00,   ← user will see this
             status:           COMPLETED,
             items: [{
               menuItemId:   101,
               menuItemName: "Chicken Biryani",
               quantity:     1,
               unitPrice:    180.00,
               totalPrice:   180.00
             }],
             createdAt: "2026-01-10T14:34:22"
           }

                    │
                    │ User app (after pull-to-refresh or notification)
                    ▼

GET /api/subscriptions/my/active
  → walletBalance: 320.00   (down from 500)
  → Hero balance animates: 500 → 320

GET /api/redemptions/subscription/42
  → [
      {
        id: 77,
        totalAmount: 180,
        remainingBalance: 320,
        status: COMPLETED,
        items: [{ menuItemName: "Chicken Biryani", quantity: 1, totalPrice: 180 }],
        createdAt: "2026-01-10T14:34:22"
      }
    ]
  → Redemption history section shows: "Chicken Biryani · −₹180 · 2:34 PM Today"
```

### Error states — backend validation chain

| Error Condition | Backend Response | Recommended User-Facing Message |
|----------------|-----------------|--------------------------------|
| Subscription status ≠ ACTIVE | 400 Bad Request | "This membership is no longer active." |
| Subscription expired at balance-deduct time | 400 + status → EXPIRED | "Your membership expired on [date]." |
| Balance insufficient | 400 Bad Request | "Insufficient balance — ₹[amount] required, ₹[balance] available." |
| Item not in eligible categories | 400 Bad Request | "This item isn't covered by your membership." |
| Item is OUT_OF_STOCK | 400 Bad Request | "One of the items is currently unavailable." |
| Subscription store mismatch | 400 Bad Request | "This membership is for a different store." |
| Vendor doesn't own store | 403 Forbidden | (vendor-side error, user sees nothing) |
| Duplicate redemption (idempotency) | 200 (cached response) | Transparent — returns same result |
| Network failure | No response | "Connection lost. Check your internet and try again." |

---

## Summary

| Area | Status |
|------|--------|
| Backend redemption logic | ✅ **Production-complete** |
| Backend history APIs | ✅ **Production-complete** |
| Backend balance deduction | ✅ **Production-complete** |
| Frontend type definitions | ❌ `redemption.ts` is stale junk — full rewrite needed |
| Frontend API clients | ❌ `redemption.api.ts` and `ledger.api.ts` are empty |
| Frontend hooks | ❌ No redemption hooks exist |
| Frontend screens | ❌ History is placeholder, present screen doesn't exist |
| Subscription detail | ✅ Built (hierarchy correct, eligible menu visible, no redemption CTA yet) |

**The entire Phase 5 is frontend work. The backend requires zero changes.**

The redemption model is vendor-initiated — the user's action is **"Present at Counter"**, not a form submission. This is the correct design for a point-of-sale membership product where the vendor validates physical delivery of items.
