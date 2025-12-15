FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . /app

# Create model dir if missing
RUN mkdir -p /app/model

ENV FLASK_ENV=production
ENV PYTHONUNBUFFERED=1
ENV PORT=5001

EXPOSE 5001

# Use gunicorn in production (respects PORT env var)
CMD ["sh", "-c", "gunicorn -b 0.0.0.0:${PORT:-5001} app:app --workers 2"]
