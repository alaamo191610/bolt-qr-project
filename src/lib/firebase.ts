// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, isSupported, type Analytics, logEvent } from "firebase/analytics";

const env = (k: string) =>
  (import.meta as any)?.env?.[k] ?? (process as any)?.env?.[k];

const firebaseConfig = {
  apiKey:             env("VITE_FIREBASE_API_KEY") || env("NEXT_PUBLIC_FIREBASE_API_KEY"),
  authDomain:         env("VITE_FIREBASE_AUTH_DOMAIN") || env("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
  projectId:          env("VITE_FIREBASE_PROJECT_ID") || env("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
  storageBucket:      env("VITE_FIREBASE_STORAGE_BUCKET") || env("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId:  env("VITE_FIREBASE_MESSAGING_SENDER_ID") || env("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
  appId:              env("VITE_FIREBASE_APP_ID") || env("NEXT_PUBLIC_FIREBASE_APP_ID"),
  measurementId:      env("VITE_FIREBASE_MEASUREMENT_ID") || env("NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID"),
};

// Singleton app
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Lazy analytics, guarded for SSR/unsupported browsers
let analyticsPromise: Promise<Analytics | null> | null = null;

export function getAnalyticsSafe() {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!analyticsPromise) {
    analyticsPromise = isSupported().then(s => (s ? getAnalytics(app) : null));
  }
  return analyticsPromise;
}

// ---- NEW: safe event logger + typed event helpers ----
async function safeLogEvent(
  eventName: string,
  params?: Record<string, unknown>
) {
  try {
    const analytics = await getAnalyticsSafe();
    if (!analytics) {
      if (process.env.NODE_ENV !== "production") {
        console.debug(`[analytics disabled] ${eventName}`, params || {});
      }
      return;
    }
    logEvent(analytics, eventName, params);
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      console.debug(`[analytics error] ${eventName}`, e);
    }
  }
}

type Lang = "en" | "ar";

export const trackMenuEvents = {
  languageChanged(prev: Lang, next: Lang) {
    return safeLogEvent("language_changed", { previous_language: prev, next_language: next });
  },
  menuViewed(tableCode: string, language: Lang) {
    return safeLogEvent("menu_viewed", { table_code: tableCode, language });
  },
  menuSearched(term: string, results: number) {
    return safeLogEvent("menu_searched", { term, results });
  },
  categoryFiltered(categoryId: string, categoryName?: string) {
    return safeLogEvent("category_filtered", { category_id: categoryId, category_name: categoryName });
  },
  itemAddedToCart(id: string, name?: string, price?: number, quantity = 1) {
    return safeLogEvent("add_to_cart", { id, name, price, quantity });
  },
  itemRemovedFromCart(id: string, name?: string, price?: number, quantity = 1) {
    return safeLogEvent("remove_from_cart", { id, name, price, quantity });
  },
  cartViewed(totalItems: number, totalPrice: number) {
    return safeLogEvent("cart_viewed", { total_items: totalItems, total_price: totalPrice });
  },
  orderStarted(tableCode: string, totalItems: number, totalPrice: number) {
    return safeLogEvent("order_started", { table_code: tableCode, total_items: totalItems, total_price: totalPrice });
  },
  itemCompareToggled(id: string, name?: string, selected?: boolean) {
    return safeLogEvent("compare_toggle", { id, name, selected });
  },
  
  orderCompleted(
    tableCode: string,
    items: Array<{ id: string; name?: string; price?: number; quantity?: number }>,
    totalPrice: number
  ) {
    return safeLogEvent("order_completed", {
      table_code: tableCode,
      total_price: totalPrice,
      items: items.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.quantity ?? 1 })),
    });
  },
  compareSheetViewed(ids: string[]) {
    return safeLogEvent("compare_sheet_viewed", { ids });
  },
};