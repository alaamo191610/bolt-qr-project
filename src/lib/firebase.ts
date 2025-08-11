// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics, Analytics } from "firebase/analytics";
import { logEvent } from "firebase/analytics";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyATfSEs1COkGl938-46OWaf9EOR3Hc3ELA",
  authDomain: "qr-code-af651.firebaseapp.com",
  projectId: "qr-code-af651",
  storageBucket: "qr-code-af651.firebasestorage.app",
  messagingSenderId: "100095134739",
  appId: "1:100095134739:web:b87b80747d3c99477c83e6",
  measurementId: "G-G42GQGTELR"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Analytics (only in browser environment)
let analytics: Analytics | null = null;
if (typeof window !== 'undefined') {
  analytics = getAnalytics(app);
}

// Analytics helper functions
export const trackEvent = (eventName: string, parameters?: Record<string, any>) => {
  if (analytics) {
    logEvent(analytics, eventName, parameters);
  }
};

// Customer Menu specific tracking events
export const trackMenuEvents = {
  // Page views
  menuViewed: (tableNumber: string, language: string) => {
    trackEvent('menu_viewed', {
      table_number: tableNumber,
      language: language,
      timestamp: new Date().toISOString()
    });
  },

  // Item interactions
  itemViewed: (itemId: string, itemName: string, category: string) => {
    trackEvent('menu_item_viewed', {
      item_id: itemId,
      item_name: itemName,
      category: category
    });
  },

  itemAddedToCart: (itemId: string, itemName: string, price: number, quantity: number) => {
    trackEvent('add_to_cart', {
      currency: 'QAR',
      value: price * quantity,
      items: [{
        item_id: itemId,
        item_name: itemName,
        price: price,
        quantity: quantity
      }]
    });
  },

  itemRemovedFromCart: (itemId: string, itemName: string, price: number, quantityRemoved: number) => {
    trackEvent('remove_from_cart', {
      currency: 'QAR',
      value: price * quantityRemoved,
      items: [{
        item_id: itemId,
        item_name: itemName,
        price: price,
        quantity: quantityRemoved
      }]
    });
  },

  // Cart interactions
  cartViewed: (itemCount: number, totalValue: number) => {
    trackEvent('view_cart', {
      currency: 'QAR',
      value: totalValue,
      item_count: itemCount
    });
  },

  // Order process
  orderStarted: (tableNumber: string, itemCount: number, totalValue: number) => {
    trackEvent('begin_checkout', {
      currency: 'QAR',
      value: totalValue,
      table_number: tableNumber,
      item_count: itemCount
    });
  },

  orderCompleted: (tableNumber: string, orderItems: any[], totalValue: number) => {
    trackEvent('purchase', {
      transaction_id: `${tableNumber}_${Date.now()}`,
      currency: 'QAR',
      value: totalValue,
      table_number: tableNumber,
      items: orderItems.map(item => ({
        item_id: item.id,
        item_name: item.name_en || item.name,
        price: item.price,
        quantity: item.quantity
      }))
    });
  },

  // Search and filtering
  menuSearched: (searchTerm: string, resultsCount: number) => {
    trackEvent('search', {
      search_term: searchTerm,
      results_count: resultsCount
    });
  },

  categoryFiltered: (categoryId: string, categoryName: string) => {
    trackEvent('category_filtered', {
      category_id: categoryId,
      category_name: categoryName
    });
  },

  // Language switching
  languageChanged: (fromLanguage: string, toLanguage: string) => {
    trackEvent('language_changed', {
      from_language: fromLanguage,
      to_language: toLanguage
    });
  },

  // Compare feature
  itemCompareToggled: (itemId: string, itemName: string, isSelected: boolean) => {
    trackEvent('compare_item_toggled', {
      item_id: itemId,
      item_name: itemName,
      is_selected: isSelected
    });
  },

  compareSheetViewed: (itemIds: string[]) => {
    trackEvent('compare_sheet_viewed', {
      item_ids: itemIds,
      item_count: itemIds.length
    });
  },

  // Customization
  itemCustomized: (itemId: string, itemName: string, customizations: any) => {
    trackEvent('item_customized', {
      item_id: itemId,
      item_name: itemName,
      customization_count: Object.keys(customizations).length
    });
  }
};

export { analytics };
export default app;