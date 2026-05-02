"""routes/sms.py — POST /compose_sms, GET /sms_queue, POST /mark_sent"""
import uuid

import aiosqlite
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

DB_PATH = "beacon.db"
router = APIRouter()


async def get_db():
    db = await aiosqlite.connect(DB_PATH)
    await db.execute(
        """CREATE TABLE IF NOT EXISTS sms_queue (
            id TEXT PRIMARY KEY,
            incident_id TEXT,
            message TEXT NOT NULL,
            location TEXT,
            sent INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )"""
    )
    await db.commit()
    return db


class SMSRequest(BaseModel):
    incident_id: str = ""
    patient_count: int
    situation_summary: str
    location: str = "[Location — tap to type]"
    notes: str = ""


@router.post("/compose_sms")
async def compose_sms(req: SMSRequest):
    if req.patient_count < 1:
        raise HTTPException(status_code=400, detail="patient_count must be >= 1")

    loc = req.location or "[Location — tap to type]"
    notes_part = f" {req.notes}." if req.notes else ""
    message = (
        f"BEACON — [{loc}] — {req.patient_count} affected. "
        f"{req.situation_summary}.{notes_part} "
        "Containment check in progress. ORT started. Request medical team."
    )

    sms_id = str(uuid.uuid4())
    db = await get_db()
    await db.execute(
        "INSERT INTO sms_queue (id, incident_id, message, location) VALUES (?,?,?,?)",
        (sms_id, req.incident_id, message, loc),
    )
    await db.commit()
    await db.close()

    return {"id": sms_id, "message": message, "location": loc}


@router.get("/sms_queue")
async def list_sms_queue(sent: bool = False):
    db = await get_db()
    cursor = await db.execute(
        "SELECT id, incident_id, message, location, sent, created_at "
        "FROM sms_queue WHERE sent = ? ORDER BY created_at DESC",
        (1 if sent else 0,),
    )
    rows = await cursor.fetchall()
    await db.close()
    return [
        {"id": r[0], "incident_id": r[1], "message": r[2],
         "location": r[3], "sent": bool(r[4]), "created_at": r[5]}
        for r in rows
    ]


@router.post("/mark_sent/{sms_id}")
async def mark_sent(sms_id: str):
    db = await get_db()
    await db.execute("UPDATE sms_queue SET sent = 1 WHERE id = ?", (sms_id,))
    await db.commit()
    await db.close()
    return {"id": sms_id, "sent": True}
