document.addEventListener("DOMContentLoaded", () => {
  const currentUser = getCurrentUser();

  if (currentUser) {
    const destination =
      role(currentUser.role) === "vendor"
        ? "/vendor-dashboard.html"
        : "/order-history.html";

    window.location.replace(destination);
    return;
  }

  const form = document.getElementById("guestForm");
  const lookupMessage = document.getElementById("lookupMessage");
  const result = document.getElementById("guestResult");
  const savedOrders = document.getElementById("savedOrders");
  const orderIdInput = document.getElementById("orderId");
  const guestReferenceInput = document.getElementById("guestReference");

  const query = new URLSearchParams(location.search);

  orderIdInput.value = query.get("orderId") || "";
  guestReferenceInput.value = query.get("reference") || "";

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

    savedOrders.innerHTML = saved.length
      ? saved
        .map(
          order => `
              <button
                class="button secondary"
                type="button"
                data-id="${order.OrderID}"
                data-reference="${esc(order.GuestOrderReference)}"
              >
                Order #${order.OrderID}
              </button>
            `
        )
        .join("")
      : `
          <p class="muted">
            No guest orders are saved in this browser.
          </p>
        `;

    savedOrders.querySelectorAll("button").forEach(button => {
      button.addEventListener("click", () => {
        orderIdInput.value = button.dataset.id;
        guestReferenceInput.value = button.dataset.reference;
        form.requestSubmit();
      });
    });
  }

  function timelineStatusClass(status) {
    switch (String(status || "").toLowerCase()) {
      case "pending":
        return "timeline-pending";

      case "preparing":
        return "timeline-preparing";

      case "ready":
        return "timeline-ready";

      case "completed":
        return "timeline-completed";

      case "cancelled":
        return "timeline-cancelled";

      default:
        return "";
    }
  }

  function renderGuestOrder(data) {
    const order = data.order || data;

    const items = Array.isArray(data.items)
      ? data.items
      : [];

    const timeline = Array.isArray(data.timeline)
      ? data.timeline
      : [];

    const paymentStatus =
      order.PaymentStatus || "Not recorded";

    const uniqueTimeline = timeline.filter(
      (item, index, array) =>
        index ===
        array.findIndex(
          entry =>
            entry.OrderStatus === item.OrderStatus
        )
    );

    const mayChangePayment =
      order.OrderStatus === "Pending" &&
      isPendingPayment(paymentStatus) &&
      Number.isInteger(Number(order.PaymentID));

    result.innerHTML = `
      <div class="guest-order-top">
        <div>
          <span class="small muted">
            Guest order
          </span>

          <h2>
            Order #${order.OrderID}
          </h2>

          <span class="guest-order-date">
            ${formatDate(order.OrderDateTime)}
          </span>
        </div>

        <span class="badge ${order.OrderStatus === "Cancelled"
        ? "unavailable"
        : "warning"
      }">
          ${esc(order.OrderStatus)}
        </span>
      </div>

      <div class="guest-reference-display">
        <span>
          Guest Order Reference
        </span>

        <strong>
          ${esc(guestReferenceInput.value.trim())}
        </strong>
      </div>

      <section class="order-progress-section">
        <span class="section-label">
          Order Progress
        </span>

        <div class="timeline-list">
          ${uniqueTimeline.length
        ? uniqueTimeline
          .map(
            item => `
                      <div class="timeline-item ${timelineStatusClass(
              item.OrderStatus
            )}">
                        <span class="timeline-marker"></span>

                        <div class="timeline-content">
                          <strong>
                            ${esc(item.OrderStatus)}
                          </strong>

                          <span>
                            ${formatDate(item.StatusDateTime)}
                          </span>
                        </div>
                      </div>
                    `
          )
          .join("")
        : `
                  <p class="small muted">
                    No order progress records are available yet.
                  </p>
                `
      }
        </div>
      </section>

      <div class="payment-strip">
        <div class="payment-info">
          <span class="payment-label">
            Payment Method
          </span>

          <strong>
            ${esc(
        order.PaymentMethod ||
        "No payment method"
      )}
          </strong>
        </div>

        <div class="payment-actions">
          <span class="badge ${paymentBadgeClass(
        paymentStatus
      )}">
            ${esc(paymentLabel(paymentStatus))}
          </span>

          ${mayChangePayment
        ? `
                  <button
                    class="button secondary change-payment-button"
                    type="button"
                    data-change-payment
                  >
                    Change Payment Method
                  </button>
                `
        : ""
      }
        </div>
      </div>

      <div class="guest-order-items">
        ${items.length
        ? items
          .map(
            item => `
                    <div class="guest-order-item">
                      <span>
                        ${Number(item.Quantity || 0)} ×
                        ${esc(item.ItemName)}
                      </span>

                      <strong>
                        ${money(
              item.Subtotal ??
              Number(item.UnitPrice || 0) *
              Number(item.Quantity || 0)
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

      <div class="guest-order-total">
        <strong>
          Total
        </strong>

        <strong>
          ${money(order.TotalAmount)}
        </strong>
      </div>
    `;

    result
      .querySelector("[data-change-payment]")
      ?.addEventListener("click", () => {
        const orderId = encodeURIComponent(order.OrderID);

        const reference = encodeURIComponent(
          guestReferenceInput.value.trim()
        );

        window.location.href =
          `/checkout.html?changePayment=true` +
          `&orderId=${orderId}` +
          `&reference=${reference}`;
      });

    result.hidden = false;

    saveGuestOrder({
      OrderID: order.OrderID,
      GuestOrderReference:
        guestReferenceInput.value.trim()
    });

    renderSavedOrders();
  }

  form.addEventListener(
    "submit",
    async event => {
      event.preventDefault();

      setMessage(lookupMessage);
      result.hidden = true;

      const orderId = Number(orderIdInput.value);

      const reference =
        guestReferenceInput.value.trim();

      if (
        !Number.isInteger(orderId) ||
        orderId <= 0
      ) {
        setMessage(
          lookupMessage,
          "Enter a valid Order ID.",
          "error"
        );

        orderIdInput.focus();
        return;
      }

      if (!reference) {
        setMessage(
          lookupMessage,
          "Enter your guest order reference.",
          "error"
        );

        guestReferenceInput.focus();
        return;
      }

      const submitButton = form.querySelector(
        'button[type="submit"], button:not([type])'
      );

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent =
          "Tracking order…";
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
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent =
            "Track Order Status";
        }
      }
    }
  );

  renderSavedOrders();

  if (
    query.get("orderId") &&
    query.get("reference")
  ) {
    form.requestSubmit();
  }
});