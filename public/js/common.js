const TOKEN_KEY = "hawker_token";
const LEGACY_CART_KEY = "hawker_cart";
const GUEST_CART_KEY = "hawker_cart_guest";

function cartStorageKey() {
  const user = getCurrentUser();

  if (!user) {
    return GUEST_CART_KEY;
  }

  const identifier =
    user.id ?? user.username ?? "member";

  return `hawker_cart_user_${identifier}`;
}

function migrateLegacyCart() {
  const activeKey = cartStorageKey();

  if (localStorage.getItem(activeKey)) {
    return;
  }

  const legacyCart = localStorage.getItem(LEGACY_CART_KEY);

  if (legacyCart) {
    localStorage.setItem(activeKey, legacyCart);
    localStorage.removeItem(LEGACY_CART_KEY);
  }
}
const PENDING_ORDER_KEY = "hawker_pending_order";
const GUEST_ORDERS_KEY = "hawker_guest_orders";
const ORDER_CONFIRMATION_KEY = "hawker_order_confirmation";

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function decodeToken() {
  const token = getToken();
  if (!token) return null;

  try {
    const payload = token.split(".")[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const padded = payload.padEnd(payload.length + (4 - payload.length % 4) % 4, "=");
    const decoded = decodeURIComponent(
      atob(padded)
        .split("")
        .map(character => `%${("00" + character.charCodeAt(0).toString(16)).slice(-2)}`)
        .join("")
    );

    const parsed = JSON.parse(decoded);

    if (parsed.exp && Number(parsed.exp) * 1000 <= Date.now()) {
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }

    return parsed;
  } catch {
    localStorage.removeItem(TOKEN_KEY);
    return null;
  }
}

function getCurrentUser() {
  const payload = decodeToken();
  if (!payload) return null;

  return {
    id: payload.id ?? payload.UserID ?? payload.userId,
    username: payload.username ?? payload.Username ?? payload.name ?? "User",
    email: payload.email ?? payload.Email ?? "",
    role: payload.role ?? payload.Role
  };
}

function role(value) {
  return String(value || "").toLowerCase();
}

async function apiRequest(path, options = {}) {
  const headers = { ...(options.headers || {}) };

  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;

  try {
    response = await fetch(path, {
      ...options,
      headers
    });
  } catch {
    throw new Error("Unable to connect to the server.");
  }

  let body = null;

  if (response.status !== 204) {
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      body = await response.json().catch(() => null);
    } else {
      body = await response.text().catch(() => "");
    }
  }

  if (!response.ok) {
    const error = new Error(
      body?.error ||
      body?.message ||
      body ||
      `Request failed with status ${response.status}`
    );

    error.status = response.status;
    error.body = body;
    throw error;
  }

  return body;
}

function showToast(message, type = "success") {
  let region = document.querySelector(".toast-region");

  if (!region) {
    region = document.createElement("div");
    region.className = "toast-region";
    region.setAttribute("aria-live", "polite");
    document.body.appendChild(region);
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  region.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 4200);
}

function setMessage(element, message = "", type = "error") {
  if (!element) return;
  element.textContent = message;
  element.className = `form-message ${message ? type : ""}`;
}

function money(value) {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD"
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function getCart() {
  try {
    migrateLegacyCart();

    const cart = JSON.parse(
      localStorage.getItem(cartStorageKey())
    );

    if (!cart || !Array.isArray(cart.items)) {
      return {
        StallID: null,
        StallName: "",
        items: []
      };
    }

    return cart;
  } catch (error) {
    console.error("Unable to read cart:", error);

    return {
      StallID: null,
      StallName: "",
      items: []
    };
  }
}

async function refreshCartFromBackend() {
  const cart = getCart();

  if (
    !Number.isInteger(Number(cart.StallID)) ||
    Number(cart.StallID) <= 0 ||
    !Array.isArray(cart.items) ||
    !cart.items.length
  ) {
    return cart;
  }

  try {
    const response = await apiRequest(
      `/stalls/${Number(cart.StallID)}/menu-items`
    );

    const currentMenuItems = Array.isArray(response)
      ? response
      : Array.isArray(response?.menuItems)
        ? response.menuItems
        : Array.isArray(response?.items)
          ? response.items
          : [];

    if (!currentMenuItems.length) {
      return cart;
    }

    let changed = false;

    const refreshedItems = cart.items.map(savedItem => {
      const currentItem = currentMenuItems.find(
        menuItem =>
          Number(menuItem.MenuItemID) ===
          Number(savedItem.MenuItemID)
      );

      if (!currentItem) {
        if (savedItem.IsAvailable !== false) {
          changed = true;
        }

        return {
          ...savedItem,
          IsAvailable: false
        };
      }

      const refreshedItem = {
        ...savedItem,
        ItemName:
          currentItem.ItemName ??
          savedItem.ItemName,
        Price: Number(currentItem.Price),
        IsAvailable:
          currentItem.IsAvailable === true ||
          Number(currentItem.IsAvailable) === 1
      };

      if (
        refreshedItem.ItemName !== savedItem.ItemName ||
        Number(refreshedItem.Price) !==
        Number(savedItem.Price) ||
        refreshedItem.IsAvailable !==
        savedItem.IsAvailable
      ) {
        changed = true;
      }

      return refreshedItem;
    });

    const refreshedCart = {
      ...cart,
      items: refreshedItems
    };

    if (changed) {
      saveCart(refreshedCart);
    }

    return refreshedCart;
  } catch (error) {
    console.error(
      "Unable to refresh cart from backend:",
      error
    );

    /*
     * Do not destroy the cart when the server is temporarily
     * unavailable. The backend will still validate the items,
     * prices and availability during checkout.
     */
    return cart;
  }
}

function saveCart(cart) {
  localStorage.setItem(
    cartStorageKey(),
    JSON.stringify(cart)
  );
  updateCartCount();
}

function clearCart() {
  localStorage.removeItem(cartStorageKey());
  updateCartCount();
}

function transferGuestCartToCurrentUser() {
  const user = getCurrentUser();
  if (!user) return;

  const guestCartRaw = localStorage.getItem(GUEST_CART_KEY);
  if (!guestCartRaw) {
    localStorage.removeItem(LEGACY_CART_KEY);
    return;
  }

  const memberKey = cartStorageKey();
  const memberCartRaw = localStorage.getItem(memberKey);

  try {
    const guestCart = JSON.parse(guestCartRaw);
    const memberCart = memberCartRaw ? JSON.parse(memberCartRaw) : null;

    if (!memberCart || !Array.isArray(memberCart.items) || !memberCart.items.length) {
      localStorage.setItem(memberKey, guestCartRaw);
      localStorage.removeItem(GUEST_CART_KEY);
    } else if (
      Number(memberCart.StallID) === Number(guestCart.StallID) &&
      Array.isArray(guestCart.items)
    ) {
      const merged = structuredClone(memberCart);

      guestCart.items.forEach(guestItem => {
        const existing = merged.items.find(
          item => Number(item.MenuItemID) === Number(guestItem.MenuItemID)
        );

        if (existing) {
          existing.Quantity = Number(existing.Quantity) + Number(guestItem.Quantity);
        } else {
          merged.items.push(guestItem);
        }
      });

      localStorage.setItem(memberKey, JSON.stringify(merged));
      localStorage.removeItem(GUEST_CART_KEY);
    }
    // Different-stall carts remain separate. The member cart is shown while
    // signed in; the anonymous cart remains available only after logout.
  } catch {
    // Corrupt anonymous cart data should never destroy the member cart.
    localStorage.removeItem(GUEST_CART_KEY);
  }

  localStorage.removeItem(LEGACY_CART_KEY);
  updateCartCount();
}

function cartQty(cart = getCart()) {
  return cart.items.reduce(
    (total, item) => total + Number(item.Quantity || 0),
    0
  );
}

function subtotal(cart = getCart()) {
  return cart.items.reduce(
    (total, item) =>
      total + Number(item.Price || 0) * Number(item.Quantity || 0),
    0
  );
}

function updateCartCount() {
  document.querySelectorAll("[data-cart-count]").forEach(element => {
    element.textContent = cartQty();
  });
}

function saveGuestOrder(order) {
  const existing = JSON.parse(
    localStorage.getItem(GUEST_ORDERS_KEY) || "[]"
  );

  const record = {
    OrderID: order.OrderID ?? order.order?.OrderID,
    GuestOrderReference:
      order.GuestOrderReference ??
      order.order?.GuestOrderReference
  };

  const updated = [
    record,
    ...existing.filter(
      item => String(item.OrderID) !== String(record.OrderID)
    )
  ].slice(0, 8);

  localStorage.setItem(
    GUEST_ORDERS_KEY,
    JSON.stringify(updated)
  );
}

function clearPendingOrder() {
  localStorage.removeItem(PENDING_ORDER_KEY);
}

function logout() {
  /*
   * Remove authentication only. The member cart remains under the
   * account-specific storage key and is not visible to a guest.
   */
  localStorage.removeItem(TOKEN_KEY);
  clearPendingOrder();
  sessionStorage.removeItem(ORDER_CONFIRMATION_KEY);
  window.location.href = "/index.html";
}

function isPendingPayment(paymentStatus) {
  return ["Pending", "Failed"].includes(String(paymentStatus || ""));
}

function paymentLabel(paymentStatus) {
  const status = String(paymentStatus || "");

  if (status === "Successful") return "Paid";
  if (status === "Pending") return "Awaiting Payment";
  if (status === "Failed") return "Payment Failed";
  if (status === "Refunded") return "Refunded";

  return "Not recorded";
}

function paymentBadgeClass(paymentStatus) {
  const status = String(paymentStatus || "");

  if (status === "Successful") return "success";
  if (status === "Pending") return "warning";
  if (status === "Failed") return "unavailable";
  if (status === "Refunded") return "neutral";

  return "neutral";
}


function setupNav() {
  const user = getCurrentUser();
  const currentRole = role(user?.role);
  const canOrder = !user || currentRole === "customer";

  const mobileToggle = document.querySelector("[data-mobile-toggle]");
  const navigation = document.querySelector(".nav-links");

  mobileToggle?.addEventListener("click", () => {
    const isOpen = navigation?.classList.toggle("open") || false;
    mobileToggle.setAttribute("aria-expanded", String(isOpen));
    mobileToggle.setAttribute(
      "aria-label",
      isOpen ? "Close navigation" : "Open navigation"
    );
  });

  navigation?.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
      navigation.classList.remove("open");
      mobileToggle?.setAttribute("aria-expanded", "false");
      mobileToggle?.setAttribute("aria-label", "Open navigation");
    });
  });

  document.addEventListener("click", event => {
    if (
      navigation?.classList.contains("open") &&
      !navigation.contains(event.target) &&
      !mobileToggle?.contains(event.target)
    ) {
      navigation.classList.remove("open");
      mobileToggle?.setAttribute("aria-expanded", "false");
      mobileToggle?.setAttribute("aria-label", "Open navigation");
    }
  });

  const currentPage =
    location.pathname.split("/").pop() || "index.html";

  document.querySelectorAll(".nav-link").forEach(link => {
    if (link.getAttribute("href")?.endsWith(currentPage)) {
      link.classList.add("active");
    }
  });

  document.querySelectorAll("[data-auth-only]").forEach(element => {
    element.hidden = !user;
  });

  document.querySelectorAll("[data-guest-only]").forEach(element => {
    element.hidden = Boolean(user);
  });

  document.querySelectorAll("[data-customer-only]").forEach(element => {
    element.hidden = currentRole !== "customer";
  });

  document.querySelectorAll("[data-vendor-only]").forEach(element => {
    element.hidden = currentRole !== "vendor";
  });

  document.querySelectorAll("[data-nea-only]").forEach(element => {
    element.hidden = currentRole !== "nea_officer";
  });

  document.querySelectorAll("[data-user-name]").forEach(element => {
    element.textContent = user?.username || "";
  });

  document.querySelectorAll("[data-logout]").forEach(element => {
    element.addEventListener("click", logout);
  });

  document.querySelectorAll(".cart-pill").forEach(element => {
    element.hidden = !canOrder;
  });

  document.querySelectorAll('.nav-link[href="/stalls.html"]').forEach(element => {
    element.hidden = !canOrder;
  });

  updateCartCount();

  const existingCart = getCart();

  if (canOrder && existingCart.items.length) {
    refreshCartFromBackend()
      .then(() => {
        updateCartCount();
      })
      .catch(error => {
        console.error(
          "Unable to refresh navigation cart:",
          error
        );
      });
  }
}

function requireCustomer() {
  const user = getCurrentUser();

  if (!user || role(user.role) !== "customer") {
    window.location.href =
      "/login.html?next=" +
      encodeURIComponent(location.pathname + location.search);
    return null;
  }

  return user;
}

function requireVendor() {
  const user = getCurrentUser();

  if (!user || role(user.role) !== "vendor") {
    window.location.href =
      "/login.html?next=/vendor-dashboard.html";
    return null;
  }

  return user;
}

function requireNeaOfficer() {
  const user = getCurrentUser();

  if (!user || role(user.role) !== "nea_officer") {
    window.location.href =
      "/login.html?next=/inspection-reports.html";
    return null;
  }

  return user;
}

document.addEventListener("DOMContentLoaded", setupNav);

document.addEventListener("DOMContentLoaded", () => {
  const items = document.querySelectorAll(
    ".reveal, .card, .stall-card, .menu-card"
  );

  if (!("IntersectionObserver" in window)) {
    items.forEach(item => item.classList.add("visible"));
    return;
  }

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08 }
  );

  items.forEach(item => {
    item.classList.add("reveal");
    observer.observe(item);
  });
});




function openPageAtTop(destination) {
  sessionStorage.setItem("hawker_open_at_top", "1");
  window.location.assign(destination);
}

function forcePageToTop() {
  if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
  }

  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

document.addEventListener("click", event => {
  const footerLink = event.target.closest(".site-footer a[href]");

  if (!footerLink) {
    return;
  }

  const rawHref = footerLink.getAttribute("href");

  if (
    !rawHref ||
    rawHref.startsWith("mailto:") ||
    rawHref.startsWith("tel:") ||
    rawHref.startsWith("http://") ||
    rawHref.startsWith("https://")
  ) {
    return;
  }

  event.preventDefault();

  const destination =
    rawHref === "#"
      ? "/index.html"
      : rawHref.split("#")[0] || "/index.html";

  openPageAtTop(destination);
});

window.addEventListener("DOMContentLoaded", () => {
  if (sessionStorage.getItem("hawker_open_at_top") === "1") {
    sessionStorage.removeItem("hawker_open_at_top");
    forcePageToTop();
    requestAnimationFrame(forcePageToTop);
  }
});

window.addEventListener("pageshow", () => {
  if (sessionStorage.getItem("hawker_open_at_top") === "1") {
    sessionStorage.removeItem("hawker_open_at_top");
    forcePageToTop();
  }
});


function getRoleHomePath(user = getCurrentUser()) {
  if (!user) {
    return "/index.html";
  }

  const userRole = role(user.role || user.Role);

  if (userRole === "vendor") {
    return "/vendor-dashboard.html";
  }

  if (userRole === "nea_officer") {
    return "/inspection-reports.html";
  }

  return "/index.html";
}

function redirectNonCustomerFromOrdering() {
  const user = getCurrentUser();

  if (!user) {
    return false;
  }

  const userRole = role(user.role || user.Role);

  if (userRole === "vendor" || userRole === "nea_officer") {
    window.location.replace(getRoleHomePath(user));
    return true;
  }

  return false;
}


function hideHomeForStaffRoles() {
  const user = getCurrentUser();
  const currentRole = role(user?.role || user?.Role);

  if (!["vendor", "nea_officer"].includes(currentRole)) {
    return;
  }

  document.querySelectorAll(".nav-links a, .nav-link").forEach(link => {
    const label = (link.textContent || "").trim().toLowerCase();
    const href = (link.getAttribute("href") || "").toLowerCase();

    if (
      label === "home" ||
      href === "/" ||
      href.endsWith("/index.html") ||
      href === "index.html"
    ) {
      link.remove();
    }
  });
}

document.addEventListener("DOMContentLoaded", hideHomeForStaffRoles);
