import sys
import os

# Add root project path so backend imports resolve correctly
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend.app.main import app
