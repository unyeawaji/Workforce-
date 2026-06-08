import enum
from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime,
    ForeignKey, Text, Enum as SAEnum, Date, Time,
)
from sqlalchemy.orm import relationship
from app.db.database import Base


class UserRole(str, enum.Enum):
    admin = "admin"
    worker = "worker"


class ActivityStatus(str, enum.Enum):
    pending = "pending"
    completed = "completed"
    blocked = "blocked"


class VerificationStatus(str, enum.Enum):
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

    activities = relationship("Activity", back_populates="worker",
                              foreign_keys="Activity.worker_id", cascade="all, delete-orphan")
    shifts = relationship("Shift", back_populates="worker", cascade="all, delete-orphan")
    check_ins = relationship("CheckIn", back_populates="worker", cascade="all, delete-orphan")
    push_subscriptions = relationship("PushSubscription", back_populates="worker", cascade="all, delete-orphan")


class WorkSchedule(Base):
    """Admin-configured work schedule — one row, updated in place."""
    __tablename__ = "work_schedule"

    id = Column(Integer, primary_key=True, default=1)
    clock_in_deadline_hour = Column(Integer, default=15)
    clock_in_deadline_minute = Column(Integer, default=0)
    checkin_interval_minutes = Column(Integer, default=120)
    grace_period_minutes = Column(Integer, default=15)
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

    client_name = Column(String(200), nullable=True)   # which client the worker is working for

    is_late = Column(Boolean, default=False, nullable=False)
    is_blocked = Column(Boolean, default=False, nullable=False)
    block_reason = Column(String(255), nullable=True)
    minutes_late = Column(Integer, nullable=True)

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
    """Web Push subscription endpoint stored per worker device."""
    __tablename__ = "push_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    worker_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    endpoint = Column(Text, nullable=False, unique=True)
    p256dh = Column(Text, nullable=False)   # browser public key
    auth = Column(Text, nullable=False)     # auth secret
    user_agent = Column(String(300), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now)

    worker = relationship("User", back_populates="push_subscriptions")


class PushNotificationLog(Base):
    """
    Tracks which (shift, window_key) pairs have already been notified.
    Persisting this in the DB means process restarts / Railway redeploys
    do not cause duplicate push notifications within the same check-in window.
    Rows older than 24h are pruned automatically by the scheduler.
    """
    __tablename__ = "push_notification_log"

    id = Column(Integer, primary_key=True, index=True)
    shift_id = Column(Integer, ForeignKey("shifts.id", ondelete="CASCADE"), nullable=False, index=True)
    window_key = Column(String(32), nullable=False, index=True)   # "{shift_id}:{YYYYmmddTHHMM}"
    notified_at = Column(DateTime(timezone=True), default=_now, nullable=False)


class UsedExportToken(Base):
    """
    BUG FIX: tracks consumed export JWTs so each token is truly single-use.
    jti is a UUID stored at token creation; verify_export_token checks this table
    and rejects any token whose jti already appears here.
    Rows are pruned on a schedule (anything older than 5 minutes is safe to drop).
    """
    __tablename__ = "used_export_tokens"

    id = Column(Integer, primary_key=True, index=True)
    jti = Column(String(64), unique=True, nullable=False, index=True)
    used_at = Column(DateTime(timezone=True), default=_now, nullable=False)
