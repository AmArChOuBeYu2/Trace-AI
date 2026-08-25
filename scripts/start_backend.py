import json
import os
import socket
import subprocess
import sys
import time
import urllib.request

HOST = "127.0.0.1"
PORT = 8000


def port_pid() -> int | None:
    if os.name != "nt":
        return None
    result = subprocess.run(["netstat", "-ano", "-p", "TCP"], capture_output=True, text=True)
    for line in result.stdout.splitlines():
        parts = line.split()
        if len(parts) >= 5 and parts[1] == f"{HOST}:{PORT}" and parts[3] == "LISTENING":
            try:
                return int(parts[4])
            except ValueError:
                return None
    return None


def healthy() -> bool:
    try:
        with urllib.request.urlopen(f"http://{HOST}:{PORT}/api/health", timeout=1.5) as response:
            if response.status != 200:
                return False
            data = json.loads(response.read().decode("utf-8"))
            return data.get("status") == "healthy"
    except Exception:
        return False


def process_is_backend(pid: int) -> bool:
    if os.name != "nt":
        return False
    result = subprocess.run(
        ["wmic", "process", "where", f"ProcessId={pid}", "get", "CommandLine", "/value"],
        capture_output=True,
        text=True,
    )
    command = result.stdout.lower()
    return "uvicorn" in command or "backend.app.main" in command or "backend.app.main_legacy" in command


if __name__ == "__main__":
    if healthy():
        print(f"TRACE-AI backend is already healthy on {HOST}:{PORT}. Reusing existing process.")
        raise SystemExit(0)

    pid = port_pid()
    if pid:
        print(f"Port {PORT} is occupied by PID {pid}.")
        if process_is_backend(pid):
            print("Existing TRACE-AI backend is not healthy. Stopping it cleanly before restart...")
            subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], check=False)
            time.sleep(1)
        else:
            raise SystemExit(f"Port {PORT} is occupied by an unrelated process. Refusing to kill it.")

    print(f"Starting exactly one Uvicorn process on {HOST}:{PORT}...")
    raise SystemExit(subprocess.call([
        sys.executable, "-m", "uvicorn", "backend.app.main:app", "--host", HOST, "--port", str(PORT)
    ]))
