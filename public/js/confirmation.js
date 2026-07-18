document.addEventListener("DOMContentLoaded", () => {
  const raw = sessionStorage.getItem(ORDER_CONFIRMATION_KEY);

  if (!raw) {
    window.location.replace("/stalls.html");
    return;
  }

  let confirmation;

  try {
    confirmation = JSON.parse(raw);
  } catch {
    sessionStorage.removeItem(ORDER_CONFIRMATION_KEY);
    window.location.replace("/stalls.html");
    return;
  }
  const isCash = confirmation.paymentMethod === "Cash";
  const isPaid = confirmation.paymentStatus === "Successful";

  document.getElementById("confirmationOrderId").textContent =
    `#${confirmation.orderId}`;

  document.getElementById("confirmationEyebrow").textContent =
    isCash ? "Order submitted" : "Payment completed";

  document.getElementById("confirmationTitle").textContent =
    isCash
      ? "Please pay at the stall."
      : "Your payment was successful.";

  document.getElementById("confirmationMessage").textContent =
    isCash
      ? `Your order from ${confirmation.stallName} is awaiting cash payment. `
      + "Food preparation should begin only after the vendor confirms payment."
      : `Your order from ${confirmation.stallName} has been paid and confirmed.`;

  document.getElementById("confirmationPayment").textContent =
    isCash
      ? "Cash · Awaiting payment"
      : `${confirmation.paymentMethod} · ${paymentLabel(
        confirmation.paymentStatus
      )}`;

  document.getElementById("confirmationStatusPanel").innerHTML = `
    <div class="payment-state ${isPaid ? "paid" : "pending"}">
      <span>${isPaid ? "✓" : "!"}</span>
      <div>
        <strong>${isPaid ? "Payment successful" : "Payment required"}</strong>
        <p>
          ${isPaid
      ? "The stall can begin processing your order."
      : "Proceed to the stall and pay before preparation begins."
    }
        </p>
      </div>
    </div>
  `;

  document.getElementById("confirmationItems").innerHTML =
    confirmation.items.map(item => `
      <div>
        <span>${item.Quantity} × ${esc(item.ItemName)}</span>
        <strong>${money(item.Price * item.Quantity)}</strong>
      </div>
    `).join("") +
    `
      <div class="confirmation-total">
        <span>Total</span>
        <strong>${money(confirmation.subtotal)}</strong>
      </div>
    `;

  const primaryLink =
    document.getElementById("primaryConfirmationLink");

  if (!confirmation.isMember) {
    const referenceBox =
      document.getElementById("confirmationReference");

    referenceBox.hidden = false;

    document.getElementById(
      "confirmationReferenceValue"
    ).textContent = confirmation.guestReference;

    primaryLink.textContent =
      isCash ? "Track this order" : "Track this order";

    primaryLink.href =
      `/guest-order.html?orderId=${encodeURIComponent(
        confirmation.orderId
      )}&reference=${encodeURIComponent(
        confirmation.guestReference
      )}`;
  } else {
    primaryLink.textContent =
      "View my orders";

    primaryLink.href = "/history.html";
  }
});
