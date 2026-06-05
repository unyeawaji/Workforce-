"""
Shared SlowAPI rate-limiter instance.

Kept in app.core so route modules can import it without creating a
main -> routes -> main circular import.

main.py attaches this to app.state and registers the 429 handler.
Route modules import it directly to apply @limiter.limit decorators.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
