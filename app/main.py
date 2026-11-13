import json
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import Base, engine, get_db
from app.models import LogEntry, Pill, PillBox, Placement, Visit
from app.schemas import CopyDay, LogWrite, PillBoxCreate, PillBoxUpdate, PillWrite, SlotWrite, VisitWrite

STATIC_DIR = Path(__file__).resolve().parent / "static"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Health tracker", lifespan=lifespan)


def log_out(row: LogEntry) -> dict:
    return {
        "id": row.id,
        "occurred_at": row.occurred_at.strftime("%Y-%m-%dT%H:%M:%S"),
        "text": row.text,
        "tags": json.loads(row.tags),
    }


def pill_out(row: Pill) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "description": row.description,
        "shape": row.shape,
        "color": row.color,
    }


def box_out(row: PillBox) -> dict:
    return {
        "id": row.id,
        "title": row.title,
        "description": row.description,
        "end_date": row.end_date.isoformat() if row.end_date else None,
        "display_order": row.display_order,
        "placements": [
            {"weekday": item.weekday, "slot": item.slot, "pill_id": item.pill_id}
            for item in sorted(row.placements, key=lambda item: (item.weekday, item.slot))
        ],
    }


def visit_out(row: Visit) -> dict:
    return {
        "id": row.id,
        "visit_date": row.visit_date.isoformat(),
        "doctor_kind": row.doctor_kind,
        "doctor_name": row.doctor_name,
        "conclusion": row.conclusion,
        "prescription": row.prescription,
        "next_steps": row.next_steps,
    }


def require_box(db: Session, box_id: int) -> PillBox:
    box = db.get(PillBox, box_id)
    if box is None:
        raise HTTPException(status_code=404, detail="Pill box not found")
    return box


def require_pill(db: Session, pill_id: int) -> Pill:
    pill = db.get(Pill, pill_id)
    if pill is None:
        raise HTTPException(status_code=404, detail="Pill not found")
    return pill


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return Response(status_code=204)


@app.get("/api/logs")
def list_logs(db: Session = Depends(get_db)):
    rows = db.scalars(select(LogEntry).order_by(LogEntry.occurred_at, LogEntry.id)).all()
    return [log_out(row) for row in rows]


@app.post("/api/logs", status_code=201)
def create_log(payload: LogWrite, db: Session = Depends(get_db)):
    row = LogEntry(
        occurred_at=payload.occurred_at,
        text=payload.text,
        tags=json.dumps(payload.tags),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return log_out(row)


@app.patch("/api/logs/{log_id}")
def update_log(log_id: int, payload: LogWrite, db: Session = Depends(get_db)):
    row = db.get(LogEntry, log_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Log entry not found")
    row.occurred_at = payload.occurred_at
    row.text = payload.text
    row.tags = json.dumps(payload.tags)
    db.commit()
    db.refresh(row)
    return log_out(row)


@app.delete("/api/logs/{log_id}", status_code=204)
def delete_log(log_id: int, db: Session = Depends(get_db)):
    row = db.get(LogEntry, log_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Log entry not found")
    db.delete(row)
    db.commit()


@app.get("/api/current-medicines")
def current_medicines(db: Session = Depends(get_db)):
    pill_ids = db.scalars(select(Placement.pill_id).distinct()).all()
    if not pill_ids:
        return []
    pills = db.scalars(select(Pill).where(Pill.id.in_(pill_ids))).all()
    pills.sort(key=lambda pill: (pill.name.casefold(), pill.id))
    return [{"id": pill.id, "name": pill.name} for pill in pills]


@app.get("/api/pills")
def list_pills(db: Session = Depends(get_db)):
    rows = db.scalars(select(Pill).order_by(Pill.id)).all()
    return [pill_out(row) for row in rows]


@app.post("/api/pills", status_code=201)
def create_pill(payload: PillWrite, db: Session = Depends(get_db)):
    row = Pill(
        name=payload.name,
        description=payload.description,
        shape=payload.shape,
        color=payload.color,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return pill_out(row)


@app.patch("/api/pills/{pill_id}")
def update_pill(pill_id: int, payload: PillWrite, db: Session = Depends(get_db)):
    row = require_pill(db, pill_id)
    row.name = payload.name
    row.description = payload.description
    row.shape = payload.shape
    row.color = payload.color
    db.commit()
    db.refresh(row)
    return pill_out(row)


@app.post("/api/pills/{pill_id}/duplicate", status_code=201)
def duplicate_pill(pill_id: int, db: Session = Depends(get_db)):
    source = require_pill(db, pill_id)
    row = Pill(
        name=source.name,
        description=source.description,
        shape=source.shape,
        color=source.color,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return pill_out(row)


@app.delete("/api/pills/{pill_id}", status_code=204)
def delete_pill(pill_id: int, db: Session = Depends(get_db)):
    row = require_pill(db, pill_id)
    db.delete(row)
    db.commit()


@app.get("/api/pill-boxes")
def list_boxes(db: Session = Depends(get_db)):
    rows = db.scalars(select(PillBox).order_by(PillBox.display_order, PillBox.id)).all()
    return [box_out(row) for row in rows]


@app.post("/api/pill-boxes", status_code=201)
def create_box(payload: PillBoxCreate, db: Session = Depends(get_db)):
    current = db.scalar(select(func.max(PillBox.display_order)))
    row = PillBox(
        title=payload.title,
        description=payload.description,
        display_order=0 if current is None else current + 1,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return box_out(row)


@app.patch("/api/pill-boxes/{box_id}")
def update_box(box_id: int, payload: PillBoxUpdate, db: Session = Depends(get_db)):
    row = require_box(db, box_id)
    changes = payload.model_dump(exclude_unset=True)
    if "title" in changes:
        row.title = changes["title"]
    if "description" in changes:
        row.description = changes["description"]
    if "end_date" in changes:
        row.end_date = changes["end_date"]
    db.commit()
    db.refresh(row)
    return box_out(row)


@app.delete("/api/pill-boxes/{box_id}", status_code=204)
def delete_box(box_id: int, db: Session = Depends(get_db)):
    row = require_box(db, box_id)
    db.delete(row)
    db.commit()


@app.put("/api/pill-boxes/{box_id}/slots")
def set_slot(box_id: int, payload: SlotWrite, db: Session = Depends(get_db)):
    box = require_box(db, box_id)
    if payload.pill_id is not None:
        require_pill(db, payload.pill_id)
    existing = next(
        (
            item
            for item in box.placements
            if item.weekday == payload.weekday and item.slot == payload.slot
        ),
        None,
    )
    if payload.pill_id is None:
        if existing is not None:
            db.delete(existing)
    elif existing is None:
        db.add(
            Placement(
                pill_box_id=box.id,
                weekday=payload.weekday,
                slot=payload.slot,
                pill_id=payload.pill_id,
            )
        )
    else:
        existing.pill_id = payload.pill_id
    db.commit()
    db.refresh(box)
    return box_out(box)


@app.post("/api/pill-boxes/{box_id}/copy-day")
def copy_day(box_id: int, payload: CopyDay, db: Session = Depends(get_db)):
    box = require_box(db, box_id)
    source = [
        (item.slot, item.pill_id)
        for item in box.placements
        if item.weekday == payload.weekday
    ]
    for item in list(box.placements):
        if item.weekday != payload.weekday:
            db.delete(item)
    db.flush()
    for day in range(7):
        if day == payload.weekday:
            continue
        for slot, pill_id in source:
            db.add(
                Placement(
                    pill_box_id=box.id,
                    weekday=day,
                    slot=slot,
                    pill_id=pill_id,
                )
            )
    db.commit()
    db.refresh(box)
    return box_out(box)


@app.get("/api/visits")
def list_visits(db: Session = Depends(get_db)):
    rows = db.scalars(select(Visit).order_by(Visit.visit_date.desc(), Visit.id.desc())).all()
    return [visit_out(row) for row in rows]


@app.post("/api/visits", status_code=201)
def create_visit(payload: VisitWrite, db: Session = Depends(get_db)):
    row = Visit(
        visit_date=payload.visit_date,
        doctor_kind=payload.doctor_kind,
        doctor_name=payload.doctor_name,
        conclusion=payload.conclusion,
        prescription=payload.prescription,
        next_steps=payload.next_steps,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return visit_out(row)


@app.patch("/api/visits/{visit_id}")
def update_visit(visit_id: int, payload: VisitWrite, db: Session = Depends(get_db)):
    row = db.get(Visit, visit_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Visit not found")
    row.visit_date = payload.visit_date
    row.doctor_kind = payload.doctor_kind
    row.doctor_name = payload.doctor_name
    row.conclusion = payload.conclusion
    row.prescription = payload.prescription
    row.next_steps = payload.next_steps
    db.commit()
    db.refresh(row)
    return visit_out(row)


@app.delete("/api/visits/{visit_id}", status_code=204)
def delete_visit(visit_id: int, db: Session = Depends(get_db)):
    row = db.get(Visit, visit_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Visit not found")
    db.delete(row)
    db.commit()


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
