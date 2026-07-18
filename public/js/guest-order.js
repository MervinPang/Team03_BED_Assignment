document.addEventListener("DOMContentLoaded", () => {
  const currentUser = getCurrentUser();

  if (currentUser) {
    const destination =
      role(currentUser.role) === "vendor"
        ? "/vendor.html"
        : "/history.html";

    window.location.replace(destination);
    return;
  }

  const form =
    document.getElementById("guestForm");

  const lookupMessage =
    document.getElementById("lookupMessage");

  const result =
    document.getElementById("guestResult");

  const savedOrders =
    document.getElementById("savedOrders");

  const query =
    new URLSearchParams(location.search);

  const orderIdInput =
    document.getElementById("orderId");

  const guestReferenceInput =
    document.getElementById("guestReference");

  orderIdInput.value =
    query.get("orderId") || "";

  guestReferenceInput.value =
    query.get("reference") || "";

  function renderSavedOrders() {
    let saved = [];

    try {
      const parsed = JSON.parse(
        localStorage.getItem(GUEST_ORDERS_KEY) || "[]"
      );
      saved = Array.isArray(parsed) ? parsed : [];
    } catch {
      localStorage.removeItem(GUEST_ORDERS_KEY);
    }

    savedOrders.innerHTML =
      saved.length
        ? saved.map(order => `
          <button
            class="button secondary"
            type="button"
            data-id="${order.OrderID}"
            data-reference="${esc(
          order.GuestOrderReference
        )}"
          >
            Order #${order.OrderID}
          </button>
        `).join("")
        : `
          <p class="muted">
            No guest orders are saved in this browser.
          </p>
        `;

    savedOrders
      .querySelectorAll("button")
      .forEach(button => {
        button.addEventListener("click", () => {
          orderIdInput.value =
            button.dataset.id;

          guestReferenceInput.value =
            button.dataset.reference;

          form.requestSubmit();
        });
      });
  }

  function renderGuestOrder(data) {
    const order =
      data.order || data;

    const items =
      data.items || [];

    const timeline =
      data.timeline || [];

    const paymentStatus =
      order.PaymentStatus || "Not recorded";

    result.innerHTML = `
      <div class="row-between wrap">
        <div>
          <span class="small muted">Guest order</span>
          <h2>#${order.OrderID}</h2>
        </div>

        <span class="badge ${order.OrderStatus === "Cancelled"
        ? "unavailable"
        : "warning"
      }">
          ${esc(order.OrderStatus)}
        </span>
      </div>

      <p class="muted">
        ${formatDate(order.OrderDateTime)}
      </p>

      <div class="guest-reference-display">
        <span>GuestOrderReference</span>
        <strong>${esc(guestReferenceInput.value.trim())}</strong>
      </div>

      <div class="payment-strip">
        <span>${esc(order.PaymentMethod || "No payment method")}</span>
        <span class="badge ${paymentBadgeClass(paymentStatus)}">
          ${esc(paymentLabel(paymentStatus))}
        </span>
      </div>

      ${items.map(item => `
        <div class="row-between">
          <span>
            ${item.Quantity} × ${esc(item.ItemName)}
          </span>
          <strong>
            ${money(
        item.Subtotal ??
        item.UnitPrice * item.Quantity
      )}
          </strong>
        </div>
      `).join("")}

      <div class="summary-line total">
        <span>Total</span>
        <strong>${money(order.TotalAmount)}</strong>
      </div>

      <div class="timeline-list">
        ${timeline.map(item => `
          <p class="small muted">
            ${esc(item.OrderStatus)} ·
            ${formatDate(item.StatusDateTime)}
          </p>
        `).join("")}
      </div>
    `;

    result.hidden = false;

    saveGuestOrder({
      OrderID: order.OrderID,
      GuestOrderReference:
        guestReferenceInput.value.trim()
    });

    renderSavedOrders();
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    setMessage(lookupMessage);
    result.hidden = true;

    const orderId = Number(orderIdInput.value);
    const reference = guestReferenceInput.value.trim();

    if (!Number.isInteger(orderId) || orderId <= 0) {
      setMessage(lookupMessage, "Enter a valid Order ID.", "error");
      orderIdInput.focus();
      return;
    }

    if (!reference) {
      setMessage(lookupMessage, "Enter your guest order reference.", "error");
      guestReferenceInput.focus();
      return;
    }

    try {
      const data = await apiRequest(
        "/order-history/guest",
        {
          method: "POST",
          body: JSON.stringify({
            OrderID: orderId,
            GuestOrderReference: reference
          })
        }
      );

      renderGuestOrder(data);
    } catch (error) {
      setMessage(
        lookupMessage,
        error.message,
        "error"
      );
    }
  });

  renderSavedOrders();

  if (
    query.get("orderId") &&
    query.get("reference")
  ) {
    form.requestSubmit();
  }
});
