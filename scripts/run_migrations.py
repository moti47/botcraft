#!/usr/bin/env python3
"""Run database migrations against Supabase via direct PostgreSQL.

Usage:
    python scripts/run_migrations.py

Uses psycopg2 to connect and execute migrations.
"""
from __future__ import annotations

import os
import re
import sys
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

# Ensure UTF-8 output on Windows
if sys.stdout.encoding != 'utf-8':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Load .env
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "").strip()
DB_PASSWORD = os.getenv("SUPABASE_DB_PASSWORD", "").strip()

if not SUPABASE_URL:
    print("[ERR] SUPABASE_URL not found in .env")
    sys.exit(1)

if not SERVICE_KEY:
    print("[ERR] SUPABASE_SERVICE_KEY not found in .env")
    sys.exit(1)

# Extract project ref from URL for direct DB connection
match = re.search(r"https://([^.]+)\.supabase\.co", SUPABASE_URL)
if not match:
    print(f"[ERR] Invalid SUPABASE_URL format: {SUPABASE_URL}")
    sys.exit(1)

project_ref = match.group(1)
print(f"[*] Connecting to Supabase at {SUPABASE_URL}")

# Try direct PostgreSQL connection
if not DB_PASSWORD:
    print("[WARN] SUPABASE_DB_PASSWORD not in .env - using default 'postgres'")
    DB_PASSWORD = "postgres"

db_host = f"db.{project_ref}.supabase.co"
db_user = "postgres"
db_port = 5432
db_name = "postgres"

# Use psycopg2 for direct connection
try:
    import psycopg2
except ImportError:
    print("[ERR] psycopg2 not available. Installing...")
    os.system("pip install psycopg2-binary > /dev/null 2>&1")
    import psycopg2

conn_string = (
    f"postgresql://{db_user}:{DB_PASSWORD}@{db_host}:{db_port}/{db_name}"
)

try:
    conn = psycopg2.connect(conn_string, connect_timeout=10)
    conn.autocommit = True
    cursor = conn.cursor()
    print("[OK] Connected to PostgreSQL\n")
except psycopg2.OperationalError as e:
    print(f"[ERR] Connection failed: {str(e)[:100]}")
    print("\nTo fix this, set your database password:")
    print(f"  1. Get it from: {SUPABASE_URL}/project/settings/database")
    print("  2. Add to .env: SUPABASE_DB_PASSWORD='your_password'")
    sys.exit(1)

# Create tracking table
print("[*] Setting up migrations tracking...")
try:
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS _migrations_applied (
            id BIGSERIAL PRIMARY KEY,
            filename TEXT UNIQUE NOT NULL,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    print("[OK] Tracking table ready\n")
except psycopg2.Error as e:
    print(f"[WARN] Could not create tracking: {str(e)[:80]}\n")

# Find and run migrations
migration_dir = Path(__file__).resolve().parents[1] / "infra" / "migrations"
if not migration_dir.exists():
    print(f"[ERR] Migration directory not found: {migration_dir}")
    conn.close()
    sys.exit(1)

sql_files = sorted(migration_dir.glob("*.sql"))
if not sql_files:
    print("[WARN] No SQL files found in infra/migrations/")
    conn.close()
    sys.exit(0)

print(f"[*] Running {len(sql_files)} migration(s)...\n")

applied_count = 0
skipped_count = 0
failed_count = 0
errors = []

for sql_file in sql_files:
    filename = sql_file.name
    start_time = datetime.now()

    # Check if already applied
    try:
        cursor.execute(
            "SELECT 1 FROM _migrations_applied WHERE filename = %s",
            (filename,)
        )
        if cursor.fetchone():
            print(f"[SKIP] {filename:<45} already applied")
            skipped_count += 1
            continue
    except psycopg2.Error:
        pass  # Table doesn't exist yet

    try:
        print(f"[...] {filename:<45} ", end="", flush=True)
        sql_content = sql_file.read_text(encoding="utf-8")

        # Execute migration
        cursor.execute(sql_content)

        # Mark as applied
        try:
            cursor.execute(
                "INSERT INTO _migrations_applied (filename) VALUES (%s)",
                (filename,)
            )
        except psycopg2.Error:
            pass  # Table might not exist

        elapsed = (datetime.now() - start_time).total_seconds()
        print(f"[OK] APPLIED ({elapsed:.2f}s)")
        applied_count += 1
    except psycopg2.Error as e:
        elapsed = (datetime.now() - start_time).total_seconds()
        print(f"[ERR] FAILED ({elapsed:.2f}s)")
        error_msg = f"{filename}: {str(e)[:80]}"
        errors.append(error_msg)
        failed_count += 1

conn.close()

# Summary
print("\n" + "=" * 70)
print("[RESULT] Migration Summary")
print("=" * 70)
print(f"[OK] Applied:  {applied_count}")
print(f"[SKIP] Skipped: {skipped_count}")
print(f"[ERR] Failed:  {failed_count}")

if errors:
    print("\n[WARN] Errors encountered:")
    for err in errors:
        print(f"  • {err}")

if failed_count > 0:
    sys.exit(1)

print("\n[DONE] All migrations completed successfully!")
sys.exit(0)
