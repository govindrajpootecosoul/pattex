# Pattex Backend — API flow (with Signup & Login)

Server: `http://localhost:3026` · Base API: `/api`

**Draw.io:** Haan, is diagram ko draw.io par khol/edit kar sakte ho. Steps → [`drawio-import-guide.md`](./drawio-import-guide.md). Copy-paste file → [`backend-api-flow.mmd`](./backend-api-flow.mmd).

---

## 1. Main request flow (updated — Signup & Login included)

Same structure as your diagram; `/api/auth` paths now show full signup/login steps.

```mermaid
flowchart TD
  A[Browser / React Frontend] -->|fetch URL| B[Express server.js :3026]
  B --> C[CORS middleware]
  C --> D[express.json - body parse]
  D --> E[compression]
  E --> F{URL path?}

  F -->|GET /api/health| HC[Direct response]
  F -->|/api/dashboard/*| H[protect middleware - JWT]
  F -->|/api/auth/logout, users...| AR[authRoutes.js + protect JWT]
  F -->|POST /api/auth/signup| SG_START[authRoutes.js]
  F -->|POST /api/auth/login| LG_START[authRoutes.js]

  subgraph SIGNUP["SIGNUP — POST /api/auth/signup"]
    direction TB
    SG_START --> SG1[Signup.jsx → authApi.signup]
    SG1 --> SG2{All fields? name email phone password databaseName}
    SG2 -->|no| SG_E1[400 Missing fields]
    SG2 -->|yes| SG3{User.findOne email exists?}
    SG3 -->|yes| SG_E2[400 User already exists]
    SG3 -->|no| SG4[User.create + bcrypt hash password]
    SG4 --> SG5[(maindb.userspattex_emami)]
    SG5 --> SG6[jwt.sign 7 days]
    SG6 --> SG7[201 JSON user + token]
    SG7 --> SG8[localStorage pattex_token + pattex_user]
  end

  subgraph LOGIN["LOGIN — POST /api/auth/login"]
    direction TB
    LG_START --> LG1[Login.jsx → authApi.login]
    LG1 --> LG2{email + password?}
    LG2 -->|no| LG_E1[400 Provide email and password]
    LG2 -->|yes| LG3[User.findOne email + password from maindb]
    LG3 --> LG4{Found + bcrypt matchPassword?}
    LG4 -->|no| LG_E2[401 Invalid email or password]
    LG4 -->|yes| LG5{status active?}
    LG5 -->|no| LG_E3[403 Inactive account]
    LG5 -->|yes| LG6[jwt.sign 7 days]
    LG6 --> LG7[200 JSON user + token]
    LG7 --> LG8[localStorage + navigate /dashboard]
  end

  H -->|token fail| K[401 Unauthorized]
  H -->|token OK| DR[dashboardRoutes.js]
  DR --> CM[Company models from req.user.databaseName]
  CM --> DB2[(MongoDB pattex / emami - dashboard)]
  DB2 --> DRH[Handler: revenue inventory marketing buybox...]
  DRH --> R[JSON response]

  SG8 --> R
  LG8 --> R
  AR --> M1[(maindb.userspattex_emami)]
  M1 --> R
  HC --> R
  SG_E1 --> R
  SG_E2 --> R
  LG_E1 --> R
  LG_E2 --> R
  LG_E3 --> R
  K --> R
  R --> A
```

---

## 2. Signup only (detail)

```mermaid
flowchart LR
  subgraph FE[Frontend]
    F1[Signup form submit] --> F2[POST /api/auth/signup JSON body]
  end

  subgraph BE[Backend authRoutes.js]
    B1[Validate fields] --> B2{email duplicate?}
    B2 -->|yes| E1[400]
    B2 -->|no| B3[User.create]
    B3 --> B4[User model pre-save: bcrypt.hash password]
    B4 --> B5[jwt.sign → token]
    B5 --> B6[201 JSON response]
  end

  subgraph DB[MongoDB]
    D1[(maindb.userspattex_emami)]
  end

  subgraph STORE[Browser after success]
    S1[pattex_token] 
    S2[pattex_user with databaseName]
  end

  F2 --> B1
  B3 --> D1
  B6 --> S1
  B6 --> S2
```

**Signup body:** `{ name, email, phone, password, databaseName, role? }`  
**`databaseName`** = which company dashboard DB to use later (e.g. `pattex`, `emami`).

---

## 3. Login only (detail)

```mermaid
flowchart LR
  subgraph FE[Frontend]
    F1[Login form submit] --> F2[POST /api/auth/login]
  end

  subgraph BE[Backend authRoutes.js]
    B1[email + password] --> B2[Find user in maindb]
    B2 --> B3[bcrypt.compare password]
    B3 --> B4{active status?}
    B4 -->|no| E1[403]
    B4 -->|yes| B5[jwt.sign → token]
    B5 --> B6[JSON: user + token]
  end

  subgraph DB[MongoDB]
    D1[(maindb.userspattex_emami)]
  end

  F2 --> B1
  B2 --> D1
  B6 --> LS[localStorage + Dashboard]
```

---

## 4. Dashboard API after login

```mermaid
flowchart TD
  A[Dashboard page e.g. Revenue] --> B[dashboardApi.getRevenue]
  B --> C[GET /api/dashboard/revenue]
  C --> D[Header: Authorization Bearer pattex_token]
  D --> E[protect: jwt.verify → User.findById]
  E --> F[req.user.databaseName → getCompanyModels]
  F --> G[(Company DB: revenues collection)]
  G --> H[JSON → charts / tables]
```

---

## Quick reference

| Step | Signup | Login |
|------|--------|-------|
| URL | `POST /api/auth/signup` | `POST /api/auth/login` |
| DB read/write | Write new user in **maindb** | Read user from **maindb** |
| Password | Hash on save (bcrypt) | Compare with hash (bcrypt) |
| Token | JWT 7 days | JWT 7 days |
| Frontend storage | `pattex_token`, `pattex_user` | Same |

Protected routes always send: `Authorization: Bearer <token>`.
