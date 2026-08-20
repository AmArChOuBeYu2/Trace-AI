import os
import pytest
from PIL import Image
from backend.app.config import settings
from backend.app.services.forensic_service import ForensicService
from backend.app.database import db_manager

# Set up test paths
TEST_IMAGE_PATH = os.path.join(settings.UPLOAD_DIR, "test_source.jpg")

@pytest.fixture(scope="session", autouse=True)
def setup_test_assets():
    # Ensure upload directory exists
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    # Create a dummy solid JPEG image for testing
    img = Image.new("RGB", (200, 200), color="blue")
    img.save(TEST_IMAGE_PATH, "JPEG")
    yield
    # Clean up dummy image after tests finish
    if os.path.exists(TEST_IMAGE_PATH):
        os.remove(TEST_IMAGE_PATH)

def test_sha256_computation():
    sha = ForensicService.calculate_sha256(TEST_IMAGE_PATH)
    assert len(sha) == 64
    # Re-reading same file should yield the exact same hash
    sha_recalc = ForensicService.calculate_sha256(TEST_IMAGE_PATH)
    assert sha == sha_recalc

def test_metadata_extraction():
    meta = ForensicService.extract_image_metadata(TEST_IMAGE_PATH)
    assert meta["format"] == "JPEG"
    assert meta["width"] == 200
    assert meta["height"] == 200

def test_ela_forensics():
    result = ForensicService.run_image_forensics(TEST_IMAGE_PATH)
    assert "ela_path" in result
    assert result["ela_path"] is not None
    
    # ELA difference image must have been generated on disk
    ela_filename = os.path.basename(result["ela_path"])
    ela_abs_path = os.path.join(settings.UPLOAD_DIR, "ela", ela_filename)
    assert os.path.exists(ela_abs_path)
    
    # Clean up generated ELA image
    if os.path.exists(ela_abs_path):
        os.remove(ela_abs_path)

def test_database_case_creation():
    # Direct database CRUD test using SQLite/Supabase abstraction
    inv = db_manager.create_investigation(
        title="Test Automated Case Runs",
        description="Verify backend DB persistence handles standard inputs.",
        case_number="TEST-9999"
    )
    assert inv is not None
    assert inv["title"] == "Test Automated Case Runs"
    assert inv["case_number"] == "TEST-9999"
    
    # Verify retrieval
    retrieved = db_manager.get_investigation(inv["id"])
    assert retrieved is not None
    assert retrieved["title"] == "Test Automated Case Runs"
