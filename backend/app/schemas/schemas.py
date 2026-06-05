from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel, EmailStr, field_validator
from app.models.models import UserRole, ActivityStatus, VerificationStatus


# ── Auth ──────────────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


# ── Users ─────────────────────────────────────────────────────────────────────
class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: UserRole = UserRole.worker
    department: Optional[str] = None

    @field_validator("password")
    @classmethod
    def pw_length(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    is_active: Optional[bool] = None
    role: Optional[UserRole] = None
    department: Optional[str] = None


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    role: UserRole
    department: Optional[str]
    is_active: bool
    created_at: datetime
    model_config = {"from_attributes": True}


# ── Shifts ────────────────────────────────────────────────────────────────────
class ShiftOut(BaseModel):
    id: int
    worker_id: int
    date: date
    clock_in: Optional[datetime]
    clock_out: Optional[datetime]
    total_minutes: Optional[int]
    screenshot_url: Optional[str] = None
    is_late: bool = False
    is_blocked: bool = False
    block_reason: Optional[str] = None
    minutes_late: Optional[int] = None
    model_config = {"from_attributes": True}


# ── Activities ────────────────────────────────────────────────────────────────
class ActivityCreate(BaseModel):
    task_title: str
    description: str
    start_time: datetime
    end_time: Optional[datetime] = None
    status: ActivityStatus = ActivityStatus.pending
    date: date


class ActivityUpdate(BaseModel):
    task_title: Optional[str] = None
    description: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    status: Optional[ActivityStatus] = None


class VerifyActivityRequest(BaseModel):
    verification_status: VerificationStatus
    admin_feedback: Optional[str] = None

    @field_validator("admin_feedback")
    @classmethod
    def feedback_required_on_rejection(cls, v, info):
        if info.data.get("verification_status") == VerificationStatus.rejected and not v:
            raise ValueError("Feedback is mandatory when rejecting an activity")
        return v


class ActivityOut(BaseModel):
    id: int
    worker_id: int
    task_title: str
    description: str
    start_time: datetime
    end_time: Optional[datetime]
    status: ActivityStatus
    verification_status: VerificationStatus
    admin_feedback: Optional[str]
    date: date
    created_at: datetime
    updated_at: datetime
    verified_by: Optional[int]
    verified_at: Optional[datetime]
    worker: Optional[UserOut] = None
    model_config = {"from_attributes": True}


# ── Analytics ─────────────────────────────────────────────────────────────────
class DashboardStats(BaseModel):
    active_workers_today: int
    total_minutes_today: int
    pending_verifications: int
    total_activities_today: int
    approved_today: int
    rejected_today: int


class WeeklyPoint(BaseModel):
    day: str
    hours: float
    tasks: int


class WeeklyStats(BaseModel):
    points: List[WeeklyPoint]


# ── Work Schedule ─────────────────────────────────────────────────────────────
class WorkScheduleOut(BaseModel):
    id: int
    clock_in_deadline_hour: int
    clock_in_deadline_minute: int
    checkin_interval_minutes: int
    grace_period_minutes: int
    model_config = {"from_attributes": True}


class WorkScheduleUpdate(BaseModel):
    clock_in_deadline_hour: Optional[int] = None
    clock_in_deadline_minute: Optional[int] = None
    checkin_interval_minutes: Optional[int] = None
    grace_period_minutes: Optional[int] = None


# ── Check-ins ─────────────────────────────────────────────────────────────────
class CheckInCreate(BaseModel):
    outlier_tasks_completed: int
    note: Optional[str] = None


class CheckInOut(BaseModel):
    id: int
    shift_id: int
    worker_id: int
    submitted_at: datetime
    screenshot_url: str
    outlier_tasks_completed: int
    note: Optional[str]
    is_missed: bool
    worker: Optional["UserOut"] = None
    model_config = {"from_attributes": True}


# ── Extended ShiftOut with punctuality and check-ins ──────────────────────────
class ShiftOutFull(BaseModel):
    id: int
    worker_id: int
    date: date
    clock_in: Optional[datetime]
    clock_out: Optional[datetime]
    total_minutes: Optional[int]
    screenshot_url: Optional[str] = None
    is_late: bool = False
    is_blocked: bool = False
    block_reason: Optional[str] = None
    minutes_late: Optional[int] = None
    check_ins: List[CheckInOut] = []
    worker: Optional["UserOut"] = None
    model_config = {"from_attributes": True}


# ── Department Rates & Payroll ─────────────────────────────────────────────────
class DepartmentRateUpsert(BaseModel):
    department: str
    hourly_rate_cents: int  # e.g. 1500 = $15.00
    currency: str = "USD"


class DepartmentRateOut(BaseModel):
    id: int
    department: str
    hourly_rate_cents: int
    currency: str
    updated_at: datetime
    model_config = {"from_attributes": True}


class WorkerPayrollOut(BaseModel):
    worker_id: int
    worker_name: str
    department: Optional[str]
    total_minutes: int
    total_hours: float
    hourly_rate_cents: int
    currency: str
    gross_pay_cents: int  # total_hours * hourly_rate_cents
    shift_count: int
    check_in_count: int
    outlier_tasks_total: int
