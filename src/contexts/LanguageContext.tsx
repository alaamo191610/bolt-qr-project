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
      loading: "Getting things ready for you…",
      error: "Oops, something went wrong 😅",
      success: "All set ✔️",
      cancel: "Cancel",
      save: "Save",
      delete: "Remove",
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
      nameEn: "Name (English)",
      nameAr: "Name (Arabic)",
      selectCategory: "Pick a category",
      allCategories: "All categories",
      addCategory: "Add category",
      addIngredient: "Add ingredient",
      updateItem: "Update item",
      deleteItem: "Remove item",
      deleteSelected: "Remove selected",
      deleteItemConfirm: "Are you sure you want to remove this item? No going back 🙏",
      deleteSelectedConfirm: "Are you sure you want to remove {count} items? No going back 🙏",
      selectAll: "Select all",
      itemsSelected: "{count} selected",
      noItems: "No items yet",
      noItemsDescription: "Start with your first item, the rest is easy 😉",
      addFirstItem: "Add first item",
      noCategory: "No category",
      available: "Available",
      unavailable: "Out of stock",
      ingredients: "Ingredients",
      addItem: "New item",
      adding: "Adding…",
      saving: "Saving…",
      deleting: "Removing…",
      fillAllFields: "Please fill in all required fields 🙌",
      added: "Item added ✔️",
      updated: "Item updated ✔️",
      errorOccurred: "Something went wrong 😅",
      deleted: "Item removed ✔️",
      deletedSelected: "{count} items removed ✔️",
      uploading: "Uploading…",
      remove: "Remove image",
      uploaded: "Upload complete ✔️",
      placeholder: "Click or drag an image here",
      required: "This field is required ✋",
      timestamp: "Time",
      dateRange: "Date range",
      ingredientsShow: "Show ingredients",
      ingredientsHide: "Hide ingredients",
      goesWellWith: "Goes well with",
      decrease: "Decrease",
      increase: "Increase",
      sort: "Sort",
      clear: "Clear",
      notesPlaceholder: "Example: no onions / extra sauce",
      unavailableTemp: "Not available right now 🙃",
      reset: "Reset",
    },
    errors: {
      general: {
        somethingWrong: "Oops… something went wrong 😅, please try again.",
        unknown: "Not sure what happened 🤔… let’s fix it together.",
        required: "This field is required ✋",
        notAllowed: "You can’t do that right now 🚫",
      },
      network: {
        offline: "No internet connection 📶… check your network and try again.",
        timeout: "Taking too long to load… your internet seems slow 🐌",
        serverDown: "Service is down 🔌… please try again later.",
      },
      payment: {
        failed: "Payment didn’t go through 💳… try another method.",
        declined: "Card was declined 🚫… maybe check with your bank.",
        invalidCard: "Card details look wrong 🙃… please double-check.",
      },
      orders: {
        notFound: "We couldn’t find your order 😕… double-check the number.",
        unavailableItem: "That dish is out of the kitchen 🍲… pick something else.",
        tooMany: "You can’t add more than this 🤷‍♂️",
        updateFailed: "Couldn’t update the order 🙁… try again.",
      },
      upload: {
        failed: "Upload failed 😅… try a smaller image.",
        tooLarge: "Image is too big 📸… please resize it.",
        unsupported: "File type not supported 🚫",
      }
    },
    cart: {
      viewOrder: "View order 🧾",
      items: "Items",
      miniCartAria: "Mini cart",
      estimated: "Estimated",
      min: "min",
      itemAdded: "Item added to cart ✔️",
    },
    badges: {
      spicy: "Spicy 🌶️",
      garlicky: "Garlicky 🧄",
      cheesy: "Cheesy 🧀",
      fresh: "Fresh & Refreshing 🍃",
      vegFriendly: "Veggie-friendly 🥗",
    },
    
    pairings: {
      garlicSauce: "Garlic sauce 🧄",
      salad: "Salad 🥗",
      drink: "Cold drink 🥤",
      cola: "Cola 🥤",
      fries: "French fries 🍟",
      extraCheese: "Extra cheese 🧀",
      sideSalad: "Side salad 🥗",
      bread: "Fresh bread 🍞",
      juice: "Fresh juice 🥤",
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
      title: "Create QR Code",
      description: "Link your tables to the smart menu in seconds — scan, open, and order 🍽️",
      qrSize: "QR size",
      table: "Table number",
      capacity: "Capacity",
      guests: "Guests",
      menuUrl: "Menu link",
      download: "Download",
      preview: "Preview menu",
      copyUrl: "Copy link",
      instructions: {
        title: "How it works",
        1: "Print the codes and place each one on its table.",
        2: "Guest scans the code with their phone 📱.",
        3: "They’re taken straight to the digital menu.",
        4: "Every order is auto-linked to the right table ✔️.",
        5: "Download high-resolution versions for pro printing.",
      }
    },
    menu: {
      title: "Digital Menu",
      subtitle: "Scan. Browse. Order. ✨",
      cart: "Cart",
      searchPlaceholder: "What are you craving? Search here… 🔍",
      all: "All",
      addToCart: "Add to cart ✨",
      yourOrder: "Your order now",
      cartEmpty: "Your cart is empty… shall we fill it up? 😉",
      placeOrder: "Place order 🚀",
      orderPlaced: "Order placed 🎉",
      orderPlacedDescription: "Table {table}: kitchen just started cooking 🍳",
      estimatedTime: "Around 15–20 minutes — take it easy.",
      noItemsFound: "No results",
      noItemsDescription: "Change the word… results will change 🔄",
      orders: "Orders",
      each: "Each",
      estimated: "Estimated time",
      min: "min",
      priceLowHigh: "Price: low to high",
      priceHighLow: "Price: high to low",
      other: "Other",
      compare: "Compare",
      compareLimit: "You can only compare 2 items 😉",
      highlightDifferences: "Highlight differences",
      swapSides: "Swap sides 🔄",
      comparing: "Comparing",
      compareCount: "Items to compare:",
      onlyDifferences: "Only differences",
      addBoth: "Take both 😋",
      compareTagline: "Compare calmly… pick what your heart loves ❤️",
      addToOrder: "Add to order",
      customize: "Customize",
      compareTray: "Compare tray",
      unique: "Unique",
      common: "Common",
    },
    compare: {
      compare: "Compare",
      comparing: "Comparing",
      limit: "You can only compare 2 items 😉",
      needTwo: "Pick 2 items to compare",
      compareTray: "Compare tray",
      compareCount: "{{n}} items selected",
      cleared: "Compare list cleared ✔️",
    },
    
    custom: {
      reset: "Reset",
      removeAll: "Remove all",
      extraAll: "Add all",
      extraAllPaid: "Add all (paid)",
      chooseOption: "Customization options",
      no: "No",
      normal: "Normal",
      extra: "Extra",
      extraPrice: "Extra price",
      include: "Include",
      extraShort: "Extra",
    },
    pricing: {
      base: "Base",
      extras: "Extras",
      total: "Total",
      from: "Starting from ",
      title: "Pricing & Currency",
      description: "Base currency, enabled currencies, exchange rates & rounding.",
      loading: "Loading…",
      saveChanges: "Save changes",
      saved: "Saved",
      baseCurrency: "Base currency",
      enabledRatesTitle: "Enabled currencies & rates",
      ratesHint: "1 {base} = X target currency",
      rate: "rate",
      priceDisplay: "Price display",
      priceDisplaySymbol: "Symbol",
      priceDisplayCode: "Code",
      rounding: "Rounding",
      roundingNone: "none",
      rounding005: "nearest 0.05",
      rounding01: "nearest 0.1",
      rounding05: "nearest 0.5",
      taxMode: "Tax mode",
      taxInclusive: "Item prices include VAT",
      previewTitle: "Preview (100 {base})",
      currencies: {
        USD: "US Dollar",
        QAR: "Qatari Riyal",
        JOD: "Jordanian Dinar",
        SAR: "Saudi Riyal",
      },
    },
    fees: {
      title: "Fees, VAT & Service",
      description: "Define VAT %, service charge %, and delivery fee (in base currency).",
      loading: "Loading…",
      saveChanges: "Save changes",
      saved: "Saved",
      vatPercent: "VAT %",
      serviceChargePercent: "Service charge %",
      deliveryFeeBase: "Delivery fee (base currency)",
      showVatLine: "Show VAT line on receipt",
      showServiceChargeLine: "Show Service Charge line",
      previewTitle: "Preview (Subtotal = 100)",
      subtotal: "Subtotal",
      vat: "VAT",
      serviceCharge: "Service Charge",
      deliveryFee: "Delivery Fee",
      total: "Total",
    },
    promos: {
      title: "Promotions",
      description: "Create discount codes (% or fixed). Amounts use your base currency.",
      loading: "Loading promotions…",
      code: "Code",
      type: "Type",
      percent: "percent %",
      fixed: "fixed amount",
      percentLabel: "Percent %",
      amountBaseLabel: "Amount (base)",
      minOrderBase: "Min order (base)",
      usageLimit: "Usage limit",
      start: "Start",
      end: "End",
      scope: "Scope",
      scopeGlobal: "global",
      scopeTable: "specific table",
      tableId: "Table ID",
      savePromo: "Save promo",
      table: {
        code: "Code",
        type: "Type",
        value: "Value",
        minOrder: "Min Order",
        start: "Start",
        end: "End",
        uses: "Uses",
        active: "Active",
        actions: "Actions",
        empty: "No promotions yet",
        badgeOn: "active",
        badgeOff: "off",
        enable: "Enable",
        disable: "Disable",
      },
    },
    orders: {
      title: "Order management",
      description: "Track orders in real time ⏱️",
      pending: "Pending ⌛",
      preparing: "Kitchen is preparing 🍳",
      ready: "Ready ✅",
      served: "Served 🍽️",
      totalSales: "Total sales",
      orderNumber: "Order number",
      table: "Table",
      items: "Items",
      markAs: "Mark as",
      noOrders: "No orders right now",
      noOrdersDescription: "Once an order comes in through the digital menu, it’ll show up here.",
      ago: "ago",
      justNow: "just now",
    },
    tables: {
      title: "Table management",
      description: "Quickly manage the status of every table in one place ✨",
      addTable: "Add table",
      available: "Available ✅",
      occupied: "Occupied 🍽️",
      reserved: "Reserved 🪑",
      cleaning: "Cleaning 🧹",
      totalCapacity: "Total capacity",
      tableCode: "Table code",
      seatingCapacity: "Seating capacity",
      addNewTable: "New table",
      tableCodePlaceholder: "e.g. T01, A5, or VIP1",
      seats: "Seats",
      qrCodeAccess: "QR code to access menu 📱",
    },
    
    admin: {
      title: "Admin Panel",
      subtitle: "Manage menu items and restaurant settings",
      tabs: {
        workflow: "Order Workflow",
        kds: "KDS Settings",
        pricing: "Pricing & Currency",
        promotions: "Promotions",
      },
      description: "Easily manage your menu and settings ✨",
      menuManagement: "Menu management",
      restaurantSettings: "Restaurant settings",
      addMenuItem: "Add new item",
      restaurantName: "Restaurant name",
      contactPhone: "Contact phone",
      address: "Address",
      restaurantDescription: "Restaurant description",
      saveSettings: "Save changes",
      editItem: "Edit item",
      saveChanges: "Save changes",
      adding: "Adding…",
      saving: "Saving…",
      infoTitle: "Restaurant Information",
      orderWorkflow: "Order Workflow",
      orderWorkflowDesc: "Statuses, transitions, and SLAs enforced across the app",
      kdsSettings: "KDS Settings",
      kdsSettingsDesc: "Columns, sounds, auto-bump, and visual preferences",
      // Restaurant form fields
      name: "Restaurant Name",
      phone: "Contact Phone",
    },
    tabs: {
      orderWorkflow: "Order Workflow Rules",
      kds: "Kitchen Display Settings",
    },
    orderWorkflow: {
      title: "Order Workflow Rules",
      description: "Manage how orders move between statuses and who can update them.",
      enableAuto: "Enable Auto Status Update",
      autoDesc: "Orders will automatically advance when conditions are met.",
      staffRestrictions: "Staff Restrictions",
      staffRestrictionsDesc: "Control which staff roles can update specific statuses.",
      statuses: "Statuses",
      statusKey: "Key",
      labelEn: "Label (EN)",
      labelAr: "Label (AR)",
      customerVisible: "Customer visible",
      notify: "Notify customer",
      slaMin: "SLA (min)",
      transitions: "Allowed Transitions",
      fromTo: "From ↓ / To →",
      autoCancelPending: "Auto-cancel PENDING after (min)",
      saveChanges: "Save changes",
      loading: "Loading order rules…",
    },
    kds: {
      title: "Kitchen Display Settings",
      description: "Customize how orders appear in the Kitchen Display System.",
      showTimers: "Show Timers",
      showTimersDesc: "Display elapsed time since order creation.",
      soundAlerts: "Enable Sound Alerts",
      soundAlertsDesc: "Play audio when a new order arrives.",
      groupByTable: "Group Orders by Table",
      groupByTableDesc: "Show all orders per table grouped together.",
      columns: "Columns",
      soundEnabled: "Enable sound alerts",
      soundPreset: "Sound preset",
      soundPresets: {
        ding: "ding",
        bell: "bell",
        knock: "knock",
        beep: "beep",
      },
      autoBump: "Auto-bump after (min)",
      ticketScale: "Ticket scale",
      showModifiersLarge: "Show modifiers large",
      colorScheme: "Color scheme",
      colorSchemes: {
        light: "light",
        dark: "dark",
        highContrast: "high-contrast",
        ticketGrouping: "Group tickets",
      groupings: {
        none: "none",
        byTable: "by table",
        byCourse: "by course",
      },
      prepTimeColorsOk: "OK ≤ (min)",
      prepTimeColorsWarn: "Warn ≤ (min)",
      visibleStatusesHint: "Visible statuses (left→right). You can include/exclude: pending, preparing, ready, served, cancelled.",
      saveChanges: "Save changes",
      loading: "Loading KDS settings…",
      },
    },
    theme: {
      title: "Theme customization",
      description: "Give your restaurant its own unique look 🎨",
      darkMode: "Dark mode 🌙",
      darkModeDescription: "Switch between light and dark",
      colorPresets: "Color presets",
      customColors: "Custom colors",
      primary: "Primary",
      secondary: "Secondary",
      accent: "Accent",
      background: "Background",
      surface: "Surface",
      text: "Text",
      textSecondary: "Secondary text",
      preview: "Preview 👀",
      primaryButton: "Primary button",
      secondaryButton: "Secondary button",
      accentButton: "Accent button",
      resetToDefault: "Reset to default ↩️",
      applyChanges: "Apply changes ✔️",
    },
    analytics: {
      title: "Analytics dashboard",
      subtitle: "Track performance & insights 📊",
      description: "See your restaurant’s performance clearly",
      totalRevenue: "Total revenue 💰",
      totalOrders: "Total orders",
      avgOrderValue: "Average order value",
      ordersServed: "Orders served 🍽️",
      popularItems: "Most popular items ⭐",
      mostActiveTables: "Most active tables",
      orders: "Order",
      revenueByStatus: "Revenue by status",
      weekTrend: "Weekly orders",
      topRevenueTables: "Top revenue tables",
      topRevenueItems: "Top revenue items",
      statusDistribution: "Order status distribution",
      status: {
        pending: "Pending ⏳",
        preparing: "Kitchen preparing 🍳",
        served: "Served ✔️",
        cancelled: "Cancelled ❌",
      },
      weeklyTrendChart: "Weekly revenue & orders",
      revenue: "Revenue",
      exportPDF: "Export as PDF 📄",
      pdfTitle: "Analytics summary",
      pdfTotalRevenue: "Total revenue",
      orderTitle: "Orders summary",
      tableSubtotal: "Table subtotal",
      groupedByTable: "Orders by table",
    } ,
    restaurant: {
      name: "Bella Vista",
      phone: "(555) 123-4567",
      defaultDescription: "A fine restaurant offering an exceptional dining experience with fresh ingredients and elegant service ✨",
    },
    
    status: {
      errorLoadingMenu: "We couldn’t load the menu 😅",
      tableNotFound: "Table «{table}» not found. Double-check the code or ask us 🙏",
      noMenuItems: "No items available right now",
      failedToLoadMenu: "Menu failed to load 🔄",
      tryAgain: "Try again",
      failedToPlaceOrder: "Couldn’t place the order 🚫",
      placingOrder: "Placing your order… ⏳",
    },
    
    language: {
      english: "English",
      arabic: "Arabic",
      switchTo: "Switch to",
    }    
  },
  ar: {
    common: {
      loading: "نجهّزلك الأمور…",
      error: "معلش، صار خلل 😅",
      success: "تزبطت ✔️",
      cancel: "إلغاء",
      save: "خزّن",
      delete: "شيل",
      edit: "عدّل",
      add: "زيد",
      search: "دوّر",
      filter: "فلتر",
      total: "المجموع",
      status: "الوضع",
      actions: "خيارات",
      name: "الاسم",
      price: "السِّعر",
      category: "التصنيف",
      description: "الوصف",
      image: "الصورة",
      back: "رجعة",
      next: "الجاي",
      previous: "اللي قبل",
      close: "سكّر",
      confirm: "ثبّت",
      yes: "ايوا",
      no: "لأ",
      table: "الطاولة",
      nameEn: "الاسم بالإنجليزي",
      nameAr: "الاسم بالعربي",
      selectCategory: "اختار تصنيف",
      allCategories: "كل التصنيفات",
      addCategory: "زيد تصنيف",
      addIngredient: "زيد مكوّن",
      updateItem: "حدّث الصنف",
      deleteItem: "شيل الصنف",
      deleteSelected: "شيل المحدد",
      deleteItemConfirm: "متأكد تِشيله؟ ما في رجعة 🙏",
      deleteSelectedConfirm: "متأكد تِشيل {count} صنف؟ ما في رجعة 🙏",
      selectAll: "علّم الكل",
      itemsSelected: "{count} محدد",
      noItems: "لسّا ما في أصناف",
      noItemsDescription: "بلّش بأول صنف، والباقي سهل 😉",
      addFirstItem: "زيد أول صنف",
      noCategory: "بلا تصنيف",
      available: "موجود",
      unavailable: "خلصان",
      ingredients: "المكوّنات",
      addItem: "صنف جديد",
      adding: "عم نضيف…",
      saving: "عم نخزّن…",
      deleting: "عم نشيل…",
      fillAllFields: "عَبّي كل الخانات المطلوبة 🙌",
      added: "الصنف انضاف ✔️",
      updated: "الصنف اتحدّث ✔️",
      errorOccurred: "صار خلل بالسيستم 😅",
      deleted: "الصنف انشال ✔️",
      deletedSelected: "{count} صنف انشالوا ✔️",
      uploading: "عم نرفع…",
      remove: "شيل الصورة",
      uploaded: "خلص الرفع ✔️",
      placeholder: "كبسة هون أو اسحب صورة وحطها",
      required: "هاي الخانة ضرورية ✋",
      timestamp: "الوقت",
      dateRange: "من… لـ…",
      ingredientsShow: "فرجيني المكوّنات",
      ingredientsHide: "خبّي المكوّنات",
      goesWellWith: "بيلبق مع",
      decrease: "نقّص",
      increase: "زيد",
      sort: "رتّب",
      clear: "فضّي",
      notesPlaceholder: "مثال: بلا بصل / زيادة صوص",
      unavailableTemp: "مش متوفر هالمرة 🙃",
      reset: "إعادة ضبط",
    },
    errors: {
      general: {
        somethingWrong: "معلش… صار خلل بسيط 😅، جرّب كمان مرة.",
        unknown: "والله ما فهمنا شو اللي صار 🤔… خلينا نحلها بسرعة.",
        required: "هاي الخانة ضرورية ✋",
        notAllowed: "ما بتقدر تعمل هيك هسا 🚫",
      },
      network: {
        offline: "مش واصل نت عندك 📶… شيّك الشبكة وجرب.",
        timeout: "التحميل طول كتير… النت بطيء شوي 🐌",
        serverDown: "الخدمة مش شغّالة هالمرة 🔌… معلش حاول بعدين.",
      },
      payment: {
        failed: "الدفع ما زبط 💳… جرب بطاقة تانية أو طريقة غير.",
        declined: "البطاقة ما قبلت 🚫… يمكن بدها إذن من البنك.",
        invalidCard: "معلومات البطاقة غلط 🙃… صححها وجرب.",
      },
      orders: {
        notFound: "ما لقينا طلبك 😕… تأكد من الرقم.",
        unavailableItem: "الأكلة خلصت من المطبخ 🍲… اختار غيرها.",
        tooMany: "ما بنقدر نضيف أكتر من هيك 🤷‍♂️",
        updateFailed: "ما قدرنا نحدّث الطلب 🙁… جرّب كمان مرة.",
      },
      upload: {
        failed: "الرفع ما زبط 😅… جرب صورة أصغر أو صيغة تانية.",
        tooLarge: "الصورة كبيرة كتير 📸… صغّرها شوي.",
        unsupported: "نوع الملف مش مدعوم 🚫",
      }
    },
    badges: {
      spicy: "حرّ 🌶️",
      garlicky: "طعمة ثوم 🧄",
      cheesy: "جبني 🧀",
      fresh: "طازج ومنعِّش 🍃",
      vegFriendly: "بناسب النباتيين 🥗",
    },
    
    pairings: {
      garlicSauce: "صلصة ثوم 🧄",
      salad: "سلطة 🥗",
      drink: "مشروب بارد 🥤",
      cola: "كولا 🥤",
      fries: "بطاطا مقلية 🍟",
      extraCheese: "جبنة زيادة 🧀",
      sideSalad: "سلطة جانبية 🥗",
      bread: "خبز طازج 🍞",
      juice: "عصير طبيعي 🥤",
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
      viewOrder: "شوف الطلب 🧾",
      items: "الأصناف",
      miniCartAria: "سلة مصغّرة",
      estimated: "تقريبًا",
      min: "دقيقة",
      itemAdded: "انضاف الصنف عالسلة ✔️",
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
      description: "اربط الطاولات بقائمتك الذكية بثواني — امسح، تفتح القائمة، واطلب 🍽️",
      qrSize: "حجم الرمز",
      table: "رقم الطاولة",
      capacity: "السعة",
      guests: "عدد الضيوف",
      menuUrl: "رابط القائمة",
      download: "نزّل",
      preview: "معاينة القائمة",
      copyUrl: "انسخ الرابط",
      instructions: {
        title: "كيف تستخدمه؟",
        1: "اطبع الرموز وحُطّ كل واحد على طاولته.",
        2: "الزبون بمسح الرمز بكاميرا موبايله 📱.",
        3: "بيفتح مباشرة عالقائمة الرقمية.",
        4: "كل طلب بينربط أوتوماتيك بالطاولة الصح ✔️.",
        5: "نزّل نسخة عالية الدقة للطباعة المرتبة.",
      }
    },
    menu: {
      title: "القائمة الرقمية",
      subtitle: "امسح. تصفّح. اطلب. ✨",
      cart: "السلة",
      searchPlaceholder: "شو نفسك فيه؟ فتّش هون… 🔍",
      all: "الكل",
      addToCart: "عالسلّة ✨",
      yourOrder: "طلبك هَلّأ",
      cartEmpty: "سلتك فاضية… نعبّيها؟ 😉",
      placeOrder: "يلا نطلب 🚀",
      orderPlaced: "تم الطلب 🎉",
      orderPlacedDescription: "طاولة {table}: المطبخ بلّش يشتغل 🍳",
      estimatedTime: "حوالي ١٥–٢٠ دقيقة — على رواق.",
      noItemsFound: "ما في نتائج",
      noItemsDescription: "غيّر الكلمة… بتتغيّر النتائج 🔄",
      orders: "الطلبات",
      each: "للوحدة",
      estimated: "الوقت المتوقع",
      min: "دقيقة",
      priceLowHigh: "السعر: من الأقل للأعلى",
      priceHighLow: "السعر: من الأعلى للأقل",
      other: "أخرى",
      compare: "قارن",
      compareLimit: "مسموح بس عنصرين 😉",
      highlightDifferences: "بيّن الفروقات",
      swapSides: "بدّل الجانبين 🔄",
      comparing: "عم نقارن لك…",
      compareCount: "عناصر المقارنة:",
      onlyDifferences: "الفروقات فقط",
      addBoth: "الاثنين أحلى 😋",
      compareTagline: "قارن عمهلك… وخد اللي قلبك مال له ❤️",
      addToOrder: "أضف للطلب",
      customize: "خصص طلبك",
      compareTray: "شريط المقارنة",
      unique: "غير",
      common: "مشترك",
    },
    compare: {
      compare: "قارن",
      comparing: "عم نقارن لك…",
      limit: "مسموح تقارن عنصرين بس 😉",
      needTwo: "اختار عنصرين عشان نقدر نقارن",
      compareTray: "شريط المقارنة",
      compareCount: "اخترت {{n}} عنصر",
      cleared: "انمسحت قائمة المقارنة ✔️",
    },
    
    custom: {
      reset: "إعادة الضبط",
      removeAll: "شيل الكل",
      extraAll: "زيد الكل",
      extraAllPaid: "زيد الكل (مدفوع)",
      chooseOption: "خيارات التخصيص",
      no: "بدون",
      normal: "عادي",
      extra: "إضافي",
      extraPrice: "سعر الإضافة",
      include: "تضمين",
      extraShort: "إضافي",
    },
    pricing: {
      base: "الأساسي",
      extras: "الإضافات",
      total: "الإجمالي",
      from: "ابتداءً من ",
      title: "التسعير والعملات",
      description: "العملة الأساسية، العملات المُفعّلة، أسعار الصرف والتقريب.",
      loading: "جارٍ التحميل…",
      saveChanges: "حفظ التغييرات",
      saved: "تم الحفظ",
      baseCurrency: "العملة الأساسية",
      enabledRatesTitle: "العملات المُفعّلة وأسعار الصرف",
      ratesHint: "1 {base} = قيمة بالعملة الهدف",
      rate: "سعر الصرف",
      priceDisplay: "عرض السعر",
      priceDisplaySymbol: "رمز",
      priceDisplayCode: "رمز العملة",
      rounding: "التقريب",
      roundingNone: "بدون",
      rounding005: "أقرب 0.05",
      rounding01: "أقرب 0.1",
      rounding05: "أقرب 0.5",
      taxMode: "وضع الضريبة",
      taxInclusive: "الأسعار تشمل ضريبة القيمة المضافة",
      previewTitle: "معاينة (100 {base})",
      currencies: {
        USD: "الدولار الأمريكي",
        QAR: "الريال القطري",
        JOD: "الدينار الأردني",
        SAR: "الريال السعودي",
      },
    },
    fees: {
      title: "الرسوم والضريبة والخدمة",
      description: "حدّد نسبة ضريبة القيمة المضافة، نسبة رسوم الخدمة، ورسوم التوصيل (بالعملة الأساسية).",
      loading: "جارٍ التحميل…",
      saveChanges: "حفظ التغييرات",
      saved: "تم الحفظ",
      vatPercent: "ضريبة القيمة المضافة ٪",
      serviceChargePercent: "رسوم الخدمة ٪",
      deliveryFeeBase: "رسوم التوصيل (بالعملة الأساسية)",
      showVatLine: "إظهار سطر الضريبة في الإيصال",
      showServiceChargeLine: "إظهار سطر رسوم الخدمة",
      previewTitle: "معاينة (الإجمالي الفرعي = 100)",
      subtotal: "الإجمالي الفرعي",
      vat: "الضريبة",
      serviceCharge: "رسوم الخدمة",
      deliveryFee: "رسوم التوصيل",
      total: "الإجمالي",
    },
    promos: {
      title: "العروض الترويجية",
      description: "أنشئ رموز خصم (٪ أو مبلغ ثابت). تُحسب المبالغ بالعملة الأساسية.",
      loading: "جارٍ تحميل العروض…",
      code: "الرمز",
      type: "النوع",
      percent: "نسبة ٪",
      fixed: "مبلغ ثابت",
      percentLabel: "النسبة ٪",
      amountBaseLabel: "المبلغ (بالعملة الأساسية)",
      minOrderBase: "الحد الأدنى للطلب (بالعملة الأساسية)",
      usageLimit: "حد مرات الاستخدام",
      start: "البداية",
      end: "النهاية",
      scope: "النطاق",
      scopeGlobal: "عام",
      scopeTable: "طاولة محددة",
      tableId: "معرّف الطاولة",
      savePromo: "حفظ العرض",
      table: {
        code: "الرمز",
        type: "النوع",
        value: "القيمة",
        minOrder: "الحد الأدنى",
        start: "البداية",
        end: "النهاية",
        uses: "مرات الاستخدام",
        active: "الحالة",
        actions: "إجراءات",
        empty: "لا توجد عروض بعد",
        badgeOn: "مفعّل",
        badgeOff: "متوقف",
        enable: "تفعيل",
        disable: "إيقاف",
      },
    },
    orders: {
      title: "إدارة الطلبات",
      description: "تابع طلباتك لحظة بلحظة ⏱️",
      pending: "قيد الانتظار ⌛",
      preparing: "المطبخ عم يجهّز 🍳",
      ready: "جاهز ✅",
      served: "انقدّم عالطاولة 🍽️",
      totalSales: "إجمالي المبيعات",
      orderNumber: "رقم الطلب",
      table: "الطاولة",
      items: "الأصناف",
      markAs: "عيّن كـ",
      noOrders: "ما في طلبات هسا",
      noOrdersDescription: "أول ما يجي طلب من القائمة الرقمية، رح يبين هون.",
      ago: "منذ",
      justNow: "هسا",
    },
    tables: {
      title: "إدارة الطاولات",
      description: "رتّب حالة كل طاولة بسرعة ومن مكان واحد ✨",
      addTable: "زيد طاولة",
      available: "متاحة ✅",
      occupied: "مشغولة 🍽️",
      reserved: "محجوزة 🪑",
      cleaning: "قيد التنظيف 🧹",
      totalCapacity: "السعة الكليّة",
      tableCode: "رمز الطاولة",
      seatingCapacity: "عدد المقاعد",
      addNewTable: "طاولة جديدة",
      tableCodePlaceholder: "مثال: T01 أو A5 أو VIP1",
      seats: "مقاعد",
      qrCodeAccess: "رمز QR لفتح القائمة 📱",
    },
    
    admin: {
      title: "لوحة الإدارة",
      subtitle: "سيطر على قائمتك وإعدادات مطعمك بسهولة",
      tabs: {
        workflow: "سير الطلب",
        kds: "شاشة المطبخ",
        pricing: "التسعير والعملات",
        promotions: "العروض الترويجية",
      },
      description: "رتّب قائمتك وإعداداتك بخطوات بسيطة ✨",
      menuManagement: "إدارة القائمة",
      restaurantSettings: "إعدادات المطعم",
      addMenuItem: "زيد عنصر جديد",
      restaurantName: "اسم المطعم",
      contactPhone: "رقم التواصل",
      address: "العنوان",
      restaurantDescription: "نبذة عن المطعم",
      saveSettings: "خزّن التعديلات",
      editItem: "عدّل العنصر",
      saveChanges: "خزّن التغييرات",
      adding: "عم نضيف…",
      saving: "عم نخزّن…",
      infoTitle: "معلومات المطعم",
      orderWorkflow: "سير الطلب",
      orderWorkflowDesc: "الحالات والانتقالات ووقت الإنجاز عبر النظام",
      kdsSettings: "إعدادات شاشة المطبخ",
      kdsSettingsDesc: "الأعمدة والأصوات والانتقال الآلي والتفضيلات البصرية",
      // Restaurant form fields
      name: "اسم المطعم",
      phone: "هاتف التواصل",
    },
    tabs: {
      orderWorkflow: "قواعد سير الطلب",
      kds: "إعدادات شاشة المطبخ",
    },
    orderWorkflow: {
      title: "قواعد سير الطلب",
      description: "تحكّم بكيفية انتقال الطلبات بين الحالات ومن يحق له تعديلها.",
      enableAuto: "تفعيل التحديث التلقائي",
      autoDesc: "سيتم تحديث حالة الطلب تلقائيًا عند تحقق الشروط.",
      staffRestrictions: "قيود الموظفين",
      staffRestrictionsDesc: "تحكم في صلاحيات الأدوار المختلفة لتحديث الحالات.",
      statuses: "الحالات",
      statusKey: "المفتاح",
      labelEn: "التسمية (إنجليزي)",
      labelAr: "التسمية (عربي)",
      customerVisible: "ظاهر للعميل",
      notify: "تنبيه العميل",
      slaMin: "زمن الإنجاز (دقيقة)",
      transitions: "الانتقالات المسموح بها",
      fromTo: "من ↓ / إلى →",
      autoCancelPending: "إلغاء تلقائي لحالة «قيد الانتظار» بعد (دقيقة)",
      saveChanges: "حفظ التغييرات",
      loading: "جارٍ تحميل قواعد الطلب…",
    },
    kds: {
      title: "إعدادات شاشة المطبخ",
      description: "خصّص طريقة عرض الطلبات في شاشة المطبخ.",
      showTimers: "إظهار المؤقت",
      showTimersDesc: "عرض الوقت المنقضي منذ إنشاء الطلب.",
      soundAlerts: "تفعيل التنبيهات الصوتية",
      soundAlertsDesc: "تشغيل صوت عند وصول طلب جديد.",
      groupByTable: "تجميع حسب الطاولة",
      groupByTableDesc: "عرض جميع الطلبات لكل طاولة معًا.",
      columns: "الأعمدة",
      soundEnabled: "تفعيل التنبيهات الصوتية",
      soundPreset: "نغمة التنبيه",
      soundPresets: {
        ding: "دينغ",
        bell: "جرس",
        knock: "طرق",
        beep: "بيب",
      },
      autoBump: "ترحيل تلقائي بعد (دقيقة)",
      ticketScale: "حجم التذكرة",
      showModifiersLarge: "إظهار الإضافات بخط كبير",
      colorScheme: "نظام الألوان",
      colorSchemes: {
        light: "فاتح",
        dark: "داكن",
        highContrast: "تباين عالٍ",
      },
      ticketGrouping: "تجميع التذاكر",
      groupings: {
        none: "بدون",
        byTable: "حسب الطاولة",
        byCourse: "حسب الطبق/الوجبة",
      },
      prepTimeColorsOk: "حد طبيعي ≤ (دقيقة)",
      prepTimeColorsWarn: "تحذير ≤ (دقيقة)",
      visibleStatusesHint: "الحالات الظاهرة (من اليسار إلى اليمين). يمكنك تضمين/استبعاد: قيد الانتظار، قيد التحضير، جاهز، تم التقديم، أُلغي.",
      saveChanges: "حفظ التغييرات",
      loading: "جارٍ تحميل إعدادات شاشة المطبخ…",
    },
    theme: {
      title: "تخصيص المظهر",
      description: "خلّي مطعمك يبين بهويته الخاصة 🎨",
      darkMode: "الوضع الداكن 🌙",
      darkModeDescription: "بدّل بين الفاتح والداكن",
      colorPresets: "ألوان جاهزة",
      customColors: "ألوان مخصّصة",
      primary: "لون أساسي",
      secondary: "لون ثانوي",
      accent: "لون مميّز",
      background: "الخلفية",
      surface: "الواجهة",
      text: "النص",
      textSecondary: "نص ثانوي",
      preview: "معاينة 👀",
      primaryButton: "زر أساسي",
      secondaryButton: "زر ثانوي",
      accentButton: "زر مميّز",
      resetToDefault: "رجّع للإفتراضي ↩️",
      applyChanges: "طبّق التغييرات ✔️",
    },
    analytics: {
      title: "لوحة التحليلات",
      subtitle: "تابع الأداء والرؤى 📊",
      description: "شوف أداء مطعمك بكل وضوح",
      totalRevenue: "الإيرادات الكليّة 💰",
      totalOrders: "عدد الطلبات",
      avgOrderValue: "متوسط قيمة الطلب",
      ordersServed: "طلبات اتقدّمت 🍽️",
      popularItems: "الأصناف الأكثر طلبًا ⭐",
      mostActiveTables: "الطاولات الأكثر حركة",
      orders: "طلب",
      revenueByStatus: "الإيرادات حسب الحالة",
      weekTrend: "الطلب الأسبوعي",
      topRevenueTables: "أعلى الطاولات إيرادًا",
      topRevenueItems: "أعلى الأصناف إيرادًا",
      statusDistribution: "توزيع حالات الطلب",
      status: {
        pending: "قيد الانتظار ⏳",
        preparing: "المطبخ عم يجهّز 🍳",
        served: "اتقدّم ✔️",
        cancelled: "اتلغى ❌",
      },
      weeklyTrendChart: "الإيرادات والطلبات الأسبوعية",
      revenue: "الإيرادات",
      exportPDF: "نزّل كـ PDF 📄",
      pdfTitle: "ملخص التحليلات",
      pdfTotalRevenue: "مجموع الإيرادات",
      orderTitle: "ملخص الطلبات",
      tableSubtotal: "إجمالي الطاولة",
      groupedByTable: "الطلبات حسب الطاولة",
    },
    restaurant: {
      name: "بيلا فيستا",
      phone: "(555) 123-4567",
      defaultDescription: "مطعم راقي بقدّم تجربة طعام مميزة بمكونات طازجة وخدمة أنيقة ✨",
    },
    
    status: {
      errorLoadingMenu: "ما قدرنا نحمّل القائمة 😅",
      tableNotFound: "الطاولة «{table}» مش موجودة. تأكّد من الرمز أو اسألنا 🙏",
      noMenuItems: "ما في أصناف هسا",
      failedToLoadMenu: "القائمة ما حملت 🔄",
      tryAgain: "جرّب مرّة ثانية",
      failedToPlaceOrder: "ما قدرنا نبعت الطلب 🚫",
      placingOrder: "عم نبعت الطلب… ⏳",
    },
    
    language: {
      english: "الإنجليزية",
      arabic: "العربية",
      switchTo: "حوّل لـ",
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