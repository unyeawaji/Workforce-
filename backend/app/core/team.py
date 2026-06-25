"""
Shared helper for resolving which worker accounts belong to an admin's team.

Previously this exact query was duplicated in activities.py and analytics.py,
and the two copies had silently drifted: analytics.py filtered to active
workers only, activities.py didn't. That meant a deactivated worker's
activities disappeared from dashboard counts but still showed up — and could
still be approved/rejected — in the activity feed itself.

include_inactive=True (the default) is the correct choice for anything that
reports on historical fact: an activity that was logged while the worker was
active is real regardless of their current status, the same reasoning used
for payroll (see payroll.py's payroll_summary). Pass include_inactive=False
only for things that should reflect the *current* team, like "how many people
are on my team right now."
"""
from sqlalchemy.orm import Session
from app.models.models import User, UserRole


def team_worker_ids(db: Session, admin_id: int, include_inactive: bool = True) -> list[int]:
    """Return worker IDs belonging to this admin's team."""
    q = db.query(User.id).filter(
        User.admin_id == admin_id,
        User.role == UserRole.worker,
    )
    if not include_inactive:
        q = q.filter(User.is_active == True)
    return [w.id for w in q.all()]
