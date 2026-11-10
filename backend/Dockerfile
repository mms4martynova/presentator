FROM python:3.11-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends libreoffice-impress fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
ENV STORAGE_DIR=/data/storage
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
