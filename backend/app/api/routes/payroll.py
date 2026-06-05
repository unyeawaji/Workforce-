import logging
from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.models.models import DepartmentRate, Shift, CheckIn, User, UserRole
from app.schemas.schemas import DepartmentRateOut, DepartmentRateUpsert, WorkerPayrollOut
from app.api.deps import require_admin

router = APIRouter(prefix="/payroll", tags=["Payroll"])
logger = logging.getLogger(__name__)


# ── Department Rates ──────────────────────────────────────────────────────────

@router.get("/rates", response_model=List[DepartmentRateOut])
def list_rates(db: Session = Depends(get_db), admin=Depends(require_admin)):
    return [DepartmentRateOut.model_validate(r) for r in db.query(DepartmentRate).all()]


@router.post("/rates", response_model=DepartmentRateOut)
def upsert_rate(payload: DepartmentRateUpsert, db: Session = Depends(get_db), admin=Depends(require_admin)):
    if payload.hourly_rate_cents < 0:
        raise HTTPException(400, "Hourly rate cannot be negative")
    rate = db.query(DepartmentRate).filter(DepartmentRate.department == payload.department).first()
    if rate:
        rate.hourly_rate_cents = payload.hourly_rate_cents
        rate.currency = payload.currency
    else:
        rate = DepartmentRate(
            department=payload.department,
            hourly_rate_cents=payload.hourly_rate_cents,
            currency=payload.currency,
        )
        db.add(rate)
    db.commit()
    db.refresh(rate)
    logger.info(f"Admin set {payload.department} rate to {payload.hourly_rate_cents} cents")
    return DepartmentRateOut.model_validate(rate)


@router.delete("/rates/{department}")
def delete_rate(department: str, db: Session = Depends(get_db), admin=Depends(require_admin)):
    rate = db.query(DepartmentRate).filter(DepartmentRate.department == department).first()
    if not rate:
        raise HTTPException(404, "Rate not found")
    db.delete(rate)
    db.commit()
    return {"deleted": department}


# ── Payroll Summary ───────────────────────────────────────────────────────────

@router.get("/summary", response_model=List[WorkerPayrollOut])
def payroll_summary(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    department: Optional[str] = None,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    # Get all workers
    q = db.query(User).filter(User.role == UserRole.worker, User.is_active == True)
    if department:
        q = q.filter(User.department == department)
    workers = q.all()

    # Get all rates as a lookup
    rates = {r.department: r for r in db.query(DepartmentRate).all()}

    results = []
    for worker in workers:
        # Total clocked minutes
        sq = db.query(func.coalesce(func.sum(Shift.total_minutes), 0)).filter(
            Shift.worker_id == worker.id,
            Shift.clock_out.isnot(None),
        )
        if date_from:
            sq = sq.filter(Shift.date >= date_from)
        if date_to:
            sq = sq.filter(Shift.date <= date_to)
        total_minutes = sq.scalar() or 0

        # Shift count
        sc = db.query(func.count(Shift.id)).filter(
            Shift.worker_id == worker.id,
            Shift.clock_out.isnot(None),
        )
        if date_from:
            sc = sc.filter(Shift.date >= date_from)
        if date_to:
            sc = sc.filter(Shift.date <= date_to)
        shift_count = sc.scalar() or 0

        # Check-in count and outlier tasks
        ci_q = (
            db.query(
                func.count(CheckIn.id),
                func.coalesce(func.sum(CheckIn.outlier_tasks_completed), 0)
            )
            .join(Shift, Shift.id == CheckIn.shift_id)
            .filter(CheckIn.worker_id == worker.id)
        )
        if date_from:
            ci_q = ci_q.filter(Shift.date >= date_from)
        if date_to:
            ci_q = ci_q.filter(Shift.date <= date_to)
        ci_row = ci_q.first()
        check_in_count = ci_row[0] or 0
        outlier_tasks = int(ci_row[1] or 0)

        rate = rates.get(worker.department)
        hourly_rate_cents = rate.hourly_rate_cents if rate else 0
        currency = rate.currency if rate else "USD"
        total_hours = round(total_minutes / 60, 2)
        gross_pay_cents = int(total_hours * hourly_rate_cents)

        results.append(WorkerPayrollOut(
            worker_id=worker.id,
            worker_name=worker.name,
            department=worker.department,
            total_minutes=total_minutes,
            total_hours=total_hours,
            hourly_rate_cents=hourly_rate_cents,
            currency=currency,
            gross_pay_cents=gross_pay_cents,
            shift_count=shift_count,
            check_in_count=check_in_count,
            outlier_tasks_total=outlier_tasks,
        ))

    return sorted(results, key=lambda x: x.gross_pay_cents, reverse=True)
