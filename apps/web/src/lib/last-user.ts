const LAST_USER_KEY = "pantry-last-user";
export const readLastUser = (): string | null => {
  try {
    return localStorage.getItem(LAST_USER_KEY);
  } catch {
    return null;
  }
};

export const rememberLastUser = (userId: string): void => {
  try {
    localStorage.setItem(LAST_USER_KEY, userId);
  } catch {
    /* storage unavailable */
  }
};

export const forgetLastUser = (): void => {
  try {
    localStorage.removeItem(LAST_USER_KEY);
  } catch {
    /* storage unavailable */
  }
};
