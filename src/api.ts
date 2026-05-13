import { loadToken } from "./auth";
import type { Account, AccountInput } from "./types";

const RAW_BASE = (import.meta.env.VITE_API_URL ?? "").trim();
const BASE = RAW_BASE.replace(/\/+$/, "");

function url(path: string): string {
  return `${BASE}${path}`;
}

/** Server returns snake_case + extra fields. Map to our camelCase Account. */
type ServerAccount = {
  id: string;
  email: string;
  registered_at: string;
  daily_reset_at: string;
  daily_percent: number;
  weekly_reset_at: string;
  weekly_percent: number;
  created_at: string;
  updated_at: string;
};

function toAccount(s: ServerAccount): Account {
  return {
    id: s.id,
    email: s.email,
    registeredAt: s.registered_at,
    dailyResetAt: s.daily_reset_at,
    dailyPercent: s.daily_percent,
    weeklyResetAt: s.weekly_reset_at,
    weeklyPercent: s.weekly_percent,
    createdAt: s.created_at,
  };
}

function toServerPayload(input: AccountInput) {
  return {
    email: input.email,
    registered_at: input.registeredAt,
    daily_reset_at: input.dailyResetAt,
    daily_percent: input.dailyPercent,
    weekly_reset_at: input.weeklyResetAt,
    weekly_percent: input.weeklyPercent,
  };
}

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request(
  path: string,
  init: RequestInit & { token?: string } = {}
): Promise<Response> {
  const token = init.token ?? loadToken();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(url(path), { ...init, headers });
  } catch (err) {
    throw new ApiError(0, `Network error: ${(err as Error).message}`);
  }

  if (res.status === 401) {
    throw new UnauthorizedError();
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { detail?: string };
      if (data?.detail) detail = data.detail;
    } catch {
      // ignore JSON parse failure
    }
    throw new ApiError(res.status, detail);
  }
  return res;
}

/** Verify the token is accepted. Returns true on 200, throws on 401. */
export async function checkAuth(token: string): Promise<boolean> {
  await request("/api/auth/check", { token });
  return true;
}

export async function listAccounts(): Promise<Account[]> {
  const res = await request("/api/accounts");
  const data = (await res.json()) as ServerAccount[];
  return data.map(toAccount);
}

export async function createAccount(input: AccountInput): Promise<Account> {
  const res = await request("/api/accounts", {
    method: "POST",
    body: JSON.stringify(toServerPayload(input)),
  });
  return toAccount((await res.json()) as ServerAccount);
}

export async function updateAccount(
  id: string,
  patch: Partial<AccountInput>
): Promise<Account> {
  const body: Record<string, unknown> = {};
  if (patch.email !== undefined) body.email = patch.email;
  if (patch.registeredAt !== undefined) body.registered_at = patch.registeredAt;
  if (patch.dailyResetAt !== undefined) body.daily_reset_at = patch.dailyResetAt;
  if (patch.dailyPercent !== undefined) body.daily_percent = patch.dailyPercent;
  if (patch.weeklyResetAt !== undefined)
    body.weekly_reset_at = patch.weeklyResetAt;
  if (patch.weeklyPercent !== undefined)
    body.weekly_percent = patch.weeklyPercent;

  const res = await request(`/api/accounts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return toAccount((await res.json()) as ServerAccount);
}

export async function deleteAccount(id: string): Promise<void> {
  await request(`/api/accounts/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
