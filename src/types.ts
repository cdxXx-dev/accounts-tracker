export type Account = {
  id: string;
  email: string;
  /** ISO datetime when the account was registered. Expiry = registeredAt + 14 days. */
  registeredAt: string;
  /** ISO datetime when the daily quota next refreshes to 100%. */
  dailyResetAt: string;
  /** Current daily quota percent (0–100). */
  dailyPercent: number;
  /** ISO datetime when the weekly quota next refreshes to 100%. */
  weeklyResetAt: string;
  /** Current weekly quota percent (0–100). */
  weeklyPercent: number;
  /** Bookkeeping: when the account record was created in this app. */
  createdAt: string;
};

/** Fields the user supplies via the form / edit panel. */
export type AccountInput = Omit<Account, "id" | "createdAt">;
