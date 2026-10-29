/**
 * 🧮 منطق السلة والحسابات — دوال نقية (بدون DOM) لتسهيل الاختبار.
 * تُستخدم في المتصفح من app.js، وفي الاختبارات من Node.
 *
 * الأسعار تُحسب بالسنت (هللة/قرش) داخلياً لتجنّب أخطاء الفاصلة العائمة.
 */

export const CART_STORAGE_KEY = "burgerhouse:cart:v1";
export const MAX_QUANTITY = 20;

const toCents = (value) => Math.round(Number(value) * 100);
const fromCents = (cents) => cents / 100;

/** إنشاء سلة فارغة أو من عناصر معطاة. */
export function createCart(items = []) {
  return {
    items: items
      .filter((item) => item && typeof item.id === "string" && Number.isFinite(Number(item.qty)))
      .map((item) => ({ id: item.id, qty: clampQuantity(Number(item.qty)) }))
      .filter((item) => item.qty > 0),
  };
}

/** تحديد الكمية بين 1 والحد الأعلى. */
export function clampQuantity(qty) {
  const n = Math.floor(Number(qty));
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_QUANTITY, Math.max(1, n));
}

/** تنظيف بيانات محفوظة (localStorage) والتأكد من مطابقتها للقائمة الحالية. */
export function sanitizeCart(raw, menu = []) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.items)) return createCart();
  const validIds = new Set(menu.map((product) => product.id));
  const merged = new Map();
  for (const item of raw.items) {
    if (!item || typeof item.id !== "string") continue;
    if (validIds.size > 0 && !validIds.has(item.id)) continue;
    const qty = clampQuantity(item.qty);
    merged.set(item.id, clampQuantity((merged.get(item.id) || 0) + qty));
  }
  return createCart([...merged.entries()].map(([id, qty]) => ({ id, qty })));
}

export function getQuantity(cart, productId) {
  const item = cart?.items?.find((entry) => entry.id === productId);
  return item ? item.qty : 0;
}

/** إضافة منتج (أو زيادة كميته). يعيد سلة جديدة دون تعديل الأصل. */
export function addItem(cart, productId, qty = 1) {
  const safeQty = Math.max(1, Math.floor(Number(qty) || 1));
  const items = cart?.items ? cart.items.map((item) => ({ ...item })) : [];
  const existing = items.find((item) => item.id === productId);
  if (existing) {
    existing.qty = clampQuantity(existing.qty + safeQty);
  } else {
    items.push({ id: productId, qty: clampQuantity(safeQty) });
  }
  return { items };
}

/** تحديد كمية منتج مباشرة. الكمية صفر أو أقل تحذف المنتج. */
export function setQuantity(cart, productId, qty) {
  const n = Math.floor(Number(qty));
  if (!Number.isFinite(n) || n <= 0) return removeItem(cart, productId);
  return {
    items: (cart?.items || []).map((item) =>
      item.id === productId ? { ...item, qty: clampQuantity(n) } : { ...item }
    ),
  };
}

export function incrementItem(cart, productId) {
  return addItem(cart, productId, 1);
}

export function decrementItem(cart, productId) {
  const current = getQuantity(cart, productId);
  if (current <= 1) return removeItem(cart, productId);
  return setQuantity(cart, productId, current - 1);
}

export function removeItem(cart, productId) {
  return {
    items: (cart?.items || [])
      .filter((item) => item.id !== productId)
      .map((item) => ({ ...item })),
  };
}

export function clearCart() {
  return { items: [] };
}

/** عدد القطع الكلي في السلة. */
export function getItemCount(cart) {
  return (cart?.items || []).reduce((sum, item) => sum + item.qty, 0);
}

/**
 * حساب الفاتورة كاملة.
 * @returns {{
 *   lines: Array<{id:string,name:string,price:number,qty:number,lineTotal:number,image:string}>,
 *   itemCount: number, subtotal: number, deliveryFee: number, total: number,
 *   freeDeliveryApplied: boolean, freeDeliveryRemaining: number
 * }}
 */
export function getTotals(cart, menu = [], settings = {}) {
  const products = new Map(menu.map((product) => [product.id, product]));
  const lines = [];
  let subtotalCents = 0;
  let itemCount = 0;

  for (const item of cart?.items || []) {
    const product = products.get(item.id);
    if (!product) continue;
    const qty = clampQuantity(item.qty);
    const priceCents = toCents(product.price);
    const lineCents = priceCents * qty;
    subtotalCents += lineCents;
    itemCount += qty;
    lines.push({
      id: product.id,
      name: product.name,
      price: fromCents(priceCents),
      qty,
      lineTotal: fromCents(lineCents),
      image: product.image || "",
      imageAlt: product.imageAlt || product.name,
    });
  }

  const deliveryCents = toCents(settings.deliveryFee || 0);
  const freeMinimum = Number(settings.freeDeliveryMinimum) || 0;
  const freeMinimumCents = toCents(freeMinimum);
  const freeDeliveryApplied =
    lines.length > 0 && freeMinimumCents > 0 && subtotalCents >= freeMinimumCents;
  const appliedDeliveryCents = lines.length === 0 ? 0 : freeDeliveryApplied ? 0 : deliveryCents;

  return {
    lines,
    itemCount,
    subtotal: fromCents(subtotalCents),
    deliveryFee: fromCents(appliedDeliveryCents),
    total: fromCents(subtotalCents + appliedDeliveryCents),
    freeDeliveryApplied,
    freeDeliveryRemaining: Math.max(0, fromCents(freeMinimumCents - subtotalCents)),
  };
}

/** تنسيق سعر برقمين عشريين بأرقام لاتينية (مألوفة في قوائم المطاعم الأردنية). */
export function formatMoney(value, currency = "د.أ") {
  const amount = Number(value) || 0;
  return `${amount.toFixed(2)} ${currency}`.trim();
}

/** تحويل الأرقام العربية/الفارسية إلى لاتينية وتنظيف الرقم من الرموز. */
export function normalizeDigits(input) {
  return String(input ?? "")
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
}

/** استخراج رقم واتساب بالصيغة الدولية (أرقام فقط). */
export function normalizeWhatsAppNumber(input) {
  let digits = normalizeDigits(input).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  return digits;
}

/**
 * توحيد رقم الهاتف الأردني إلى الصيغة المحلية 07XXXXXXXX.
 * يقبل: 0791234567، 791234567، +962791234567، 00962791234567، مع مسافات أو شرطات.
 * يعيد "" إذا لم يكن الرقم صحيحاً.
 */
export function normalizePhone(input) {
  let digits = normalizeDigits(input).replace(/[^\d+]/g, "");
  digits = digits.replace(/^\+?00962/, "").replace(/^\+?962/, "");
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (!/^7[789]\d{7}$/.test(digits)) return "";
  return `0${digits}`;
}

export function isValidPhone(input) {
  return normalizePhone(input) !== "";
}

/**
 * التحقق من بيانات إتمام الطلب.
 * @returns {{valid:boolean, errors:Record<string,string>, values:{name:string,phone:string,address:string,notes:string}}}
 */
export function validateCheckout(fields = {}) {
  const errors = {};
  const name = String(fields.name ?? "").trim().replace(/\s+/g, " ");
  const rawPhone = String(fields.phone ?? "").trim();
  const address = String(fields.address ?? "").trim().replace(/\s+/g, " ");
  const notes = String(fields.notes ?? "").trim().slice(0, 300);

  if (name.length < 3) {
    errors.name = "الرجاء كتابة الاسم الكامل (3 أحرف على الأقل).";
  } else if (name.length > 60) {
    errors.name = "الاسم طويل جداً، الحد الأعلى 60 حرفاً.";
  } else if (!/[\u0600-\u06FFa-zA-Z]/.test(name)) {
    errors.name = "الرجاء كتابة اسم يحتوي على أحرف.";
  }

  const phone = normalizePhone(rawPhone);
  if (!rawPhone) {
    errors.phone = "رقم الهاتف مطلوب لتأكيد الطلب.";
  } else if (!phone) {
    errors.phone = "أدخل رقم موبايل أردني صحيح يبدأ بـ 07 (مثال: 0791234567).";
  }

  if (address.length < 8) {
    errors.address = "الرجاء كتابة العنوان بالتفصيل (المنطقة، الشارع، رقم البناية).";
  } else if (address.length > 200) {
    errors.address = "العنوان طويل جداً، الحد الأعلى 200 حرف.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    values: { name, phone, address, notes },
  };
}

/**
 * تجهيز رسالة واتساب مفصّلة بالطلب.
 * تتضمن المنتجات والكميات وأسعار الوحدات والإجماليات ومعلومات التوصيل.
 */
export function buildWhatsAppMessage({ cart, menu, customer, settings }) {
  const totals = getTotals(cart, menu, settings);
  const currency = settings?.currency || "د.أ";
  const restaurant = settings?.restaurantName || "Burger House";
  const money = (value) => formatMoney(value, currency);
  const lines = [];

  lines.push(`مرحباً ${restaurant} 👋`);
  lines.push("أرغب بتأكيد الطلب التالي:");
  lines.push("");
  lines.push("*تفاصيل الطلب*");

  if (totals.lines.length === 0) {
    lines.push("— السلة فارغة —");
  } else {
    totals.lines.forEach((line, index) => {
      lines.push(
        `${index + 1}. ${line.name} × ${line.qty} — ${money(line.price)} للواحد = ${money(line.lineTotal)}`
      );
    });
  }

  lines.push("");
  lines.push("*الحساب*");
  lines.push(`إجمالي المنتجات (${totals.itemCount} قطعة): ${money(totals.subtotal)}`);
  lines.push(
    totals.freeDeliveryApplied
      ? "رسوم التوصيل: مجاني 🎉"
      : `رسوم التوصيل: ${money(totals.deliveryFee)}`
  );
  lines.push(`الإجمالي النهائي: ${money(totals.total)}`);
  lines.push("");
  lines.push("*معلومات التوصيل*");
  lines.push(`الاسم: ${customer?.name || "-"}`);
  lines.push(`رقم الهاتف: ${customer?.phone || "-"}`);
  lines.push(`العنوان: ${customer?.address || "-"}`);
  lines.push(`ملاحظات الطلب: ${customer?.notes ? customer.notes : "لا يوجد"}`);
  lines.push("");
  lines.push("— أُرسلت من موقع Burger House (نسخة تجريبية)");

  return lines.join("\n").trim();
}

/** رابط واتساب جاهز، أو "" إذا لم يُضبط رقم في الإعدادات. */
export function buildWhatsAppUrl(number, message) {
  const digits = normalizeWhatsAppNumber(number);
  if (!digits) return "";
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
