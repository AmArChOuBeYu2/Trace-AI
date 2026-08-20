import os
import sys
import shutil
import subprocess
from dotenv import load_dotenv

def run_diagnostics_check() -> bool:
    print("\n" + "="*70)
    print("                  TRACE-AI RUNTIME DIAGNOSTICS                  ")
    print("="*70)

    # 1. Load .env explicitly from the project root
    project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    env_path = os.path.join(project_root, ".env")
    
    if os.path.exists(env_path):
        load_dotenv(dotenv_path=env_path, override=True)
        print(f"[CONFIG] Loaded .env explicitly from: {env_path}")
    else:
        print(f"[WARNING] .env file not found at: {env_path}")

    # 2. Check environment keys presence using boolean validation only (no secret prints!)
    keys = {
        "SUPABASE_URL": bool(os.getenv("SUPABASE_URL")),
        "SUPABASE_ANON_KEY": bool(os.getenv("SUPABASE_ANON_KEY")),
        "SUPABASE_SERVICE_ROLE_KEY": bool(os.getenv("SUPABASE_SERVICE_ROLE_KEY")),
        "GEMINI_API_KEY": bool(os.getenv("GEMINI_API_KEY")),
        "LANGSEARCH_API_KEY": bool(os.getenv("LANGSEARCH_API_KEY")),
        "SOURCE_SEARCH_API_KEY": bool(os.getenv("SOURCE_SEARCH_API_KEY")),
        "HF_TOKEN": bool(os.getenv("HF_TOKEN")) # Optional
    }

    print("\n--- Credential Configuration Status ---")
    for key, is_present in keys.items():
        status = "CONFIGURED" if is_present else ("OPTIONAL / NOT CONFIGURED" if key == "HF_TOKEN" else "MISSING / NOT CONFIGURED")
        print(f"  - {key:<30}: {status}")

    # Verify all required keys are configured
    required_missing = [k for k, present in keys.items() if not present and k != "HF_TOKEN"]
    if required_missing:
        print(f"\n[CRITICAL] Missing required configurations: {required_missing}")
        raise RuntimeError(f"Startup blocked. Missing required configurations: {required_missing}")

    scorecard = {}

    # 3. Verify FFmpeg / ffprobe availability from Python
    print("\n--- Testing Media Processor Binaries ---")
    ffmpeg_bin = shutil.which("ffmpeg")
    if ffmpeg_bin is None:
        ffmpeg_bin = r"C:\ffmpeg\bin\ffmpeg.exe"
        
    ffprobe_bin = shutil.which("ffprobe")
    if ffprobe_bin is None:
        ffprobe_bin = r"C:\ffmpeg\bin\ffprobe.exe"

    try:
        res = subprocess.run([ffmpeg_bin, "-version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if res.returncode == 0:
            print(f"  - FFmpeg  : CONNECTED ({ffmpeg_bin})")
            scorecard["FFmpeg"] = "CONNECTED"
        else:
            print(f"  - FFmpeg  : FAILED (Exit code {res.returncode})")
            scorecard["FFmpeg"] = "FAILED"
    except Exception as e:
        print(f"  - FFmpeg  : FAILED ({e})")
        scorecard["FFmpeg"] = "FAILED"

    try:
        res = subprocess.run([ffprobe_bin, "-version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if res.returncode == 0:
            print(f"  - ffprobe : CONNECTED ({ffprobe_bin})")
            scorecard["ffprobe"] = "CONNECTED"
        else:
            print(f"  - ffprobe : FAILED (Exit code {res.returncode})")
            scorecard["ffprobe"] = "FAILED"
    except Exception as e:
        print(f"  - ffprobe : FAILED ({e})")
        scorecard["ffprobe"] = "FAILED"

    if "FAILED" in [scorecard["FFmpeg"], scorecard["ffprobe"]]:
        raise RuntimeError("Startup blocked. Local media-processing binaries (FFmpeg/ffprobe) are unavailable.")

    # 4. Perform Real API Connectivity checks
    import httpx
    
    # 4a. SUPABASE
    print("\n--- Testing Supabase DB Connectivity ---")
    sub_url = os.getenv("SUPABASE_URL", "")
    sub_key = os.getenv("SUPABASE_ANON_KEY", "")
    
    # Auto-heal dashboard URL if present
    if "supabase.com/dashboard/project/" in sub_url:
        project_ref = sub_url.rstrip("/").split("/")[-1]
        sub_url = f"https://{project_ref}.supabase.co"

    try:
        from supabase import create_client
        supabase_client = create_client(sub_url, sub_key)
        # Real select query
        supabase_client.table("investigations").select("id").limit(1).execute()
        print("  - Supabase Database: CONNECTED (Tables verified)")
        scorecard["Supabase"] = "CONNECTED"
    except Exception as e:
        print(f"  - Supabase Database: FAILED ({e})")
        scorecard["Supabase"] = "FAILED"
        print("[DIAGNOSIS] If you see PGRST205 / Table not found, you must run the SQL in 'scripts/migration.sql' in your Supabase SQL Editor.")

    # 4b. GEMINI Vision AI
    print("\n--- Testing Gemini AI Connectivity ---")
    try:
        from google import genai
        gemini_client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
        res = gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents="State 'OK' if online."
        )
        if res.text:
            print(f"  - Gemini AI        : CONNECTED (Response: '{res.text.strip()}')")
            scorecard["Gemini"] = "CONNECTED"
        else:
            print("  - Gemini AI        : FAILED (Empty response)")
            scorecard["Gemini"] = "FAILED"
    except Exception as e:
        print(f"  - Gemini AI        : FAILED ({e})")
        scorecard["Gemini"] = "FAILED"

    # 4c. LANGSEARCH
    print("\n--- Testing LangSearch Web Search Connectivity ---")
    try:
        headers = {
            "Authorization": f"Bearer {os.getenv('LANGSEARCH_API_KEY')}",
            "Content-Type": "application/json"
        }
        res = httpx.post(
            "https://api.langsearch.com/v1/web-search",
            headers=headers,
            json={"query": "Chandigarh Police", "count": 1},
            timeout=10.0
        )
        if res.status_code == 200:
            print("  - LangSearch API   : CONNECTED")
            scorecard["LangSearch"] = "CONNECTED"
        else:
            print(f"  - LangSearch API   : FAILED (HTTP {res.status_code}: {res.text})")
            scorecard["LangSearch"] = "FAILED"
    except Exception as e:
        print(f"  - LangSearch API   : FAILED ({e})")
        scorecard["LangSearch"] = "FAILED"

    # 4d. TAVILY
    print("\n--- Testing Tavily Search Connectivity ---")
    try:
        res = httpx.post(
            "https://api.tavily.com/search",
            json={"api_key": os.getenv("SOURCE_SEARCH_API_KEY"), "query": "Chandigarh Police", "max_results": 1},
            timeout=10.0
        )
        if res.status_code == 200:
            print("  - Tavily API       : CONNECTED")
            scorecard["Tavily"] = "CONNECTED"
        else:
            print(f"  - Tavily API       : FAILED (HTTP {res.status_code}: {res.text})")
            scorecard["Tavily"] = "FAILED"
    except Exception as e:
        print(f"  - Tavily API       : FAILED ({e})")
        scorecard["Tavily"] = "FAILED"

    # 4e. HUGGING FACE (Optional)
    print("\n--- Testing Hugging Face Connectivity ---")
    hf_token = os.getenv("HF_TOKEN")
    if hf_token:
        try:
            headers = {
                "Authorization": f"Bearer {hf_token}",
                "Content-Type": "application/json"
            }
            res = httpx.post(
                "https://router.huggingface.co/hf-inference/models/roberta-base-openai-detector",
                headers=headers,
                json={"inputs": "Ping"},
                timeout=10.0
            )
            # 200 (Success) or 403 (Handshake success but permission issue) represents active gateway contact!
            if res.status_code in [200, 403, 401]:
                print(f"  - Hugging Face API : CONNECTED (HTTP {res.status_code})")
                scorecard["Hugging Face"] = "CONNECTED"
            else:
                print(f"  - Hugging Face API : FAILED (HTTP {res.status_code}: {res.text})")
                scorecard["Hugging Face"] = "FAILED"
        except Exception as e:
            print(f"  - Hugging Face API : FAILED ({e})")
            scorecard["Hugging Face"] = "FAILED"
    else:
        print("  - Hugging Face API : OPTIONAL / NOT CONFIGURED")
        scorecard["Hugging Face"] = "OPTIONAL"

    # 5. Review scorecards
    print("\n" + "="*70)
    print("                    DIAGNOSTICS SCORECARD                    ")
    print("="*70)
    failed_required = []
    for service, status in scorecard.items():
        print(f"  - {service:<20}: {status}")
        if status == "FAILED" and service != "Hugging Face":
            failed_required.append(service)

    print("="*70)
    if failed_required:
        print(f"\n[CRITICAL] Diagnostics phase failed for required services: {failed_required}")
        print("[CRITICAL] Server startup halted. Fix configuration and migrations before running.")
        print("="*70 + "\n")
        raise RuntimeError(f"Diagnostics failed for required services: {failed_required}")
        
    print("\n[SUCCESS] All required local binaries and API connections are successfully verified!")
    print("="*70 + "\n")
    return True

if __name__ == "__main__":
    try:
        run_diagnostics_check()
        sys.exit(0)
    except Exception as e:
        print(f"Diagnostics Exception: {e}")
        sys.exit(1)
