from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import List


class Settings(BaseSettings):
    APP_NAME: str = "AİİИDUCTION"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    DATABASE_URL: str

    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    # Admin seeding — required on first deploy
    ADMIN_EMAIL: str = "admin@aiinduction.local"
    ADMIN_PASSWORD: str = ""

    # Cloudinary — required for screenshot uploads
    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""

    @field_validator("SECRET_KEY")
    @classmethod
    def secret_key_must_be_strong(cls, v: str) -> str:
        if not v or v.startswith("changeme") or len(v) < 32:
            raise ValueError(
                "SECRET_KEY must be at least 32 characters and not the default placeholder. "
                "Generate one with: openssl rand -hex 32"
            )
        return v

    def get_origins(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
