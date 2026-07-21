document.addEventListener("DOMContentLoaded", () => {
  const CHECKOUT_DRAFT_KEY = "hawkerhub_checkout_draft";
  const rawDraft = sessionStorage.getItem(CHECKOUT_DRAFT_KEY);

  if (!rawDraft) {
    window.location.replace("/checkout.html");
    return;
  }

  let draft;
  try {
    draft = JSON.parse(rawDraft);
  } catch {
    window.location.replace("/checkout.html");
    return;
  }

  if (redirectNonCustomerFromOrdering()) return;

  const method = draft.paymentMethod;
  const panels = {
    Cash: document.getElementById("cashPanel"),
    Card: document.getElementById("cardPanel"),
    PayNow: document.getElementById("payNowPanel")
  };

  Object.values(panels).forEach(panel => {
    panel.hidden = true;
  });
  (panels[method] || panels.Cash).hidden = false;

  const icon = document.getElementById("paymentHeadingIcon");
  const title = document.getElementById("paymentMethodTitle");
  const button = document.getElementById("confirmPaymentButton");
  const message = document.getElementById("paymentMessage");
  const referenceDisplay = document.getElementById("displayTransactionReference");
  const copyButton = document.getElementById("copyReferenceButton");

  const methodIcons = {
    Cash: "/images/takeaway-black.svg",
    Card: "/images/credit-card.svg",
    PayNow: "/images/qr-code.svg"
  };

  const transactionReference = generateTransactionReference(method);

  title.textContent = method;
  icon.src = methodIcons[method] || methodIcons.Cash;
  referenceDisplay.textContent = transactionReference;
  button.textContent = method === "Cash"
    ? "Place Order with Cash"
    : `Pay ${money(draft.estimatedTotal)}`;

  document.getElementById("paymentSummary").innerHTML = `
    <div class="summary-header">
      <h3>Order summary</h3>
      <span class="payment-method-badge">
        <img src="${methodIcons[method]}" alt="">
        ${esc(method)}
      </span>
    </div>
    <div class="summary-stall">
      <span>Ordering from</span>
      <strong>${esc(draft.stallName)}</strong>
    </div>
    <div class="checkout-items">
      ${draft.cartItems.map(item => `
        <div class="checkout-item">
          <div>
            <strong>${esc(item.ItemName)}</strong>
            <span class="muted">${item.Quantity} × ${money(item.Price)}</span>
          </div>
          <strong>${money(item.Price * item.Quantity)}</strong>
        </div>
      `).join("")}
    </div>
    <div class="summary-totals">
      <div class="summary-line total">
        <span>Amount payable</span>
        <strong>${money(draft.estimatedTotal)}</strong>
      </div>
    </div>
  `;

  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(transactionReference);
      copyButton.textContent = "Copied";
      window.setTimeout(() => {
        copyButton.textContent = "Copy";
      }, 1400);
    } catch {
      showToast("Unable to copy the transaction reference.", "error");
    }
  });

  const cardNumber = document.getElementById("cardNumber");
  const cardExpiry = document.getElementById("cardExpiry");
  const cardCvv = document.getElementById("cardCvv");

  cardNumber?.addEventListener("input", () => {
    cardNumber.value = cardNumber.value
      .replace(/\D/g, "")
      .slice(0, 16)
      .replace(/(.{4})/g, "$1 ")
      .trim();
  });

  cardExpiry?.addEventListener("input", () => {
    const digits = cardExpiry.value.replace(/\D/g, "").slice(0, 4);
    cardExpiry.value = digits.length > 2
      ? `${digits.slice(0, 2)}/${digits.slice(2)}`
      : digits;
  });

  cardCvv?.addEventListener("input", () => {
    cardCvv.value = cardCvv.value.replace(/\D/g, "").slice(0, 4);
  });

  function validatePaymentDetails() {
    if (method !== "Card") return true;

    const cardholderName = document.getElementById("cardholderName").value.trim();
    const cardDigits = cardNumber.value.replace(/\s/g, "");
    const expiry = cardExpiry.value;
    const cvv = cardCvv.value;

    if (!cardholderName) {
      setMessage(message, "Enter the cardholder name.", "error");
      return false;
    }

    if (!/^\d{16}$/.test(cardDigits)) {
      setMessage(message, "Enter a valid 16-digit demonstration card number.", "error");
      return false;
    }

    if (!isValidExpiry(expiry)) {
      setMessage(message, "Enter a valid future expiry date in MM/YY format.", "error");
      return false;
    }

    if (!/^\d{3,4}$/.test(cvv)) {
      setMessage(message, "Enter a valid 3 or 4-digit CVV.", "error");
      return false;
    }

    return true;
  }

  button.addEventListener("click", async () => {
    setMessage(message);
    if (!validatePaymentDetails()) return;

    button.disabled = true;
    button.innerHTML = '<span class="button-spinner"></span> Submitting to backend…';

    try {
      const order = await apiRequest("/orders", {
        method: "POST",
        body: JSON.stringify(draft.orderPayload)
      });

      const orderId = Number(order?.OrderID ?? order?.order?.OrderID);
      const guestReference = order?.GuestOrderReference
        ?? order?.order?.GuestOrderReference
        ?? null;

      if (!Number.isInteger(orderId) || orderId <= 0) {
        throw new Error("The backend did not return a valid Order ID.");
      }

      localStorage.setItem(PENDING_ORDER_KEY, JSON.stringify(order));

      const paymentPayload = {
        OrderID: orderId,
        PaymentMethod: method,
        TransactionReference: transactionReference
      };

      if (!draft.isMember) {
        if (!guestReference) {
          throw new Error("The backend did not return a guest order reference.");
        }
        paymentPayload.GuestOrderReference = guestReference;
      }

      const payment = await apiRequest("/payments", {
        method: "POST",
        body: JSON.stringify(paymentPayload)
      });

      if (!draft.isMember) {
        saveGuestOrder({
          OrderID: orderId,
          GuestOrderReference: guestReference
        });
      }

      const serverOrder = order?.order || order;
      const serverItems = Array.isArray(order?.items)
        ? order.items
        : Array.isArray(serverOrder?.items)
          ? serverOrder.items
          : [];

      const items = serverItems.length
        ? serverItems.map(item => ({
          MenuItemID: item.MenuItemID,
          ItemName: item.ItemName,
          Quantity: Number(item.Quantity),
          Price: Number(
            item.UnitPrice
            ?? item.Price
            ?? (Number(item.Subtotal) / Number(item.Quantity || 1))
          )
        }))
        : draft.cartItems;

      const serverTotal = Number(serverOrder?.TotalAmount ?? order?.TotalAmount);
      const backendTransactionReference = payment?.TransactionReference
        ?? transactionReference;

      sessionStorage.setItem(ORDER_CONFIRMATION_KEY, JSON.stringify({
        orderId,
        guestReference,
        transactionReference: backendTransactionReference,
        isMember: draft.isMember,
        stallName: draft.stallName,
        items,
        subtotal: Number.isFinite(serverTotal)
          ? serverTotal
          : draft.estimatedTotal,
        paymentMethod: method,
        paymentStatus: payment?.PaymentStatus
          || (method === "Cash" ? "Pending" : "Successful"),
        placedAt: new Date().toISOString()
      }));

      clearCart();
      localStorage.removeItem(PENDING_ORDER_KEY);
      sessionStorage.removeItem(CHECKOUT_DRAFT_KEY);
      window.location.assign("/confirmation.html");
    } catch (error) {
      const errorMessage = error?.message
        || "Unable to complete the backend order and payment.";

      setMessage(message, errorMessage, "error");
      showToast(errorMessage, "error");
      button.disabled = false;
      button.textContent = method === "Cash"
        ? "Place order with cash"
        : `Pay ${money(draft.estimatedTotal)}`;
    }
  });

  function generateTransactionReference(paymentMethod) {
    const datePart = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    const randomPart = crypto?.randomUUID
      ? crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()
      : Math.random().toString(36).slice(2, 10).toUpperCase();
    const prefix = paymentMethod === "PayNow"
      ? "PN"
      : paymentMethod === "Card"
        ? "CARD"
        : "CASH";
    return `${prefix}-${datePart}-${randomPart}`;
  }

  function isValidExpiry(value) {
    if (!/^\d{2}\/\d{2}$/.test(value)) return false;
    const [monthText, yearText] = value.split("/");
    const month = Number(monthText);
    const year = 2000 + Number(yearText);
    if (month < 1 || month > 12) return false;
    const expiryDate = new Date(year, month, 0, 23, 59, 59);
    return expiryDate >= new Date();
  }
});
