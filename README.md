# WorkForce Tracker

Daily worker activity tracking with admin verification — deployable to Railway in under 10 minutes.

```
workforce-railway/
├── backend/                  ← FastAPI + PostgreSQL
│   ├── app/
│   │   ├── api/routes/       ← auth, users, shifts, activities, analytics
│   │   ├── core/             ← config, security (JWT + bcrypt)
│   │   ├── db/               ← SQLAlchemy session
│   │   ├── models/           ← User, Shift, Activity ORM models
│   │   ├── schemas/          ← Pydantic v2 request/response schemas
│   │   └── main.py           ← FastAPI app, CORS, startup seed
│   ├── requirements.txt
│   ├── railway.json
│   └── .env.example
└── frontend/                 ← React 18 + Vite
    ├── src/
    │   ├── components/
    │   │   ├── ui/           ← Button, Card, Badge, Input, Modal, Toast…
    │   │   ├── admin/        ← AdminDashboard, VerifyDrawer, charts
    │   │   └── worker/       ← WorkerDashboard, ClockHero, ActivityTimeline
    │   ├── hooks/            ← useActivities, useTodayShift, useWorkers, useDashboardStats
    │   ├── lib/              ← axios api client, utils
    │   ├── store/            ← Zustand auth + theme stores
    │   └── styles/           ← globals.css (design tokens, animations)
    ├── package.json
    ├── vite.config.js
    └── railway.json
```

---

## Deploy to Railway (step-by-step)

### Prerequisites
- Railway account at railway.app (free tier works)
- Git repository with this code pushed

### Step 1 — Push to GitHub

```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_USERNAME/workforce-tracker.git
git push -u origin main
```

### Step 2 — Create Railway project

1. Go to [railway.app](https://railway.app) → **New Project**
2. Choose **Deploy from GitHub repo** → select your repo

### Step 3 — Add PostgreSQL

In your Railway project:
1. Click **+ New** → **Database** → **Add PostgreSQL**
2. Railway automatically sets `DATABASE_URL` — copy it for the next step

### Step 4 — Deploy the Backend service

1. Click **+ New** → **GitHub Repo** → select repo → set **Root Directory** to `backend`
2. Set these **Environment Variables** in the Railway service settings:

| Variable | Value |
|---|---|
| `DATABASE_URL` | *(paste from PostgreSQL service — Railway can also link it)* |
| `SECRET_KEY` | *(run `openssl rand -hex 32` and paste result)* |
| `DEBUG` | `false` |
| `ALLOWED_ORIGINS` | *(your frontend Railway URL — set after step 5)* |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `480` |

3. Railway detects `railway.json` and runs:
   - Build: `pip install -r requirements.txt`
   - Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

4. After deploy, note your backend URL: `https://your-backend.up.railway.app`

On first boot, the server auto-creates all tables and seeds:
- **Email:** `admin@workforce.local`
- **Password:** `Admin@1234` ← change this immediately!

API docs available at: `https://your-backend.up.railway.app/docs`

### Step 5 — Deploy the Frontend service

1. Click **+ New** → **GitHub Repo** → select repo → set **Root Directory** to `frontend`
2. Set this **Environment Variable**:

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://your-backend.up.railway.app` |

3. Railway runs: `npm install && npm run build` then `npx serve -s dist -l $PORT`
4. Note your frontend URL: `https://your-frontend.up.railway.app`

### Step 6 — Update CORS

Go back to the **backend** service → Environment Variables → update:
```
ALLOWED_ORIGINS=https://your-frontend.up.railway.app
```
Railway will auto-redeploy.

### Done!

Visit `https://your-frontend.up.railway.app` and log in with the default admin credentials.

---

## Local Development

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env — set DATABASE_URL and SECRET_KEY

uvicorn app.main:app --reload --port 8000
# Docs: http://localhost:8000/docs
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
# Edit .env: VITE_API_URL=http://localhost:8000

npm run dev
# App: http://localhost:5173
```

---

## API Reference

### Auth
| Method | Endpoint | Auth |
|---|---|---|
| POST | `/api/v1/auth/login` | Public |
| GET | `/api/v1/auth/me` | Any |

### Users (Admin only)
| Method | Endpoint |
|---|---|
| POST | `/api/v1/users` |
| GET | `/api/v1/users?role=worker` |
| PATCH | `/api/v1/users/{id}` |
| DELETE | `/api/v1/users/{id}` |

### Shifts
| Method | Endpoint | Auth |
|---|---|---|
| POST | `/api/v1/shifts/clock-in` | Worker |
| POST | `/api/v1/shifts/clock-out` | Worker |
| GET | `/api/v1/shifts/today` | Any |
| GET | `/api/v1/shifts` | Any (workers see own only) |

### Activities
| Method | Endpoint | Notes |
|---|---|---|
| POST | `/api/v1/activities` | Worker only |
| GET | `/api/v1/activities` | Workers see own; admin sees all |
| PATCH | `/api/v1/activities/{id}` | Locked if approved |
| DELETE | `/api/v1/activities/{id}` | Locked if approved |
| POST | `/api/v1/activities/{id}/verify` | Admin only |

### Analytics (Admin only)
| Method | Endpoint |
|---|---|
| GET | `/api/v1/analytics/dashboard` |
| GET | `/api/v1/analytics/weekly` |
| GET | `/api/v1/analytics/export?fmt=csv` |
| GET | `/api/v1/analytics/export?fmt=xlsx` |

Export supports query filters: `worker_id`, `date_from`, `date_to`, `verification_status`

---

## Key Design Decisions

**Immutable Audit Trail**
Once an admin approves an activity (`verification_status = approved`), all PATCH/DELETE
requests are rejected with HTTP 403 at the API layer. The frontend also hides edit/delete
controls and shows a 🔒 badge. Workers cannot bypass this via direct API calls.

**Mandatory Rejection Feedback**
Pydantic v2 validates server-side that `admin_feedback` is non-empty when
`verification_status = rejected`. The drawer UI also enforces this client-side.

**RBAC at the query layer**
Workers querying `GET /activities` receive an automatic `worker_id = current_user.id`
filter applied in SQL — they cannot see others' data even with crafted API calls.

**Server-computed shift duration**
`total_minutes` is calculated from real `clock_in` / `clock_out` timestamps by the server.
Workers cannot self-report duration.

---

## Production Checklist

- [ ] Replace `SECRET_KEY` with `openssl rand -hex 32`
- [ ] Change default admin password immediately after first login
- [ ] Set `DEBUG=false`
- [ ] Set `ALLOWED_ORIGINS` to your exact frontend domain
- [ ] Enable Railway's built-in DDoS protection
- [ ] Set up Railway's automatic daily backups for PostgreSQL
- [ ] Consider setting `ACCESS_TOKEN_EXPIRE_MINUTES=120` for tighter security
