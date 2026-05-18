"""Vercel serverless FastAPI entrypoint for the accounts-tracker backend.

Vercel maps every file under /api/ to a serverless function. The site is
configured (in vercel.json) to rewrite all /api/* requests to this file so
FastAPI handles the routing itself.

All endpoints are prefixed with /api so the same paths work both in dev
and in production behind Vercel's rewrites.
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Iterator
from uuid import UUID

import psycopg
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from psycopg.rows import dict_row
from pydantic import BaseModel, EmailStr, Field


def _database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL environment variable is not set")
    return url


@contextmanager
def get_connection() -> Iterator[psycopg.Connection]:
    """Per-request short-lived connection. Vercel functions are stateless,
    so a connection pool buys us nothing here — we open and close around
    each request. Neon's pooler endpoint handles the actual pooling."""
    conn = psycopg.connect(_database_url(), autocommit=True)
    try:
        yield conn
    finally:
        conn.close()


# Quota reset schedule is fixed: 15:00 Asia/Novosibirsk (UTC+7), i.e. 08:00 UTC.
# Daily quota resets every day at that time; weekly quota resets on Sundays at
# that time. The DB stores the *last applied* reset boundary so we know when
# the next tick should flip the percent back to zero.
NSK_OFFSET = timedelta(hours=7)
RESET_HOUR_NSK = 15
RESET_HOUR_UTC = RESET_HOUR_NSK - int(NSK_OFFSET.total_seconds() // 3600)  # = 8


def latest_past_daily_boundary(now: datetime) -> datetime:
    """Return the most recent UTC moment that maps to 15:00 NSK."""
    now_utc = now.astimezone(timezone.utc)
    candidate = now_utc.replace(
        hour=RESET_HOUR_UTC, minute=0, second=0, microsecond=0
    )
    if candidate > now_utc:
        candidate -= timedelta(days=1)
    return candidate


def latest_past_weekly_boundary(now: datetime) -> datetime:
    """Return the most recent UTC moment that maps to Sunday 15:00 NSK."""
    now_utc = now.astimezone(timezone.utc)
    nsk_now = now_utc + NSK_OFFSET
    # In NSK terms, weekday(): Mon=0..Sun=6. We want the previous (or current)
    # Sunday 15:00 NSK.
    nsk_today_1500 = nsk_now.replace(
        hour=RESET_HOUR_NSK, minute=0, second=0, microsecond=0
    )
    # Days back from today's NSK weekday to the previous Sunday (inclusive).
    days_back = (nsk_today_1500.weekday() - 6) % 7  # weekday(): Mon=0..Sun=6
    # If today is Sunday but it's before 15:00 NSK, go back 7 days.
    candidate_nsk = nsk_today_1500 - timedelta(days=days_back)
    if candidate_nsk > nsk_now:
        candidate_nsk -= timedelta(days=7)
    return (candidate_nsk - NSK_OFFSET).replace(tzinfo=timezone.utc)


def ensure_schema() -> None:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS accounts (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email TEXT NOT NULL,
                registered_at TIMESTAMPTZ NOT NULL,
                daily_last_reset_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                daily_percent INTEGER NOT NULL DEFAULT 0
                    CHECK (daily_percent BETWEEN 0 AND 100),
                weekly_last_reset_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                weekly_percent INTEGER NOT NULL DEFAULT 0
                    CHECK (weekly_percent BETWEEN 0 AND 100),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            """
        )
        # Migration: rename legacy columns from the previous schema.
        # daily_reset_at / weekly_reset_at used to hold the *next* user-set
        # reset time; under the new mechanic we reinterpret them as the
        # *last* applied boundary, so a simple rename is correct.
        cur.execute(
            """
            DO $$
            BEGIN
              IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'accounts' AND column_name = 'daily_reset_at'
              ) THEN
                ALTER TABLE accounts RENAME COLUMN daily_reset_at TO daily_last_reset_at;
              END IF;
              IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'accounts' AND column_name = 'weekly_reset_at'
              ) THEN
                ALTER TABLE accounts RENAME COLUMN weekly_reset_at TO weekly_last_reset_at;
              END IF;
            END $$;
            """
        )


class AccountIn(BaseModel):
    email: EmailStr
    registered_at: datetime
    daily_percent: int = Field(ge=0, le=100, default=0)
    weekly_percent: int = Field(ge=0, le=100, default=0)


class AccountPatch(BaseModel):
    email: EmailStr | None = None
    registered_at: datetime | None = None
    daily_last_reset_at: datetime | None = None
    daily_percent: int | None = Field(default=None, ge=0, le=100)
    weekly_last_reset_at: datetime | None = None
    weekly_percent: int | None = Field(default=None, ge=0, le=100)


class Account(BaseModel):
    id: UUID
    email: str
    registered_at: datetime
    daily_last_reset_at: datetime
    daily_percent: int
    weekly_last_reset_at: datetime
    weekly_percent: int
    created_at: datetime
    updated_at: datetime


app = FastAPI(title="accounts-tracker backend")

_default_origins = (
    "http://localhost:5173,"
    "http://127.0.0.1:5173,"
    "https://dist-gqmwmcnh.devinapps.com"
)
_origins = [
    o.strip()
    for o in os.environ.get("CORS_ORIGINS", _default_origins).split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_origin_regex=os.environ.get("CORS_ORIGIN_REGEX"),
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)


def require_token(request: Request) -> None:
    """Reject requests that don't carry the configured bearer token.

    If API_TOKEN is unset (e.g. local dev), the gate is disabled.
    """
    expected = os.environ.get("API_TOKEN")
    if not expected:
        return
    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = header.split(" ", 1)[1].strip()
    if token != expected:
        raise HTTPException(status_code=401, detail="Invalid token")


_FIELDS = (
    "id",
    "email",
    "registered_at",
    "daily_last_reset_at",
    "daily_percent",
    "weekly_last_reset_at",
    "weekly_percent",
    "created_at",
    "updated_at",
)
_UPDATABLE = (
    "email",
    "registered_at",
    "daily_last_reset_at",
    "daily_percent",
    "weekly_last_reset_at",
    "weekly_percent",
)
_SELECT_COLS = ", ".join(_FIELDS)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/auth/check", dependencies=[Depends(require_token)])
def auth_check() -> dict[str, bool]:
    """Cheap endpoint the frontend hits to validate a token."""
    return {"ok": True}


@app.get(
    "/api/accounts",
    response_model=list[Account],
    dependencies=[Depends(require_token)],
)
def list_accounts() -> list[Account]:
    ensure_schema()
    with get_connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(f"SELECT {_SELECT_COLS} FROM accounts ORDER BY created_at ASC")
        rows = cur.fetchall()
    return [Account(**r) for r in rows]


@app.post(
    "/api/accounts",
    response_model=Account,
    status_code=201,
    dependencies=[Depends(require_token)],
)
def create_account(payload: AccountIn) -> Account:
    ensure_schema()
    now = datetime.now(tz=timezone.utc)
    daily_anchor = latest_past_daily_boundary(now)
    weekly_anchor = latest_past_weekly_boundary(now)
    with get_connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            f"""
            INSERT INTO accounts (
                email, registered_at,
                daily_last_reset_at, daily_percent,
                weekly_last_reset_at, weekly_percent
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING {_SELECT_COLS}
            """,
            (
                payload.email,
                payload.registered_at,
                daily_anchor,
                payload.daily_percent,
                weekly_anchor,
                payload.weekly_percent,
            ),
        )
        row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=500, detail="Insert failed")
    return Account(**row)


@app.patch(
    "/api/accounts/{account_id}",
    response_model=Account,
    dependencies=[Depends(require_token)],
)
def update_account(account_id: UUID, patch: AccountPatch) -> Account:
    ensure_schema()
    fields = patch.model_dump(exclude_unset=True)
    fields = {k: v for k, v in fields.items() if k in _UPDATABLE}

    if not fields:
        with get_connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                f"SELECT {_SELECT_COLS} FROM accounts WHERE id = %s",
                (str(account_id),),
            )
            row = cur.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Account not found")
        return Account(**row)

    set_parts = [f"{k} = %s" for k in fields]
    set_parts.append("updated_at = now()")
    values = list(fields.values()) + [str(account_id)]
    sql = (
        f"UPDATE accounts SET {', '.join(set_parts)} "
        f"WHERE id = %s RETURNING {_SELECT_COLS}"
    )
    with get_connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, values)
        row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Account not found")
    return Account(**row)


@app.delete(
    "/api/accounts/{account_id}",
    status_code=204,
    dependencies=[Depends(require_token)],
)
def delete_account(account_id: UUID) -> None:
    ensure_schema()
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM accounts WHERE id = %s", (str(account_id),))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Account not found")
