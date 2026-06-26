"""
Client management (admin only) + client portal (client role).

Admin endpoints:
  POST   /clients               — create a client account
  GET    /clients               — list this admin's clients
  PATCH  /clients/{id}/workers  — assign/replace worker list for a client
  DELETE /clients/{id}          — remove client
  GET    /clients/reviews        — admin: all reviews left for their team's workers

Client portal:
  GET    /clients/me/feed       — live status of assigned workers (today)
  GET    /clients/me/history    — daily summaries of assigned workers over a date range
  POST   /clients/me/reviews    — leave a star rating + comment about an assigned worker
  GET    /clients/me/reviews    — list reviews this client has left
"""
import logging
from datetime import datetime, timedelta, timezone, date as date_cls
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func

from pydantic import BaseModel, field_validator
from app.db.database import get_db
from app.models.models import User, UserRole, ClientWorker, Shift, CheckIn, WorkerReview, PushSubscription
from app.schemas.schemas import (
    ClientCreate, ClientWorkerAssign, ClientOut, WorkerLiveStatus, WorkerDailySummary,
    WorkerReviewCreate, WorkerReviewUpdate, WorkerReviewOut, WorkerReviewSummary,
)
from app.api.deps import require_regular_admin, require_client, require_worker, get_current_user
from app.core.security import get_password_hash
from app.core.schedule_utils import logical_today
from app.core.push import notify_user

router = APIRouter(prefix="/clients", tags=["Clients"])
logger = logging.getLogger(__name__)

MAX_HISTORY_DAYS = 31  # cap range size so a client portal query can't scan the whole table

def _client_out(client, db, admin_name=None):
    """Build ClientOut with assigned_worker_ids populated."""
    wids = [cw.worker_id for cw in db.query(ClientWorker).filter(ClientWorker.client_id == client.id).all()]
    return ClientOut(
        id=client.id, name=client.name, email=client.email,
        role=client.role, department=client.department,
        is_active=client.is_active, admin_id=client.admin_id, admin_name=admin_name,
        created_at=client.created_at, assigned_worker_ids=wids,
    )


# ── Client portal: live worker feed ───────────────────────────────────────────
# MUST be defined before /{client_id} routes so FastAPI doesn't treat "me" as an int

@router.get("/me/feed", response_model=List[WorkerLiveStatus])
def client_feed(db: Session = Depends(get_db), client=Depends(require_client)):
    """Read-only: live status of all workers assigned to this client today."""
    now = datetime.now(timezone.utc)
    today = logical_today(now)

    assignments = db.query(ClientWorker).filter(ClientWorker.client_id == client.id).all()
    worker_ids = [a.worker_id for a in assignments]
    if not worker_ids:
        return []

    workers = db.query(User).filter(User.id.in_(worker_ids), User.is_active == True).all()

    result = []
    for worker in workers:
        shift = (
            db.query(Shift)
            .options(joinedload(Shift.check_ins))
            .filter(Shift.worker_id == worker.id, Shift.date == today)
            .first()
        )
        is_online = bool(shift and shift.clock_in and not shift.clock_out)
        clock_in  = shift.clock_in  if shift else None
        clock_out = shift.clock_out if shift else None

        # Live elapsed minutes for active shift; stored minutes for completed shift
        minutes_today = 0
        if shift and shift.clock_in:
            if shift.clock_out:
                minutes_today = shift.total_minutes or 0
            else:
                minutes_today = max(0, int((now - shift.clock_in).total_seconds() / 60))

        tasks_today = 0
        check_in_count = 0
        last_active_at = None
        if shift:
            check_in_count = len(shift.check_ins)
            tasks_today = sum(c.outlier_tasks_completed for c in shift.check_ins)
            # Last activity = the most recent of clock_in, latest check-in, or clock_out
            candidates = [t for t in (
                shift.clock_in,
                max((c.submitted_at for c in shift.check_ins), default=None),
                shift.clock_out,
            ) if t is not None]
            last_active_at = max(candidates) if candidates else None

        result.append(WorkerLiveStatus(
            worker_id=worker.id,
            worker_name=worker.name,
            department=worker.department,
            is_online=is_online,
            clock_in=clock_in,
            clock_out=clock_out,
            minutes_today=minutes_today,
            hours_today=round(minutes_today / 60, 1),
            tasks_today=tasks_today,
            check_in_count=check_in_count,
            last_active_at=last_active_at,
        ))

    result.sort(key=lambda w: (not w.is_online, w.worker_name))
    return result


# ── Client portal: historical daily summaries ─────────────────────────────────

@router.get("/me/history", response_model=List[WorkerDailySummary])
def client_history(
    date_from: Optional[date_cls] = Query(None),
    date_to: Optional[date_cls] = Query(None),
    db: Session = Depends(get_db),
    client=Depends(require_client),
):
    """
    Read-only: per-day summaries (hours, tasks, check-ins) for this client's
    assigned workers, defaulting to the past 7 days if no range is given.
    """
    today = logical_today(datetime.now(timezone.utc))
    if not date_to:
        date_to = today
    if not date_from:
        date_from = date_to - timedelta(days=6)
    if date_from > date_to:
        raise HTTPException(400, "date_from must be before date_to")
    if (date_to - date_from).days > MAX_HISTORY_DAYS:
        raise HTTPException(400, f"Date range cannot exceed {MAX_HISTORY_DAYS} days")

    assignments = db.query(ClientWorker).filter(ClientWorker.client_id == client.id).all()
    worker_ids = [a.worker_id for a in assignments]
    if not worker_ids:
        return []

    workers = {w.id: w for w in db.query(User).filter(User.id.in_(worker_ids)).all()}

    shifts = (
        db.query(Shift)
        .options(joinedload(Shift.check_ins))
        .filter(
            Shift.worker_id.in_(worker_ids),
            Shift.date >= date_from,
            Shift.date <= date_to,
        )
        .order_by(Shift.date.desc())
        .all()
    )

    result = []
    for shift in shifts:
        worker = workers.get(shift.worker_id)
        if not worker:
            continue
        minutes_total = shift.total_minutes if shift.total_minutes is not None else (
            int((datetime.now(timezone.utc) - shift.clock_in).total_seconds() / 60)
            if shift.clock_in and not shift.clock_out else 0
        )
        result.append(WorkerDailySummary(
            date=shift.date,
            worker_id=worker.id,
            worker_name=worker.name,
            department=worker.department,
            clock_in=shift.clock_in,
            clock_out=shift.clock_out,
            minutes_total=minutes_total,
            hours_total=round(minutes_total / 60, 1),
            tasks_total=sum(c.outlier_tasks_completed for c in shift.check_ins),
            check_in_count=len(shift.check_ins),
        ))

    return result


# ── Client portal: leave / edit a review for an assigned worker ───────────────

def _review_out(r: WorkerReview, client_name: Optional[str] = None, worker_name: Optional[str] = None) -> WorkerReviewOut:
    """Shared mapper so every endpoint returns the same shape, including edited_at."""
    return WorkerReviewOut(
        id=r.id, client_id=r.client_id,
        client_name=client_name or (r.client.name if r.client else None),
        worker_id=r.worker_id,
        worker_name=worker_name or (r.worker.name if r.worker else None),
        rating=r.rating, comment=r.comment,
        created_at=r.created_at, edited_at=r.edited_at,
    )


def _notify_admin_new_review(db: Session, admin_id: int, client_name: str, worker_name: str, rating: int) -> None:
    """Best-effort push notification to the admin's subscribed devices. Never raises."""
    stars = "★" * rating + "☆" * (5 - rating)
    notify_user(
        db, admin_id,
        title=f"⭐ New review for {worker_name}",
        body=f"{client_name} rated {worker_name} {stars} ({rating}/5).",
    )


@router.post("/me/reviews", response_model=WorkerReviewOut, status_code=201)
def submit_review(
    payload: WorkerReviewCreate,
    db: Session = Depends(get_db),
    client=Depends(require_client),
):
    """Client: leave a star rating + optional comment for one of their assigned workers."""
    assignment = db.query(ClientWorker).filter(
        ClientWorker.client_id == client.id,
        ClientWorker.worker_id == payload.worker_id,
    ).first()
    if not assignment:
        raise HTTPException(403, "You can only review workers assigned to you")

    worker = db.query(User).filter(User.id == payload.worker_id, User.role == UserRole.worker).first()
    if not worker:
        raise HTTPException(404, "Worker not found")

    review = WorkerReview(
        client_id=client.id,
        worker_id=worker.id,
        admin_id=worker.admin_id,
        rating=payload.rating,
        comment=payload.comment,
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    logger.info("Client %s rated worker %s: %s/5", client.id, worker.id, payload.rating)

    if worker.admin_id:
        _notify_admin_new_review(db, worker.admin_id, client.name, worker.name, payload.rating)

    return _review_out(review, client_name=client.name, worker_name=worker.name)


@router.patch("/me/reviews/{review_id}", response_model=WorkerReviewOut)
def edit_review(
    review_id: int,
    payload: WorkerReviewUpdate,
    db: Session = Depends(get_db),
    client=Depends(require_client),
):
    """Client: revise a review they previously left. Only the original author can edit it."""
    review = db.query(WorkerReview).options(joinedload(WorkerReview.worker)).filter(
        WorkerReview.id == review_id,
        WorkerReview.client_id == client.id,
    ).first()
    if not review:
        raise HTTPException(404, "Review not found")

    review.rating = payload.rating
    review.comment = payload.comment
    review.edited_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(review)
    logger.info("Client %s edited review %s for worker %s: now %s/5", client.id, review_id, review.worker_id, payload.rating)

    return _review_out(review, client_name=client.name)


@router.get("/me/reviews", response_model=List[WorkerReviewOut])
def list_my_reviews(db: Session = Depends(get_db), client=Depends(require_client)):
    """Client: list all reviews they've left, most recent first."""
    reviews = (
        db.query(WorkerReview)
        .options(joinedload(WorkerReview.worker))
        .filter(WorkerReview.client_id == client.id)
        .order_by(WorkerReview.created_at.desc())
        .all()
    )
    return [_review_out(r, client_name=client.name) for r in reviews]


# ── Worker: view reviews left about them ───────────────────────────────────────

@router.get("/reviews/me", response_model=List[WorkerReviewOut])
def list_reviews_about_me(db: Session = Depends(get_db), worker=Depends(require_worker)):
    """Worker: read-only list of reviews clients have left about them, most recent first."""
    reviews = (
        db.query(WorkerReview)
        .options(joinedload(WorkerReview.client))
        .filter(WorkerReview.worker_id == worker.id)
        .order_by(WorkerReview.created_at.desc())
        .all()
    )
    return [_review_out(r, worker_name=worker.name) for r in reviews]


# ── Admin: view reviews left for their team's workers ─────────────────────────

@router.get("/reviews", response_model=List[WorkerReviewOut])
def list_team_reviews(
    worker_id: Optional[int] = None,
    db: Session = Depends(get_db),
    admin=Depends(require_regular_admin),
):
    """Admin: all reviews clients have left for workers on this admin's team."""
    q = (
        db.query(WorkerReview)
        .options(joinedload(WorkerReview.worker), joinedload(WorkerReview.client))
        .filter(WorkerReview.admin_id == admin.id)
    )
    if worker_id:
        q = q.filter(WorkerReview.worker_id == worker_id)
    reviews = q.order_by(WorkerReview.created_at.desc()).all()
    return [_review_out(r) for r in reviews]


@router.get("/reviews/summary", response_model=List[WorkerReviewSummary])
def team_review_summary(db: Session = Depends(get_db), admin=Depends(require_regular_admin)):
    """Admin: average rating + review count per worker, for a quick leaderboard view."""
    team_workers = db.query(User).filter(User.admin_id == admin.id, User.role == UserRole.worker).all()
    if not team_workers:
        return []
    worker_ids = [w.id for w in team_workers]
    names = {w.id: w.name for w in team_workers}

    agg = (
        db.query(WorkerReview.worker_id, func.count(WorkerReview.id), func.avg(WorkerReview.rating))
        .filter(WorkerReview.worker_id.in_(worker_ids))
        .group_by(WorkerReview.worker_id)
        .all()
    )
    agg_map = {row[0]: (row[1], row[2]) for row in agg}

    latest_by_worker = {}
    if agg_map:
        latest_reviews = (
            db.query(WorkerReview)
            .options(joinedload(WorkerReview.client))
            .filter(WorkerReview.worker_id.in_(agg_map.keys()))
            .order_by(WorkerReview.worker_id, WorkerReview.created_at.desc())
            .all()
        )
        for r in latest_reviews:
            if r.worker_id not in latest_by_worker:
                latest_by_worker[r.worker_id] = r

    result = []
    for wid in worker_ids:
        count, avg = agg_map.get(wid, (0, None))
        latest = latest_by_worker.get(wid)
        result.append(WorkerReviewSummary(
            worker_id=wid,
            worker_name=names[wid],
            review_count=count,
            average_rating=round(float(avg), 2) if avg is not None else None,
            latest_review=_review_out(latest, worker_name=names[wid]) if latest else None,
        ))
    result.sort(key=lambda x: (x.average_rating is None, -(x.average_rating or 0)))
    return result


# ── Admin: create client ───────────────────────────────────────────────────────

@router.post("", response_model=ClientOut, status_code=201)
def create_client(payload: ClientCreate, db: Session = Depends(get_db), admin=Depends(require_regular_admin)):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(409, "Email already registered")

    client = User(
        name=payload.name,
        email=payload.email,
        password_hash=get_password_hash(payload.password),
        role=UserRole.client,
        is_active=True,
        admin_id=admin.id,
    )
    db.add(client)
    db.flush()

    # Assign initial workers
    for wid in payload.worker_ids:
        worker = db.query(User).filter(
            User.id == wid,
            User.role == UserRole.worker,
            User.admin_id == admin.id,
        ).first()
        if worker:
            db.add(ClientWorker(client_id=client.id, worker_id=wid))

    db.commit()
    db.refresh(client)
    logger.info("Admin %s created client %s", admin.id, client.id)
    return _client_out(client, db, admin_name=admin.name)


# ── Admin: list their clients ──────────────────────────────────────────────────

@router.get("", response_model=List[ClientOut])
def list_clients(db: Session = Depends(get_db), admin=Depends(require_regular_admin)):
    clients = db.query(User).filter(
        User.role == UserRole.client,
        User.admin_id == admin.id,
    ).order_by(User.created_at.desc()).all()
    return [_client_out(c, db, admin_name=admin.name) for c in clients]


# ── Admin: assign workers to a client ─────────────────────────────────────────

@router.patch("/{client_id}/workers")
def assign_workers(
    client_id: int,
    payload: ClientWorkerAssign,
    db: Session = Depends(get_db),
    admin=Depends(require_regular_admin),
):
    client = db.query(User).filter(
        User.id == client_id,
        User.role == UserRole.client,
        User.admin_id == admin.id,
    ).first()
    if not client:
        raise HTTPException(404, "Client not found")

    # Replace all assignments
    db.query(ClientWorker).filter(ClientWorker.client_id == client_id).delete(synchronize_session=False)
    for wid in payload.worker_ids:
        worker = db.query(User).filter(
            User.id == wid,
            User.role == UserRole.worker,
            User.admin_id == admin.id,
        ).first()
        if worker:
            db.add(ClientWorker(client_id=client_id, worker_id=wid))

    db.commit()
    logger.info("Admin %s updated workers for client %s: %s", admin.id, client_id, payload.worker_ids)
    return {"client_id": client_id, "worker_ids": payload.worker_ids}


# ── Admin: suspend / reinstate a client ──────────────────────────────────────

class ClientSuspendRequest(BaseModel):
    reason: Optional[str] = None   # required when suspending, ignored when reinstating

@router.patch("/{client_id}/suspend", response_model=ClientOut)
def suspend_client(
    client_id: int,
    payload: ClientSuspendRequest,
    db: Session = Depends(get_db),
    admin=Depends(require_regular_admin),
):
    """
    Admin: suspend or reinstate a client account.

    On suspension:
    - Sets is_active = False with an audit timestamp + reason.
    - Closes any open shifts for workers assigned to this client
      so hourly pay stops accumulating immediately.
    - Sends a push notification to the client so they know their
      account has been suspended.

    On reinstatement:
    - Clears the suspension record and re-enables login.
    """
    client = db.query(User).filter(
        User.id == client_id,
        User.role == UserRole.client,
        User.admin_id == admin.id,
    ).first()
    if not client:
        raise HTTPException(404, "Client not found")

    now = datetime.now(timezone.utc)

    if client.is_active:
        # ── Suspending ────────────────────────────────────────────────────────
        client.is_active = False
        client.deactivated_reason = payload.reason or "Account suspended by manager"
        client.deactivated_at = now

        # Find workers assigned to this client and close their open shifts
        assigned_worker_ids = [
            cw.worker_id for cw in
            db.query(ClientWorker).filter(ClientWorker.client_id == client_id).all()
        ]
        closed_shifts = 0
        for wid in assigned_worker_ids:
            open_shift = db.query(Shift).filter(
                Shift.worker_id == wid,
                Shift.clock_in.isnot(None),
                Shift.clock_out.is_(None),
            ).first()
            if open_shift:
                open_shift.clock_out = now
                open_shift.total_minutes = max(
                    0, int((now - open_shift.clock_in).total_seconds() / 60)
                )
                closed_shifts += 1

        db.commit()
        logger.info(
            "Admin %s suspended client %s — closed %d open shift(s)",
            admin.id, client_id, closed_shifts,
        )

        # Notify the client via push notification
        notify_user(
            db, client.id,
            title="Account Suspended",
            body=(
                f"Your account has been suspended by your manager. "
                f"Reason: {client.deactivated_reason}. "
                "Please contact your manager for further information."
            ),
            url="/",
        )

    else:
        # ── Reinstating ───────────────────────────────────────────────────────
        client.is_active = True
        client.deactivated_reason = None
        client.deactivated_at = None
        db.commit()
        logger.info("Admin %s reinstated client %s", admin.id, client_id)

        # Notify the client that they have been reinstated
        notify_user(
            db, client.id,
            title="Account Reinstated",
            body="Your account has been reinstated. You can now log in and access the portal.",
            url="/",
        )

    db.refresh(client)
    return _client_out(client, db, admin_name=admin.name)


# ── Admin: delete client ───────────────────────────────────────────────────────

@router.delete("/{client_id}", status_code=204)
def delete_client(client_id: int, db: Session = Depends(get_db), admin=Depends(require_regular_admin)):
    client = db.query(User).filter(
        User.id == client_id,
        User.role == UserRole.client,
        User.admin_id == admin.id,
    ).first()
    if not client:
        raise HTTPException(404, "Client not found")
    db.delete(client)
    db.commit()
    logger.info("Admin %s deleted client %s", admin.id, client_id)

# ── Admin: reset a client's password ─────────────────────────────────────────

class PasswordResetRequest(BaseModel):
    new_password: str

    @field_validator("new_password")
    @classmethod
    def pw_min(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v

@router.post("/{client_id}/reset-password", status_code=204)
def reset_client_password(
    client_id: int,
    payload: PasswordResetRequest,
    db: Session = Depends(get_db),
    admin=Depends(require_regular_admin),
):
    """Admin: forcibly reset a client's password."""
    client = db.query(User).filter(
        User.id == client_id,
        User.role == UserRole.client,
        User.admin_id == admin.id,
    ).first()
    if not client:
        raise HTTPException(404, "Client not found")
    client.password_hash = get_password_hash(payload.new_password)
    db.commit()
    logger.info("Admin %s reset password for client %s", admin.id, client_id)

