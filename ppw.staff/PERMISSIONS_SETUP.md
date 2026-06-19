# PPW Staff — Permissions & DB Setup

## 1. Schema: NO manual SQL needed
RBAC permissions live in the **existing `user.permissions` column** (`simple-json`, nullable) — already defined in `User` entity. The `media` table (item photos/videos) is the `ItemMedia` entity.

Because `ppw.staff` runs **`synchronize: true`**, TypeORM **auto-creates/updates** the `permissions` column and `media` table on app boot. So on deploy you do **not** run any `CREATE TABLE` / `ALTER`.

> ⚠️ One precondition: the DB user must have **ALTER/CREATE** privileges for synchronize to apply schema changes. The `permissions` column already existed before, so most likely nothing new is needed.

There is **no separate "permissions" table.** It's a JSON object on each user.

## 2. The permission model (shape of `user.permissions`)
```json
{
  "system": ["dashboard","inventory","orders","staff","reports","sync"],
  "allowedParents": [],          // allowed brands; [] = ALL brands
  "allowedCategories": [],       // allowed categories; [] = ALL categories
  "orderTypes": ["Tax Invoice","Quotation"]
}
```
- **Admins:** `permissions = null` → bypass everything.
- **`system`** = page access. Keys → pages:
  | key | unlocks |
  |---|---|
  | `dashboard` | Home / Dashboard |
  | `inventory` | Inventory, Godown, Attach Barcode |
  | `orders` | Create Order |
  | `reports` | **Order History / Day Book** + Ledgers |
  | `staff` | Users (staff management) |
  | `sync` | Tally sync actions |
- **Empty `allowedParents` + `allowedCategories` = full inventory.** Set them to restrict what a user sees & can order.

## 3. The ONE data task after deploy: assign permissions to existing staff
Existing non-admin users have `permissions = NULL` → with RBAC on, they're locked out (no page to land on). Fix either way:

**A) Via UI (recommended):** Admin → Users → edit each staff → tick at least one page (validation enforces ≥1) → Save. Manager auto-gets Inventory.

**B) One-time SQL to seed sensible defaults**, then fine-tune in the UI:
```sql
-- Give every non-admin with no pages a starter set (Create Order + History, full inventory)
UPDATE `user`
SET permissions = '{"system":["orders","reports"],"allowedParents":[],"allowedCategories":[],"orderTypes":["Tax Invoice","Quotation"]}'
WHERE role <> 'admin'
  AND (permissions IS NULL OR JSON_EXTRACT(permissions, '$.system') IS NULL);
```

## 4. Deploy path
`ppw.staff` → **manual `eb deploy`** from `ppw.staff/backend/` to env `ppw-prod` / `admin.onlineppw.com`. (Git `main` push deploys the *root* app via CI — a different app; it does NOT carry these `ppw.staff` changes.)

## 5. Notes
- After a schema-affecting deploy, if you see `Unknown column`, restart the app (`systemctl restart web`) so `synchronize` runs.
- Nap-time auto-logout (23:45–05:00, non-admins) is **active in production** by design; disabled only in local dev.
