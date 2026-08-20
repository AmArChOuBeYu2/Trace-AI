import os
import sys

# Add backend to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.app.database import engine
from backend.app.models import Base

def setup_db():
    print("[DB SETUP] Initializing database engine and tables...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    print("[DB SETUP] SQLite Database tables created successfully!")

if __name__ == "__main__":
    setup_db()
