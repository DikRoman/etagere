"use client";

import { create } from "zustand";
import type { RecordModel } from "pocketbase";
import {
  getPb,
  isPro,
  type SubscriptionRecord,
} from "@/lib/pb";

interface AuthState {
  ready: boolean;
  user: RecordModel | null;
  subscription: SubscriptionRecord | null;
  error: string | null;
  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
  refreshSubscription: () => Promise<void>;
  /** Dev / stub: mark as Pro without payment */
  activateProStub: (months?: number) => Promise<void>;
  isLoggedIn: () => boolean;
  hasPro: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  ready: false,
  user: null,
  subscription: null,
  error: null,

  isLoggedIn: () => Boolean(get().user),
  hasPro: () => isPro(get().subscription),

  hydrate: async () => {
    const pb = getPb();
    try {
      if (pb.authStore.isValid) {
        await pb.collection("users").authRefresh();
      }
    } catch {
      pb.authStore.clear();
    }
    const user = pb.authStore.record;
    set({ user: user ?? null, ready: true, error: null });
    if (user) await get().refreshSubscription();
    else set({ subscription: null });
  },

  login: async (email, password) => {
    const pb = getPb();
    set({ error: null });
    try {
      await pb.collection("users").authWithPassword(email.trim(), password);
      set({ user: pb.authStore.record });
      await get().refreshSubscription();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Login failed";
      set({ error: msg, user: null, subscription: null });
      throw e;
    }
  },

  register: async (email, password, name) => {
    const pb = getPb();
    set({ error: null });
    try {
      const user = await pb.collection("users").create({
        email: email.trim(),
        password,
        passwordConfirm: password,
        name: name?.trim() || email.split("@")[0],
      });
      void user;
      await pb.collection("users").authWithPassword(email.trim(), password);

      try {
        await fetch("/api/billing/ensure-free", {
          method: "POST",
          headers: { Authorization: pb.authStore.token },
        });
      } catch {
        /* ignore */
      }

      set({ user: pb.authStore.record });
      await get().refreshSubscription();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Register failed";
      set({ error: msg });
      throw e;
    }
  },

  logout: () => {
    getPb().authStore.clear();
    set({ user: null, subscription: null, error: null });
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
        sort: "-created",
      });
      const sub = (list.items[0] as unknown as SubscriptionRecord) ?? null;
      set({ subscription: sub });
    } catch {
      set({ subscription: null });
    }
  },

  activateProStub: async (months = 1) => {
    const pb = getPb();
    const user = pb.authStore.record;
    if (!user) throw new Error("Not logged in");

    const expires = new Date();
    expires.setMonth(expires.getMonth() + months);

    const existing = get().subscription;
    // Client cannot update empty updateRule — use Next API with admin token later.
    // For now call /api/billing/activate-stub
    const res = await fetch("/api/billing/activate-stub", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: pb.authStore.token,
      },
      body: JSON.stringify({
        months,
        subscriptionId: existing?.id,
      }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error || "Failed to activate Pro");
    }
    await get().refreshSubscription();
    void expires;
  },
}));
