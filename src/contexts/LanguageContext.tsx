import { AlignVerticalSpaceBetween } from 'lucide-react';
import React, { createContext, useContext, useState, useEffect } from 'react';

export type Language = 'en' | 'ar';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string>) => string;
  isRTL: boolean;
  isLoaded: boolean;
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
      each: "each",
      orders: "orders"
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
      justNow: "Just now"
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
      weekTrend: "7-Day Order Trend"
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
      name: "Bella Vista",
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
      loading: "جارٍ التحميل...",
      error: "حدث خطأ",
      success: "تم بنجاح",
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
      nameEn: "Item name in English",
      nameAr: "اسم الصنف بالعربية",
      selectCategory: "اختر الفئة",
      allCategories: "جميع الفئات",
      addCategory: "إضافة فئة",
      addIngredient: "إضافة مكون",
      updateItem: "تحديث العنصر",
      deleteItem: "حذف العنصر",
      deleteSelected: "حذف المحدد",
      deleteItemConfirm: "هل أنت متأكد من حذف هذا العنصر؟ لا يمكن التراجع عن هذا الإجراء.",
      deleteSelectedConfirm: "هل أنت متأكد من حذف {count} عنصر محدد؟ لا يمكن التراجع عن هذا الإجراء.",
      selectAll: "تحديد الكل",
      itemsSelected: "عنصر محدد",
      noItems: "لا توجد عناصر",
      noItemsDescription: "ابدأ ببناء قائمتك بإضافة العنصر الأول.",
      addFirstItem: "أضف عنصرك الأول",
      noCategory: "بدون فئة",
      available: "متاح",
      unavailable: "غير متاح",
      ingredients: "المكونات",
      addItem: "عنصر جديد",
      adding: "جارٍ الإضافة...",
      saving: "جارٍ الحفظ...",
      deleting: 'جارٍ الحذف...',
      fillAllFields: 'يرجى تعبئة جميع الحقول المطلوبة',
      added: 'تمت إضافة العنصر بنجاح',
      updated: 'تم تحديث العنصر بنجاح',
      errorOccurred: 'حدث خطأ ما',
      deleted: 'تم حذف العنصر بنجاح',
      deletedSelected: 'تم حذف {count} عنصرًا بنجاح',
    },
    auth: {
      welcome: "مرحبًا بك من جديد",
      createAccount: "إنشاء حساب جديد",
      signIn: "تسجيل الدخول",
      signUp: "إنشاء حساب",
      signOut: "تسجيل الخروج",
      email: "البريد الإلكتروني",
      password: "كلمة المرور",
      emailPlaceholder: "admin@restaurant.com",
      passwordPlaceholder: "••••••••",
      signInDescription: "ادخل إلى مركز إدارة مطعمك",
      signUpDescription: "ابدأ رحلتك المهنية مع أول إعداد",
      alreadyHaveAccount: "لديك حساب؟ سجّل الدخول",
      dontHaveAccount: "ليس لديك حساب؟ أنشئ واحدًا"
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
      description: "أنشئ رموز QR لربط الطاولات بالقائمة الرقمية",
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
        1: "اطبع الرموز وضعها على الطاولات المناسبة",
        2: "يمسح العميل الرمز بكاميرا هاتفه",
        3: "يتم توجيهه مباشرة إلى القائمة الرقمية",
        4: "يُربط كل طلب تلقائيًا بالطاولة الصحيحة",
        5: "حمّل رموز عالية الدقة للطباعة الاحترافية"
      }
    },
    menu: {
      title: "القائمة الرقمية",
      subtitle: "امسح. تصفح. اطلب.",
      cart: "السلة",
      searchPlaceholder: "ابحث في عناصر القائمة...",
      all: "الكل",
      addToCart: "أضف إلى السلة",
      yourOrder: "طلبك",
      cartEmpty: "السلة فارغة",
      placeOrder: "أرسل الطلب",
      orderPlaced: "تم إرسال الطلب",
      orderPlacedDescription: "طلبك في الطريق إلى الطاولة {table}",
      estimatedTime: "الوقت المتوقع: ١٥-٢٠ دقيقة",
      noItemsFound: "لا توجد نتائج",
      noItemsDescription: "جرّب تعديل البحث أو التصفية",
      each: "لكل قطعة",
      orders: "الطلبات"
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
      description: "تحكم بحالة كل طاولة في المطعم",
      addTable: "إضافة طاولة",
      available: "متاحة",
      occupied: "مشغولة",
      reserved: "محجوزة",
      cleaning: "قيد التنظيف",
      totalCapacity: "السعة الكلية",
      tableCode: "رمز الطاولة",
      seatingCapacity: "عدد المقاعد",
      addNewTable: "طاولة جديدة",
      tableCodePlaceholder: "مثال: T01، A5، VIP1",
      seats: "مقاعد",
      qrCodeAccess: "رمز QR للدخول إلى القائمة"
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
      description: "غيّر مظهر مطعمك كما تحب",
      darkMode: "الوضع الداكن",
      darkModeDescription: "التبديل بين الوضع الفاتح والداكن",
      colorPresets: "ألوان جاهزة",
      customColors: "ألوان مخصصة",
      primary: "أساسي",
      secondary: "ثانوي",
      accent: "مميز",
      background: "الخلفية",
      surface: "الواجهة",
      text: "النص",
      textSecondary: "نص ثانوي",
      preview: "معاينة",
      primaryButton: "زر أساسي",
      secondaryButton: "زر ثانوي",
      accentButton: "زر مميز",
      resetToDefault: "استعادة الإعدادات",
      applyChanges: "تطبيق التغييرات"
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
      weekTrend: "نمط الطلبات الأسبوعي"
    },
    restaurant: {
      name: "بيلا فيستا",
      phone: "(555) 123-4567",
      defaultDescription: "مطعم راقٍ يقدم تجربة طعام استثنائية بمكونات طازجة وخدمة أنيقة."
    },
    status: {
      errorLoadingMenu: "تعذر تحميل القائمة",
      tableNotFound: "الطاولة \"{table}\" غير موجودة. تحقق من الرمز أو اطلب المساعدة.",
      noMenuItems: "لا توجد عناصر حالياً",
      failedToLoadMenu: "فشل تحميل عناصر القائمة",
      tryAgain: "أعد المحاولة",
      failedToPlaceOrder: "فشل إرسال الطلب",
      placingOrder: "يتم إرسال الطلب..."
    },
    language: {
      english: "الإنجليزية",
      arabic: "العربية",
      switchTo: "التبديل إلى"
    }
  }
};

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>('en');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlLang = urlParams.get('lang') as Language;
    const savedLang = localStorage.getItem('restaurant-language') as Language;

    const initialLang = savedLang || urlLang || 'en'; setLanguageState(initialLang);
    updateDocumentDirection(initialLang);
    setIsLoaded(true); // ✅ mark as loaded

    const handleAdminLanguageLoaded = (event: CustomEvent) => {
      const { language: adminLang } = event.detail;
      if (adminLang && adminLang !== initialLang) {
        setLanguageState(adminLang);
        updateDocumentDirection(adminLang);
      }
    };

    window.addEventListener('admin-language-loaded', handleAdminLanguageLoaded as EventListener);
    return () => {
      window.removeEventListener('admin-language-loaded', handleAdminLanguageLoaded as EventListener);
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
    setLanguageState(lang);
    localStorage.setItem('restaurant-language', lang);
    updateDocumentDirection(lang);

    // Update URL parameter
    const url = new URL(window.location.href);
    url.searchParams.set('lang', lang);
    window.history.replaceState({}, '', url.toString());
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
      isLoaded
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