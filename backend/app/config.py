from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    host: str = "0.0.0.0"
    port: int = 8000
    cors_origins: str = "http://localhost:5173"
    output_dir: str = "./generated"
    google_application_credentials: str | None = None

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]

    @property
    def output_path(self) -> Path:
        path = Path(self.output_dir)
        path.mkdir(parents=True, exist_ok=True)
        return path


settings = Settings()
