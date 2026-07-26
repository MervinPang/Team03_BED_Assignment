document.addEventListener("DOMContentLoaded", async () => {
  if (redirectNonCustomerFromOrdering()) return;

  const CHECKOUT_DRAFT_KEY = "hawkerhub_checkout_draft";

  const query = new URLSearchParams(window.location.search);

  const isPaymentChange =
    query.get("changePayment") === "true";

  document.body.classList.toggle(
    "payment-change-mode",
    isPaymentChange
  );

  const paymentChangeOrderId = Number(
    query.get("orderId")
  );

  const paymentChangeReference =
    query.get("reference")?.trim() || "";

  const form = document.getElementById("checkoutForm");

  const cartContainer =
    document.getElementById("checkoutCart");

  const messageContainer =
    document.getElementById("checkoutMessage");

  const guestFields =
    document.getElementById("guestFields");

  const guestNameInput =
    document.getElementById("guestName");

  const guestEmailInput =
    document.getElementById("guestEmail");

  const referenceField =
    document.getElementById("referenceField");

  const transactionReference =
    document.getElementById(
      "transactionReference"
    );

  const instructions =
    document.getElementById(
      "specialInstructions"
    );

  const counter =
    document.getElementById(
      "instructionLimit"
    );

  const submitButton =
    document.getElementById("submitButton");

  const currentUser = getCurrentUser();
  const currentRole = role(currentUser?.role);
  const isMember = currentRole === "customer";

  let paymentChangeOrder = null;
  let paymentChangeItems = [];

  if (currentUser && !isMember) {
    window.location.replace(
      currentRole === "vendor"
        ? "/vendor-dashboard.html"
        : "/inspection-reports.html"
    );

    return;
  }

  referenceField.hidden = true;
  transactionReference.disabled = true;
  transactionReference.required = false;

  if (isPaymentChange) {
    guestFields.hidden = true;

    guestNameInput.disabled = true;
    guestEmailInput.disabled = true;

    guestNameInput.required = false;
    guestEmailInput.required = false;

    const checkoutTitle =
      document.getElementById("checkoutTitle");

    const checkoutSubtitle =
      document.getElementById("checkoutSubtitle");

    if (checkoutTitle) {
      checkoutTitle.textContent =
        "Review and Update Payment";
    }

    if (checkoutSubtitle) {
      checkoutSubtitle.textContent =
        "Review your existing order and choose a new payment method.";
    }

    instructions.readOnly = true;
    instructions.disabled = false;

    await loadGuestOrderForPaymentChange();
  } else {
    guestFields.hidden = isMember;

    guestNameInput.disabled = isMember;
    guestEmailInput.disabled = isMember;

    guestNameInput.required = !isMember;
    guestEmailInput.required = !isMember;
  }

  async function loadGuestOrderForPaymentChange() {
    if (
      !Number.isInteger(paymentChangeOrderId) ||
      paymentChangeOrderId <= 0 ||
      !paymentChangeReference
    ) {
      setMessage(
        messageContainer,
        "The guest order information is invalid.",
        "error"
      );

      form.hidden = true;
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Loading order…";

    try {
      const data = await apiRequest(
        "/order-history/guest",
        {
          method: "POST",
          body: JSON.stringify({
            OrderID: paymentChangeOrderId,
            GuestOrderReference:
              paymentChangeReference
          })
        }
      );

      paymentChangeOrder =
        data.order || data;

      paymentChangeItems =
        Array.isArray(data.items)
          ? data.items
          : [];

      instructions.value =
        paymentChangeOrder.SpecialInstructions || "";

      instructions.readOnly = true;

      updateCounter();

      const paymentStatus =
        paymentChangeOrder.PaymentStatus ||
        "Not recorded";

      const paymentId = Number(
        paymentChangeOrder.PaymentID
      );

      if (
        paymentChangeOrder.OrderStatus !==
        "Pending"
      ) {
        throw new Error(
          "The payment method can only be changed while the order is pending."
        );
      }

      if (!isPendingPayment(paymentStatus)) {
        throw new Error(
          "This payment can no longer be changed."
        );
      }

      if (
        !Number.isInteger(paymentId) ||
        paymentId <= 0
      ) {
        throw new Error(
          "The payment record could not be found."
        );
      }

      const existingPaymentMethod =
        paymentChangeOrder.PaymentMethod;

      const existingMethodInput =
        document.querySelector(
          `input[name="paymentMethod"][value="${existingPaymentMethod}"]`
        );

      if (existingMethodInput) {
        existingMethodInput.checked = true;
      }

      renderPaymentChangeSummary();
      updatePayment();

      submitButton.disabled = false;
    } catch (error) {
      setMessage(
        messageContainer,
        error?.message ||
        "Unable to load the guest order.",
        "error"
      );

      form.hidden = true;

      submitButton.disabled = false;
      submitButton.textContent =
        "Continue to Payment";
    }
  }

  function renderSummary() {
    const cart = getCart();

    if (!cart.items.length) {
      cartContainer.innerHTML = `
      <div class="empty premium-empty">
        <h3>Your cart is empty</h3>

        <p class="muted">
          Browse the stalls to begin a new order.
        </p>

        <a
          class="button primary"
          href="/stalls.html"
        >
          Browse Stalls
        </a>
      </div>
    `;

      form.hidden = true;
      return;
    }

    const totalAmount = subtotal(cart);

    cartContainer.innerHTML = `
    <div class="normal-checkout-summary">
      <div class="normal-checkout-header">
        <div>
          <span class="normal-checkout-eyebrow">
            Order Summary
          </span>

          <h3>
            ${esc(cart.StallName)}
          </h3>
        </div>

        <a
          class="normal-checkout-edit"
          href="/menu.html?stall=${cart.StallID}"
        >
          Edit
        </a>
      </div>

      <div class="normal-checkout-section">
        <span class="normal-checkout-section-title">
          Order Items
        </span>

        <div class="normal-checkout-item-list">
          ${cart.items
        .map(
          item => `
                <div class="normal-checkout-item">
                  <div>
                    <strong>
                      ${esc(item.ItemName)}
                    </strong>

                    <span>
                      ${Number(item.Quantity)} ×
                      ${money(Number(item.Price))}
                    </span>
                  </div>

                  <strong class="normal-checkout-item-price">
                    ${money(
            Number(item.Price) *
            Number(item.Quantity)
          )}
                  </strong>
                </div>
              `
        )
        .join("")}
        </div>
      </div>

      <div class="normal-checkout-total">
        <div>
          <span>Amount Payable</span>

          <small>
            Total for this order
          </small>
        </div>

        <strong>
          ${money(totalAmount)}
        </strong>
      </div>
    </div>
  `;
  }

  function renderPaymentChangeSummary() {
    const stallName =
      paymentChangeOrder.StallName || "Hawker Stall";

    const totalAmount = Number(
      paymentChangeOrder.TotalAmount || 0
    );

    cartContainer.innerHTML = `
    <div class="payment-change-summary">
      <div class="payment-change-header">
        <div>
          <span class="payment-change-eyebrow">
            Payment Update
          </span>

          <h3>
            Order #${paymentChangeOrder.OrderID}
          </h3>
        </div>

        <span class="badge warning">
          ${esc(paymentChangeOrder.OrderStatus)}
        </span>
      </div>

      <div class="payment-change-reference">
        <span>Guest Order Reference</span>

        <strong>
          ${esc(paymentChangeReference)}
        </strong>
      </div>

      <div class="payment-change-stall">
        <span>Ordering from</span>

        <strong>
          ${esc(stallName)}
        </strong>
      </div>

      <div class="payment-change-section">
        <span class="payment-change-section-title">
          Order Items
        </span>

        <div class="payment-change-item-list">
          ${paymentChangeItems.length
        ? paymentChangeItems
          .map(item => {
            const quantity = Number(
              item.Quantity || 0
            );

            const unitPrice = Number(
              item.UnitPrice ??
              item.Price ??
              (
                Number(item.Subtotal || 0) /
                Number(quantity || 1)
              )
            );

            const itemSubtotal =
              Number(item.Subtotal) ||
              unitPrice * quantity;

            return `
                      <div class="payment-change-item">
                        <div>
                          <strong>
                            ${esc(item.ItemName)}
                          </strong>

                          <span>
                            ${quantity} × ${money(unitPrice)}
                          </span>
                        </div>

                        <strong class="payment-change-item-price">
                          ${money(itemSubtotal)}
                        </strong>
                      </div>
                    `;
          })
          .join("")
        : `
                  <p class="muted">
                    No order items were returned.
                  </p>
                `
      }
        </div>
      </div>

      <div class="payment-change-method">
        <div>
          <span>Current Payment Method</span>

          <strong>
            ${esc(
        paymentChangeOrder.PaymentMethod ||
        "Not recorded"
      )}
          </strong>
        </div>
      </div>

      <div class="payment-change-total">
        <div>
          <span>Total Amount</span>

          <small>
            Amount payable for this order
          </small>
        </div>

        <strong>
          ${money(totalAmount)}
        </strong>
      </div>
    </div>
  `;
  }

  function updatePayment() {
    const paymentMethod =
      document.querySelector(
        'input[name="paymentMethod"]:checked'
      )?.value;

    if (paymentMethod === "Cash") {
      submitButton.textContent =
        isPaymentChange
          ? "Continue with Cash"
          : "Confirm Cash Payment";
    } else if (paymentMethod === "Card") {
      submitButton.textContent =
        "Continue to Card Payment";
    } else if (paymentMethod === "PayNow") {
      submitButton.textContent =
        "Continue to PayNow";
    } else {
      submitButton.textContent =
        "Select a Payment Method";
    }
  }

  function updateCounter() {
    if (!counter || !instructions) {
      return;
    }

    counter.textContent =
      `${instructions.value.length} / 300`;
  }

  instructions?.addEventListener(
    "input",
    updateCounter
  );

  document
    .querySelectorAll(
      'input[name="paymentMethod"]'
    )
    .forEach(input => {
      input.addEventListener(
        "change",
        updatePayment
      );
    });

  form.addEventListener(
    "submit",
    event => {
      event.preventDefault();

      setMessage(messageContainer);

      if (isPaymentChange) {
        handlePaymentChangeSubmission();
        return;
      }

      handleNormalCheckoutSubmission();
    }
  );

  function handlePaymentChangeSubmission() {
    if (!paymentChangeOrder) {
      return setMessage(
        messageContainer,
        "The guest order could not be loaded.",
        "error"
      );
    }

    const paymentMethod =
      document.querySelector(
        'input[name="paymentMethod"]:checked'
      )?.value;

    if (!paymentMethod) {
      return setMessage(
        messageContainer,
        "Please select a payment method.",
        "error"
      );
    }

    const totalAmount = Number(
      paymentChangeOrder.TotalAmount || 0
    );

    const cartItems =
      paymentChangeItems.map(item => {
        const quantity = Number(
          item.Quantity || 0
        );

        const price = Number(
          item.UnitPrice ??
          item.Price ??
          (
            Number(item.Subtotal || 0) /
            Number(quantity || 1)
          )
        );

        return {
          MenuItemID: item.MenuItemID,
          ItemName: item.ItemName,
          Quantity: quantity,
          Price: price
        };
      });

    sessionStorage.setItem(
      CHECKOUT_DRAFT_KEY,
      JSON.stringify({
        paymentMethod,
        isPaymentChange: true,
        isMember: false,

        orderId:
          paymentChangeOrder.OrderID,

        paymentId:
          paymentChangeOrder.PaymentID,

        guestReference:
          paymentChangeReference,

        stallName:
          paymentChangeOrder.StallName ||
          "Hawker Stall",

        cartItems,

        estimatedTotal: totalAmount
      })
    );

    window.location.assign(
      `/payment.html?changePayment=true` +
      `&orderId=${encodeURIComponent(
        paymentChangeOrder.OrderID
      )}` +
      `&reference=${encodeURIComponent(
        paymentChangeReference
      )}`
    );
  }

  function handleNormalCheckoutSubmission() {
    const cart = getCart();

    if (!cart.items.length) {
      return setMessage(
        messageContainer,
        "Your cart is empty.",
        "error"
      );
    }

    if (
      !isMember &&
      !guestNameInput.value.trim()
    ) {
      guestNameInput.focus();

      return setMessage(
        messageContainer,
        "Please enter your name.",
        "error"
      );
    }

    if (
      !isMember &&
      (
        !guestEmailInput.value.trim() ||
        !guestEmailInput.validity.valid
      )
    ) {
      guestEmailInput.focus();

      return setMessage(
        messageContainer,
        "Please enter a valid email address.",
        "error"
      );
    }

    const paymentMethod =
      document.querySelector(
        'input[name="paymentMethod"]:checked'
      )?.value;

    if (!paymentMethod) {
      return setMessage(
        messageContainer,
        "Please select a payment method.",
        "error"
      );
    }

    const orderPayload = {
      OrderType:
        isMember ? "Member" : "Guest",

      SpecialInstructions:
        instructions.value.trim(),

      items: cart.items.map(item => ({
        MenuItemID: Number(
          item.MenuItemID
        ),

        Quantity: Number(
          item.Quantity
        )
      }))
    };

    if (!isMember) {
      orderPayload.GuestName =
        guestNameInput.value.trim();

      orderPayload.GuestEmail =
        guestEmailInput.value.trim();
    }

    const checkoutId =
      crypto?.randomUUID
        ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    localStorage.removeItem(
      PENDING_ORDER_KEY
    );

    sessionStorage.setItem(
      CHECKOUT_DRAFT_KEY,
      JSON.stringify({
        checkoutId,
        orderPayload,
        paymentMethod,
        isMember,
        stallName: cart.StallName,
        cartItems: cart.items,
        estimatedTotal: subtotal(cart)
      })
    );

    window.location.assign(
      "/payment.html"
    );
  }

  if (!isPaymentChange) {
    renderSummary();
  }

  updatePayment();
  updateCounter();
});