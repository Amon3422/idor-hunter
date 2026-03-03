# IDOR Hunter

An internal security tool for automated IDOR (Insecure Direct Object Reference) / BOLA vulnerability detection. It replays HTTP requests under two different user accounts and uses heuristic scoring + LLM analysis to flag unauthorized data access.

---

## How it works

1. **Input** a request via manual form or cURL import (copy from browser DevTools)
2. **Provide credentials** for Account A (legitimate owner) and Account B (attacker)
3. **Replay** both requests and compare responses with a structural diff engine
4. **Score** the diff using 4 heuristic signals (status codes, size ratio, key similarity, data leakage)
5. **LLM confirms** suspicious results and generates a structured finding with severity, reproduction steps, and a suggested fix

---

## Features

### MVP (complete)
- Manual request input + cURL import
- Dual-session replay (Account A vs. Account B)
- Heuristic structural diff engine (score 0–100)
- LLM integration (Groq + OpenAI fallback with retry/backoff)
- Web UI dashboard — scans, findings list, finding detail
- Structured report export (JSON + Markdown)

### Phase 2 (in progress)
- **Scan Sessions** — batch scan groups for Swagger/OpenAPI imports
- Raw HTTP import
- Swagger / OpenAPI spec import with variable mapping
- Historical scan comparison

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Node.js (ESM), Express 5 |
| Database | PostgreSQL + Prisma ORM |
| LLM | Groq (llama-3.3-70b) / OpenAI (gpt-4o) |
| Frontend | Vanilla JS, HTML/CSS (no framework) |
| Dev | Nodemon, Jest, ESLint |

---

## Prerequisites

- Node.js ≥ 20
- PostgreSQL ≥ 14
- A Groq or OpenAI API key

---

## Setup

### 1. Clone & install

```bash
git clone https://github.com/YOUR_USERNAME/idor-hunter.git
cd idor-hunter
npm install          # installs root + all workspaces
```

### 2. Configure environment

```bash
cp .env.example server/.env
```

Edit `server/.env`:

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/idor_hunter?schema=public"
CREDENTIALS_ENCRYPTION_KEY=   # openssl rand -hex 32
GROQ_API_KEY=                  # from console.groq.com
```

### 3. Set up the database

```bash
cd server
npx prisma migrate deploy      # apply migrations
npx prisma generate            # generate Prisma client
```

### 4. Run

```bash
# From project root — starts both backend (3000) and frontend (3001)
npm run dev
```

Open [http://localhost:3001](http://localhost:3001)

---

## Project structure

```
idor-hunter/
├── server/                   # Express API
│   ├── src/
│   │   ├── controllers/      # Request handlers
│   │   ├── routes/           # Express routers
│   │   ├── services/
│   │   │   ├── parser/       # cURL / raw HTTP parsers
│   │   │   ├── replay/       # HTTP request replayer + session manager
│   │   │   ├── analysis/     # Heuristic diff engine + LLM analyzer
│   │   │   └── report/       # JSON + Markdown report generator
│   │   ├── config/           # Prisma client, LLM config
│   │   └── utils/            # Encryption helpers
│   └── prisma/               # Schema + migrations
└── client/                   # Static frontend
    └── public/               # HTML pages + vanilla JS
```

---

## API overview

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/scans` | Create a standalone scan |
| `GET` | `/scans/:id/run` | Execute scan (replay → diff → LLM) |
| `GET` | `/scans` | Scan history |
| `POST` | `/curl/parse` | Parse a cURL command (preview only) |
| `POST` | `/curl/scan` | Parse cURL + create scan |
| `GET` | `/findings` | List findings (filterable) |
| `GET` | `/findings/:id` | Finding detail |
| `GET` | `/findings/export` | Export findings (JSON / Markdown) |
| `PATCH` | `/findings/:id/status` | Update finding status |
| `POST` | `/sessions` | Create a batch scan session |
| `GET` | `/sessions` | List sessions |
| `GET` | `/sessions/:id` | Session detail + child scans |
| `POST` | `/sessions/:id/run` | Start session execution |
| `PATCH` | `/sessions/:id` | Update session (DRAFT only) |
| `DELETE` | `/sessions/:id` | Delete session |

---

## Security notes

- Credentials (Account A / B tokens) are AES-256-GCM encrypted at rest
- No public-facing authentication — intended for internal security team use only
- Never commit real tokens to `server/.env`; rotate any exposed keys immediately

---

## License

MIT
