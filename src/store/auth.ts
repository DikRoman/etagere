"use client";

import { create } from "zustand";
import type { RecordModel } from "pocketbase";
import { ClientResponseError } from "pocketbase";
import {
  getPb,
  isPro,
  type SubscriptionRecord,
} from "@/lib/pb";

export class EmailNotVerifiedError extends Error {
  email: string;
  constructor(email: string) {
    super("EMAIL_NOT_VERIFIED");
    this.name = "EmailNotVerifiedError";
    this.email = email;
  }
}

interface AuthState {
  ready: boolean;
  user: RecordModel | null;
  subscription: SubscriptionRecord | null;
  error: string | null;
  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  loginWithOAuth: (provider: "vk" | "yandex" | "telegram") => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  resendVerification: (email: string) => Promise<void>;
  confirmVerification: (token: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  confirmPasswordReset: (
    token: string,
    password: string,
    passwordConfirm: string,
  ) => Promise<void>;
  logout: () => void;
  updateAvatar: (file: File) => Promise<void>;
  updateProfile: (data: { name: string }) => Promise<void>;
  changePassword: (data: {
    oldPassword: string;
    password: string;
    passwordConfirm: string;
  }) => Promise<void>;
  refreshSubscription: () => Promise<void>;
  startYookassaCheckout: () => Promise<void>;
  cancelYookassaRenew: () => Promise<void>;
  resumeYookassaRenew: () => Promise<void>;
  activateProStub: (opts?: { months?: number; trialDays?: number }) => Promise<void>;
  isLoggedIn: () => boolean;
  hasPro: () => boolean;
}

async function ensureFreeTrial(token: string): Promise<void> {
  try {
    await fetch("/api/billing/ensure-free", {
      method: "POST",
      headers: { Authorization: token },
    });
  } catch {
    /* ignore */
  }
}

function mapAuthError(e: unknown, fallback: string): string {
  if (e instanceof EmailNotVerifiedError) return "EMAIL_NOT_VERIFIED";
  if (e instanceof ClientResponseError) {
    const data = e.response?.data as
      | Record<string, { code?: string; message?: string } | string>
      | undefined;
    if (data?.email && typeof data.email === "object") {
      if (data.email.code === "validation_not_unique") return "EMAIL_TAKEN";
    }
    if (data?.password && typeof data.password === "object") {
      if (data.password.code === "validation_min_text_constraint") {
        return "PASSWORD_TOO_SHORT";
      }
    }
    const message = data?.message;
    if (typeof message === "string" && message) return message;
  }
  return e instanceof Error ? e.message : fallback;
}

let hydratePromise: Promise<void> | null = null;

async function refreshAuthSession(): Promise<void> {
  const pb = getPb();
  if (!pb.authStore.isValid) return;

  try {
    await pb.collection("users").authRefresh();
  } catch (e) {
    if (e instanceof ClientResponseError) {
      // PocketBase auto-cancels duplicate in-flight auth requests.
      if (e.isAbort) return;
      if (e.status === 401 || e.status === 403) {
        pb.authStore.clear();
      }
      return;
    }
    if (!pb.authStore.isValid) pb.authStore.clear();
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  ready: false,
  user: null,
  subscription: null,
  error: null,

  isLoggedIn: () => Boolean(get().user),
  hasPro: () => isPro(get().subscription),

  hydrate: async () => {
    if (hydratePromise) return hydratePromise;

    hydratePromise = (async () => {
      const pb = getPb();
      await refreshAuthSession();

      const user = pb.authStore.record;
      // Password sign-ups must verify email; OAuth (VK) users are trusted.
      if (user && !user.verified) {
        const providers = await pb
          .collection("users")
          .listExternalAuths(user.id)
          .catch(() => []);
        if (!providers.length) {
          pb.authStore.clear();
          set({ user: null, subscription: null, ready: true, error: null });
          return;
        }
      }

      const current = pb.authStore.record;
      set({ user: current ?? null, ready: true, error: null });
      if (current) await get().refreshSubscription();
      else set({ subscription: null });
    })();

    try {
      await hydratePromise;
    } finally {
      hydratePromise = null;
    }
  },

  login: async (email, password) => {
    const pb = getPb();
    const trimmed = email.trim();
    set({ error: null });
    try {
      await pb.collection("users").authWithPassword(trimmed, password);
      const user = pb.authStore.record;
      if (!user?.verified) {
        pb.authStore.clear();
        throw new EmailNotVerifiedError(trimmed);
      }
      set({ user });
      await ensureFreeTrial(pb.authStore.token);
      await get().refreshSubscription();
    } catch (e) {
      const msg = mapAuthError(e, "Login failed");
      set({ error: msg, user: null, subscription: null });
      throw e;
    }
  },

  loginWithOAuth: async (provider) => {
    set({ error: null });
    if (typeof window === "undefined") return;
    if (provider === "vk") {
      window.location.assign("/api/auth/vk/start");
      return;
    }
    if (provider === "yandex") {
      window.location.assign("/api/auth/yandex/start");
      return;
    }
    if (provider === "telegram") {
      window.location.assign("/api/auth/telegram/start");
      return;
    }
    set({ error: "OAUTH_UNAVAILABLE" });
    throw new Error("OAUTH_UNAVAILABLE");
  },

  register: async (email, password, name) => {
    const pb = getPb();
    const trimmed = email.trim();
    set({ error: null });
    try {
      await pb.collection("users").create({
        email: trimmed,
        password,
        passwordConfirm: password,
        name: name?.trim() || trimmed.split("@")[0],
      });

      const res = await fetch("/api/auth/send-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Could not send verification email");
      }

      pb.authStore.clear();
    } catch (e) {
      const msg = mapAuthError(e, "Register failed");
      set({ error: msg });
      throw e;
    }
  },

  resendVerification: async (email) => {
    const res = await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || "Could not resend email");
    }
  },

  confirmVerification: async (token) => {
    const res = await fetch("/api/auth/confirm-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || "Invalid token");
    }
  },

  requestPasswordReset: async (email) => {
    const res = await fetch("/api/auth/request-password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || "Could not send email");
    }
  },

  confirmPasswordReset: async (token, password, passwordConfirm) => {
    const res = await fetch("/api/auth/confirm-password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password, passwordConfirm }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || "Could not reset password");
    }
  },

  logout: () => {
    getPb().authStore.clear();
    set({ user: null, subscription: null, error: null });
  },

  updateAvatar: async (file) => {
    const pb = getPb();
    const user = get().user;
    if (!user) throw new Error("Not logged in");
    const token = pb.authStore.token;
    if (!token) throw new Error("Not logged in");

    const form = new FormData();
    form.append("avatar", file, file.name || "avatar.jpg");
    const res = await fetch("/api/account/avatar", {
      method: "POST",
      headers: { Authorization: token },
      body: form,
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
      avatar?: string;
      id?: string;
    };
    if (!res.ok) {
      throw new Error(data.error || "Не удалось загрузить фото");
    }
    pb.authStore.save(token, data as RecordModel);
    set({ user: data as RecordModel });
  },

  updateProfile: async ({ name }) => {
    const pb = getPb();
    const user = get().user;
    if (!user) throw new Error("Not logged in");
    const updated = await pb.collection("users").update(user.id, {
      name: name.trim(),
    });
    set({ user: updated });
  },

  changePassword: async ({ oldPassword, password, passwordConfirm }) => {
    const pb = getPb();
    const user = get().user;
    if (!user) throw new Error("Not logged in");
    if (password !== passwordConfirm) {
      throw new Error("PASSWORDS_MISMATCH");
    }
    const updated = await pb.collection("users").update(user.id, {
      oldPassword,
      password,
      passwordConfirm,
    });
    set({ user: updated });
  },

  refreshSubscription: async () => {
    const pb = getPb();
    const user = pb.authStore.record;
    if (!user) {
      set({ subscription: null });
      return;
    }
    try {
      const list = await pb.collection("subscriptions").getList(1, 1, {
        filter: `user = "${user.id}"`,
      });
      const sub = (list.items[0] as unknown as SubscriptionRecord) ?? null;
      set({ subscription: sub });
    } catch {
      set({ subscription: null });
    }
  },

  activateProStub: async (opts = {}) => {
    const pb = getPb();
    const user = pb.authStore.record;
    if (!user) throw new Error("Not logged in");

    const existing = get().subscription;
    const res = await fetch("/api/billing/activate-stub", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: pb.authStore.token,
      },
      body: JSON.stringify({
        months: opts.months ?? (opts.trialDays ? undefined : 1),
        trialDays: opts.trialDays,
        subscriptionId: existing?.id,
      }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || "Failed to activate Pro");
    }
    await get().refreshSubscription();
  },

  startYookassaCheckout: async () => {
    const pb = getPb();
    if (!pb.authStore.record) throw new Error("Not logged in");
    const res = await fetch("/api/billing/yookassa/checkout", {
      method: "POST",
      headers: { Authorization: pb.authStore.token },
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      confirmation_url?: string;
      already?: boolean;
    };
    if (!res.ok) throw new Error(data.error || "Checkout failed");
    if (data.already) {
      await get().refreshSubscription();
      return;
    }
    if (!data.confirmation_url) throw new Error("No payment URL");
    window.location.assign(data.confirmation_url);
  },

  cancelYookassaRenew: async () => {
    const pb = getPb();
    if (!pb.authStore.record) throw new Error("Not logged in");
    const res = await fetch("/api/billing/yookassa/cancel", {
      method: "POST",
      headers: { Authorization: pb.authStore.token },
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(data.error || "Cancel failed");
    await get().refreshSubscription();
  },

  resumeYookassaRenew: async () => {
    const pb = getPb();
    if (!pb.authStore.record) throw new Error("Not logged in");
    const res = await fetch("/api/billing/yookassa/resume", {
      method: "POST",
      headers: { Authorization: pb.authStore.token },
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(data.error || "Resume failed");
    await get().refreshSubscription();
  },
}));
