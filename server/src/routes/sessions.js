'use strict';

import express from 'express'
import {
    createSession,
    getSessions,
    getSession,
    updateSession,
    runSession,
    deleteSession,
} from '../controllers/sessionController.js'

const router = express.Router();

// POST   /sessions            — Create a new session (from Swagger or manual)
router.post('/',           createSession);

// GET    /sessions            — List all sessions with progress summary
router.get('/',            getSessions);

// GET    /sessions/:id        — Get session detail + child scans
router.get('/:id',         getSession);

// PATCH  /sessions/:id        — Update name or global_mapping (DRAFT only)
router.patch('/:id',       updateSession);

// POST   /sessions/:id/run    — Set mapping+auth, create child scans, start async execution
router.post('/:id/run',    runSession);

// DELETE /sessions/:id        — Delete session and cascade child scans
router.delete('/:id',      deleteSession);

export default router
