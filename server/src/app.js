//Import
import path from 'node:path'
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

import dotenv from 'dotenv'
dotenv.config({ path: path.join(__dirname, '../.env') })

import express from 'express'
import helmet from 'helmet'

import scanRoute from '../src/routes/scans.js'
import curlRoute from '../src/routes/curl.js'
import findingRoute from '../src/routes/findings.js'
import sessionRoute from '../src/routes/sessions.js'
//Main code
const app = express();

// ─── Middlewares ─────────────────────────────────────────────────────────────
app.use(helmet());
app.use(express.json());


// ─── Routes ──────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/scans',    scanRoute)
app.use('/curl',     curlRoute)
app.use('/findings', findingRoute)
app.use('/sessions', sessionRoute)

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
    const status = err.statusCode || 500;
    res.status(status).json({ error: { message: err.message, status } });
});

export default app