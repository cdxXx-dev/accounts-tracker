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
from datetime import datetime
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


def ensure_schema() -> None:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS accounts (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email TEXT NOT NULL,
                registered_at TIMESTAMPTZ NOT NULL,
                daily_reset_at TIMESTAMPTZ NOT NULL,
                daily_percent INTEGER NOT NULL DEFAULT 100
                    CHECK (daily_percent BETWEEN 0 AND 100),
                weekly_reset_at TIMESTAMPTZ NOT NULL,
                weekly_percent INTEGER NOT NULL DEFAULT 100
                    CHECK (weekly_percent BETWEEN 0 AND 100),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            """
        )


class AccountIn(BaseModel):
    email: EmailStr
    registered_at: datetime
    daily_reset_at: datetime
    daily_percent: int = Field(ge=0, le=100, default=100)
    weekly_reset_at: datetime
    weekly_percent: int = Field(ge=0, le=100, default=100)


class AccountPatch(BaseModel):
    email: EmailStr | None = None
    registered_at: datetime | None = None
    daily_reset_at: datetime | None = None
    daily_percent: int | None = Field(default=None, ge=0, le=100)
    weekly_reset_at: datetime | None = None
    weekly_percent: int | None = Field(default=None, ge=0, le=100)


class Account(BaseModel):
    id: UUID
    email: str
    registered_at: datetime
    daily_reset_at: datetime
    daily_percent: int
    weekly_reset_at: datetime
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
    "daily_reset_at",
    "daily_percent",
    "weekly_reset_at",
    "weekly_percent",
    "created_at",
    "updated_at",
)
_UPDATABLE = (
    "email",
    "registered_at",
    "daily_reset_at",
    "daily_percent",
    "weekly_reset_at",
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
    with get_connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            f"""
            INSERT INTO accounts (
                email, registered_at,
                daily_reset_at, daily_percent,
                weekly_reset_at, weekly_percent
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING {_SELECT_COLS}
            """,
            (
                payload.email,
                payload.registered_at,
                payload.daily_reset_at,
                payload.daily_percent,
                payload.weekly_reset_at,
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
