"""routes/incidents.py — POST /log_incident, GET /incidents"""
import uuid
from datetime import datetime, timezone

import aiosqlite
from fastapi import APIRouter
from pydantic import BaseModel

DB_PATH = "beacon.db"
router = APIRouter()


async def get_db():
    db = await aiosqlite.connect(DB_PATH)
    await db.execute(
        """CREATE TABLE IF NOT EXISTS incidents (
            id TEXT PRIMARY KEY,
            timestamp TEXT NOT NULL,
            transcript TEXT,
            language TEXT,
            guidance TEXT,
            location TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )"""
    )
    await db.commit()
    return db


class IncidentRequest(BaseModel):
    guidance: dict
    location: str = ""
    timestamp: str = ""
    transcript: str = ""
    language: str = "en"


@router.post("/log_incident")
async def log_incident(req: IncidentRequest):
    incident_id = str(uuid.uuid4())
    ts = req.timestamp or datetime.now(timezone.utc).isoformat()
    import json

    db = await get_db()
    await db.execute(
        "INSERT INTO incidents (id, timestamp, transcript, language, guidance, location) VALUES (?,?,?,?,?,?)",
        (incident_id, ts, req.transcript, req.language, json.dumps(req.guidance), req.location),
    )
    await db.commit()
    await db.close()
    return {"id": incident_id}


@router.get("/incidents")
async def list_incidents(limit: int = 50):
    import json

    db = await get_db()
    cursor = await db.execute(
        "SELECT id, timestamp, transcript, language, guidance, location FROM incidents ORDER BY timestamp DESC LIMIT ?",
        (limit,),
    )
    rows = await cursor.fetchall()
    await db.close()
    return [
        {"id": r[0], "timestamp": r[1], "transcript": r[2], "language": r[3],
         "guidance": json.loads(r[4]), "location": r[5]}
        for r in rows
    ]
