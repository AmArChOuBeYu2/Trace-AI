# Use a stable official Python slim runtime
FROM python:3.11-slim

# Install system dependencies including FFmpeg and ffprobe
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Verify FFmpeg & ffprobe installation during docker build step
RUN ffmpeg -version && ffprobe -version

# Set work directory
WORKDIR /app

# Copy requirements list from the backend context directory
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all backend files into a /app/backend folder to maintain the "backend.app" import module pathing
COPY . /app/backend/

# Create folders for uploads and data fallback
RUN mkdir -p /app/backend/uploads /app/backend/data

# Expose public port
EXPOSE 8000

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PORT=8000

# Start FastAPI application
CMD ["sh", "-c", "python -m uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT}"]
