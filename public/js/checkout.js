document.addEventListener("DOMContentLoaded", () => {
  if (redirectNonCustomerFromOrdering()) return;

  const CHECKOUT_DRAFT_KEY = "hawkerhub_checkout_draft";

  const form = document.getElementById("checkoutForm");
  const cartContainer = document.getElementById("checkoutCart");
  const messageContainer = document.getElementById("checkoutMessage");

  const guestFields = document.getElementById("guestFields");
  const guestNameInput = document.getElementById("guestName");
  const guestEmailInput = document.getElementById("guestEmail");

  const referenceField = document.getElementById("referenceField");
  const transactionReference = document.getElementById("transactionReference");

  const instructions = document.getElementById("specialInstructions");
  const counter = document.getElementById("instructionLimit");
  const submitButton = document.getElementById("submitButton");

  const currentUser = getCurrentUser();
  const currentRole = role(currentUser?.role);
  const isMember = currentRole === "customer";

  if (currentUser && !isMember) {
    window.location.replace(
      currentRole === "vendor"
        ? "/vendor-dashboard.html"
        : "/inspection-reports.html"
    );
    return;
  }

  guestFields.hidden = isMember;
  guestNameInput.disabled = isMember;
  guestEmailInput.disabled = isMember;

  guestNameInput.required = !isMember;
  guestEmailInput.required = !isMember;

  referenceField.hidden = true;
  transactionReference.disabled = true;
  transactionReference.required = false;

  function renderSummary() {
    const cart = getCart();

    if (!cart.items.length) {
      cartContainer.innerHTML = `
        <div class="empty premium-empty">
          <h3>Your cart is empty</h3>

          <p class="muted">
            Browse the stalls to begin a new order.
          </p>

          <a class="button primary" href="/stalls.html">
            Browse Stalls
          </a>
        </div>
      `;

      form.hidden = true;
      return;
    }

    cartContainer.innerHTML = `
      <div class="receipt-summary stack">

        <div class="receipt-stall">
          <div>
            <span class="small muted">
              Your Order
            </span>

            <h3>${esc(cart.StallName)}</h3>
          </div>

          <a
            class="text-link"
            href="/menu.html?stall=${cart.StallID}"
          >
            Edit
          </a>
        </div>

        <div class="checkout-items">
          ${cart.items
        .map(
          (item) => `
                <div class="checkout-item">

                  <div>
                    <strong>${esc(item.ItemName)}</strong>

                    <span class="small muted">
                      ${item.Quantity} × ${money(item.Price)}
                    </span>
                  </div>

                  <strong>
                    ${money(item.Price * item.Quantity)}
                  </strong>

                </div>
              `
        )
        .join("")}
        </div>

        <div class="summary-line">
          <span>Subtotal</span>
          <strong>${money(subtotal(cart))}</strong>
        </div>

        <div class="summary-line total">
          <span>Total</span>
          <strong>${money(subtotal(cart))}</strong>
        </div>

      </div>
    `;
  }

  function updatePayment() {
    const paymentMethod = document.querySelector(
      'input[name="paymentMethod"]:checked'
    )?.value;

    submitButton.textContent =
      paymentMethod === "Cash"
        ? "Continue to Cash Confirmation"
        : "Continue to Payment";
  }

  function updateCounter() {
    counter.textContent = `${instructions.value.length} / 300`;
  }

  instructions.addEventListener("input", updateCounter);

  document
    .querySelectorAll('input[name="paymentMethod"]')
    .forEach((input) =>
      input.addEventListener("change", updatePayment)
    );

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    setMessage(messageContainer);

    const cart = getCart();

    if (!cart.items.length) {
      return setMessage(
        messageContainer,
        "Your cart is empty.",
        "error"
      );
    }

    if (!isMember && !guestNameInput.value.trim()) {
      guestNameInput.focus();

      return setMessage(
        messageContainer,
        "Please enter your name.",
        "error"
      );
    }

    if (
      !isMember &&
      (!guestEmailInput.value.trim() ||
        !guestEmailInput.validity.valid)
    ) {
      guestEmailInput.focus();

      return setMessage(
        messageContainer,
        "Please enter a valid email address.",
        "error"
      );
    }

    const paymentMethod = document.querySelector(
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
      OrderType: isMember ? "Member" : "Guest",

      SpecialInstructions: instructions.value.trim(),

      items: cart.items.map((item) => ({
        MenuItemID: Number(item.MenuItemID),
        Quantity: Number(item.Quantity),
      })),
    };

    if (!isMember) {
      orderPayload.GuestName = guestNameInput.value.trim();
      orderPayload.GuestEmail = guestEmailInput.value.trim();
    }

    sessionStorage.setItem(
      CHECKOUT_DRAFT_KEY,
      JSON.stringify({
        orderPayload,
        paymentMethod,
        isMember,
        stallName: cart.StallName,
        cartItems: cart.items,
        estimatedTotal: subtotal(cart),
      })
    );

    window.location.assign("/payment.html");
  });

  renderSummary();
  updatePayment();
  updateCounter();
});