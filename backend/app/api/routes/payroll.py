import logging
from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.models import DepartmentRate, Shift, CheckIn, User, UserRole
from app.schemas.schemas import DepartmentRateOut, DepartmentRateUpsert, WorkerPayrollOut
from app.api.deps import require_regular_admin, require_regular_admin, get_current_user
from app.core.schedule_utils import get_or_create_work_schedule

router = APIRouter(prefix="/payroll", tags=["Payroll"])
logger = logging.getLogger(__name__)


def _get_currency(db: Session) -> str:
    """Single source of truth for pay currency — set by the admin once, used everywhere."""
    return get_or_create_work_schedule(db).currency


def _worker_payroll(
    db: Session, worker: User, rates: dict, currency: str,
    date_from: Optional[date], date_to: Optional[date],
) -> WorkerPayrollOut:
    """Shared calculation: hours worked × department rate, for one worker over a date range."""
    sq = db.query(func.coalesce(func.sum(Shift.total_minutes), 0)).filter(
        Shift.worker_id == worker.id, Shift.clock_out.isnot(None))
    if date_from: sq = sq.filter(Shift.date >= date_from)
    if date_to: sq = sq.filter(Shift.date <= date_to)
    total_minutes = sq.scalar() or 0

    sc = db.query(func.count(Shift.id)).filter(
        Shift.worker_id == worker.id, Shift.clock_out.isnot(None))
    if date_from: sc = sc.filter(Shift.date >= date_from)
    if date_to: sc = sc.filter(Shift.date <= date_to)
    shift_count = sc.scalar() or 0

    ci_q = (db.query(func.count(CheckIn.id),
                     func.coalesce(func.sum(CheckIn.outlier_tasks_completed), 0))
            .join(Shift, Shift.id == CheckIn.shift_id)
            .filter(CheckIn.worker_id == worker.id))
    if date_from: ci_q = ci_q.filter(Shift.date >= date_from)
    if date_to: ci_q = ci_q.filter(Shift.date <= date_to)
    ci_row = ci_q.first()
    check_in_count = ci_row[0] or 0
    outlier_tasks = int(ci_row[1] or 0)

    rate = rates.get(worker.department)
    hourly_rate_cents = rate.hourly_rate_cents if rate else 0
    total_hours = round(total_minutes / 60, 2)
    gross_pay_cents = int(total_minutes * hourly_rate_cents / 60)

    return WorkerPayrollOut(
        worker_id=worker.id, worker_name=worker.name, department=worker.department,
        is_active=worker.is_active,
        total_minutes=total_minutes, total_hours=total_hours,
        hourly_rate_cents=hourly_rate_cents, currency=currency,
        gross_pay_cents=gross_pay_cents, shift_count=shift_count,
        check_in_count=check_in_count, outlier_tasks_total=outlier_tasks,
    )


@router.get("/rates", response_model=List[DepartmentRateOut])
def list_rates(db: Session = Depends(get_db), admin=Depends(require_regular_admin)):
    currency = _get_currency(db)
    rates = db.query(DepartmentRate).all()
    # Keep the stored row's currency in sync with the global setting, in case it
    # was changed since this rate was last touched — avoids a stale value lingering.
    out = []
    for r in rates:
        if r.currency != currency:
            r.currency = currency
    if rates:
        db.commit()
    return [DepartmentRateOut.model_validate(r) for r in rates]


@router.post("/rates", response_model=DepartmentRateOut)
def upsert_rate(payload: DepartmentRateUpsert, db: Session = Depends(get_db), admin=Depends(require_regular_admin)):
    if payload.hourly_rate_cents < 0:
        raise HTTPException(400, "Hourly rate cannot be negative")
    currency = _get_currency(db)  # currency is no longer set per-rate — always the admin-wide value
    rate = db.query(DepartmentRate).filter(DepartmentRate.department == payload.department).first()
    if rate:
        rate.hourly_rate_cents = payload.hourly_rate_cents
        rate.currency = currency
    else:
        rate = DepartmentRate(department=payload.department,
                              hourly_rate_cents=payload.hourly_rate_cents, currency=currency)
        db.add(rate)
    db.commit(); db.refresh(rate)
    return DepartmentRateOut.model_validate(rate)


@router.delete("/rates/{department}")
def delete_rate(department: str, db: Session = Depends(get_db), admin=Depends(require_regular_admin)):
    rate = db.query(DepartmentRate).filter(DepartmentRate.department == department).first()
    if not rate:
        raise HTTPException(404, "Rate not found")
    db.delete(rate); db.commit()
    return {"deleted": department}


@router.get("/summary", response_model=List[WorkerPayrollOut])
def payroll_summary(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    department: Optional[str] = None,
    db: Session = Depends(get_db),
    admin=Depends(require_regular_admin),
):
    # Active workers always show. Deactivated workers only show if they have
    # shift hours within the requested period — otherwise every former worker
    # would clutter every payroll run forever. This keeps "fixed when deactivated,
    # history preserved" actually true: their pay for a period they worked is
    # still visible, but they don't linger in views where they're irrelevant.
    active_q = db.query(User).filter(
        User.role == UserRole.worker,
        User.is_active == True,
        User.admin_id == admin.id,
    )
    inactive_with_hours_q = db.query(User).join(Shift, Shift.worker_id == User.id).filter(
        User.role == UserRole.worker,
        User.is_active == False,
        User.admin_id == admin.id,
        Shift.clock_out.isnot(None),
    )
    if date_from: inactive_with_hours_q = inactive_with_hours_q.filter(Shift.date >= date_from)
    if date_to: inactive_with_hours_q = inactive_with_hours_q.filter(Shift.date <= date_to)
    inactive_with_hours_q = inactive_with_hours_q.distinct()

    if department:
        active_q = active_q.filter(User.department == department)
        inactive_with_hours_q = inactive_with_hours_q.filter(User.department == department)

    workers = active_q.all() + inactive_with_hours_q.all()

    rates = {r.department: r for r in db.query(DepartmentRate).all()}
    currency = _get_currency(db)
    results = [_worker_payroll(db, w, rates, currency, date_from, date_to) for w in workers]
    return sorted(results, key=lambda x: x.gross_pay_cents, reverse=True)


@router.get("/me/summary", response_model=WorkerPayrollOut)
def my_payroll_summary(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    Self-service: a worker's own hours and estimated gross pay for a date range
    (defaults to all-time if no range given). Uses the same calculation as the
    admin payroll summary. Not available to clients.
    """
    if user.role != UserRole.worker:
        raise HTTPException(403, "Only workers can view their own payroll summary")
    rates = {r.department: r for r in db.query(DepartmentRate).all()}
    currency = _get_currency(db)
    return _worker_payroll(db, user, rates, currency, date_from, date_to)
