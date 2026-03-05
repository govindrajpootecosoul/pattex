# Pattex Dashboard

Full-stack dashboard with login/signup and sections: Executive Summary, Revenue, Inventory, Buybox, Marketing, Product Details. Uses static data and MongoDB for user auth.

## Setup

1. **Backend**
   ```bash
   cd backend
   npm install
   ```
   Ensure `backend/.env` has:
   - `MONGO_URI` – your MongoDB connection string (database: `pattex`)
   - `JWT_SECRET` – any secret string
   - `PORT` – e.g. 5000

2. **Frontend**
   ```bash
   cd frontend
   npm install
   ```

## Run

1. Start backend: `cd backend && npm run dev` → http://localhost:5000  
2. Start frontend: `cd frontend && npm run dev` → http://localhost:3000  

Frontend proxies `/api` to the backend. Open http://localhost:3000, sign up or log in, then use the sidebar to open each dashboard section.

## Project structure

- `backend/` – Express API, MongoDB (Mongoose), JWT auth, dashboard routes with static data
- `frontend/` – React (Vite), login/signup, dashboard layout and section pages
- `brain/` – Project notes and knowledge base (do not delete)
