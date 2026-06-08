from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel, EmailStr, field_validator, Field
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
    client_name: Optional[str] = None
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
    clock_in_deadline_hour: Optional[int] = Field(None, ge=0, le=23)
    clock_in_deadline_minute: Optional[int] = Field(None, ge=0, le=59)
    checkin_interval_minutes: Optional[int] = Field(None, ge=5)   # min 5 min interval
    grace_period_minutes: Optional[int] = Field(None, ge=0, le=120)


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
    client_name: Optional[str] = None
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


# ── Day Schedule & Holidays ───────────────────────────────────────────────────
class DayScheduleOut(BaseModel):
    id: int
    day_of_week: int
    is_working_day: bool
    work_start_hour: int
    work_start_minute: int
    work_end_hour: int
    work_end_minute: int
    model_config = {"from_attributes": True}


class DayScheduleUpdate(BaseModel):
    is_working_day: bool
    work_start_hour: int = Field(ge=0, le=23)
    work_start_minute: int = Field(ge=0, le=59)
    work_end_hour: int = Field(ge=0, le=23)
    work_end_minute: int = Field(ge=0, le=59)


class HolidayCreate(BaseModel):
    date: date
    name: str


class HolidayOut(BaseModel):
    id: int
    date: date
    name: str
    model_config = {"from_attributes": True}


class WorkWindowStatus(BaseModel):
    """Returned to workers so they know if they can clock in."""
    can_clock_in: bool
    is_holiday: bool
    holiday_name: Optional[str] = None
    is_working_day: bool
    work_start_hour: int
    work_start_minute: int
    work_end_hour: int
    work_end_minute: int
    message: str
    next_window_day: Optional[str] = None   # e.g. "Monday"
    next_window_start: Optional[str] = None  # e.g. "09:00"
