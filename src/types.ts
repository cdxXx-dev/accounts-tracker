export type Account = {
  id: string;
  email: string;
  /** ISO datetime when the account was registered. Expiry = registeredAt + 14 days. */
  registeredAt: string;
  /**
   * ISO datetime of the last applied *daily* reset boundary (15:00 NSK).
   * Used to detect when a new boundary has been crossed and the percent
   * should be flipped back to 0.
   */
  dailyLastResetAt: string;
  /** Current daily quota percent (0–100). 100 = exhausted, 0 = fresh. */
  dailyPercent: number;
  /** ISO datetime of the last applied *weekly* reset boundary (Sunday 15:00 NSK). */
  weeklyLastResetAt: string;
  /** Current weekly quota percent (0–100). 100 = exhausted, 0 = fresh. */
  weeklyPercent: number;
  /** Bookkeeping: when the account record was created in this app. */
  createdAt: string;
};

/** Fields the user supplies via the form / edit panel. */
export type AccountInput = {
  email: string;
  registeredAt: string;
  dailyPercent: number;
  weeklyPercent: number;
};
