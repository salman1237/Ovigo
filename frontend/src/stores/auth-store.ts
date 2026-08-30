import { create } from "zustand";
import { persist } from "zustand/middleware";

import { AUTH_TOKEN_STORAGE_KEY } from "@/lib/constants";
import type { TokenPair, User } from "@/types/user";

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  setSession: (tokens: TokenPair) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setSession: (tokens) =>
        set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          user: tokens.user,
        }),
      clearSession: () => set({ accessToken: null, refreshToken: null, user: null }),
    }),
    { name: AUTH_TOKEN_STORAGE_KEY }
  )
);
