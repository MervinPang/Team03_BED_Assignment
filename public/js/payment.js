document.addEventListener("DOMContentLoaded", async () => {
  const CHECKOUT_DRAFT_KEY = "hawkerhub_checkout_draft";
  const PAYMENT_CHANGE_KEY = "hawkerhub_payment_change";

  const query = new URLSearchParams(window.location.search);

  const changePaymentMode =
    query.get("changePayment") === "true";

  const queryOrderId = Number(query.get("orderId"));

  const queryGuestReference =
    query.get("reference")?.trim() || "";

  const backToCheckoutButton =
    document.getElementById("backToCheckoutButton");

  const rawDraft = sessionStorage.getItem(
    CHECKOUT_DRAFT_KEY
  );

  const rawPaymentChange = sessionStorage.getItem(
    PAYMENT_CHANGE_KEY
  );

  let draft = null;
  let paymentChange = null;

  if (rawDraft) {
    try {
      draft = JSON.parse(rawDraft);
    } catch {
      sessionStorage.removeItem(CHECKOUT_DRAFT_KEY);
    }
  }

  if (rawPaymentChange) {
    try {
      paymentChange = JSON.parse(
        rawPaymentChange
      );
    } catch {
      sessionStorage.removeItem(PAYMENT_CHANGE_KEY);
    }
  }

  if (changePaymentMode) {
    if (
      !Number.isInteger(queryOrderId) ||
      queryOrderId <= 0 ||
      !queryGuestReference
    ) {
      showToast(
        "The guest payment information is invalid.",
        "error"
      );

      window.location.replace(
        "/guest-order-tracking.html"
      );

      return;
    }

    try {
      const guestOrderData = await apiRequest(
        "/order-history/guest",
        {
          method: "POST",
          body: JSON.stringify({
            OrderID: queryOrderId,
            GuestOrderReference:
              queryGuestReference
          })
        }
      );

      const guestOrder =
        guestOrderData.order || guestOrderData;

      const guestItems = Array.isArray(
        guestOrderData.items
      )
        ? guestOrderData.items
        : [];

      const paymentStatus =
        guestOrder.PaymentStatus || "";

      if (guestOrder.OrderStatus !== "Pending") {
        throw new Error(
          "This order can no longer have its payment method changed."
        );
      }

      if (!isPendingPayment(paymentStatus)) {
        throw new Error(
          "This payment can no longer be changed."
        );
      }

      const paymentId = Number(
        guestOrder.PaymentID
      );

      if (
        !Number.isInteger(paymentId) ||
        paymentId <= 0
      ) {
        throw new Error(
          "The payment record could not be found."
        );
      }

      paymentChange = {
        OrderID: guestOrder.OrderID,
        PaymentID: paymentId,
        GuestOrderReference:
          queryGuestReference,
        CurrentPaymentMethod:
          guestOrder.PaymentMethod,
        PaymentStatus:
          guestOrder.PaymentStatus
      };

      sessionStorage.setItem(
        PAYMENT_CHANGE_KEY,
        JSON.stringify(paymentChange)
      );

      if (!draft) {
        throw new Error(
          "No payment method was selected."
        );
      }

      draft = {
        ...draft,
        isPaymentChange: true,
        isMember: false,
        orderId: guestOrder.OrderID,
        paymentId,
        guestReference:
          queryGuestReference,
        estimatedTotal: Number(
          guestOrder.TotalAmount
        ),
        stallName:
          guestOrder.StallName ||
          draft.stallName ||
          "Hawker stall",
        cartItems: guestItems.map(item => ({
          MenuItemID: item.MenuItemID,
          ItemName: item.ItemName,
          Quantity: Number(
            item.Quantity || 0
          ),
          Price: Number(
            item.UnitPrice ??
            item.Price ??
            (
              Number(item.Subtotal || 0) /
              Number(item.Quantity || 1)
            )
          )
        }))
      };
    } catch (error) {
      showToast(
        error.message ||
        "Unable to load the guest payment.",
        "error"
      );

      window.setTimeout(() => {
        window.location.replace(
          `/guest-order-tracking.html?orderId=${encodeURIComponent(
            queryOrderId
          )}&reference=${encodeURIComponent(
            queryGuestReference
          )}`
        );
      }, 1200);

      return;
    }
  } else {
    if (!draft) {
      window.location.replace(
        "/checkout.html"
      );

      return;
    }

    if (redirectNonCustomerFromOrdering()) {
      return;
    }
  }

  if (backToCheckoutButton && changePaymentMode) {
    backToCheckoutButton.href =
      `/checkout.html?changePayment=true` +
      `&orderId=${encodeURIComponent(queryOrderId)}` +
      `&reference=${encodeURIComponent(queryGuestReference)}`;
  }

  const method = draft.paymentMethod;

  const panels = {
    Cash: document.getElementById("cashPanel"),
    Card: document.getElementById("cardPanel"),
    PayNow: document.getElementById(
      "payNowPanel"
    )
  };

  Object.values(panels).forEach(panel => {
    if (panel) {
      panel.hidden = true;
    }
  });

  const activePanel =
    panels[method] || panels.Cash;

  if (activePanel) {
    activePanel.hidden = false;
  }

  const icon = document.getElementById(
    "paymentHeadingIcon"
  );

  const title = document.getElementById(
    "paymentMethodTitle"
  );

  const button = document.getElementById(
    "confirmPaymentButton"
  );

  const message = document.getElementById(
    "paymentMessage"
  );

  const referenceDisplay =
    document.getElementById(
      "displayTransactionReference"
    );

  const copyButton = document.getElementById(
    "copyReferenceButton"
  );

  const methodIcons = {
    Cash: "/images/takeaway-black.svg",
    Card: "/images/credit-card.svg",
    PayNow: "/images/qr-code.svg"
  };

  const transactionReference =
    generateTransactionReference(method);

  if (title) {
    title.textContent = method;
  }

  if (icon) {
    icon.src =
      methodIcons[method] ||
      methodIcons.Cash;
  }

  if (referenceDisplay) {
    referenceDisplay.textContent =
      transactionReference;
  }

  if (button) {
    if (changePaymentMode) {
      button.textContent =
        method === "Cash"
          ? "Confirm Cash Payment"
          : `Confirm ${method} Payment`;
    } else {
      button.textContent =
        method === "Cash"
          ? "Place Order with Cash"
          : `Pay ${money(
            draft.estimatedTotal
          )}`;
    }
  }

  const paymentSummary =
    document.getElementById(
      "paymentSummary"
    );

  if (paymentSummary) {
    paymentSummary.innerHTML = `
    <div class="payment-review-summary">

      <div class="payment-review-header">
        <div>
          <span class="payment-review-eyebrow">
            ${changePaymentMode ? "Payment Update" : "Order Summary"}
          </span>

          <h3>
            ${changePaymentMode
        ? `Order #${draft.orderId}`
        : esc(draft.stallName || "Hawker Stall")}
          </h3>
        </div>

        <span class="payment-review-method">
          <img
            src="${methodIcons[method] || methodIcons.Cash}"
            alt=""
          >

          ${esc(method)}
        </span>
      </div>

      ${changePaymentMode && draft.guestReference
        ? `
            <div class="payment-review-reference">
              <span>Guest Order Reference</span>

              <strong>
                ${esc(draft.guestReference)}
              </strong>
            </div>
          `
        : ""
      }

      <div class="payment-review-stall">
        <span>Ordering from</span>

        <strong>
          ${esc(draft.stallName || "Hawker Stall")}
        </strong>
      </div>

      <div class="payment-review-section">
        <span class="payment-review-section-title">
          Order Items
        </span>

        <div class="payment-review-item-list">

          ${Array.isArray(draft.cartItems) &&
        draft.cartItems.length
        ? draft.cartItems
          .map(
            item => `
                      <div class="payment-review-item">

                        <div>
                          <strong>
                            ${esc(item.ItemName)}
                          </strong>

                          <span>
                            ${Number(item.Quantity)} ×
                            ${money(Number(item.Price))}
                          </span>
                        </div>

                        <strong class="payment-review-item-price">
                          ${money(
              Number(item.Price) *
              Number(item.Quantity)
            )}
                        </strong>

                      </div>
                    `
          )
          .join("")
        : `
                  <p class="muted">
                    No order items were returned.
                  </p>
                `
      }

        </div>
      </div>

      <div class="payment-review-total">
        <div>
          <span>Amount Payable</span>

          <small>
            Total for this order
          </small>
        </div>

        <strong>
          ${money(draft.estimatedTotal)}
        </strong>
      </div>

    </div>
  `;
  }

  copyButton?.addEventListener(
    "click",
    async () => {
      try {
        await navigator.clipboard.writeText(
          transactionReference
        );

        copyButton.textContent = "Copied";

        window.setTimeout(() => {
          copyButton.textContent = "Copy";
        }, 1400);
      } catch {
        showToast(
          "Unable to copy the transaction reference.",
          "error"
        );
      }
    }
  );

  const cardNumber =
    document.getElementById("cardNumber");

  const cardExpiry =
    document.getElementById("cardExpiry");

  const cardCvv =
    document.getElementById("cardCvv");

  cardNumber?.addEventListener(
    "input",
    () => {
      cardNumber.value = cardNumber.value
        .replace(/\D/g, "")
        .slice(0, 16)
        .replace(/(.{4})/g, "$1 ")
        .trim();
    }
  );

  cardExpiry?.addEventListener(
    "input",
    () => {
      const digits = cardExpiry.value
        .replace(/\D/g, "")
        .slice(0, 4);

      cardExpiry.value =
        digits.length > 2
          ? `${digits.slice(
            0,
            2
          )}/${digits.slice(2)}`
          : digits;
    }
  );

  cardCvv?.addEventListener(
    "input",
    () => {
      cardCvv.value = cardCvv.value
        .replace(/\D/g, "")
        .slice(0, 4);
    }
  );

  function validatePaymentDetails() {
    if (method !== "Card") {
      return true;
    }

    const cardholderName =
      document
        .getElementById(
          "cardholderName"
        )
        ?.value.trim() || "";

    const cardDigits =
      cardNumber?.value.replace(
        /\s/g,
        ""
      ) || "";

    const expiry =
      cardExpiry?.value || "";

    const cvv =
      cardCvv?.value || "";

    if (!cardholderName) {
      setMessage(
        message,
        "Please enter the cardholder's name.",
        "error"
      );

      return false;
    }

    if (!/^\d{16}$/.test(cardDigits)) {
      setMessage(
        message,
        "Please enter a valid 16-digit card number.",
        "error"
      );

      return false;
    }

    if (!isValidExpiry(expiry)) {
      setMessage(
        message,
        "Please enter a valid expiry date in MM/YY format.",
        "error"
      );

      return false;
    }

    if (!/^\d{3,4}$/.test(cvv)) {
      setMessage(
        message,
        "Please enter a valid 3 or 4-digit CVV.",
        "error"
      );

      return false;
    }

    return true;
  }

  button?.addEventListener(
    "click",
    async () => {
      setMessage(message);

      if (!validatePaymentDetails()) {
        return;
      }

      button.disabled = true;

      button.innerHTML =
        '<span class="button-spinner"></span> Processing payment...';

      try {
        if (changePaymentMode) {
          await updateExistingGuestPayment();

          return;
        }

        await createNewOrderAndPayment();
      } catch (error) {
        const errorMessage =
          error?.message ||
          "Unable to complete the payment.";

        setMessage(
          message,
          errorMessage,
          "error"
        );

        showToast(
          errorMessage,
          "error"
        );

        button.disabled = false;

        if (changePaymentMode) {
          button.textContent =
            method === "Cash"
              ? "Confirm Cash Payment"
              : `Confirm ${method} Payment`;
        } else {
          button.textContent =
            method === "Cash"
              ? "Place Order with Cash"
              : `Pay ${money(
                draft.estimatedTotal
              )}`;
        }
      }
    }
  );

  async function updateExistingGuestPayment() {
    const savedPaymentChange =
      paymentChange ||
      JSON.parse(
        sessionStorage.getItem(
          PAYMENT_CHANGE_KEY
        ) || "null"
      );

    if (
      !savedPaymentChange ||
      !Number.isInteger(
        Number(
          savedPaymentChange.PaymentID
        )
      )
    ) {
      throw new Error(
        "Payment information could not be loaded."
      );
    }

    await apiRequest(
      `/payments/${savedPaymentChange.PaymentID}/method`,
      {
        method: "PUT",
        body: JSON.stringify({
          PaymentMethod: method,
          GuestOrderReference:
            savedPaymentChange.GuestOrderReference,
          TransactionReference:
            method === "Cash"
              ? ""
              : transactionReference
        })
      }
    );

    sessionStorage.removeItem(
      PAYMENT_CHANGE_KEY
    );

    sessionStorage.removeItem(
      CHECKOUT_DRAFT_KEY
    );

    showToast(
      "Payment method updated successfully."
    );

    const orderId = encodeURIComponent(
      savedPaymentChange.OrderID
    );

    const reference = encodeURIComponent(
      savedPaymentChange.GuestOrderReference
    );

    window.location.assign(
      `/guest-order-tracking.html?orderId=${orderId}&reference=${reference}`
    );
  }

  async function createNewOrderAndPayment() {
    const order = await apiRequest(
      "/orders",
      {
        method: "POST",
        body: JSON.stringify(
          draft.orderPayload
        )
      }
    );

    const orderId = Number(
      order?.OrderID ??
      order?.order?.OrderID
    );

    const guestReference =
      order?.GuestOrderReference ??
      order?.order?.GuestOrderReference ??
      null;

    if (
      !Number.isInteger(orderId) ||
      orderId <= 0
    ) {
      throw new Error(
        "The backend did not return a valid Order ID."
      );
    }

    localStorage.setItem(
      PENDING_ORDER_KEY,
      JSON.stringify(order)
    );

    const paymentPayload = {
      OrderID: orderId,
      PaymentMethod: method,
      TransactionReference:
        transactionReference
    };

    if (!draft.isMember) {
      if (!guestReference) {
        throw new Error(
          "The backend did not return a guest order reference."
        );
      }

      paymentPayload.GuestOrderReference =
        guestReference;
    }

    const payment = await apiRequest(
      "/payments",
      {
        method: "POST",
        body: JSON.stringify(
          paymentPayload
        )
      }
    );

    if (!draft.isMember) {
      saveGuestOrder({
        OrderID: orderId,
        GuestOrderReference:
          guestReference
      });
    }

    const serverOrder =
      order?.order || order;

    const serverItems =
      Array.isArray(order?.items)
        ? order.items
        : Array.isArray(serverOrder?.items)
          ? serverOrder.items
          : [];

    const items = serverItems.length
      ? serverItems.map(item => ({
        MenuItemID: item.MenuItemID,
        ItemName: item.ItemName,
        Quantity: Number(
          item.Quantity
        ),
        Price: Number(
          item.UnitPrice ??
          item.Price ??
          (
            Number(
              item.Subtotal
            ) /
            Number(
              item.Quantity || 1
            )
          )
        )
      }))
      : draft.cartItems;

    const serverTotal = Number(
      serverOrder?.TotalAmount ??
      order?.TotalAmount
    );

    const backendTransactionReference =
      payment?.TransactionReference ??
      transactionReference;

    sessionStorage.setItem(
      ORDER_CONFIRMATION_KEY,
      JSON.stringify({
        orderId,
        guestReference,
        transactionReference:
          backendTransactionReference,
        isMember: draft.isMember,
        stallName: draft.stallName,
        items,
        subtotal:
          Number.isFinite(serverTotal)
            ? serverTotal
            : draft.estimatedTotal,
        paymentMethod: method,
        paymentStatus:
          payment?.PaymentStatus ||
          (
            method === "Cash"
              ? "Pending"
              : "Successful"
          ),
        placedAt:
          new Date().toISOString()
      })
    );

    clearCart();

    localStorage.removeItem(
      PENDING_ORDER_KEY
    );

    sessionStorage.removeItem(
      CHECKOUT_DRAFT_KEY
    );

    window.location.assign(
      "/confirmation.html"
    );
  }

  function generateTransactionReference(
    paymentMethod
  ) {
    const datePart = new Date()
      .toISOString()
      .slice(0, 10)
      .replaceAll("-", "");

    const randomPart =
      crypto?.randomUUID
        ? crypto
          .randomUUID()
          .replaceAll("-", "")
          .slice(0, 8)
          .toUpperCase()
        : Math.random()
          .toString(36)
          .slice(2, 10)
          .toUpperCase();

    const prefix =
      paymentMethod === "PayNow"
        ? "PN"
        : paymentMethod === "Card"
          ? "CARD"
          : "CASH";

    return `${prefix}-${datePart}-${randomPart}`;
  }

  function isValidExpiry(value) {
    if (!/^\d{2}\/\d{2}$/.test(value)) {
      return false;
    }

    const [monthText, yearText] =
      value.split("/");

    const month = Number(monthText);

    const year =
      2000 + Number(yearText);

    if (month < 1 || month > 12) {
      return false;
    }

    const expiryDate = new Date(
      year,
      month,
      0,
      23,
      59,
      59
    );

    return expiryDate >= new Date();
  }
});