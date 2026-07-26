document.addEventListener("DOMContentLoaded", async () => {
  if (!requireCustomer()) return;

  const activeOrdersElement = document.getElementById("activeOrders");
  const previousOrdersElement = document.getElementById("previousOrders");
  const messageElement = document.getElementById("historyMessage");
  const mostFrequentOrdersElement = document.getElementById("mostFrequentOrders");
  const detailsBackdrop = document.getElementById("detailsBackdrop");
  const detailsBody = document.getElementById("detailsBody");
  const paymentBackdrop = document.getElementById("paymentBackdrop");
  const paymentForm = document.getElementById("paymentChangeForm");
  const paymentMessage = document.getElementById("paymentChangeMessage");
  const referenceField = document.getElementById("changeReferenceField");
  const referenceInput = document.getElementById("changeReference");

  const statusOrder = [
    "Pending",
    "Preparing",
    "Ready",
    "Completed",
  ];

  function statusClass(status) {
    if (status === "Completed" || status === "Ready") {
      return "success";
    }

    if (status === "Cancelled") {
      return "unavailable";
    }

    return "warning";
  }

  function getOrderPaymentStatus(order) {
    return (
      order.RecordedPaymentStatus ||
      order.PaymentStatus ||
      "Not recorded"
    );
  }

  function createTransactionReference(method) {
    const prefix = method === "PayNow" ? "PAYNOW" : "CARD";
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase();

    return `${prefix}-${timestamp}-${random}`;
  }

  function orderCard(order) {
    const paymentStatus = getOrderPaymentStatus(order);

    return `
      <article class="card order-card premium-order-card">
        <div class="order-card-top">
          <div class="order-stall-image">
            ${order.StallImage
        ? `<img
                    src="${esc(order.StallImage)}"
                    alt="${esc(order.StallName || "Food stall")}"
                  >`
        : "<span>🍽️</span>"
      }
          </div>

          <div class="order-card-copy">
            <span class="small muted">
              Order #${order.OrderID}
            </span>

            <h3>${esc(order.StallName || "Food order")}</h3>

            <p>${formatDate(order.OrderDateTime)}</p>
          </div>

          <span class="badge ${statusClass(order.OrderStatus)}">
            ${esc(order.OrderStatus)}
          </span>
        </div>

        <div class="payment-strip">
          <span>
            ${esc(order.PaymentMethod || "No payment method")}
          </span>

          <span class="badge ${paymentBadgeClass(paymentStatus)}">
            ${esc(paymentLabel(paymentStatus))}
          </span>
        </div>

        <div class="order-card-bottom">
          <div>
            <span class="small muted">Items</span>
            <strong>${order.TotalQuantity || 0}</strong>
          </div>

          <div>
            <span class="small muted">Total</span>
            <strong>${money(order.TotalAmount)}</strong>
          </div>

          <button
            class="button secondary"
            type="button"
            data-order-id="${order.OrderID}"
          >
            View Details
          </button>
        </div>
      </article>
    `;
  }

  function renderOrders(element, orders, emptyTitle) {
    element.innerHTML =
      Array.isArray(orders) && orders.length
        ? orders.map(orderCard).join("")
        : `
          <div class="card empty premium-empty">
            <div class="empty-state-icon">📦</div>

            <h3>${emptyTitle}</h3>

            <p class="muted">
              Browse our hawker stalls and place your first order.
            </p>
          </div>
        `;

    element
      .querySelectorAll("[data-order-id]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          openDetails(button.dataset.orderId);
        });
      });
  }

  function renderMostFrequentOrders(items) {

    if (!Array.isArray(items) || items.length === 0) {

      mostFrequentOrdersElement.innerHTML = `
            <div class="frequent-orders-empty">
                <strong>No recommendations yet</strong>

                <p>
                    Complete a few orders and your most frequently ordered menu items will appear here.
                </p>
            </div>
        `;

      return;
    }

    mostFrequentOrdersElement.innerHTML = items.map((item, index) => {

      return `
            <article class="frequent-order-card">

                <div class="frequent-order-rank">
                    ${index + 1}
                </div>

                ${item.ItemImage
                  ? `
                      <img
                        class="frequent-order-image"
                        src="${esc(item.ItemImage)}"
                        alt="${esc(item.ItemName)}"
                      >
                    `
                  : `
                      <div class="frequent-order-image frequent-order-placeholder">
                        🍽️
                      </div>
                    `
                }

                <div class="frequent-order-content">

                    <h3>${esc(item.ItemName)}</h3>

                    <div class="frequent-order-stall">
                        ${esc(item.StallName)}
                    </div>

                    <div class="frequent-order-stats">

                        <div class="frequent-order-stat">
                            <span class="frequent-order-label">
                                Quantity Ordered
                            </span>

                            <span class="frequent-order-value">
                                ${item.TotalQuantityOrdered}
                            </span>
                        </div>

                        <div class="frequent-order-stat">
                            <span class="frequent-order-label">
                                Number of Orders
                            </span>

                            <span class="frequent-order-value">
                                ${item.OrderCount}
                            </span>
                        </div>
                    </div>
                </div>
            </article>
        `;

    }).join("");
  }

  function timelineHtml(currentStatus, timeline) {
    const currentIndex = statusOrder.indexOf(currentStatus);

    return `
      <div class="detail-timeline">
        ${statusOrder
        .map((status, index) => {
          const record = timeline.find(
            (item) => item.OrderStatus === status
          );

          const completed =
            index <= currentIndex &&
            currentStatus !== "Cancelled";

          return `
              <div class="timeline-step ${completed ? "done" : ""
            }">
                <span></span>

                <div>
                  <strong>${status}</strong>

                  <small>
                    ${record
              ? formatDate(record.StatusDateTime)
              : ""
            }
                  </small>
                </div>
              </div>
            `;
        })
        .join("")}

        ${currentStatus === "Cancelled"
        ? `
              <div class="timeline-cancelled">
                <span>×</span>

                <div>
                  <strong>Cancelled</strong>
                  <small>This order was cancelled.</small>
                </div>
              </div>
            `
        : ""
      }
      </div>
    `;
  }

  function closeDetails() {
    detailsBackdrop.hidden = true;
    document.body.classList.remove("modal-open");
  }

  function closePaymentModal() {
    paymentBackdrop.hidden = true;
    document.body.classList.remove("modal-open");
    setMessage(paymentMessage);
  }

  async function cancelOrder(orderId, cancelButton) {
    if (
      !window.confirm(
        "Cancel this pending unpaid order? This cannot be undone."
      )
    ) {
      return;
    }

    if (cancelButton.disabled) {
      return;
    }

    const originalText = cancelButton.textContent;

    cancelButton.disabled = true;
    cancelButton.textContent = "Cancelling...";

    try {
      await apiRequest(`/orders/${orderId}`, {
        method: "DELETE",
      });

      closeDetails();
      showToast("Order cancelled successfully.");

      await loadHistory();
    } catch (error) {
      showToast(error.message, "error");

      cancelButton.disabled = false;
      cancelButton.textContent = originalText;
    }
  }

  function updateReferenceField() {
    const method = document.querySelector(
      'input[name="changedPaymentMethod"]:checked'
    )?.value;

    const required =
      method === "Card" || method === "PayNow";

    referenceField.hidden = !required;
    referenceInput.disabled = !required;
    referenceInput.required = required;

    referenceInput.value = required
      ? createTransactionReference(method)
      : "";
  }

  async function openPaymentModal(order) {
    setMessage(paymentMessage);

    try {
      const payment = await apiRequest(
        `/payments/order/${order.OrderID}`
      );

      if (order.OrderStatus !== "Pending") {
        throw new Error(
          "Payment can only be changed while the order is pending."
        );
      }

      if (!isPendingPayment(payment.PaymentStatus)) {
        throw new Error(
          "Only a pending or failed payment can be changed."
        );
      }

      document.getElementById("paymentOrderId").value =
        order.OrderID;

      document.getElementById("existingPaymentId").value =
        payment.PaymentID;

      document
        .querySelectorAll(
          'input[name="changedPaymentMethod"]'
        )
        .forEach((input) => {
          input.checked =
            input.value === payment.PaymentMethod;
        });

      updateReferenceField();

      paymentBackdrop.hidden = false;
      document.body.classList.add("modal-open");
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function openDetails(orderId) {
    detailsBackdrop.hidden = false;
    document.body.classList.add("modal-open");

    detailsBody.innerHTML = `
      <div class="detail-loading">
        <span class="page-spinner"></span>
        <p>Loading order details…</p>
      </div>
    `;

    try {
      const data = await apiRequest(
        `/order-history/${orderId}`
      );

      const order = data.order;
      const items = data.items || [];
      const timeline = data.timeline || [];

      const paymentStatus =
        getOrderPaymentStatus(order);

      const mayCancel =
        order.OrderStatus === "Pending" &&
        paymentStatus !== "Successful";

      const mayChangePayment =
        order.OrderStatus === "Pending" &&
        isPendingPayment(paymentStatus);

      detailsBody.innerHTML = `
        <div class="detail-hero">
          ${order.StallImage
          ? `
                <img
                  src="${esc(order.StallImage)}"
                  alt="${esc(order.StallName)}"
                >
              `
          : ""
        }

          <div class="detail-hero-overlay">
            <span class="badge ${statusClass(
          order.OrderStatus
        )}">
              ${esc(order.OrderStatus)}
            </span>

            <h2>${esc(order.StallName)}</h2>

            <p>
              Order #${order.OrderID}
              ·
              ${formatDate(order.OrderDateTime)}
            </p>
          </div>
        </div>

        <div class="detail-grid">
          <section class="detail-main">

            <div class="detail-section">

              <div class="detail-section-title">
                <h3>Order Items</h3>

                <span>
                  ${items.reduce(
          (total, item) =>
            total + Number(item.Quantity),
          0
        )} items
                </span>
              </div>

              <div class="detail-items">
                ${items
          .map(
            (item) => `
                      <div class="detail-item">

                        ${item.ItemImage
                ? `
                              <img
                                src="${esc(item.ItemImage)}"
                                alt="${esc(item.ItemName)}"
                              >
                            `
                : `
                              <div class="detail-item-placeholder">
                                🍜
                              </div>
                            `
              }

                        <div>
                          <strong>
                            ${esc(item.ItemName)}
                          </strong>

                          <span>
                            ${item.Quantity}
                            ×
                            ${money(item.UnitPrice)}
                          </span>
                        </div>

                        <strong>
                          ${money(item.Subtotal)}
                        </strong>

                      </div>
                    `
          )
          .join("")}
              </div>

              <div class="detail-total">
                <span>Order Total</span>
                <strong>
                  ${money(order.TotalAmount)}
                </strong>
              </div>
            </div>
                        ${order.SpecialInstructions
          ? `
                  <div class="detail-note">
                    <span>Special Instructions</span>
                    <p>${esc(order.SpecialInstructions)}</p>
                  </div>
                `
          : ""
        }

            ${mayChangePayment || mayCancel
          ? `
                  <div class="detail-actions sticky-detail-actions">
                    ${mayChangePayment
            ? `
                          <button
                            class="button primary"
                            id="changePaymentButton"
                            type="button"
                          >
                            Change Payment Method
                          </button>
                        `
            : ""
          }

                    ${mayCancel
            ? `
                          <button
                            class="button danger"
                            id="cancelOrderButton"
                            type="button"
                          >
                            Cancel Order
                          </button>
                        `
            : ""
          }
                  </div>
                `
          : ""
        }
          </section>

          <aside class="detail-aside">
            <div class="detail-info-card">
              <span class="small muted">
                Collection Location
              </span>

              <h3>
                ${esc(order.HCName || "Hawker centre")}
              </h3>

              <p>
                ${esc(order.StallUnitNo || "")}
                ${esc(order.HCAddress || "")}
              </p>
            </div>

            <div class="detail-info-card">
              <span class="small muted">
                Payment
              </span>

              <h3>
                ${esc(order.PaymentMethod || "—")}
              </h3>

              <p>
                <span
                  class="badge ${paymentBadgeClass(paymentStatus)}"
                >
                  ${esc(paymentLabel(paymentStatus))}
                </span>
              </p>

              <p>
                ${money(order.PaymentAmount || order.TotalAmount)}
              </p>
            </div>

            <div class="detail-info-card">
              <span class="small muted">
                Order Progress
              </span>

              ${timelineHtml(order.OrderStatus, timeline)}
            </div>
          </aside>
        </div>
      `;

      const cancelButton =
        document.getElementById("cancelOrderButton");

      cancelButton?.addEventListener(
        "click",
        () => {
          cancelOrder(order.OrderID, cancelButton);
        }
      );

      document
        .getElementById("changePaymentButton")
        ?.addEventListener("click", () => {
          closeDetails();
          openPaymentModal(order);
        });
    } catch (error) {
      detailsBody.innerHTML = `
        <div class="detail-error">
          <h3>Unable to load order</h3>
          <p>${esc(error.message)}</p>
        </div>
      `;
    }
  }

  paymentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage(paymentMessage);

    const orderId = Number(
      document.getElementById("paymentOrderId").value
    );

    const existingPaymentId = Number(
      document.getElementById("existingPaymentId").value
    );

    const paymentMethod = document.querySelector(
      'input[name="changedPaymentMethod"]:checked'
    )?.value;

    const submitButton = document.getElementById(
      "confirmPaymentChange"
    );

    if (!paymentMethod) {
      setMessage(
        paymentMessage,
        "Please choose a payment method.",
        "error"
      );

      return;
    }

    if (
      paymentMethod !== "Cash" &&
      !referenceInput.value.trim()
    ) {
      setMessage(
        paymentMessage,
        "A transaction reference is required for Card and PayNow.",
        "error"
      );

      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Updating payment…";

    try {
      await apiRequest(
        `/payments/${existingPaymentId}/method`,
        {
          method: "PUT",
          body: JSON.stringify({
            PaymentMethod: paymentMethod,
            TransactionReference:
              paymentMethod === "Cash"
                ? ""
                : referenceInput.value.trim(),
          }),
        }
      );

      closePaymentModal();
      showToast("Payment method updated successfully.");

      await loadHistory();
      await openDetails(orderId);
    } catch (error) {
      setMessage(
        paymentMessage,
        error.message,
        "error"
      );
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Confirm payment change";
    }
  });

  document
    .querySelectorAll(
      'input[name="changedPaymentMethod"]'
    )
    .forEach((input) => {
      input.addEventListener(
        "change",
        updateReferenceField
      );
    });

  document
    .getElementById("closeDetails")
    .addEventListener("click", closeDetails);

  document
    .getElementById("closePaymentModal")
    .addEventListener("click", closePaymentModal);

  document
    .getElementById("cancelPaymentChange")
    .addEventListener("click", closePaymentModal);

  detailsBackdrop.addEventListener("click", (event) => {
    if (event.target === detailsBackdrop) {
      closeDetails();
    }
  });

  paymentBackdrop.addEventListener("click", (event) => {
    if (event.target === paymentBackdrop) {
      closePaymentModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    if (!detailsBackdrop.hidden) {
      closeDetails();
    }

    if (!paymentBackdrop.hidden) {
      closePaymentModal();
    }
  });

  document
    .querySelectorAll("[data-tab]")
    .forEach((tab) => {
      tab.addEventListener("click", () => {
        document
          .querySelectorAll("[data-tab]")
          .forEach((item) => {
            item.classList.toggle(
              "active",
              item === tab
            );
          });

        document.getElementById("activePanel").hidden =
          tab.dataset.tab !== "active";

        document.getElementById("previousPanel").hidden =
          tab.dataset.tab !== "previous";
      });
    });

  async function loadHistory() {
    try {
      const [activeOrders, previousOrders, mostFrequentOrders,] =
        await Promise.all([
          apiRequest("/order-history/active"),
          apiRequest("/order-history/previous"),
          apiRequest("/order-history/most-frequent"),
        ]);

      renderOrders(
        activeOrdersElement,
        activeOrders,
        "No Active Orders"
      );

      renderOrders(
        previousOrdersElement,
        previousOrders,
        "No Previous Orders"
      );

      renderMostFrequentOrders(
        mostFrequentOrders
      );

    } catch (error) {
      setMessage(
        messageElement,
        error.message,
        "error"
      );

      showToast(error.message, "error");
    }
  }

  await loadHistory();
});