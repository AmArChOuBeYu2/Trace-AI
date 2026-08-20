import os
from dotenv import load_dotenv

# Load env variables from root or backend directory
load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"))
load_dotenv()

class Settings:
    PROJECT_NAME: str = "TRACE-AI"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api"
    
    # Supabase (Optional, falls back to local SQLite if empty)
    _SUPABASE_URL_RAW: str = os.getenv("SUPABASE_URL", "")
    
    # Auto-heals Supabase Dashboard URLs to REST API URLs
    if "supabase.com/dashboard/project/" in _SUPABASE_URL_RAW:
        _project_ref = _SUPABASE_URL_RAW.rstrip("/").split("/")[-1]
        SUPABASE_URL: str = f"https://{_project_ref}.supabase.co"
    else:
        SUPABASE_URL: str = _SUPABASE_URL_RAW
        
    SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")
    SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    
    # Gemini AI
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    
    # LangSearch API Key
    LANGSEARCH_API_KEY: str = os.getenv("LANGSEARCH_API_KEY", "")
    
    # Hugging Face
    HF_TOKEN: str = os.getenv("HF_TOKEN", "")
    
    # Source Tracing / Search
    SOURCE_SEARCH_API_KEY: str = os.getenv("SOURCE_SEARCH_API_KEY", "")
    
    # Local Processing Directories
    UPLOAD_DIR: str = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
    SQLITE_DB_PATH: str = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "trace_ai.db")

settings = Settings()

# Ensure standard directories exist
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(os.path.dirname(settings.SQLITE_DB_PATH), exist_ok=True)
