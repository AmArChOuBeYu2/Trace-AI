import os
import sys
import shutil
import socket
import subprocess
from dotenv import load_dotenv


def _port_in_use(host: str = "127.0.0.1", port: int = 8000) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.2)
        return sock.connect_ex((host, port)) == 0


def run_diagnostics_check() -> bool:
    print("\n" + "=" * 70)
    print("                  TRACE-AI RUNTIME DIAGNOSTICS")
    print("=" * 70)

    project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    env_path = os.path.join(project_root, ".env")
    if os.path.exists(env_path):
        load_dotenv(dotenv_path=env_path, override=True)
        print(f"[CONFIG] Loaded .env explicitly from: {env_path}")

    keys = {
        "SUPABASE_URL": bool(os.getenv("SUPABASE_URL")),
        "SUPABASE_ANON_KEY": bool(os.getenv("SUPABASE_ANON_KEY")),
        "SUPABASE_SERVICE_ROLE_KEY": bool(os.getenv("SUPABASE_SERVICE_ROLE_KEY")),
        "GEMINI_API_KEY": bool(os.getenv("GEMINI_API_KEY")),
        "LANGSEARCH_API_KEY": bool(os.getenv("LANGSEARCH_API_KEY")),
        "SOURCE_SEARCH_API_KEY": bool(os.getenv("SOURCE_SEARCH_API_KEY")),
        "HF_TOKEN": bool(os.getenv("HF_TOKEN")),
    }

    print("\n--- Credential Configuration Status ---")
    for key, present in keys.items():
        state = "CONFIGURED" if present else ("OPTIONAL / NOT CONFIGURED" if key == "HF_TOKEN" else "MISSING / NOT CONFIGURED")
        print(f"  - {key:<30}: {state}")

    required_missing = [k for k, present in keys.items() if not present and k not in {"HF_TOKEN"}]
    if required_missing:
        raise RuntimeError(f"Startup blocked. Missing required configurations: {required_missing}")

    scorecard = {}

    print("\n--- Testing Media Processor Binaries ---")
    ffmpeg_bin = shutil.which("ffmpeg") or r"C:\ffmpeg\bin\ffmpeg.exe"
    ffprobe_bin = shutil.which("ffprobe") or r"C:\ffmpeg\bin\ffprobe.exe"
    for name, binary in (("FFmpeg", ffmpeg_bin), ("ffprobe", ffprobe_bin)):
        try:
            result = subprocess.run([binary, "-version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            scorecard[name] = "CONNECTED" if result.returncode == 0 else "FAILED"
            print(f"  - {name:<18}: {scorecard[name]}")
        except Exception as exc:
            scorecard[name] = "FAILED"
            print(f"  - {name:<18}: FAILED ({exc})")

    print("\n--- Testing Supabase DB Connectivity ---")
    try:
        from supabase import create_client
        sub_url = os.getenv("SUPABASE_URL", "")
        if "supabase.com/dashboard/project/" in sub_url:
            sub_url = f"https://{sub_url.rstrip('/').split('/')[-1]}.supabase.co"
        client = create_client(sub_url, os.getenv("SUPABASE_ANON_KEY", ""))
        client.table("investigations").select("id").limit(1).execute()
        scorecard["Supabase"] = "CONNECTED"
    except Exception as exc:
        scorecard["Supabase"] = "FAILED"
        print(f"  - Supabase Database: FAILED ({exc})")
    else:
        print("  - Supabase Database: CONNECTED")

    print("\n--- Testing Gemini AI Connectivity ---")
    try:
        from backend.app.services.gemini_runtime import gemini_runtime
        gemini_state = gemini_runtime.check()
        scorecard["Gemini"] = gemini_state["status"]
        print(f"  - Gemini AI        : {gemini_state['status']}")
        print(f"  - Primary model    : {gemini_state['primary_model']}")
        print(f"  - Active model     : {gemini_state.get('model')}")
        print(f"  - API method       : google-genai Client.models.generate_content")
        print(f"  - Generation config: JSON response, temperature=0.1, AFC disabled")
        if gemini_state.get("error_code"):
            print(f"  - Error code       : {gemini_state['error_code']}")
    except Exception as exc:
        scorecard["Gemini"] = "FAILED_CONFIGURATION"
        print(f"  - Gemini AI        : FAILED_CONFIGURATION ({exc})")

    print("\n--- Testing LangSearch Web Search Connectivity ---")
    try:
        import httpx
        response = httpx.post(
            "https://api.langsearch.com/v1/web-search",
            headers={"Authorization": f"Bearer {os.getenv('LANGSEARCH_API_KEY')}", "Content-Type": "application/json"},
            json={"query": "Chandigarh Police", "count": 1}, timeout=10.0,
        )
        scorecard["LangSearch"] = "CONNECTED" if response.status_code == 200 else "FAILED"
    except Exception as exc:
        scorecard["LangSearch"] = "FAILED"
        print(f"  - LangSearch API   : FAILED ({exc})")
    print(f"  - LangSearch API   : {scorecard['LangSearch']}")

    print("\n--- Testing Tavily Search Connectivity ---")
    try:
        import httpx
        response = httpx.post(
            "https://api.tavily.com/search",
            json={"api_key": os.getenv("SOURCE_SEARCH_API_KEY"), "query": "Chandigarh Police", "max_results": 1}, timeout=10.0,
        )
        scorecard["Tavily"] = "CONNECTED" if response.status_code == 200 else "FAILED"
    except Exception as exc:
        scorecard["Tavily"] = "FAILED"
        print(f"  - Tavily API       : FAILED ({exc})")
    print(f"  - Tavily API       : {scorecard['Tavily']}")

    hf_token = os.getenv("HF_TOKEN")
    scorecard["Hugging Face"] = "OPTIONAL" if not hf_token else "OPTIONAL / HTTP CHECK"

    print("\n--- Server Port ---")
    scorecard["Port 8000"] = "IN USE" if _port_in_use() else "AVAILABLE"
    print(f"  - 127.0.0.1:8000   : {scorecard['Port 8000']}")

    print("\n" + "=" * 70)
    for service, status in scorecard.items():
        print(f"  - {service:<20}: {status}")
    print("=" * 70)

    fatal = [service for service, status in scorecard.items() if status == "FAILED" and service not in {"Hugging Face"}]
    if scorecard.get("Gemini") == "TEMPORARILY_UNAVAILABLE":
        print("[INFO] Gemini is temporarily unavailable. Technical forensic analysis may continue.")
        if "Gemini" in fatal:
            fatal.remove("Gemini")

    if fatal:
        raise RuntimeError(f"Diagnostics failed for required services: {fatal}")

    return True


if __name__ == "__main__":
    try:
        run_diagnostics_check()
    except Exception as exc:
        print(f"Diagnostics Exception: {exc}")
        sys.exit(1)
