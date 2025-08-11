import React, { createContext, useContext, useState, useEffect } from 'react';
import { trackMenuEvents } from '../lib/firebase';

export type Language = 'en' | 'ar';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string>) => string;
  isRTL: boolean;
  isLoaded: boolean;
  getLocalizedDayName: (date: Date, format?: 'short' | 'long') => string;
}


const LanguageContext = createContext<LanguageContextType | undefined>(undefined);
// Translation keys and values
const translations: Record<Language, any> = {
  en: {
    common: {
      loading: "Loading...",
      error: "Error",
      success: "Success",
      cancel: "Cancel",
      save: "Save",
      delete: "Delete",
      edit: "Edit",
      add: "Add",
      search: "Search",
      filter: "Filter",
      total: "Total",
      status: "Status",
      actions: "Actions",
      name: "Name",
      price: "Price",
      category: "Category",
      description: "Description",
      image: "Image",
      back: "Back",
      next: "Next",
      previous: "Previous",
      close: "Close",
      confirm: "Confirm",
      yes: "Yes",
      no: "No",
      table: "Table",
      nameEn: "Item name in English",
      nameAr: "اسم الصنف بالعربية",
      selectCategory: "Select Category",
      allCategories: "All Categories",
      addCategory: "Add Category",
      addIngredient: "Add Ingredient",
      updateItem: "Update Item",
      deleteItem: "Delete Item",
      deleteSelected: "Delete Selected",
      deleteItemConfirm: "Are you sure you want to delete this item? This action cannot be undone.",
      deleteSelectedConfirm: "Are you sure you want to delete {count} selected items? This action cannot be undone.",
      selectAll: "Select All",
      itemsSelected: "items selected",
      noItems: "No Menu Items",
      noItemsDescription: "Start building your menu by adding your first item.",
      addFirstItem: "Add Your First Item",
      noCategory: "No Category",
      available: "Available",
      unavailable: "Unavailable",
      ingredients: "Ingredients",
      addItem: "Add Item",
      adding: "Adding...",
      saving: "Saving...",
      deleting: 'Deleting...',
      fillAllFields: 'Please fill all required fields',
      added: 'Item added successfully',
      updated: 'Item updated successfully',
      errorOccurred: 'Something went wrong',
      deleted: 'Item deleted successfully',
      deletedSelected: '{count} items deleted successfully',
      uploading: 'Uploading...',
      remove: 'Remove Image',
      uploaded: 'Uploaded',
      placeholder: 'Click or drag image to upload',
      required: 'This field is required.',
      timestamp: 'Timestamp',
      dateRange: 'Date Range',
      ingredientsShow: "Show ingredients",
      ingredientsHide: "Hide ingredients",
      goesWellWith: "Goes well with",
      decrease: "Decrease",
      increase: "Increase",
      sort: "Sort",
      clear: "Clear",
    },
    cart: {
      viewOrder: "View order",
      items: "items",
      miniCartAria: "Mini cart",
      estimated: "Estimated",
      min: "min"
    },
    badges: {
      spicy: "Spicy",
      garlicky: "Garlicky",
      cheesy: "Cheesy",
      fresh: "Fresh",
      vegFriendly: "Veg-friendly"
    },
    pairings: {
      garlicSauce: "Garlic sauce",
      salad: "Salad",
      drink: "Drink",
      cola: "Cola",
      fries: "Fries",
      extraCheese: "Extra cheese",
      sideSalad: "Side salad",
      bread: "Bread",
      juice: "Juice"
    },
    auth: {
      welcome: "Welcome Back",
      createAccount: "Create Account",
      signIn: "Sign In",
      signUp: "Sign Up",
      signOut: "Sign Out",
      email: "Email Address",
      password: "Password",
      emailPlaceholder: "admin@restaurant.com",
      passwordPlaceholder: "••••••••",
      signInDescription: "Sign in to your restaurant dashboard",
      signUpDescription: "Set up your restaurant account",
      alreadyHaveAccount: "Already have an account? Sign in",
      dontHaveAccount: "Don't have an account? Sign up"
    },
    nav: {
      qrCodes: "QR Codes",
      digitalMenu: "Digital Menu",
      orders: "Orders",
      tables: "Tables",
      analytics: "Analytics",
      admin: "Admin",
      settings: "Settings"
    },
    qr: {
      title: "QR Code Generator",
      description: "Generate QR codes for table access to digital menu",
      qrSize: "QR Code Size",
      table: "Table",
      capacity: "Capacity",
      guests: "guests",
      menuUrl: "Menu URL",
      download: "Download",
      preview: "Preview Menu",
      copyUrl: "Copy URL",
      instructions: {
        title: "How to Use QR Codes",
        1: "Print the QR codes and place them on respective tables",
        2: "Customers scan the QR code with their phone camera",
        3: "They'll be directed to your digital menu for that specific table",
        4: "Orders are automatically associated with the correct table",
        5: "Download high-resolution QR codes for professional printing"
      }
    },
    menu: {
      title: "Digital Menu",
      subtitle: "Scan, Browse, Order",
      cart: "Cart",
      searchPlaceholder: "Search menu items...",
      all: "All",
      addToCart: "Add to Cart",
      yourOrder: "Your Order",
      cartEmpty: "Your cart is empty",
      placeOrder: "Place Order",
      orderPlaced: "Order Placed!",
      orderPlacedDescription: "Your order has been sent to the kitchen. We'll bring it to Table {table} shortly.",
      estimatedTime: "Estimated time: 15-20 minutes",
      noItemsFound: "No items found",
      noItemsDescription: "Try adjusting your search or filter criteria.",
      orders: "orders",
      each: "each",
      estimated: "Estimated",
      min: "min",
      priceLowHigh: "Price: Low → High",
      priceHighLow: "Price: High → Low",
      other: "Other",
      compare: "Compare",
      compareLimit: "You can compare up to 2 items",
      highlightDifferences: "Highlight differences",
      swapSides: "Swap sides",
      comparing: "Comparing",
      compareCount: "Selected to compare:",
      onlyDifferences: "Only differences",
      addBoth: "Add both",
      compareTagline: "Spot the differences and pick your favorite."
    },
    orders: {
      title: "Order Management",
      description: "Track and manage all incoming orders",
      pending: "Pending",
      preparing: "Preparing",
      ready: "Ready",
      served: "Served",
      totalSales: "Total Sales",
      orderNumber: "Order #",
      table: "Table",
      items: "Items",
      markAs: "Mark as",
      noOrders: "No Orders Yet",
      noOrdersDescription: "Orders will appear here when customers place them through the QR menu.",
      ago: "ago",
      justNow: "Just now",
    },
    tables: {
      title: "Table Management",
      description: "Manage restaurant tables and their status",
      addTable: "Add Table",
      available: "Available",
      occupied: "Occupied",
      reserved: "Reserved",
      cleaning: "Cleaning",
      totalCapacity: "Total Capacity",
      tableCode: "Table Code",
      seatingCapacity: "Seating Capacity",
      addNewTable: "Add New Table",
      tableCodePlaceholder: "e.g., T05, A1, VIP1",
      seats: "Seats",
      qrCodeAccess: "QR Code for Menu Access"
    },
    analytics: {
      title: "Analytics Dashboard",
      subtitle: "Track performance and insights",
      description: "Track performance and insights",
      totalRevenue: "Total Revenue",
      totalOrders: "Total Orders",
      avgOrderValue: "Avg Order Value",
      ordersServed: "Orders Served",
      popularItems: "Popular Items",
      mostActiveTables: "Most Active Tables",
      orders: "orders",
      revenueByStatus: "Revenue by Order Status",
      weekTrend: "7-Day Order Trend",
      topRevenueTables: 'Top Tables by Revenue',
      topRevenueItems: 'Top Items by Revenue',
      statusDistribution: 'Order Status Distribution',
      status: {
        pending: 'Pending',
        preparing: 'Preparing',
        served: 'Served',
        cancelled: 'Cancelled',
      },
      weeklyTrendChart: 'Weekly Revenue & Orders',
      revenue: 'Revenue',
      exportPDF: 'Export as PDF',
      pdfTitle: 'Analytics Summary',
      pdfTotalRevenue: 'Total Revenue',
      orderTitle: 'Order Summary',
      tableSubtotal: 'Table Subtotal',
      groupedByTable: 'Orders by Table',
    },
    admin: {
      title: "Admin Panel",
      subtitle: "Manage menu items and restaurant settings",
      tabs: {
        menu: "Menu Management",
        settings: "Restaurant Settings"
      },
      description: "Manage menu items and restaurant settings",
      menuManagement: "Menu Management",
      restaurantSettings: "Restaurant Settings",
      addMenuItem: "Add Menu Item",
      restaurantName: "Restaurant Name",
      contactPhone: "Contact Phone",
      address: "Address",
      restaurantDescription: "Description",
      saveSettings: "Save Settings",
      editItem: "Edit Menu Item",
      saveChanges: "Save Changes",
      adding: "Adding...",
      saving: "Saving..."
    },
    theme: {
      title: "Theme Customizer",
      description: "Personalize your restaurant's appearance",
      darkMode: "Dark Mode",
      darkModeDescription: "Toggle between light and dark themes",
      colorPresets: "Color Presets",
      customColors: "Custom Colors",
      primary: "Primary",
      secondary: "Secondary",
      accent: "Accent",
      background: "Background",
      surface: "Surface",
      text: "Text",
      textSecondary: "Text Secondary",
      preview: "Preview",
      primaryButton: "Primary Button",
      secondaryButton: "Secondary Button",
      accentButton: "Accent Button",
      resetToDefault: "Reset to Default",
      applyChanges: "Apply Changes"
    },
    restaurant: {
      name: "AlaaaaXyzn",
      phone: "(555) 123-4567",
      defaultDescription: "Fine dining experience with fresh, locally sourced ingredients and exceptional service."
    },
    status: {
      errorLoadingMenu: "Error Loading Menu",
      tableNotFound: "Table \"{table}\" not found. Please check the QR code or contact staff.",
      noMenuItems: "No menu items available at this time.",
      failedToLoadMenu: "Failed to load menu items",
      tryAgain: "Try Again",
      failedToPlaceOrder: "Failed to place order",
      placingOrder: "Placing Order..."
    },
    language: {
      english: "English",
      arabic: "العربية",
      switchTo: "Switch to"
    }
  },
  ar: {
    common: {
      loading: "نجهّز لك كل شي…",
      error: "صار خطأ",
      success: "تمّ بنجاح",
      cancel: "إلغاء",
      save: "حفظ",
      delete: "حذف",
      edit: "تعديل",
      add: "إضافة",
      search: "بحث",
      filter: "تصفية",
      total: "الإجمالي",
      status: "الحالة",
      actions: "خيارات",
      name: "الاسم",
      price: "السعر",
      category: "الفئة",
      description: "الوصف",
      image: "الصورة",
      back: "رجوع",
      next: "التالي",
      previous: "السابق",
      close: "إغلاق",
      confirm: "تأكيد",
      yes: "نعم",
      no: "لا",
      table: "طاولة",
      nameEn: "الاسم بالإنجليزية",
      nameAr: "اسم الصنف بالعربية",
      selectCategory: "اختر الفئة",
      allCategories: "جميع الفئات",
      addCategory: "إضافة فئة",
      addIngredient: "إضافة مكوّن",
      updateItem: "تحديث الصنف",
      deleteItem: "حذف الصنف",
      deleteSelected: "حذف المحدد",
      deleteItemConfirm: "متأكد بدك تحذف هذا الصنف؟ ما في رجعة.",
      deleteSelectedConfirm: "متأكد بدك تحذف {count} صنف؟ ما في رجعة.",
      selectAll: "تحديد الكل",
      itemsSelected: "عنصر محدد",
      noItems: "لا توجد عناصر",
      noItemsDescription: "بلّش بإضافة أول صنف، والباقي سهل.",
      addFirstItem: "أضف أول صنف",
      noCategory: "بدون فئة",
      available: "متاح",
      unavailable: "غير متاح",
      ingredients: "المكوّنات",
      addItem: "صنف جديد",
      adding: "جارٍ الإضافة…",
      saving: "جارٍ الحفظ…",
      deleting: "جارٍ الحذف…",
      fillAllFields: "يرجى تعبئة كل الحقول المطلوبة",
      added: "تمت إضافة الصنف بنجاح",
      updated: "تم تحديث الصنف بنجاح",
      errorOccurred: "صار خطأ ما",
      deleted: "تم حذف الصنف بنجاح",
      deletedSelected: "تم حذف {count} صنفًا",
      uploading: "جارٍ الرفع…",
      remove: "إزالة الصورة",
      uploaded: "تم الرفع",
      placeholder: "انقر أو اسحب صورة لإضافتها",
      required: "هاي الخانة مطلوبة.",
      timestamp: "الوقت",
      dateRange: "الفترة الزمنية",
      ingredientsShow: "عرض المكوّنات",
      ingredientsHide: "إخفاء المكوّنات",
      goesWellWith: "بيلبق مع",
      decrease: "نقّص",
      increase: "زيد",
      sort: "ترتيب",
      clear: "مسح"
    },
    badges: {
      spicy: "حرّ",
      garlicky: "طعمة ثوم",
      cheesy: "جبني",
      fresh: "طازج ومنعِّش",
      vegFriendly: "بناسب النباتيين",
    },
    pairings: {
      garlicSauce: "صلصة ثوم",
      salad: "سلطة",
      drink: "مشروب بارد",
      cola: "كولا",
      fries: "بطاطا مقلية",
      extraCheese: "جبنة زيادة",
      sideSalad: "سلطة جانبية",
      bread: "خبز طازج",
      juice: "عصير طبيعي",
    },    
    auth: {
      welcome: "أهلًا برجعتك",
      createAccount: "إنشاء حساب جديد",
      signIn: "تسجيل الدخول",
      signUp: "إنشاء حساب",
      signOut: "تسجيل الخروج",
      email: "البريد الإلكتروني",
      password: "كلمة المرور",
      emailPlaceholder: "admin@restaurant.com",
      passwordPlaceholder: "••••••••",
      signInDescription: "ادخل على لوحة إدارة مطعمك",
      signUpDescription: "بلّش مشوارك بخطوات بسيطة",
      alreadyHaveAccount: "إلك حساب؟ سجّل الدخول",
      dontHaveAccount: "ما عندك حساب؟ أنشئ واحد"
    },
    cart: {
      viewOrder: "شوف الطلب",
      items: "أصناف",
      miniCartAria: "سلة مصغّرة",
      estimated: "تقريبًا",
      min: "دقيقة",
    },
    nav: {
      qrCodes: "رموز QR",
      digitalMenu: "القائمة",
      orders: "الطلبات",
      tables: "الطاولات",
      analytics: "التحليلات",
      admin: "الإدارة",
      settings: "الإعدادات"
    },
    qr: {
      title: "إنشاء رمز QR",
      description: "اربط الطاولات بقائمتك الذكية بثواني — امسح، تفتح القائمة، واطلب.",
      qrSize: "حجم الرمز",
      table: "رقم الطاولة",
      capacity: "السعة",
      guests: "ضيوف",
      menuUrl: "رابط القائمة",
      download: "تحميل",
      preview: "معاينة القائمة",
      copyUrl: "نسخ الرابط",
      instructions: {
        title: "طريقة الاستخدام",
        1: "اطبع الرموز وحُطّ كل واحد على طاولته.",
        2: "الزبون بمسح الرمز بكاميرا موبايله.",
        3: "بينتقل مباشرة على القائمة الرقمية.",
        4: "كل طلب بينربط تلقائيًا بالطاولة الصح.",
        5: "نزّل نسخ عالية الدقة للطباعة الاحترافية."
      }
    },
    menu: {
      title: "القائمة الرقمية",
      subtitle: "امسح. تصفّح. اطلب.",
      cart: "السلة",
      searchPlaceholder: "شو نفسك فيه؟ فتّش هون…",
      all: "الكل",
      addToCart: "عالسلّة ✨",
      yourOrder: "طلبك هَلّأ",
      cartEmpty: "سلتك فاضية… بدّك نعبّيها؟",
      placeOrder: "يلا نطلب",
      orderPlaced: "تم الطلب 🎉",
      orderPlacedDescription: "طاولة {table}: المطبخ بلّش يشتغل.",
      estimatedTime: "حوالي ١٥–٢٠ دقيقة — على رواق.",
      noItemsFound: "لا توجد نتائج",
      noItemsDescription: "غيّر الكلمة… بتتغيّر النتائج.",
      orders: "الطلبات",
      each: "للوحدة",
      estimated: "الوقت المتوقع",
      min: "دقيقة",
      priceLowHigh: "السعر: من الأقل إلى الأعلى",
      priceHighLow: "السعر: من الأعلى إلى الأقل",
      other: "أخرى",
      compare: "مقارنة",
      compareLimit: "مسموح تقارن عنصرين بس 😉",
      highlightDifferences: "بيّن الفروقات",
      swapSides: "بدّل الجانبين",
      comparing: "نقارن لك…",
      compareCount: "عناصر المقارنة:",
      onlyDifferences: "الفروقات فقط",
      addBoth: "الاثنين أحلى",
      compareTagline: "قارن بهدوء… وخذ اللي قلبك مال له."
    },
    orders: {
      title: "إدارة الطلبات",
      description: "تابع الطلبات لحظة بلحظة",
      pending: "قيد الانتظار",
      preparing: "يتم التحضير",
      ready: "جاهز",
      served: "تم التقديم",
      totalSales: "إجمالي المبيعات",
      orderNumber: "رقم الطلب",
      table: "طاولة",
      items: "العناصر",
      markAs: "تحديد كـ",
      noOrders: "لا توجد طلبات حاليًا",
      noOrdersDescription: "ستظهر هنا الطلبات عند استقبالها عبر القائمة الرقمية.",
      ago: "منذ",
      justNow: "الآن"
    },
    tables: {
      title: "إدارة الطاولات",
      description: "رتّب حالة كل طاولة على السريع، ومن مكان واحد.",
      addTable: "أضف طاولة",
      available: "متاحة",
      occupied: "مشغولة",
      reserved: "محجوزة",
      cleaning: "قيد التنظيف",
      totalCapacity: "السعة الكليّة",
      tableCode: "رمز الطاولة",
      seatingCapacity: "عدد المقاعد",
      addNewTable: "طاولة جديدة",
      tableCodePlaceholder: "مثال: T01 أو A5 أو VIP1",
      seats: "مقاعد",
      qrCodeAccess: "رمز QR للوصول إلى القائمة"
    },
    admin: {
      title: "لوحة الإدارة",
      subtitle: "إدارة عناصر القائمة وإعدادات المطعم",
      tabs: {
        menu: "إدارة القائمة",
        settings: "إعدادات المطعم"
      },
      description: "إدارة القائمة والإعدادات بسهولة",
      menuManagement: "إدارة القائمة",
      restaurantSettings: "إعدادات المطعم",
      addMenuItem: "إضافة عنصر جديد",
      restaurantName: "اسم المطعم",
      contactPhone: "رقم التواصل",
      address: "العنوان",
      restaurantDescription: "نبذة عن المطعم",
      saveSettings: "حفظ التعديلات",
      editItem: "تعديل العنصر",
      saveChanges: "حفظ التغييرات",
      adding: "جارٍ الإضافة...",
      saving: "جارٍ الحفظ..."
    },
    theme: {
      title: "تخصيص المظهر",
      description: "شكّل هوية مطعمك على ذوقك",
      darkMode: "الوضع الداكن",
      darkModeDescription: "بدّل بين الفاتح والداكن",
      colorPresets: "ألوان جاهزة",
      customColors: "ألوان مخصّصة",
      primary: "أساسي",
      secondary: "ثانوي",
      accent: "مميّز",
      background: "الخلفية",
      surface: "الواجهة",
      text: "النص",
      textSecondary: "نص ثانوي",
      preview: "معاينة",
      primaryButton: "زر أساسي",
      secondaryButton: "زر ثانوي",
      accentButton: "زر مميّز",
      resetToDefault: "رجّع الافتراضي",
      applyChanges: "طبّق التغييرات"
    },
    analytics: {
      title: "لوحة التحليلات",
      subtitle: "تتبع الأداء والرؤى",
      description: "أداء مطعمك بوضوح تام",
      totalRevenue: "الإيرادات الكلية",
      totalOrders: "عدد الطلبات",
      avgOrderValue: "متوسط قيمة الطلب",
      ordersServed: "طلبات تم تقديمها",
      popularItems: "العناصر الأكثر طلباً",
      mostActiveTables: "الطاولات النشطة",
      orders: "طلب",
      revenueByStatus: "الإيرادات حسب الحالة",
      weekTrend: "نمط الطلبات الأسبوعي",
      topRevenueTables: 'الطاولات الأعلى إيرادًا',
      topRevenueItems: 'الأصناف الأعلى إيرادًا',
      statusDistribution: 'توزيع حالات الطلب',
      status: {
        pending: 'قيد الانتظار',
        preparing: 'يتم التحضير',
        served: 'تم التقديم',
        cancelled: 'تم الإلغاء',
      },
      weeklyTrendChart: 'الإيرادات والطلبات الأسبوعية',
      revenue: 'الإيرادات',
      exportPDF: 'تصدير كـ PDF',
      pdfTitle: 'ملخص التحليلات',
      pdfTotalRevenue: 'إجمالي الإيرادات',
      orderTitle: 'ملخص الطلبات',
      tableSubtotal: 'إجمالي طاولة',
      groupedByTable: 'الطلبات حسب الطاولة',
    },
    restaurant: {
      name: "بيلا فيستا",
      phone: "(555) 123-4567",
      defaultDescription: "مطعم راقٍ يقدم تجربة طعام استثنائية بمكونات طازجة وخدمة أنيقة."
    },
    status: {
      errorLoadingMenu: "ما قدرنا نحمّل القائمة",
      tableNotFound: "الطاولة «{table}» مش موجودة. تأكّد من الرمز أو اسألنا.",
      noMenuItems: "ما في عناصر حاليًا",
      failedToLoadMenu: "ما حملت عناصر القائمة",
      tryAgain: "جرّب مرّة ثانية",
      failedToPlaceOrder: "ما قدرنا نبعت الطلب",
      placingOrder: "عم نبعت الطلب…"
    },
    language: {
      english: "الإنجليزية",
      arabic: "العربية",
      switchTo: "بدّل إلى"
    }    
  }
};

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>('en');
  const [isLoaded, setIsLoaded] = useState(false);
  const getLocalizedDayName = (date: Date, format: 'short' | 'long' = 'short'): string => {
    const locale = language === 'ar' ? 'ar-EG' : 'en-US';
    return new Intl.DateTimeFormat(locale, { weekday: format }).format(date);
  };

  useEffect(() => {
    const initializeLanguage = () => {
      const isValidLang = (lang: string | null): lang is Language =>
        lang === 'en' || lang === 'ar';

      // Get language from multiple sources
      const urlParams = new URLSearchParams(window.location.search);
      const urlLang = urlParams.get('lang');
      const pathLang = window.location.pathname.startsWith('/ar/') ? 'ar' :
        window.location.pathname.startsWith('/en/') ? 'en' : null;
      const savedLang = localStorage.getItem('restaurant-language');

      let detectedLang: Language;

      // Priority: URL parameter > Path prefix > localStorage > default
      if (isValidLang(urlLang)) {
        detectedLang = urlLang;
      } else if (isValidLang(pathLang)) {
        detectedLang = pathLang;
      } else if (isValidLang(savedLang)) {
        detectedLang = savedLang;
      } else {
        detectedLang = 'en';
      }

      // Set the language state
      setLanguageState(detectedLang);
      updateDocumentDirection(detectedLang);

      // Only update URL if there's no lang parameter or it's different
      if (!urlLang || urlLang !== detectedLang) {
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.set('lang', detectedLang);
        window.history.replaceState({}, '', currentUrl.toString());
      }

      // Save to localStorage
      localStorage.setItem('restaurant-language', detectedLang);

      setIsLoaded(true);
    };

    initializeLanguage();

    // Listen for popstate events (back/forward navigation)
    const handlePopState = () => {
      initializeLanguage();
    };

    window.addEventListener('popstate', handlePopState);
    // Listen for admin panel language broadcast
    const handleAdminLanguageLoaded = (event: CustomEvent) => {
      const { language: adminLang } = event.detail;
      const isValidLang = (lang: string | null): lang is Language =>
        lang === 'en' || lang === 'ar';

      if (adminLang && isValidLang(adminLang)) {
        setLanguage(adminLang);
      }
    };

    window.addEventListener(
      'admin-language-loaded',
      handleAdminLanguageLoaded as EventListener
    );

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener(
        'admin-language-loaded',
        handleAdminLanguageLoaded as EventListener
      );
    };
  }, []);


  const updateDocumentDirection = (lang: Language) => {
    const isRTL = lang === 'ar';
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;

    // Update font family based on language
    if (isRTL) {
      document.documentElement.style.fontFamily = 'var(--font-playpen-arabic)';
    } else {
      document.documentElement.style.fontFamily = 'var(--font-playpen-arabic)';
    }

    // Update body class for RTL styling
    if (isRTL) {
      document.body.classList.add('rtl');
    } else {
      document.body.classList.remove('rtl');
    }
  };

  const setLanguage = (lang: Language) => {
    const previousLanguage = language;

    setLanguageState(lang);
    updateDocumentDirection(lang);
    
    // Track language change
    if (previousLanguage !== lang) {
      trackMenuEvents.languageChanged(previousLanguage, lang);
    }

    // Update URL parameter only if it's different
    const currentUrl = new URL(window.location.href);
    const currentLang = currentUrl.searchParams.get('lang');

    if (currentLang !== lang) {
      currentUrl.searchParams.set('lang', lang);
      window.history.replaceState({}, '', currentUrl.toString());
    }

    // Always update localStorage
    localStorage.setItem('restaurant-language', lang);
  };

  const t = (key: string, params?: Record<string, string>): string => {
    const getNestedTranslation = (obj: any, path: string): string | undefined => {
      return path.split('.').reduce((acc, part) => acc?.[part], obj);
    };

    const value = getNestedTranslation(translations[language], key);
    let result = value ?? `[${key}]`;

    if (!value) {
      console.warn(`[i18n] Missing translation for: "${key}" in ${language}`);
    }

    if (params) {
      Object.entries(params).forEach(([paramKey, paramValue]) => {
        result = result.replace(`{${paramKey}}`, paramValue);
      });
    }

    return result;
  };




  const isRTL = language === 'ar';

  return (
    <LanguageContext.Provider value={{
      language,
      setLanguage,
      t,
      isRTL,
      isLoaded,
      getLocalizedDayName
    }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};