FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /code

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app
COPY core ./core
COPY services ./services

COPY tasks ./tasks
COPY infra ./infra

EXPOSE 8000

# Bug-fix #10 — uvicorn flags לתמיכה בהעלאות גדולות (>10MB) ולא לאבד חיבורים
CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--limit-max-requests", "1000", \
     "--timeout-keep-alive", "300"]
