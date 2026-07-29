document.addEventListener("DOMContentLoaded", () => {
  const raw =
    sessionStorage.getItem(
      ORDER_CONFIRMATION_KEY
    );

  if (!raw) {
    redirectToStalls();
    return;
  }

  let confirmation;

  try {
    confirmation = JSON.parse(raw);
  } catch {
    clearInvalidConfirmation();
    return;
  }

  if (!isValidConfirmation(confirmation)) {
    clearInvalidConfirmation();
    return;
  }

  const isCash =
    confirmation.paymentMethod === "Cash";

  document.getElementById(
    "confirmationOrderId"
  ).textContent = `#${confirmation.orderId}`;

  document.getElementById(
    "confirmationTransactionReference"
  ).textContent =
    confirmation.transactionReference ||
    "Cash Payment";

  document.getElementById(
    "confirmationEyebrow"
  ).textContent =
    isCash
      ? "Order Submitted"
      : "Payment Completed";

  document.getElementById(
    "confirmationTitle"
  ).textContent =
    isCash
      ? "Please Pay at the Stall."
      : "Payment Successful.";

  document.getElementById(
    "confirmationMessage"
  ).textContent =
    isCash
      ? `Your order from ${confirmation.stallName} has been placed successfully. Please proceed to the stall to make your cash payment. ` +
      "Food preparation should begin only after the vendor confirms payment."
      : `Your payment has been confirmed, and your order from ${confirmation.stallName} is now being processed.`;

  document.getElementById(
    "confirmationPayment"
  ).textContent =
    isCash
      ? "Cash · Awaiting payment"
      : `${confirmation.paymentMethod} · ${paymentLabel(
        confirmation.paymentStatus
      )}`;

  document.getElementById(
    "confirmationItems"
  ).innerHTML =
    confirmation.items
      .map(item => `
        <div>
          <span>
            ${item.Quantity} ×
            ${esc(item.ItemName)}
          </span>

          <strong>
            ${money(
        item.Price * item.Quantity
      )}
          </strong>
        </div>
      `)
      .join("") +
    `
      <div class="confirmation-total">
        <span>Total</span>
        <strong>
          ${money(confirmation.subtotal)}
        </strong>
      </div>
    `;

  const primaryLink =
    document.getElementById(
      "primaryConfirmationLink"
    );

  if (!confirmation.isMember) {
    const referenceBox =
      document.getElementById(
        "confirmationReference"
      );

    referenceBox.hidden = false;

    document.getElementById(
      "confirmationReferenceValue"
    ).textContent =
      confirmation.guestReference;

    primaryLink.textContent =
      "Track this order";

    primaryLink.href =
      `/guest-order-tracking.html?orderId=${encodeURIComponent(
        confirmation.orderId
      )}&reference=${encodeURIComponent(
        confirmation.guestReference
      )}`;
  } else {
    primaryLink.textContent =
      "View My Orders";

    primaryLink.href =
      "/order-history.html";
  }
});

function isValidConfirmation(confirmation) {
  if (
    !confirmation ||
    typeof confirmation !== "object"
  ) {
    return false;
  }

  const orderId =
    Number(confirmation.orderId);

  const subtotal =
    Number(confirmation.subtotal);

  if (
    !Number.isInteger(orderId) ||
    orderId <= 0
  ) {
    return false;
  }

  if (
    typeof confirmation.stallName !==
    "string" ||
    !confirmation.stallName.trim()
  ) {
    return false;
  }

  if (
    typeof confirmation.paymentMethod !==
    "string" ||
    !confirmation.paymentMethod.trim()
  ) {
    return false;
  }

  if (
    typeof confirmation.paymentStatus !==
    "string" ||
    !confirmation.paymentStatus.trim()
  ) {
    return false;
  }

  if (
    typeof confirmation.isMember !==
    "boolean"
  ) {
    return false;
  }

  if (
    !Number.isFinite(subtotal) ||
    subtotal < 0
  ) {
    return false;
  }

  if (
    !Array.isArray(confirmation.items) ||
    confirmation.items.length === 0
  ) {
    return false;
  }

  const hasInvalidItem =
    confirmation.items.some(item => {
      const quantity =
        Number(item?.Quantity);

      const price =
        Number(item?.Price);

      return (
        !item ||
        typeof item.ItemName !== "string" ||
        !item.ItemName.trim() ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 50 ||
        !Number.isFinite(price) ||
        price < 0
      );
    });

  if (hasInvalidItem) {
    return false;
  }

  if (
    !confirmation.isMember &&
    (
      typeof confirmation.guestReference !==
      "string" ||
      !confirmation.guestReference.trim()
    )
  ) {
    return false;
  }

  return true;
}

function clearInvalidConfirmation() {
  sessionStorage.removeItem(
    ORDER_CONFIRMATION_KEY
  );

  redirectToStalls();
}

function redirectToStalls() {
  window.location.replace(
    "/stalls.html"
  );
}