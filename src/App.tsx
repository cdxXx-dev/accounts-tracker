import { useCallback, useEffect, useState } from "react";
import { AccountForm } from "./components/AccountForm";
import { AccountCard } from "./components/AccountCard";
import { loadAccounts, saveAccounts } from "./storage";
import type { Account, AccountInput } from "./types";
import { advanceReset, DAILY_MS, WEEKLY_MS } from "./utils";
import "./App.css";

function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Apply quota auto-reset: when a reset time has passed, set the percent to 100
 * and roll the reset time forward by one period. Returns either the original
 * array (no changes) or a new array with updated accounts.
 */
function applyQuotaResets(accounts: Account[], now: Date): Account[] {
  let changed = false;
  const next = accounts.map((acc) => {
    let updated = acc;

    const daily = advanceReset(updated.dailyResetAt, DAILY_MS, now);
    if (daily.reset) {
      updated = { ...updated, dailyResetAt: daily.resetAt, dailyPercent: 100 };
      changed = true;
    }

    const weekly = advanceReset(updated.weeklyResetAt, WEEKLY_MS, now);
    if (weekly.reset) {
      updated = { ...updated, weeklyResetAt: weekly.resetAt, weeklyPercent: 100 };
      changed = true;
    }

    return updated;
  });

  return changed ? next : accounts;
}

export default function App() {
  const [accounts, setAccounts] = useState<Account[]>(() => loadAccounts());
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    saveAccounts(accounts);
  }, [accounts]);

  useEffect(() => {
    function tick() {
      const next = new Date();
      setNow(next);
      setAccounts((prev) => applyQuotaResets(prev, next));
    }
    tick();
    const interval = setInterval(tick, 30_000);
    return () => clearInterval(interval);
  }, []);

  const handleAdd = useCallback((data: AccountInput) => {
    setAccounts((prev) => [
      ...prev,
      { ...data, id: generateId(), createdAt: new Date().toISOString() },
    ]);
  }, []);

  const handleUpdate = useCallback((id: string, patch: AccountInput) => {
    setAccounts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...patch } : a))
    );
  }, []);

  const handleDelete = useCallback((id: string) => {
    setAccounts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <AccountForm onAdd={handleAdd} />
      </header>

      <main className="cards-grid">
        {accounts.length === 0 ? (
          <div className="empty-state">
            Аккаунтов пока нет. Заполните форму выше и нажмите «добавить».
          </div>
        ) : (
          accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              now={now}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))
        )}
      </main>
    </div>
  );
}
