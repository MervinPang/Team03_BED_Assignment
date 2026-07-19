document.addEventListener("DOMContentLoaded", () => {
  if (redirectNonCustomerFromOrdering()) return;
  const CHECKOUT_DRAFT_KEY = "hawkerhub_checkout_draft";
  const form = document.getElementById("checkoutForm"),
    cartContainer = document.getElementById("checkoutCart"),
    messageContainer = document.getElementById("checkoutMessage"),
    guestFields = document.getElementById("guestFields"),
    guestNameInput = document.getElementById("guestName"),
    guestEmailInput = document.getElementById("guestEmail"),
    referenceField = document.getElementById("referenceField"),
    transactionReference = document.getElementById("transactionReference"),
    instructions = document.getElementById("specialInstructions"),
    counter = document.getElementById("instructionLimit"),
    submitButton = document.getElementById("submitButton");
  const currentUser = getCurrentUser(),
    currentRole = role(currentUser?.role),
    isMember = currentRole === "customer";
  if (currentUser && !isMember) {
    window.location.replace(currentRole === "vendor" ? "/vendor.html" : "/inspection.html");
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
    const c = getCart();
    if (!c.items.length) {
      cartContainer.innerHTML = '<div class="empty premium-empty"><h3>Your cart is empty</h3><p class="muted">Browse the stalls to begin a new order.</p><a class="button primary" href="/stalls.html">Browse stalls</a></div>';
      form.hidden = true;
      return;
    }
    cartContainer.innerHTML = `<div class="receipt-summary stack"><div class="receipt-stall"><div><span class="small muted">Your order</span><h3>${esc(c.StallName)}</h3></div><a class="text-link" href="/menu.html?stall=${c.StallID}">Edit</a></div><div class="checkout-items">${c.items.map(i => `<div class="checkout-item"><div><strong>${esc(i.ItemName)}</strong><span class="small muted">${i.Quantity} × ${money(i.Price)}</span></div><strong>${money(i.Price * i.Quantity)}</strong></div>`).join("")}</div><div class="summary-line"><span>Subtotal</span><strong>${money(subtotal(c))}</strong></div><div class="summary-line total"><span>Total</span><strong>${money(subtotal(c))}</strong></div></div>`;
  }

  function updatePayment() {
    const m = document.querySelector('input[name="paymentMethod"]:checked')?.value;
    submitButton.textContent = m === "Cash" ? "Continue to cash confirmation" : "Continue to payment";
  }

  function updateCounter() {
    counter.textContent = `${instructions.value.length} / 300`;
  }
  instructions.addEventListener("input", updateCounter);
  document.querySelectorAll('input[name="paymentMethod"]').forEach(i => i.addEventListener("change", updatePayment));
  form.addEventListener("submit", event => {
    event.preventDefault();
    setMessage(messageContainer);
    const c = getCart();
    if (!c.items.length) return setMessage(messageContainer, "Your cart is empty.", "error");
    if (!isMember && !guestNameInput.value.trim()) {
      guestNameInput.focus();
      return setMessage(messageContainer, "Please enter your name.", "error");
    }
    if (!isMember && (!guestEmailInput.value.trim() || !guestEmailInput.validity.valid)) {
      guestEmailInput.focus();
      return setMessage(messageContainer, "Please enter a valid email address.", "error");
    }
    const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked')?.value;
    if (!paymentMethod) return setMessage(messageContainer, "Please select a payment method.", "error");
    const orderPayload = {
      OrderType: isMember ? "Member" : "Guest",
      SpecialInstructions: instructions.value.trim(),
      items: c.items.map(i => ({
        MenuItemID: Number(i.MenuItemID),
        Quantity: Number(i.Quantity)
      }))
    };
    if (!isMember) {
      orderPayload.GuestName = guestNameInput.value.trim();
      orderPayload.GuestEmail = guestEmailInput.value.trim();
    }
    sessionStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify({
      orderPayload,
      paymentMethod,
      isMember,
      stallName: c.StallName,
      cartItems: c.items,
      estimatedTotal: subtotal(c)
    }));
    window.location.assign("/payment.html");
  });
  renderSummary();
  updatePayment();
  updateCounter();
});