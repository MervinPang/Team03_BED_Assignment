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

  document.getElementById("confirmationTransactionReference").textContent =
    confirmation.transactionReference || "Not applicable";

  document.getElementById("confirmationEyebrow").textContent =
    isCash ? "Order Submitted" : "Payment Completed";

  document.getElementById("confirmationTitle").textContent =
    isCash
      ? "Please Pay at the Stall."
      : "Payment Successful.";

  document.getElementById("confirmationMessage").textContent =
    isCash
      ? `Your order from ${confirmation.stallName} has been placed successfully. Please proceed to the stall to make your cash payment. `
      + "Food preparation should begin only after the vendor confirms payment."
      : `Your payment has been confirmed, and your order from ${confirmation.stallName} is now being processed.`;

  document.getElementById("confirmationPayment").textContent =
    isCash
      ? "Cash · Awaiting payment"
      : `${confirmation.paymentMethod} · ${paymentLabel(
        confirmation.paymentStatus
      )}`;

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
      `/guest-order-tracking.html?orderId=${encodeURIComponent(
        confirmation.orderId
      )}&reference=${encodeURIComponent(
        confirmation.guestReference
      )}`;
  } else {
    primaryLink.textContent =
      "View My Orders";

    primaryLink.href = "/order-history.html";
  }
});
