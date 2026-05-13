import { useCallback, useEffect, useState } from "react";
import { AccountForm } from "./components/AccountForm";
import { AccountCard } from "./components/AccountCard";
import { Login } from "./components/Login";
import {
  createAccount,
  deleteAccount,
  listAccounts,
  updateAccount,
  UnauthorizedError,
} from "./api";
import { clearToken, loadToken } from "./auth";
import type { Account, AccountInput } from "./types";
import { advanceReset, DAILY_MS, WEEKLY_MS } from "./utils";
import "./App.css";

/**
 * Apply quota auto-reset: when a reset time has passed, set the percent to 100
 * and roll the reset time forward by one period. Returns either the original
 * array (no changes) or a new array with updated accounts and a list of patches
 * to persist on the server.
 */
function applyQuotaResets(
  accounts: Account[],
  now: Date
): { next: Account[]; patches: Array<{ id: string; patch: Partial<AccountInput> }> } {
  const patches: Array<{ id: string; patch: Partial<AccountInput> }> = [];
  let changed = false;
  const next = accounts.map((acc) => {
    let updated = acc;
    const patch: Partial<AccountInput> = {};

    const daily = advanceReset(updated.dailyResetAt, DAILY_MS, now);
    if (daily.reset) {
      updated = { ...updated, dailyResetAt: daily.resetAt, dailyPercent: 100 };
      patch.dailyResetAt = daily.resetAt;
      patch.dailyPercent = 100;
      changed = true;
    }

    const weekly = advanceReset(updated.weeklyResetAt, WEEKLY_MS, now);
    if (weekly.reset) {
      updated = { ...updated, weeklyResetAt: weekly.resetAt, weeklyPercent: 100 };
      patch.weeklyResetAt = weekly.resetAt;
      patch.weeklyPercent = 100;
      changed = true;
    }

    if (Object.keys(patch).length > 0) {
      patches.push({ id: acc.id, patch });
    }

    return updated;
  });

  return { next: changed ? next : accounts, patches };
}

export default function App() {
  const [authed, setAuthed] = useState<boolean>(() => loadToken() !== null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [now, setNow] = useState<Date>(() => new Date());
  const [loading, setLoading] = useState<boolean>(() => loadToken() !== null);
  const [error, setError] = useState<string | null>(null);

  const handleUnauthorized = useCallback(() => {
    clearToken();
    setAuthed(false);
    setAccounts([]);
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listAccounts();
      setAccounts(list);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        handleUnauthorized();
        return;
      }
      setError((err as Error).message || "Не удалось загрузить аккаунты");
    } finally {
      setLoading(false);
    }
  }, [handleUnauthorized]);

  useEffect(() => {
    if (!authed) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount pattern; refresh is the only way to populate state from the API
    void refresh();
  }, [authed, refresh]);

  useEffect(() => {
    if (!authed) return;
    function tick() {
      const next = new Date();
      setNow(next);
      setAccounts((prev) => {
        const { next: updated, patches } = applyQuotaResets(prev, next);
        for (const { id, patch } of patches) {
          updateAccount(id, patch).catch((err) => {
            if (err instanceof UnauthorizedError) handleUnauthorized();
          });
        }
        return updated;
      });
    }
    tick();
    const interval = setInterval(tick, 30_000);
    return () => clearInterval(interval);
  }, [authed, handleUnauthorized]);

  const handleAdd = useCallback(
    async (data: AccountInput) => {
      setError(null);
      try {
        const created = await createAccount(data);
        setAccounts((prev) => [...prev, created]);
      } catch (err) {
        if (err instanceof UnauthorizedError) return handleUnauthorized();
        setError((err as Error).message || "Не удалось создать аккаунт");
      }
    },
    [handleUnauthorized]
  );

  const handleUpdate = useCallback(
    async (id: string, patch: AccountInput) => {
      setError(null);
      try {
        const updated = await updateAccount(id, patch);
        setAccounts((prev) => prev.map((a) => (a.id === id ? updated : a)));
      } catch (err) {
        if (err instanceof UnauthorizedError) return handleUnauthorized();
        setError((err as Error).message || "Не удалось обновить аккаунт");
      }
    },
    [handleUnauthorized]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      setError(null);
      try {
        await deleteAccount(id);
        setAccounts((prev) => prev.filter((a) => a.id !== id));
      } catch (err) {
        if (err instanceof UnauthorizedError) return handleUnauthorized();
        setError((err as Error).message || "Не удалось удалить аккаунт");
      }
    },
    [handleUnauthorized]
  );

  if (!authed) {
    return <Login onAuthenticated={() => setAuthed(true)} />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-top">
          <button
            type="button"
            className="logout-btn"
            onClick={handleUnauthorized}
          >
            выйти
          </button>
        </div>
        <AccountForm onAdd={handleAdd} />
      </header>

      {error && <div className="api-error">{error}</div>}

      <main className="cards-grid">
        {loading ? (
          <div className="empty-state">Загружаю…</div>
        ) : accounts.length === 0 ? (
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
