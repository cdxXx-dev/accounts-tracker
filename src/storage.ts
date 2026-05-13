import type { Account } from "./types";

const STORAGE_KEY = "accounts-tracker.accounts";

function isAccount(value: unknown): value is Account {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.email === "string" &&
    typeof v.registeredAt === "string" &&
    typeof v.dailyResetAt === "string" &&
    typeof v.weeklyResetAt === "string" &&
    typeof v.dailyPercent === "number" &&
    typeof v.weeklyPercent === "number" &&
    typeof v.createdAt === "string"
  );
}

export function loadAccounts(): Account[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isAccount);
  } catch {
    return [];
  }
}

export function saveAccounts(accounts: Account[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
}
