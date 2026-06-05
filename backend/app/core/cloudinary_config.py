import time
import cloudinary
import cloudinary.uploader
from app.core.config import settings

cloudinary.config(
    cloud_name=settings.CLOUDINARY_CLOUD_NAME,
    api_key=settings.CLOUDINARY_API_KEY,
    api_secret=settings.CLOUDINARY_API_SECRET,
    secure=True,
)


def upload_screenshot(file_bytes: bytes, worker_id: int, shift_id: int, prefix: str = "final") -> str:
    """Upload a screenshot and return its secure URL.

    Each call produces a unique public_id using a millisecond epoch timestamp,
    so no upload ever silently overwrites a previous one on Cloudinary.
    The URL stored in the DB row is the permanent, immutable record for that
    specific upload — prior versions are preserved in Cloudinary's asset library
    and remain accessible for audit/dispute purposes.
    """
    ts = int(time.time() * 1000)  # ms epoch — unique per upload
    public_id = f"shift_{shift_id}_worker_{worker_id}_{prefix}_{ts}"
    result = cloudinary.uploader.upload(
        file_bytes,
        folder="aiinduction/screenshots",
        public_id=public_id,
        overwrite=False,       # never clobber — each upload is a new asset
        resource_type="image",
        transformation=[{"quality": "auto", "fetch_format": "auto"}],
    )
    return result["secure_url"]
