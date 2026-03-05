# Database (MongoDB – pattex)

## Connection
- Use the URI in `backend/.env`: `MONGO_URI`
- Database name: **pattex** (in the URI path)

## Collections

### users
- `name` (String, required)
- `email` (String, required, unique)
- `phone` (String, required)
- `password` (String, required, hashed)
- `createdAt`, `updatedAt` (timestamps)

Dashboard data is currently **static** in backend routes; no dashboard collections yet. When switching to live data, add collections as needed (e.g. revenue, inventory, buybox, marketing, products).
