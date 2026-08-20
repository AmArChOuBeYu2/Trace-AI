import os
import time
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from backend.app.main import app
from backend.app.config import settings
from backend.app.database import db_manager

client = TestClient(app)

TEST_MEDIA_PATH = os.path.join(settings.UPLOAD_DIR, "test_e2e_image.jpg")

@pytest.fixture(scope="module", autouse=True)
def setup_e2e_assets():
    # Make sure upload dir exists
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    # Create test dummy image with some solid blocks (to enable ELA/forensics logic)
    img = Image.new("RGB", (300, 300), color="red")
    img.save(TEST_MEDIA_PATH, "JPEG")
    yield
    # Clean up
    if os.path.exists(TEST_MEDIA_PATH):
        os.remove(TEST_MEDIA_PATH)

def test_full_pipeline_flow():
    # 1. Create Investigation
    case_num = f"E2E-CASE-{int(time.time())}"
    payload = {
        "title": "E2E Automated Fraud Video Case",
        "description": "Integration testing of the core digital forensic pipelines.",
        "case_number": case_num,
        "status": "active",
        "risk_level": "medium"
    }
    resp = client.post("/api/investigations", json=payload)
    assert resp.status_code == 200
    inv = resp.json()
    assert inv["id"] is not None
    assert inv["case_number"] == case_num
    
    inv_id = inv["id"]
    
    # 2. Upload Media & Schedule Analysis Run
    with open(TEST_MEDIA_PATH, "rb") as f:
        file_payload = {"file": ("test_e2e_image.jpg", f, "image/jpeg")}
        resp_upload = client.post(f"/api/investigations/{inv_id}/media", files=file_payload)
        
    assert resp_upload.status_code == 200
    upload_data = resp_upload.json()
    assert "media_asset" in upload_data
    assert "analysis_run" in upload_data
    
    media_id = upload_data["media_asset"]["id"]
    run_id = upload_data["analysis_run"]["id"]
    
    # Wait for the background task to finish processing in the test client
    # In FastAPI's TestClient, background tasks run synchronously during the request lifetime,
    # so by the time the post request completes, the pipeline should have finished.
    # Let's verify status by pulling `/api/investigations/{inv_id}/status`
    time.sleep(1.0) # Give database transaction minor buffer
    resp_status = client.get(f"/api/investigations/{inv_id}/status")
    assert resp_status.status_code == 200
    status_data = resp_status.json()
    assert status_data["status"] in ["completed", "failed"]
    
    # 3. Retrieve Findings
    resp_findings = client.get(f"/api/media/{media_id}/findings")
    assert resp_findings.status_code == 200
    findings = resp_findings.json()
    # At least the ELA analysis and conclusion finding should be generated
    assert len(findings) > 0
    
    # 4. Check C2PA record
    resp_c2pa = client.get(f"/api/media/{media_id}/provenance")
    assert resp_c2pa.status_code == 200
    c2pa_data = resp_c2pa.json()
    assert "status" in c2pa_data
    assert c2pa_data["status"] in ["NOT_PRESENT", "VERIFIED", "PRESENT_UNVERIFIED", "INVALID"]
    
    # 5. Check timeline & source candidates
    resp_sources = client.get(f"/api/investigations/{inv_id}/sources")
    assert resp_sources.status_code == 200
    
    # 6. Check propagation graph
    resp_graph = client.get(f"/api/investigations/{inv_id}/graph")
    assert resp_graph.status_code == 200
    graph_data = resp_graph.json()
    assert "nodes" in graph_data
    assert "edges" in graph_data
    
    # 7. Generate report
    resp_report_gen = client.post(f"/api/investigations/{inv_id}/report")
    assert resp_report_gen.status_code == 200
    report_rel_path = resp_report_gen.json()["report_path"]
    
    # 8. Retrieve report
    resp_report_get = client.get(f"/api/investigations/{inv_id}/report")
    assert resp_report_get.status_code == 200
    report_data = resp_report_get.json()
    
    assert "case_info" in report_data
    assert "trace_plim" in report_data
    assert "limitations" in report_data
    
    # Assert PLIM Overall Score matches calculated output range
    plim_score = report_data["trace_plim"]["overall_score"]
    assert 0.0 <= plim_score <= 100.0
    
    print("[E2E TEST] End-to-end integration test passed successfully!")
