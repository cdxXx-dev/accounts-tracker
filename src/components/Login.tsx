import { useState, type FormEvent } from "react";
import { checkAuth, UnauthorizedError } from "../api";
import { saveToken } from "../auth";

type Props = {
  onAuthenticated: () => void;
};

export function Login({ onAuthenticated }: Props) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = token.trim();
    if (!trimmed) {
      setError("Введите токен");
      return;
    }
    setBusy(true);
    try {
      await checkAuth(trimmed);
      saveToken(trimmed);
      onAuthenticated();
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        setError("Неверный токен");
      } else {
        setError((err as Error).message || "Не удалось проверить токен");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1 className="login-title">accounts-tracker</h1>
        <p className="login-subtitle">введите токен доступа</p>
        <input
          type="password"
          className="login-input"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="API token"
          autoComplete="off"
          autoFocus
        />
        <button type="submit" className="add-btn login-btn" disabled={busy}>
          {busy ? "проверяю…" : "войти"}
        </button>
        {error && <div className="form-error">{error}</div>}
      </form>
    </div>
  );
}
