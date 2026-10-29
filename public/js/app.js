/**
 * 🧩 ربط الواجهة بالبيانات — يعرض القائمة، يدير السلة والدرج الجانبي،
 * ويتحقق من نموذج الطلب ويجهّز رسالة واتساب المفصّلة.
 *
 * كل الحسابات تأتي من cart.js (دوال نقية) — هذا الملف يتعامل مع DOM فقط.
 */

import { siteConfig } from "./config.js";
import { menu, categories } from "./menu.js";
import {
  CART_STORAGE_KEY,
  MAX_QUANTITY,
  addItem,
  clearCart,
  decrementItem,
  formatMoney,
  getItemCount,
  getQuantity,
  getTotals,
  incrementItem,
  removeItem,
  sanitizeCart,
  validateCheckout,
  buildWhatsAppMessage,
  buildWhatsAppUrl,
  normalizePhone,
  normalizeWhatsAppNumber,
} from "./cart.js";

/* ───────────────────────── أدوات مساعدة ───────────────────────── */

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

const money = (value) => formatMoney(value, siteConfig.currency);
const priceNumber = (value) => Number(value).toFixed(2);

const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const icon = (name, extraClass = "") =>
  `<svg class="icon${extraClass ? ` ${extraClass}` : ""}" aria-hidden="true"><use href="#${name}"/></svg>`;

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const productsById = new Map(menu.map((product) => [product.id, product]));
const whatsappDigits = normalizeWhatsAppNumber(siteConfig.whatsappNumber);

/* ───────────────────────── حالة التطبيق ───────────────────────── */

let cart = loadCart();
let activeCategory = "all";
let lastFocusedBeforeDrawer = null;
let toastTimer = null;

function loadCart() {
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return { items: [] };
    return sanitizeCart(JSON.parse(raw), menu);
  } catch {
    return { items: [] };
  }
}

function saveCart() {
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  } catch {
    /* التخزين قد يكون معطلاً (تصفح خاص) — نتجاهل الخطأ بهدوء */
  }
}

function setCart(next) {
  cart = next;
  saveCart();
  renderCart();
  syncCardControls();
  renderCheckoutSummary();
  updateCartBadges();
  updateMobileBar();
}

/* ───────────────────────── إعدادات المطعم في الصفحة ───────────────────────── */

function applySiteConfig() {
  $$("[data-config]").forEach((el) => {
    const value = siteConfig[el.dataset.config];
    if (value !== undefined && value !== null && value !== "") el.textContent = String(value);
  });

  $$("[data-config-link]").forEach((el) => {
    const key = el.dataset.configLink;
    const value = siteConfig[key];
    if (key === "email") {
      if (value) el.setAttribute("href", `mailto:${value}`);
      if (value) el.textContent = value;
      return;
    }
    if (value) el.setAttribute("href", String(value));
  });

  const waStatus = $("[data-whatsapp-status]");
  if (waStatus) {
    if (whatsappDigits) {
      waStatus.textContent = `+${whatsappDigits}`;
      waStatus.setAttribute("dir", "ltr");
    } else {
      waStatus.textContent = "غير مُعدّ بعد";
    }
  }

  const year = $("#footer-year");
  if (year) year.textContent = String(new Date().getFullYear());

  const hoursList = $("#footer-hours");
  if (hoursList) {
    hoursList.innerHTML = (siteConfig.hours || [])
      .map(
        (entry) => `<li>
          <span>${esc(entry.days)}</span>
          <strong>${esc(entry.time)}</strong>
        </li>`
      )
      .join("");
  }

  const warning = $("#whatsapp-warning");
  if (warning) warning.hidden = Boolean(whatsappDigits);
}

/* ───────────────────────── بطاقات المنتجات ───────────────────────── */

function addButtonHtml(product) {
  return `<button type="button" class="add-btn" data-add="${product.id}" aria-label="أضف ${esc(
    product.name
  )} إلى السلة">
      ${icon("i-plus")}
      أضف
    </button>`;
}

function qtyControlHtml(product, qty) {
  return `<div class="qty" role="group" aria-label="كمية ${esc(product.name)}">
      <button type="button" class="qty__btn" data-dec="${product.id}" aria-label="تقليل كمية ${esc(
    product.name
  )}">${icon("i-minus")}</button>
      <span class="qty__value" aria-live="polite">${qty}</span>
      <button type="button" class="qty__btn" data-inc="${product.id}" aria-label="زيادة كمية ${esc(
    product.name
  )}"${qty >= MAX_QUANTITY ? " disabled" : ""}>${icon("i-plus")}</button>
    </div>`;
}

function footHtml(product) {
  const qty = getQuantity(cart, product.id);
  const price = `<span class="price"><span class="price__num">${priceNumber(
    product.price
  )}</span> <span class="price__cur">${esc(siteConfig.currency)}</span></span>`;
  return `${price}${qty > 0 ? qtyControlHtml(product, qty) : addButtonHtml(product)}`;
}

function productCardHtml(product) {
  const badge = product.badge
    ? `<span class="product-badge">${esc(product.badge)}</span>`
    : "";
  return `<article class="product-card">
      <div class="product-card__media">
        <img src="${esc(product.image)}" alt="${esc(product.imageAlt || product.name)}"
             width="600" height="450" loading="lazy" decoding="async">
        ${badge}
      </div>
      <div class="product-card__body">
        <h3>${esc(product.name)}</h3>
        <p>${esc(product.description)}</p>
        <div class="product-card__foot" data-foot="${product.id}">${footHtml(product)}</div>
      </div>
    </article>`;
}

function renderTabs() {
  const tabs = $("#menu-tabs");
  if (!tabs) return;
  const all = [{ id: "all", name: "الكل" }, ...categories];
  tabs.innerHTML = all
    .map((category) => {
      const count =
        category.id === "all"
          ? menu.length
          : menu.filter((product) => product.category === category.id).length;
      const selected = category.id === activeCategory;
      return `<button type="button" class="tab" role="tab" id="tab-${category.id}"
          data-category="${category.id}" aria-controls="menu-grid"
          aria-selected="${selected ? "true" : "false"}" tabindex="${selected ? "0" : "-1"}">
          ${esc(category.name)} <span class="tab__count">${count}</span>
        </button>`;
    })
    .join("");
}

function renderMenu() {
  const grid = $("#menu-grid");
  if (!grid) return;
  const items =
    activeCategory === "all"
      ? menu
      : menu.filter((product) => product.category === activeCategory);

  if (items.length === 0) {
    grid.innerHTML = `<p class="menu__note">لا توجد أصناف في هذا التصنيف حالياً.</p>`;
    return;
  }
  grid.innerHTML = items.map(productCardHtml).join("");
}

function renderPopular() {
  const grid = $("#popular-grid");
  if (!grid) return;
  const popular = menu.filter((product) => product.popular).slice(0, 4);
  grid.innerHTML = popular.map(productCardHtml).join("");
}

/** تحديث أزرار/عدادات الكمية داخل البطاقات دون إعادة بناء الشبكة كلها. */
function syncCardControls() {
  $$("[data-foot]").forEach((foot) => {
    const product = productsById.get(foot.dataset.foot);
    if (!product) return;
    const qty = getQuantity(cart, product.id);
    const qtyWrapper = foot.querySelector(".qty");
    if (qty > 0) {
      if (qtyWrapper) {
        const value = qtyWrapper.querySelector(".qty__value");
        if (value) value.textContent = String(qty);
        const inc = qtyWrapper.querySelector("[data-inc]");
        if (inc) inc.disabled = qty >= MAX_QUANTITY;
        return;
      }
      foot.innerHTML = `<span class="price"><span class="price__num">${priceNumber(
        product.price
      )}</span> <span class="price__cur">${esc(siteConfig.currency)}</span></span>${qtyControlHtml(
        product,
        qty
      )}`;
      return;
    }
    foot.innerHTML = footHtml(product);
  });
}

/* ───────────────────────── السلة (الدرج الجانبي) ───────────────────────── */

function totalsNow() {
  return getTotals(cart, menu, {
    deliveryFee: siteConfig.deliveryFee,
    freeDeliveryMinimum: siteConfig.freeDeliveryMinimum,
  });
}

function renderCart() {
  const body = $("#cart-body");
  const subtitle = $("#cart-subtitle");
  const foot = $("#cart-foot");
  if (!body) return;

  const totals = totalsNow();

  if (subtitle) {
    subtitle.textContent =
      totals.itemCount === 0 ? "السلة فارغة" : `${totals.itemCount} قطعة في السلة`;
  }

  if (totals.lines.length === 0) {
    body.innerHTML = `<div class="cart-empty">
        <span class="cart-empty__icon">${icon("i-cart")}</span>
        <h3>سلتك فارغة</h3>
        <p>أضف صنفاً واحداً على الأقل من القائمة لتبدأ طلبك.</p>
        <button type="button" class="btn btn--primary btn--sm" data-scroll-to="menu" data-cart-close>
          تصفّح القائمة
        </button>
      </div>`;
  } else {
    body.innerHTML = totals.lines
      .map((line) => {
        const product = productsById.get(line.id);
        const qty = line.qty;
        return `<article class="cart-item" data-cart-item="${line.id}">
            <img class="cart-item__img" src="${esc(line.image)}" alt="${esc(
          line.imageAlt || line.name
        )}" width="64" height="64" loading="lazy" decoding="async">
            <div>
              <div class="cart-item__top">
                <div>
                  <h3>${esc(line.name)}</h3>
                  <span class="cart-item__unit">${money(line.price)} للواحد</span>
                </div>
                <span class="cart-item__line-total">${money(line.lineTotal)}</span>
              </div>
              <div class="cart-item__actions">
                ${qtyControlHtml(product || { id: line.id, name: line.name }, qty)}
                <button type="button" class="remove-btn" data-remove="${line.id}"
                        aria-label="حذف ${esc(line.name)} من السلة">${icon("i-trash")}</button>
              </div>
            </div>
          </article>`;
      })
      .join("");
  }

  if (foot) {
    const freeBox = $("#free-delivery");
    const freeText = $("#free-delivery-text");
    const freeBar = $("#free-delivery-progress");
    const minimum = Number(siteConfig.freeDeliveryMinimum) || 0;

    if (freeBox && freeText && freeBar) {
      const showFree =
        minimum > 0 && totals.lines.length > 0 && !totals.freeDeliveryApplied;
      freeBox.hidden = !showFree;
      if (showFree) {
        freeText.textContent = `أضف ${money(totals.freeDeliveryRemaining)} أكثر للحصول على توصيل مجاني 🎉`;
        const progress = Math.min(100, (totals.subtotal / minimum) * 100);
        freeBar.style.width = `${progress}%`;
      }
    }

    setText('[data-cart-total="subtotal"]', money(totals.subtotal));
    setText('[data-cart-total="delivery"]', money(totals.deliveryFee));
    setText('[data-cart-total="total"]', money(totals.total));

    const checkoutLink = $("[data-go-checkout]");
    if (checkoutLink) {
      checkoutLink.setAttribute("aria-disabled", totals.lines.length ? "false" : "true");
      checkoutLink.classList.toggle("is-disabled", totals.lines.length === 0);
    }
  }
}

function setText(selector, text) {
  $$(selector).forEach((el) => {
    el.textContent = text;
  });
}

function updateCartBadges() {
  const count = getItemCount(cart);
  $$("[data-cart-count]").forEach((el) => {
    el.textContent = String(count);
    el.hidden = count === 0;
  });
  const cartButton = $(".cart-button");
  if (cartButton) {
    cartButton.setAttribute(
      "aria-label",
      count === 0 ? "فتح سلة المشتريات (فارغة)" : `فتح سلة المشتريات (${count} قطعة)`
    );
  }
}

function updateMobileBar() {
  const bar = $("#mobile-bar");
  if (!bar) return;
  const count = getItemCount(cart);
  const checkoutView = $('[data-view="checkout"]');
  const onCheckout = checkoutView ? !checkoutView.hidden : false;
  bar.hidden = count === 0 || onCheckout;
}

function openCart() {
  const drawer = $("#cart-drawer");
  const overlay = $(".drawer-overlay");
  if (!drawer) return;
  lastFocusedBeforeDrawer = document.activeElement;
  drawer.hidden = false;
  if (overlay) overlay.hidden = false;
  document.body.classList.add("no-scroll");
  drawer.focus({ preventScroll: true });
}

function closeCart() {
  const drawer = $("#cart-drawer");
  const overlay = $(".drawer-overlay");
  if (!drawer || drawer.hidden) return;
  drawer.hidden = true;
  if (overlay) overlay.hidden = true;
  document.body.classList.remove("no-scroll");
  if (lastFocusedBeforeDrawer && typeof lastFocusedBeforeDrawer.focus === "function") {
    lastFocusedBeforeDrawer.focus({ preventScroll: true });
  }
}

function trapFocus(event) {
  const drawer = $("#cart-drawer");
  if (!drawer || drawer.hidden || event.key !== "Tab") return;
  const focusables = $$(
    'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])',
    drawer
  ).filter((el) => el.offsetParent !== null);
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/* ───────────────────────── إشعارات صغيرة ───────────────────────── */

function showToast(message) {
  const toast = $("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

/* ───────────────────────── إتمام الطلب ───────────────────────── */

const fieldConfig = {
  name: { input: "#customer-name", error: "#name-error", wrapper: '[data-field="name"]' },
  phone: { input: "#customer-phone", error: "#phone-error", wrapper: '[data-field="phone"]' },
  address: {
    input: "#customer-address",
    error: "#address-error",
    wrapper: '[data-field="address"]',
  },
};

function readForm() {
  return {
    name: $("#customer-name")?.value || "",
    phone: $("#customer-phone")?.value || "",
    address: $("#customer-address")?.value || "",
    notes: $("#customer-notes")?.value || "",
  };
}

function clearFieldErrors() {
  Object.entries(fieldConfig).forEach(([key, cfg]) => {
    const wrapper = $(cfg.wrapper);
    const errorEl = $(cfg.error);
    const input = $(cfg.input);
    if (wrapper) wrapper.classList.remove("field--error");
    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = "";
    }
    if (input) input.removeAttribute("aria-invalid");
  });
}

function showFieldErrors(errors) {
  Object.entries(errors).forEach(([key, message]) => {
    const cfg = fieldConfig[key];
    if (!cfg) return;
    const wrapper = $(cfg.wrapper);
    const errorEl = $(cfg.error);
    const input = $(cfg.input);
    if (wrapper) wrapper.classList.add("field--error");
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.hidden = false;
    }
    if (input) input.setAttribute("aria-invalid", "true");
  });

  const firstKey = Object.keys(errors)[0];
  if (firstKey && fieldConfig[firstKey]) $(fieldConfig[firstKey].input)?.focus();
}

function renderCheckoutSummary() {
  const linesEl = $("#checkout-lines");
  const emptyEl = $("#summary-empty");
  const totalsEl = $("#checkout-totals");
  const submit = $("#submit-order");
  const copy = $("#copy-order");
  const noteEl = $('[data-summary="delivery-note"]');
  if (!linesEl) return;

  const totals = totalsNow();
  const hasItems = totals.lines.length > 0;

  if (emptyEl) emptyEl.hidden = hasItems;
  if (totalsEl) totalsEl.hidden = !hasItems;

  linesEl.innerHTML = totals.lines
    .map(
      (line) => `<li class="summary__line">
        <img src="${esc(line.image)}" alt="${esc(line.imageAlt || line.name)}"
             width="52" height="52" loading="lazy" decoding="async">
        <div class="summary__line-info">
          <strong>${esc(line.name)}</strong>
          <span>${line.qty} × ${money(line.price)}</span>
        </div>
        <span class="summary__line-total">${money(line.lineTotal)}</span>
      </li>`
    )
    .join("");

  setText('[data-summary="subtotal"]', money(totals.subtotal));
  setText('[data-summary="delivery"]', money(totals.deliveryFee));
  setText('[data-summary="total"]', money(totals.total));

  const countEl = $("#summary-count");
  if (countEl) countEl.textContent = hasItems ? `(${totals.itemCount} قطعة)` : "";

  if (noteEl) {
    const minimum = Number(siteConfig.freeDeliveryMinimum) || 0;
    if (!hasItems) {
      noteEl.textContent = "";
      noteEl.hidden = true;
    } else if (totals.freeDeliveryApplied) {
      noteEl.textContent = "توصيل مجاني مطبّق على هذا الطلب 🎉";
      noteEl.hidden = false;
      noteEl.classList.remove("is-muted");
    } else if (minimum > 0) {
      noteEl.textContent = `أضف ${money(totals.freeDeliveryRemaining)} للحصول على توصيل مجاني. وقت التوصيل المتوقع: ${siteConfig.estimatedDelivery}.`;
      noteEl.hidden = false;
      noteEl.classList.add("is-muted");
    } else {
      noteEl.textContent = `وقت التوصيل المتوقع: ${siteConfig.estimatedDelivery}.`;
      noteEl.hidden = false;
      noteEl.classList.add("is-muted");
    }
  }

  if (submit) submit.disabled = !hasItems;
  if (copy) copy.disabled = !hasItems;
}

function currentMessage(validatedValues) {
  return buildWhatsAppMessage({
    cart,
    menu,
    customer: validatedValues,
    settings: siteConfig,
  });
}

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* نكمل بالطريقة الاحتياطية */
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

function handleSubmit(event) {
  event.preventDefault();
  const result = $("#order-result");
  if (result) result.hidden = true;

  const totals = totalsNow();
  if (totals.lines.length === 0) {
    showToast("سلتك فارغة — أضف صنفاً أولاً.");
    goToSection("menu");
    return;
  }

  clearFieldErrors();
  const { valid, errors, values } = validateCheckout(readForm());
  if (!valid) {
    showFieldErrors(errors);
    showToast("راجع الحقول المطلوبة قبل إرسال الطلب.");
    return;
  }

  const message = currentMessage(values);
  const url = buildWhatsAppUrl(siteConfig.whatsappNumber, message);
  const link = $("#order-result-link");
  const warning = $("#whatsapp-warning");

  if (!url) {
    if (warning) warning.hidden = false;
    copyToClipboard(message).then((copied) => {
      showToast(
        copied
          ? "تم نسخ تفاصيل الطلب — أضف رقم واتساب في الإعدادات لتفعيل الإرسال."
          : "رقم واتساب المطعم غير مُعدّ بعد — الصق تفاصيل الطلب في محادثة المطعم."
      );
    });
    if (result) {
      result.hidden = false;
      if (link) link.hidden = true;
    }
    warning?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
    return;
  }

  copyToClipboard(message);
  const opened = window.open(url, "_blank", "noopener");
  if (result) {
    result.hidden = false;
    if (link) {
      link.hidden = false;
      link.setAttribute("href", url);
    }
  }
  if (!opened) showToast("إن لم يفتح واتساب تلقائياً، استخدم زر «فتح واتساب».");
  else showToast("تم تجهيز رسالة الطلب في واتساب.");
}

function handleCopyOrder() {
  const { valid, errors, values } = validateCheckout(readForm());
  const customer = valid
    ? values
    : {
        name: values.name || "غير مُدخل",
        phone: values.phone || "غير مُدخل",
        address: values.address || "غير مُدخل",
        notes: values.notes || "",
      };
  if (!valid && Object.keys(errors).length > 0) {
    showFieldErrors(errors);
  }
  const message = currentMessage(customer);
  copyToClipboard(message).then((copied) => {
    showToast(copied ? "تم نسخ تفاصيل الطلب ✅" : "تعذّر النسخ التلقائي — حدّد النص وانسخه يدوياً.");
  });
}

/* ───────────────────────── التنقل بين الرئيسية والدفع ───────────────────────── */

function goToSection(id, { smooth = true } = {}) {
  const checkoutView = $('[data-view="checkout"]');
  if (checkoutView && !checkoutView.hidden) {
    window.history.replaceState(null, "", "#/");
    applyRoute();
  }
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({
    behavior: smooth && !prefersReducedMotion() ? "smooth" : "auto",
    block: "start",
  });
  window.history.replaceState(null, "", `#${id}`);
}

function applyRoute() {
  const hash = window.location.hash || "#/";
  const isCheckout = hash.startsWith("#/checkout");
  const homeView = $('[data-view="home"]');
  const checkoutView = $('[data-view="checkout"]');

  if (homeView) homeView.hidden = isCheckout;
  if (checkoutView) checkoutView.hidden = !isCheckout;

  $$("[data-nav]").forEach((link) => {
    link.classList.toggle("is-active", isCheckout ? false : link.dataset.nav === "home");
  });

  if (isCheckout) {
    renderCheckoutSummary();
    if (!getItemCount(cart)) showToast("سلتك فارغة — أضف صنفاً قبل إتمام الطلب.");
    window.scrollTo({ top: 0, behavior: "auto" });
  } else if (hash.length > 1 && !hash.startsWith("#/")) {
    const target = document.getElementById(hash.slice(1));
    if (target) target.scrollIntoView({ behavior: "auto", block: "start" });
  }

  updateMobileBar();
}

/* ───────────────────────── الأحداث ───────────────────────── */

function bindEvents() {
  document.addEventListener("click", (event) => {
    const addBtn = event.target.closest("[data-add]");
    if (addBtn) {
      const product = productsById.get(addBtn.dataset.add);
      if (product) {
        setCart(addItem(cart, product.id, 1));
        showToast(`تمت إضافة ${product.name} إلى السلة`);
      }
      return;
    }

    const incBtn = event.target.closest("[data-inc]");
    if (incBtn) {
      setCart(incrementItem(cart, incBtn.dataset.inc));
      return;
    }

    const decBtn = event.target.closest("[data-dec]");
    if (decBtn) {
      setCart(decrementItem(cart, decBtn.dataset.dec));
      return;
    }

    const removeBtn = event.target.closest("[data-remove]");
    if (removeBtn) {
      const product = productsById.get(removeBtn.dataset.remove);
      setCart(removeItem(cart, removeBtn.dataset.remove));
      if (product) showToast(`تم حذف ${product.name} من السلة`);
      return;
    }

    if (event.target.closest("[data-cart-open]")) {
      openCart();
      return;
    }

    if (event.target.closest("[data-cart-close]")) {
      closeCart();
      return;
    }

    const tab = event.target.closest("[data-category]");
    if (tab) {
      activeCategory = tab.dataset.category;
      renderTabs();
      renderMenu();
      const newTab = $(`#tab-${activeCategory}`);
      if (newTab) newTab.focus({ preventScroll: true });
      return;
    }

    const scrollLink = event.target.closest("[data-scroll-to]");
    if (scrollLink) {
      event.preventDefault();
      if (scrollLink.hasAttribute("data-cart-close")) closeCart();
      goToSection(scrollLink.dataset.scrollTo);
      return;
    }

    const checkoutLink = event.target.closest("[data-go-checkout]");
    if (checkoutLink) {
      if (getItemCount(cart) === 0) {
        event.preventDefault();
        showToast("أضف صنفاً واحداً على الأقل قبل إتمام الطلب.");
        return;
      }
      closeCart();
    }
  });

  // التنقل بالكيبورد بين تبويبات القائمة
  const tabs = $("#menu-tabs");
  if (tabs) {
    tabs.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      const tabEls = $$(".tab", tabs);
      const current = tabEls.indexOf(document.activeElement);
      if (current === -1) return;
      event.preventDefault();
      const dir = event.key === "ArrowRight" ? -1 : 1;
      const next = (current + dir + tabEls.length) % tabEls.length;
      tabEls[next].focus();
    });
  }

  const form = $("#checkout-form");
  if (form) {
    form.addEventListener("submit", handleSubmit);
    form.addEventListener("input", (event) => {
      const target = event.target;
      if (target && target.id === "customer-notes") {
        const count = $("#notes-count");
        if (count) count.textContent = String(target.value.length);
      }
      const wrapper = target.closest?.(".field");
      if (wrapper && wrapper.classList.contains("field--error")) {
        wrapper.classList.remove("field--error");
        const errorEl = wrapper.querySelector(".field__error");
        if (errorEl) errorEl.hidden = true;
        target.removeAttribute("aria-invalid");
      }
    });
    const phone = $("#customer-phone");
    phone?.addEventListener("blur", () => {
      if (!phone.value.trim()) return;
      const normalized = normalizePhone(phone.value);
      if (normalized) phone.value = normalized;
    });
  }

  $("#copy-order")?.addEventListener("click", handleCopyOrder);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeCart();
    trapFocus(event);
  });

  window.addEventListener("hashchange", applyRoute);
}

/* ───────────────────────── التشغيل ───────────────────────── */

function init() {
  applySiteConfig();
  renderTabs();
  renderPopular();
  renderMenu();
  renderCart();
  renderCheckoutSummary();
  updateCartBadges();
  bindEvents();
  applyRoute();

  // إعادة المزامنة عند الرجوع للصفحة من ذاكرة المتصفح
  window.addEventListener("pageshow", () => {
    cart = loadCart();
    renderCart();
    syncCardControls();
    renderCheckoutSummary();
    updateCartBadges();
    updateMobileBar();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
