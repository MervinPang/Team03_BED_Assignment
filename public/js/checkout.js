document.addEventListener("DOMContentLoaded", async () => {
  if (redirectNonCustomerFromOrdering()) return;

  const CHECKOUT_DRAFT_KEY = "hawkerhub_checkout_draft";

  const query = new URLSearchParams(window.location.search);

  const isPaymentChange =
    query.get("changePayment") === "true";

  document.body.classList.toggle("payment-change-mode", isPaymentChange);

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

  const guestRegistrationSection =
    document.getElementById("guestRegistrationSection");

  const createAccountInput =
    document.getElementById("createAccount");

  const guestRegistrationFields =
    document.getElementById("guestRegistrationFields");

  const accountUsernameInput =
    document.getElementById("accountUsername");

  const accountPasswordInput =
    document.getElementById("accountPassword");

  const confirmAccountPasswordInput =
    document.getElementById("confirmAccountPassword");

  const referenceField =
    document.getElementById("referenceField");

  const transactionReference =
    document.getElementById("transactionReference");

  const instructions =
    document.getElementById("specialInstructions");

  const counter =
    document.getElementById("instructionLimit");

  const submitButton =
    document.getElementById("submitButton");

  const currentUser = getCurrentUser();
  const currentRole = role(currentUser?.role);
  const isMember = currentRole === "customer";

  let paymentChangeOrder = null;
  let paymentChangeItems = [];
  let checkoutCart = null;

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
    guestRegistrationSection.hidden = true;

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
    guestRegistrationSection.hidden = isMember;

    guestNameInput.disabled = isMember;
    guestEmailInput.disabled = isMember;

    guestNameInput.required = !isMember;
    guestEmailInput.required = !isMember;
  }

  function updateGuestRegistrationFields() {
    const shouldCreateAccount =
      Boolean(createAccountInput?.checked) &&
      !isMember &&
      !isPaymentChange;

    if (guestRegistrationFields) {
      guestRegistrationFields.hidden = !shouldCreateAccount;
    }

    if (accountUsernameInput) {
      accountUsernameInput.disabled = !shouldCreateAccount;

      accountUsernameInput.required = shouldCreateAccount;
    }

    if (accountPasswordInput) {
      accountPasswordInput.disabled = !shouldCreateAccount;

      accountPasswordInput.required = shouldCreateAccount;
    }

    if (confirmAccountPasswordInput) {
      confirmAccountPasswordInput.disabled = !shouldCreateAccount;

      confirmAccountPasswordInput.required = shouldCreateAccount;
    }

    if (!shouldCreateAccount) {
      if (accountUsernameInput) { accountUsernameInput.value = ""; }

      if (accountPasswordInput) { accountPasswordInput.value = ""; }

      if (confirmAccountPasswordInput) { confirmAccountPasswordInput.value = ""; }
    }
  }

  createAccountInput?.addEventListener(
    "change",
    updateGuestRegistrationFields
  );

  updateGuestRegistrationFields();

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

      paymentChangeOrder = data.order || data;

      paymentChangeItems = Array.isArray(data.items) ? data.items : [];

      instructions.value = paymentChangeOrder.SpecialInstructions || "";

      instructions.readOnly = true;

      updateCounter();

      const paymentStatus = paymentChangeOrder.PaymentStatus || "Not recorded";

      const paymentId = Number(paymentChangeOrder.PaymentID);

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

  function validateCheckoutCart(cart) {
    if (
      !cart ||
      !Number.isInteger(Number(cart.StallID)) ||
      Number(cart.StallID) <= 0 ||
      !Array.isArray(cart.items) ||
      cart.items.length === 0
    ) {
      return {
        valid: false,
        message: "Your cart is empty or invalid."
      };
    }

    const invalidItem = cart.items.find(item => {
      const menuItemId = Number(item.MenuItemID);
      const quantity = Number(item.Quantity);
      const price = Number(item.Price);

      return (
        !Number.isInteger(menuItemId) ||
        menuItemId <= 0 ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 50 ||
        !Number.isFinite(price) ||
        price < 0 ||
        item.IsAvailable === false
      );
    });

    if (invalidItem) {
      return {
        valid: false,
        message:
          "Your cart contains an invalid or unavailable item. Please review your cart."
      };
    }

    return {
      valid: true,
      message: ""
    };
  }

  function renderSummary() {
    const cart = checkoutCart || getCart();

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
    async event => {
      event.preventDefault();

      setMessage(messageContainer);

      if (isPaymentChange) {
        handlePaymentChangeSubmission();
        return;
      }

      await handleNormalCheckoutSubmission();
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

  function validateGuestRegistration() {
    if (
      isMember ||
      !createAccountInput?.checked
    ) {
      return null;
    }

    const username = accountUsernameInput?.value.trim() || "";

    const password = accountPasswordInput?.value || "";

    const confirmPassword = confirmAccountPasswordInput?.value || "";

    if (username.length < 3) {
      accountUsernameInput?.focus();

      return (
        "Username must be at least " + "3 characters long."
      );
    }

    if (username.length > 50) {
      accountUsernameInput?.focus();

      return (
        "Username cannot exceed " + "50 characters."
      );
    }

    if (password.length < 8) {
      accountPasswordInput?.focus();

      return (
        "Password must be at least " + "8 characters long."
      );
    }

    if (password.length > 50) {
      accountPasswordInput?.focus();

      return (
        "Password cannot exceed " + "50 characters."
      );
    }

    if (
      !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)
    ) {
      accountPasswordInput?.focus();

      return (
        "Password must contain at least " + "one letter and one number."
      );
    }

    if (password !== confirmPassword) {
      confirmAccountPasswordInput?.focus();

      return "Passwords do not match.";
    }

    return null;
  }

  async function checkGuestAccountAvailability() {
    if (
      isMember ||
      !createAccountInput?.checked
    ) {
      return true;
    }

    const username = accountUsernameInput?.value.trim() || "";

    const email = guestEmailInput?.value.trim() || "";

    try {
      const availability = await apiRequest(
        "/payments/check-account-availability",
        {
          method: "POST",

          body: JSON.stringify({
            Username: username,
            Email: email
          })
        }
      );

      if (!availability.UsernameAvailable) {
        accountUsernameInput?.focus();

        setMessage(
          messageContainer,
          "Username is already registered. " +
          "Please choose another username.",
          "error"
        );

        return false;
      }

      if (!availability.EmailAvailable) {
        guestEmailInput?.focus();

        setMessage(
          messageContainer,
          "Email is already registered. " +
          "Please use another email address.",
          "error"
        );

        return false;
      }

      return true;
    } catch (error) {
      setMessage(
        messageContainer,
        error?.message ||
        "Unable to check account availability. " +
        "Please try again.",
        "error"
      );

      return false;
    }
  }

  async function handleNormalCheckoutSubmission() {
    const cart = checkoutCart || getCart();

    const cartValidation = validateCheckoutCart(cart);

    if (!cartValidation.valid) {
      return setMessage(messageContainer, cartValidation.message, "error");
    }

    if (
      !isMember &&
      !guestNameInput.value.trim()
    ) {
      guestNameInput.focus();

      return setMessage(messageContainer, "Please enter your name.", "error");
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
        messageContainer, "Please enter a valid email address.", "error");
    }

    const registrationError =
      validateGuestRegistration();

    if (registrationError) {
      return setMessage(messageContainer, registrationError, "error");
    }

    const paymentMethod =
      document.querySelector(
        'input[name="paymentMethod"]:checked'
      )?.value;

    if (!paymentMethod) {
      return setMessage(
        messageContainer, "Please select a payment method.", "error");
    }

    const originalButtonText = submitButton.textContent;

    submitButton.disabled = true;
    submitButton.textContent = "Checking account details…";

    const accountIsAvailable = await checkGuestAccountAvailability();

    if (!accountIsAvailable) {
      submitButton.disabled = false;

      submitButton.textContent = originalButtonText;

      return;
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

    let accountRegistration = null;

    if (
      !isMember &&
      createAccountInput?.checked
    ) {
      accountRegistration = {
        Username: accountUsernameInput.value.trim(),
        Password: accountPasswordInput.value
      };
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
        accountRegistration,
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
    checkoutCart =
      await refreshCartFromBackend();

    const cartValidation =
      validateCheckoutCart(checkoutCart);

    if (!cartValidation.valid) {
      setMessage(
        messageContainer,
        cartValidation.message,
        "error"
      );
    }

    renderSummary();
  }

  updatePayment();
  updateCounter();
});