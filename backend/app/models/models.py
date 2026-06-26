import enum
from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime,
    ForeignKey, Text, Enum as SAEnum, Date, Time, UniqueConstraint,
)
from sqlalchemy.orm import relationship
from app.db.database import Base


class UserRole(str, enum.Enum):
    admin = "admin"
    worker = "worker"
    client = "client"


class ActivityStatus(str, enum.Enum):
    pending = "pending"
    completed = "completed"
    blocked = "blocked"


class VerificationStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class ApplicationStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


def _now():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(SAEnum(UserRole), nullable=False, default=UserRole.worker)
    department = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    client_name = Column(String(200), nullable=True)   # saved client — pre-filled at clock-in
    created_at = Column(DateTime(timezone=True), default=_now)
    # Offboarding audit trail — set when an admin deactivates this user
    deactivated_reason = Column(String(500), nullable=True)
    deactivated_at = Column(DateTime(timezone=True), nullable=True)

    # System admin flag — only the seeded super-admin has this set.
    # System admins can invite other admins but cannot have workers/clients of their own.
    is_system_admin = Column(Boolean, default=False, nullable=False)

    # Services this admin's team offers — comma-separated service keys.
    # e.g. "account_recovery,assessment"  (only meaningful for admin-role rows)
    services = Column(Text, nullable=True)

    # Siloing: workers and clients belong to one admin.
    # NULL for admin rows (admins are top-level).
    admin_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    activities = relationship("Activity", back_populates="worker",
                              foreign_keys="Activity.worker_id", cascade="all, delete-orphan")
    shifts = relationship("Shift", back_populates="worker", cascade="all, delete-orphan")
    check_ins = relationship("CheckIn", back_populates="worker", cascade="all, delete-orphan")
    push_subscriptions = relationship("PushSubscription", back_populates="worker", cascade="all, delete-orphan")

    # Workers assigned to this client (through ClientWorker join table)
    assigned_workers = relationship("ClientWorker", foreign_keys="ClientWorker.client_id",
                                    back_populates="client", cascade="all, delete-orphan")


class ClientWorker(Base):
    """Many-to-many: which workers a client can see."""
    __tablename__ = "client_workers"
    __table_args__ = (UniqueConstraint("client_id", "worker_id", name="uq_client_worker"),)

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    worker_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=_now)

    client = relationship("User", foreign_keys=[client_id], back_populates="assigned_workers")
    worker = relationship("User", foreign_keys=[worker_id])


class JobApplication(Base):
    """Public job applications — become inactive worker accounts on submit."""
    __tablename__ = "job_applications"

    id = Column(Integer, primary_key=True, index=True)
    # FK to the User row auto-created for this applicant (is_active=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    # Which admin they applied to (chosen in dropdown on apply page)
    admin_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    full_name = Column(String(150), nullable=False)
    email = Column(String(255), nullable=False)
    phone = Column(String(50), nullable=True)
    cover_letter = Column(Text, nullable=True)
    position_type = Column(String(60), nullable=False, default='tasker')  # 'tasker' | 'onboarding_assessment'
    status = Column(SAEnum(ApplicationStatus), nullable=False, default=ApplicationStatus.pending)
    applied_at = Column(DateTime(timezone=True), default=_now)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    reviewed_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    applicant = relationship("User", foreign_keys=[user_id])
    admin = relationship("User", foreign_keys=[admin_id])
    reviewer = relationship("User", foreign_keys=[reviewed_by])


class WorkSchedule(Base):
    """Admin-configured work schedule — one row, updated in place."""
    __tablename__ = "work_schedule"

    id = Column(Integer, primary_key=True, default=1)
    clock_in_deadline_hour = Column(Integer, default=15)
    clock_in_deadline_minute = Column(Integer, default=0)
    checkin_interval_minutes = Column(Integer, default=120)
    grace_period_minutes = Column(Integer, default=15)
    currency = Column(String(10), default="USD", nullable=False)  # single source of truth for all pay
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)


class DaySchedule(Base):
    """Per-day-of-week work window set by admin. day_of_week: 0=Mon, 6=Sun."""
    __tablename__ = "day_schedules"

    id = Column(Integer, primary_key=True, index=True)
    day_of_week = Column(Integer, unique=True, nullable=False)
    is_working_day = Column(Boolean, default=True, nullable=False)
    work_start_hour = Column(Integer, default=15)
    work_start_minute = Column(Integer, default=0)
    work_end_hour = Column(Integer, default=23)
    work_end_minute = Column(Integer, default=0)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)


class Holiday(Base):
    """Specific dates blocked as holidays/off days."""
    __tablename__ = "holidays"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now)


class Shift(Base):
    __tablename__ = "shifts"

    id = Column(Integer, primary_key=True, index=True)
    worker_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    clock_in = Column(DateTime(timezone=True), nullable=True)
    clock_out = Column(DateTime(timezone=True), nullable=True)
    total_minutes = Column(Integer, nullable=True)
    screenshot_url = Column(String(500), nullable=True)
    client_name = Column(String(200), nullable=True)
    is_late = Column(Boolean, default=False, nullable=False)
    is_blocked = Column(Boolean, default=False, nullable=False)
    block_reason = Column(String(255), nullable=True)
    minutes_late = Column(Integer, nullable=True)
    # Worker's own explanation for a late clock-in or missed/blocked shift
    worker_note = Column(Text, nullable=True)

    worker = relationship("User", back_populates="shifts")
    check_ins = relationship("CheckIn", back_populates="shift", cascade="all, delete-orphan")


class CheckIn(Base):
    """Periodic check-in submitted by worker during shift."""
    __tablename__ = "check_ins"

    id = Column(Integer, primary_key=True, index=True)
    shift_id = Column(Integer, ForeignKey("shifts.id", ondelete="CASCADE"), nullable=False, index=True)
    worker_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    submitted_at = Column(DateTime(timezone=True), default=_now, nullable=False)
    screenshot_url = Column(String(500), nullable=False)
    outlier_tasks_completed = Column(Integer, nullable=False)
    note = Column(Text, nullable=True)
    is_missed = Column(Boolean, default=False, nullable=False)

    shift = relationship("Shift", back_populates="check_ins")
    worker = relationship("User", back_populates="check_ins")


class DepartmentRate(Base):
    """Hourly pay rate per department, set by admin."""
    __tablename__ = "department_rates"

    id = Column(Integer, primary_key=True, index=True)
    department = Column(String(100), unique=True, nullable=False, index=True)
    hourly_rate_cents = Column(Integer, nullable=False, default=0)
    currency = Column(String(10), default="USD", nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)


class Activity(Base):
    __tablename__ = "activities"

    id = Column(Integer, primary_key=True, index=True)
    worker_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    task_title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True), nullable=True)
    status = Column(SAEnum(ActivityStatus), nullable=False, default=ActivityStatus.pending)
    verification_status = Column(SAEnum(VerificationStatus), nullable=False,
                                 default=VerificationStatus.pending, index=True)
    admin_feedback = Column(Text, nullable=True)
    date = Column(Date, nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)
    verified_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    verified_at = Column(DateTime(timezone=True), nullable=True)

    worker = relationship("User", back_populates="activities", foreign_keys=[worker_id])
    verifier = relationship("User", foreign_keys=[verified_by])


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    worker_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    endpoint = Column(Text, nullable=False, unique=True)
    p256dh = Column(Text, nullable=False)
    auth = Column(Text, nullable=False)
    user_agent = Column(String(300), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now)

    worker = relationship("User", back_populates="push_subscriptions")


class PushNotificationLog(Base):
    __tablename__ = "push_notification_log"

    id = Column(Integer, primary_key=True, index=True)
    shift_id = Column(Integer, ForeignKey("shifts.id", ondelete="CASCADE"), nullable=False, index=True)
    window_key = Column(String(32), nullable=False, index=True)
    notified_at = Column(DateTime(timezone=True), default=_now, nullable=False)


class UsedExportToken(Base):
    __tablename__ = "used_export_tokens"

    id = Column(Integer, primary_key=True, index=True)
    jti = Column(String(64), unique=True, nullable=False, index=True)
    used_at = Column(DateTime(timezone=True), default=_now, nullable=False)

class AdminInvite(Base):
    """One-time invite tokens for creating new admin accounts."""
    __tablename__ = "admin_invites"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(64), unique=True, nullable=False, index=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    email_hint = Column(String(255), nullable=True)   # optional — pre-fill email on register page
    used = Column(Boolean, default=False, nullable=False)
    used_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    used_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now)

    creator = relationship("User", foreign_keys=[created_by])
    redeemer = relationship("User", foreign_keys=[used_by])


class WorkerReview(Base):
    """A client's star rating + comment about one of their assigned workers."""
    __tablename__ = "worker_reviews"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    worker_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    admin_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    rating = Column(Integer, nullable=False)          # 1-5
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now)
    edited_at = Column(DateTime(timezone=True), nullable=True)  # set when the client revises rating/comment

    client = relationship("User", foreign_keys=[client_id])
    worker = relationship("User", foreign_keys=[worker_id])
    admin = relationship("User", foreign_keys=[admin_id])

