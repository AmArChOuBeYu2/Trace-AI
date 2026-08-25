import os
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"))
load_dotenv()

class Settings:
    PROJECT_NAME: str = "TRACE-AI"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api"

    _SUPABASE_URL_RAW: str = os.getenv("SUPABASE_URL", "")
    if "supabase.com/dashboard/project/" in _SUPABASE_URL_RAW:
        _project_ref = _SUPABASE_URL_RAW.rstrip("/").split("/")[-1]
        SUPABASE_URL: str = f"https://{_project_ref}.supabase.co"
    else:
        SUPABASE_URL: str = _SUPABASE_URL_RAW

    SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")
    SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    GEMINI_FALLBACK_MODELS: str = os.getenv("GEMINI_FALLBACK_MODELS", "")
    GEMINI_MAX_RETRIES: int = int(os.getenv("GEMINI_MAX_RETRIES", "2"))

    LANGSEARCH_API_KEY: str = os.getenv("LANGSEARCH_API_KEY", "")
    HF_TOKEN: str = os.getenv("HF_TOKEN", "")
    SOURCE_SEARCH_API_KEY: str = os.getenv("SOURCE_SEARCH_API_KEY", "")

    UPLOAD_DIR: str = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
    SQLITE_DB_PATH: str = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "trace_ai.db")

settings = Settings()
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(os.path.dirname(settings.SQLITE_DB_PATH), exist_ok=True)
