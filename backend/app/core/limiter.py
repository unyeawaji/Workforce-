"""
Shared SlowAPI rate-limiter instance.

Kept in app.core so route modules can import it without creating a
main -> routes -> main circular import.

main.py attaches this to app.state and registers the 429 handler.
Route modules import it directly to apply @limiter.limit decorators.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address


def _real_ip(request) -> str:
    """
    Railway (and most cloud platforms) sit behind a load balancer that sets
    X-Forwarded-For to the real client IP. Using get_remote_address would return
    the shared proxy IP, causing the rate limit to fire across ALL users after
    just 10 combined login attempts. We take the first (leftmost) IP from
    X-Forwarded-For, which is the actual client, falling back to REMOTE_ADDR.
    """
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return get_remote_address(request)



# slowapi 0.1.9 calls exempt_when(request) — must accept one positional arg
limiter = Limiter(key_func=_real_ip, exempt_when=lambda request: False)
