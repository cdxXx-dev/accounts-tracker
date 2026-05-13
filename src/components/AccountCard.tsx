import { useState } from "react";
import type { Account, AccountInput } from "../types";
import {
  daysLeft,
  expiryFromRegistered,
  formatLong,
  formatShort,
  isoToLocalInput,
  localInputToIso,
} from "../utils";

type Props = {
  account: Account;
  now: Date;
  onUpdate: (id: string, patch: AccountInput) => void;
  onDelete: (id: string) => void;
};

export function AccountCard({ account, now, onUpdate, onDelete }: Props) {
  const [editing, setEditing] = useState(false);

  const expiresAt = expiryFromRegistered(account.registeredAt);
  const remaining = daysLeft(expiresAt, now);

  if (editing) {
    return (
      <AccountCardEdit
        account={account}
        onCancel={() => setEditing(false)}
        onSave={(patch) => {
          onUpdate(account.id, patch);
          setEditing(false);
        }}
      />
    );
  }

  return (
    <div className="account-card">
      <div className="card-actions">
        <button
          type="button"
          className="icon-btn"
          onClick={() => setEditing(true)}
          aria-label="редактировать аккаунт"
          title="редактировать"
        >
          ✎
        </button>
        <button
          type="button"
          className="icon-btn danger"
          onClick={() => onDelete(account.id)}
          aria-label="удалить аккаунт"
          title="удалить"
        >
          ×
        </button>
      </div>

      <div className="card-email">{account.email}</div>

      <div className="trial-badge">
        <span className="trial-icon" aria-hidden="true">
          ♛
        </span>
        Trial
      </div>

      <div className="quota-row">
        <span className="quota-label">Дневная квота</span>
        <div className="quota-bar">
          <div
            className="quota-fill"
            style={{ width: `${account.dailyPercent}%` }}
          />
        </div>
        <span className="quota-pct">{account.dailyPercent}%</span>
        <span className="quota-time">{formatShort(account.dailyResetAt)}</span>
      </div>

      <div className="quota-row">
        <span className="quota-label">Недельная квота</span>
        <div className="quota-bar">
          <div
            className="quota-fill"
            style={{ width: `${account.weeklyPercent}%` }}
          />
        </div>
        <span className="quota-pct">{account.weeklyPercent}%</span>
        <span className="quota-time">{formatShort(account.weeklyResetAt)}</span>
      </div>

      <div className="card-footer">
        <span className="expiry">
          <span className="expiry-icon" aria-hidden="true">
            ⏱
          </span>
          Истекает: {formatLong(expiresAt)}
        </span>
        <span className="days-left">Осталось {remaining} дн.</span>
      </div>
    </div>
  );
}

type EditProps = {
  account: Account;
  onSave: (patch: AccountInput) => void;
  onCancel: () => void;
};

function AccountCardEdit({ account, onSave, onCancel }: EditProps) {
  const [email, setEmail] = useState(account.email);
  const [registered, setRegistered] = useState(
    isoToLocalInput(account.registeredAt)
  );
  const [dailyReset, setDailyReset] = useState(
    isoToLocalInput(account.dailyResetAt)
  );
  const [dailyPercent, setDailyPercent] = useState(String(account.dailyPercent));
  const [weeklyReset, setWeeklyReset] = useState(
    isoToLocalInput(account.weeklyResetAt)
  );
  const [weeklyPercent, setWeeklyPercent] = useState(
    String(account.weeklyPercent)
  );
  const [error, setError] = useState<string | null>(null);

  function clampPercent(raw: string): number | null {
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return Math.min(100, Math.max(0, Math.round(n)));
  }

  function handleSave() {
    setError(null);
    const trimmed = email.trim();
    if (!trimmed) return setError("Почта не может быть пустой");
    if (!registered) return setError("Укажите дату регистрации");
    if (!dailyReset) return setError("Укажите дневное обновление");
    if (!weeklyReset) return setError("Укажите недельное обновление");
    const dp = clampPercent(dailyPercent);
    const wp = clampPercent(weeklyPercent);
    if (dp === null || wp === null)
      return setError("Проценты должны быть числами 0–100");

    onSave({
      email: trimmed,
      registeredAt: localInputToIso(registered),
      dailyResetAt: localInputToIso(dailyReset),
      dailyPercent: dp,
      weeklyResetAt: localInputToIso(weeklyReset),
      weeklyPercent: wp,
    });
  }

  return (
    <div className="account-card editing">
      <div className="card-actions">
        <button
          type="button"
          className="icon-btn"
          onClick={handleSave}
          aria-label="сохранить"
          title="сохранить"
        >
          ✓
        </button>
        <button
          type="button"
          className="icon-btn danger"
          onClick={onCancel}
          aria-label="отмена"
          title="отмена"
        >
          ×
        </button>
      </div>

      <label className="edit-field">
        <span>почта</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>

      <label className="edit-field">
        <span>зарегистрирован</span>
        <input
          type="datetime-local"
          value={registered}
          onChange={(e) => setRegistered(e.target.value)}
        />
      </label>

      <label className="edit-field">
        <span>дневная квота обновится</span>
        <input
          type="datetime-local"
          value={dailyReset}
          onChange={(e) => setDailyReset(e.target.value)}
        />
      </label>

      <label className="edit-field">
        <span>дневной %</span>
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          value={dailyPercent}
          onChange={(e) => setDailyPercent(e.target.value)}
        />
      </label>

      <label className="edit-field">
        <span>недельная квота обновится</span>
        <input
          type="datetime-local"
          value={weeklyReset}
          onChange={(e) => setWeeklyReset(e.target.value)}
        />
      </label>

      <label className="edit-field">
        <span>недельный %</span>
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          value={weeklyPercent}
          onChange={(e) => setWeeklyPercent(e.target.value)}
        />
      </label>

      {error && <div className="form-error">{error}</div>}
    </div>
  );
}
