import { useState, type FormEvent } from "react";
import { localInputToIso } from "../utils";
import type { AccountInput } from "../types";

type Props = {
  onAdd: (account: AccountInput) => void;
};

const initialState = {
  email: "",
  registered: "",
  dailyReset: "",
  dailyPercent: "100",
  weeklyReset: "",
  weeklyPercent: "100",
};

function parsePercent(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function AccountForm({ onAdd }: Props) {
  const [state, setState] = useState(initialState);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof typeof state>(key: K, value: string) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const email = state.email.trim();
    if (!email) return setError("Введите почту");
    if (!state.registered) return setError("Укажите дату регистрации");
    if (!state.dailyReset) return setError("Укажите время обновления дневной квоты");
    if (!state.weeklyReset) return setError("Укажите время обновления недельной квоты");

    const dailyPercent = parsePercent(state.dailyPercent);
    const weeklyPercent = parsePercent(state.weeklyPercent);
    if (dailyPercent === null) return setError("Дневной % должен быть числом 0–100");
    if (weeklyPercent === null) return setError("Недельный % должен быть числом 0–100");

    onAdd({
      email,
      registeredAt: localInputToIso(state.registered),
      dailyResetAt: localInputToIso(state.dailyReset),
      dailyPercent,
      weeklyResetAt: localInputToIso(state.weeklyReset),
      weeklyPercent,
    });

    setState(initialState);
  }

  return (
    <form className="account-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label className="field">
          <span className="field-label">почта</span>
          <input
            type="email"
            value={state.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="user@example.com"
            autoComplete="off"
          />
        </label>

        <label className="field">
          <span className="field-label">зарегистрирован</span>
          <input
            type="datetime-local"
            value={state.registered}
            onChange={(e) => update("registered", e.target.value)}
          />
        </label>
      </div>

      <div className="form-row">
        <label className="field">
          <span className="field-label">дневная квота</span>
          <input
            type="datetime-local"
            value={state.dailyReset}
            onChange={(e) => update("dailyReset", e.target.value)}
          />
        </label>

        <label className="field field-narrow">
          <span className="field-label">дневной %</span>
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={state.dailyPercent}
            onChange={(e) => update("dailyPercent", e.target.value)}
          />
        </label>

        <label className="field">
          <span className="field-label">недельная квота</span>
          <input
            type="datetime-local"
            value={state.weeklyReset}
            onChange={(e) => update("weeklyReset", e.target.value)}
          />
        </label>

        <label className="field field-narrow">
          <span className="field-label">недельный %</span>
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={state.weeklyPercent}
            onChange={(e) => update("weeklyPercent", e.target.value)}
          />
        </label>
      </div>

      <div className="form-actions">
        <button type="submit" className="add-btn">
          добавить
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}
    </form>
  );
}
