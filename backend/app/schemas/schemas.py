from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel, EmailStr, field_validator, Field
from app.models.models import UserRole, ActivityStatus, VerificationStatus, ApplicationStatus


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
    deactivation_reason: Optional[str] = Field(None, max_length=500)


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    role: UserRole
    department: Optional[str]
    is_active: bool
    is_system_admin: bool = False
    services: List[str] = []             # admin's offered services (empty for workers/clients)

    @field_validator("services", mode="before")
    @classmethod
    def coerce_null_services(cls, v):
        """DB rows created before the services column existed have NULL — treat as empty list."""
        if v is None:
            return []
        return v
    client_name: Optional[str] = None
    admin_id: Optional[int] = None
    admin_name: Optional[str] = None   # populated for workers/clients — who manages this account
    created_at: datetime
    deactivated_reason: Optional[str] = None
    deactivated_at: Optional[datetime] = None
    model_config = {"from_attributes": True}


# ── Admin info (public — for apply page dropdown) ─────────────────────────────
# All available service types offered across teams
SERVICES_CATALOG = {
    "account_recovery":    {"label": "Account Recovery",      "desc": "Recovering suspended or banned Aether/Outlier accounts",        "platform": "Aether · Outlier", "emoji": "🔓"},
    "assessment":          {"label": "Assessment",             "desc": "Conducting onboarding & quality assessments on Aether",         "platform": "Aether · Outlier", "emoji": "📝"},
    "tasker":              {"label": "Tasker",                 "desc": "Completing AI training tasks and data annotation on Outlier",    "platform": "Outlier",          "emoji": "✅"},
    "onboarding":          {"label": "Onboarding",             "desc": "Guiding new contractors through platform onboarding on Aether",  "platform": "Aether",           "emoji": "🚀"},
}

class AdminPublic(BaseModel):
    id: int
    name: str
    services: List[str] = []       # list of service keys from SERVICES_CATALOG
    is_system_admin: bool = False  # exposed so frontend can double-filter

    @field_validator("services", mode="before")
    @classmethod
    def coerce_null_services(cls, v):
        if v is None:
            return []
        return v
    model_config = {"from_attributes": True}


# ── System admin: summary of each regular admin's team ────────────────────────
class AdminTeamSummary(BaseModel):
    id: int
    name: str
    email: str
    is_active: bool
    created_at: datetime
    worker_count: int
    client_count: int
    active_today: int = 0        # workers currently clocked in
    pending_activities: int = 0  # unreviewed activity submissions
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
    worker_note: Optional[str] = None
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
    currency: str
    model_config = {"from_attributes": True}


class WorkScheduleUpdate(BaseModel):
    clock_in_deadline_hour: Optional[int] = Field(None, ge=0, le=23)
    clock_in_deadline_minute: Optional[int] = Field(None, ge=0, le=59)
    checkin_interval_minutes: Optional[int] = Field(None, ge=5)
    grace_period_minutes: Optional[int] = Field(None, ge=0, le=120)
    currency: Optional[str] = Field(None, min_length=3, max_length=10)


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
    worker_note: Optional[str] = None
    check_ins: List[CheckInOut] = []
    worker: Optional["UserOut"] = None
    model_config = {"from_attributes": True}


class ShiftNoteUpdate(BaseModel):
    worker_note: str = Field(min_length=1, max_length=1000)


# ── Department Rates & Payroll ─────────────────────────────────────────────────
class DepartmentRateUpsert(BaseModel):
    department: str
    hourly_rate_cents: int
    # Currency is no longer set per-department — it's a single admin-wide setting
    # (see WorkScheduleUpdate.currency). Accepted here only for backward compatibility
    # with older clients; the value is ignored.
    currency: Optional[str] = None


class DepartmentRateOut(BaseModel):
    id: int
    department: str
    hourly_rate_cents: int
    currency: str   # always mirrors the admin-wide setting, not stored independently
    updated_at: datetime
    model_config = {"from_attributes": True}


class WorkerPayrollOut(BaseModel):
    worker_id: int
    worker_name: str
    department: Optional[str]
    is_active: bool   # whether the worker is still active — deactivated workers stay
                       # visible here so payroll for a period they worked isn't lost
    total_minutes: int
    total_hours: float
    hourly_rate_cents: int
    currency: str
    gross_pay_cents: int
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
    can_clock_in: bool
    is_holiday: bool
    holiday_name: Optional[str] = None
    is_working_day: bool
    work_start_hour: int
    work_start_minute: int
    work_end_hour: int
    work_end_minute: int
    message: str
    next_window_day: Optional[str] = None
    next_window_start: Optional[str] = None


# ── Client portal ─────────────────────────────────────────────────────────────
class WorkerLiveStatus(BaseModel):
    worker_id: int
    worker_name: str
    department: Optional[str]
    is_online: bool               # clocked in, not clocked out
    clock_in: Optional[datetime]
    clock_out: Optional[datetime]
    minutes_today: int            # live elapsed if online, or shift total if clocked out
    hours_today: float            # minutes_today / 60 rounded to 1dp
    tasks_today: int              # sum of outlier_tasks_completed for today's shift
    check_in_count: int
    last_active_at: Optional[datetime] = None   # latest of clock_in / last check-in / clock_out
    model_config = {"from_attributes": True}


class WorkerDailySummary(BaseModel):
    """One day's worth of a worker's activity, for the client history view."""
    date: date
    worker_id: int
    worker_name: str
    department: Optional[str]
    clock_in: Optional[datetime]
    clock_out: Optional[datetime]
    minutes_total: int
    hours_total: float
    tasks_total: int
    check_in_count: int


# ── Job Applications ──────────────────────────────────────────────────────────
class JobApplicationCreate(BaseModel):
    full_name: str = Field(min_length=2)
    email: EmailStr
    password: str = Field(min_length=8)
    phone: Optional[str] = None
    cover_letter: Optional[str] = None
    admin_id: int            # which admin/team they're applying to
    position_type: str = "tasker"   # 'tasker' | 'onboarding_assessment'


class JobApplicationOut(BaseModel):
    id: int
    user_id: int
    admin_id: Optional[int]
    full_name: str
    email: str
    phone: Optional[str]
    cover_letter: Optional[str]
    position_type: str = "tasker"
    status: ApplicationStatus
    applied_at: datetime
    reviewed_at: Optional[datetime]
    model_config = {"from_attributes": True}


class PendingCountOut(BaseModel):
    pending: int


# ── Client management ─────────────────────────────────────────────────────────
class ClientCreate(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=8)
    worker_ids: List[int] = []   # which workers this client can see


class ClientWorkerAssign(BaseModel):
    worker_ids: List[int]


class ClientOut(BaseModel):
    """UserOut extended with the list of assigned worker IDs."""
    id: int
    name: str
    email: str
    role: UserRole
    department: Optional[str]
    is_active: bool
    deactivated_reason: Optional[str] = None
    deactivated_at: Optional[datetime] = None
    admin_id: Optional[int] = None
    admin_name: Optional[str] = None
    created_at: datetime
    assigned_worker_ids: List[int] = []
    model_config = {"from_attributes": True}

# ── Admin Invites ─────────────────────────────────────────────────────────────
class InviteCreate(BaseModel):
    email_hint: Optional[EmailStr] = None   # optional pre-fill


class InviteOut(BaseModel):
    id: int
    token: str
    email_hint: Optional[str]
    used: bool
    used_at: Optional[datetime]
    expires_at: datetime
    created_at: datetime
    model_config = {"from_attributes": True}


class InviteRegister(BaseModel):
    token: str
    name: str = Field(min_length=2)
    email: EmailStr
    password: str = Field(min_length=8)


# ── Worker Reviews (client → worker) ──────────────────────────────────────────

class WorkerReviewCreate(BaseModel):
    worker_id: int
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = Field(None, max_length=1000)


class WorkerReviewUpdate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = Field(None, max_length=1000)


class WorkerReviewOut(BaseModel):
    id: int
    client_id: int
    client_name: Optional[str] = None
    worker_id: int
    worker_name: Optional[str] = None
    rating: int
    comment: Optional[str] = None
    created_at: datetime
    edited_at: Optional[datetime] = None
    model_config = {"from_attributes": True}


class WorkerReviewSummary(BaseModel):
    """Aggregate rating stats for one worker, used in admin and client views."""
    worker_id: int
    worker_name: str
    review_count: int
    average_rating: Optional[float] = None
    latest_review: Optional[WorkerReviewOut] = None

