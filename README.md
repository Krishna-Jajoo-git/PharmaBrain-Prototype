# PharmaBrain

PharmaBrain is a full-stack academic demonstration prototype for JWT authentication, local medical-document uploads, PostgreSQL persistence, and cautious AI-assisted summarisation. It is **not** a healthcare service: use SAMPLE / FAKE documents only, and never use its output as a diagnosis, prescription, or treatment instruction.

## Features

- React + Vite + TypeScript healthcare-style dashboard
- Registration/login with bcrypt password hashing and JWT-protected routes
- PostgreSQL 16 in Docker and Prisma ORM
- User-owned JPG, PNG, and PDF uploads (maximum 10 MB) saved locally in `backend/uploads`
- Gemini document analysis kept entirely on the backend
- Automatic, visibly labelled Demo Mode fallback when Gemini is not configured or fails
- Document history, structured results, profile, deletion confirmation, responsive UI, loading/error/empty states

## Structure

```text
frontend/          React, Vite, Tailwind application
backend/           Express API, Prisma schema, Gemini service, uploads
docker-compose.yml PostgreSQL 16 service
```

## Prerequisites

- Node.js 20+ and npm
- Docker Desktop running
- A Google Gemini API key is optional; mock mode works without one

## Start PostgreSQL

From the project root:

```bash
docker compose up -d
docker ps
```

The service listens on `localhost:5432` by default, with database `pharmabrain`. If another local project already uses port 5432, set `POSTGRES_PORT=5433` before running Compose and update the port in `DATABASE_URL` to `5433`. Stop it with:

```bash
docker compose down
```

Data is retained in the named Docker volume. To change credentials, set `POSTGRES_USER` and `POSTGRES_PASSWORD` in your shell before starting Compose and update `DATABASE_URL` to match.

## Backend setup

```bash
cd backend
copy .env.example .env
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

On macOS/Linux replace `copy` with `cp`. The API runs at `http://localhost:5000`; health check: `http://localhost:5000/api/health`.

Set these values in `backend/.env`:

```env
DATABASE_URL="postgresql://pharmabrain_user:pharmabrain_password@localhost:5432/pharmabrain?schema=public"
JWT_SECRET=use_a_long_random_value
GEMINI_API_KEY=your_key_optional
GEMINI_MODEL=gemini-2.5-flash
USE_MOCK_AI=false
```

When the key is blank, invalid, or `USE_MOCK_AI=true`, the app intentionally returns a clearly labelled `DEMO MODE` sample result. Gemini is never exposed to frontend code.

### OCR prerequisites and fixture benchmark

The image OCR sidecar uses OpenCV for quality checks, deskewing, variant
generation, and layout detection. Install its isolated dependencies before
running image OCR locally:

```bash
cd backend
python -m pip install -r requirements-ocr.txt
npm run test:ocr
```

The benchmark creates five synthetic, non-clinical fixtures (clear, blurry,
handwriting-like, multi-region, and table layout) under
`backend/uploads/_benchmark`. It prints each original/preprocessed path, OCR
text, per-region/overall confidence, and processing time. Difficult handwriting
is intentionally kept as low-confidence OCR output for manual confirmation.

## Frontend setup

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the local Vite URL (normally `http://localhost:5173`).

## API

All document endpoints require `Authorization: Bearer <JWT>`.

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/documents/upload`
- `GET /api/documents`
- `GET /api/documents/:id`
- `POST /api/documents/:id/analyse`
- `DELETE /api/documents/:id`

## Architecture

The React client stores the prototype JWT in local storage and attaches it through Axios. Express verifies that token, uses Prisma to enforce per-user document access, stores uploads on disk, and saves document metadata plus JSON analysis results in PostgreSQL. The backend submits files to Gemini when configured; failures safely become demo output, so presentation flows remain functional offline.

## Demo presentation flow

1. Start Docker PostgreSQL, migrate Prisma, and run backend/frontend.
2. Register a new account and show the protected dashboard.
3. Upload a fake JPG/PNG/PDF as a prescription or report.
4. Click **Analyse Document** and show the loading state.
5. Present the labelled Demo Mode structured summary, precautions, questions, and disclaimer (or Gemini output when configured).
6. Open **My Documents**, revisit the saved summary, then delete it to demonstrate ownership and history.

## Vercel deployment

Deploy this as two Vercel projects from the same repository. Create the backend project with Root Directory `backend`; Vercel will detect `backend/api/index.ts` as the Express function. Use `npm run vercel-build` as its build command. Create the frontend project with Root Directory `frontend`; use `npm run build` and `dist` as the output directory.

For the backend Vercel project, configure `DATABASE_URL` with a hosted PostgreSQL provider (Neon or another Vercel Marketplace provider), `JWT_SECRET`, `JWT_EXPIRES_IN`, `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-2.5-flash`, `USE_MOCK_AI=false`, `FRONTEND_URL` with the deployed frontend URL, and `BLOB_READ_WRITE_TOKEN` from Vercel Blob Storage. Vercel's filesystem is temporary, so production uploads use Blob; local development continues to use `backend/uploads`.

For the frontend Vercel project, configure `VITE_API_URL` to the deployed backend URL, without a trailing slash. Add variables to Preview and Production environments separately, then redeploy after changing them.

## Limitations and disclaimer

This is intentionally a local academic prototype. Local file storage, local token storage, and Docker credentials are appropriate only for demonstration. AI output may be incomplete or wrong. It does not diagnose disease, generate prescriptions, make autonomous decisions, connect to hospitals, or order medicine. Always verify document content and any health question with a qualified healthcare professional.


--- Swayam's update ---
