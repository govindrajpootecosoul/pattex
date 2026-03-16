# Database (MongoDB – multi-database setup)

## Cluster
- **Cluster**: `cluster0.2ift0zy.mongodb.net`
- **Main DB** (auth): `maindb` – used for user accounts only
- **Company DBs** (dashboard data): one per company, e.g. `pattex`, `emami` (same collection names in each)

## Connection
- `backend/.env`: `MONGO_URI` – e.g.  
  `mongodb+srv://USER:PASSWORD@cluster0.2ift0zy.mongodb.net/maindb?retryWrites=true&w=majority`  
- Backend **forces** the default connection to use database **maindb** (see `config/db.js`), so users are always stored in maindb regardless of the DB name in the URI.

## Main DB (`maindb`) – Auth only

### Collection: `userspattex_emami`
- `name` (String, required)
- `email` (String, required, unique)
- `phone` (String, required)
- `password` (String, required, hashed, select: false)
- `databaseName` (String, required) – company DB name on same cluster (e.g. `pattex`, `emami`)
- `createdAt`, `updatedAt` (timestamps)

## Company DBs (e.g. `pattex`, `emami`)
Same collection names in every company database:
- **revenues** – revenue/sales data
- **inventories** – inventory data
- **marketings** – marketing/campaign data
- **buyboxes** – buybox data

Dashboard API uses the logged-in user’s `databaseName` to connect to that company’s DB via `mongoose.connection.useDb(databaseName)` and reads/writes these collections.

## Flow
1. **Signup**: User provides name, email, phone, password, **databaseName** (company). Stored in `maindb.userspattex_emami`.
2. **Login**: Auth against `maindb`. Response includes `databaseName`.
3. **Dashboard**: Every `/api/dashboard/*` request uses `req.user.databaseName` to attach company models (Revenue, Inventory, Marketing, Buybox) for that DB; all data comes from that company’s database.
