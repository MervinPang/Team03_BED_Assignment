document.addEventListener("DOMContentLoaded", () => {
  if (!requireVendor()) return;

  const form =
    document.getElementById("vendorForm");

  const message =
    document.getElementById("vendorMessage");

  const metrics =
    document.getElementById("metrics");

  const ordersPanel =
    document.getElementById("vendorOrdersPanel");

  const ordersList =
    document.getElementById("vendorOrdersList");

  let currentStallId = null;
  const stallSelect =
    document.getElementById("stallId");

  const currentVendor = getCurrentUser();

  if (stallSelect && window.HAWKER_DATA?.stalls) {
    stallSelect.insertAdjacentHTML(
      "beforeend",
      window.HAWKER_DATA.stalls.map(stall => `
        <option value="${stall.StallID}">
          ${esc(stall.StallName)}
        </option>
      `).join("")
    );
  }


  function unwrap(value) {
    let current = value;

    for (let depth = 0; depth < 5; depth += 1) {
      if (current == null) return current;
      if (Array.isArray(current)) return current;

      const next =
        current.data ??
        current.result ??
        current.results ??
        current.analytics ??
        current.recordset;

      if (next === undefined || next === current) {
        return current;
      }

      current = next;
    }

    return current;
  }

  function normaliseArray(value) {
    const unwrapped = unwrap(value);

    if (Array.isArray(unwrapped)) return unwrapped;
    if (Array.isArray(unwrapped?.recordset)) return unwrapped.recordset;
    if (Array.isArray(unwrapped?.items)) return unwrapped.items;
    if (Array.isArray(unwrapped?.topItems)) return unwrapped.topItems;
    if (Array.isArray(unwrapped?.TopItems)) return unwrapped.TopItems;
    if (Array.isArray(unwrapped?.rows)) return unwrapped.rows;

    return [];
  }

  function firstRecord(value) {
    const unwrapped = unwrap(value);

    if (Array.isArray(unwrapped)) {
      return unwrapped[0] || {};
    }

    if (Array.isArray(unwrapped?.recordset)) {
      return unwrapped.recordset[0] || {};
    }

    return unwrapped && typeof unwrapped === "object"
      ? unwrapped
      : {};
  }

  function firstNumber(record, keys) {
    for (const key of keys) {
      const value = record?.[key];

      if (value !== undefined && value !== null && value !== "") {
        const number = Number(value);
        if (Number.isFinite(number)) return number;
      }
    }

    return 0;
  }

  async function loadOrders() {
    ordersList.innerHTML = `
      <div class="card empty">
        <span class="page-spinner"></span>
        <p>Loading authorised orders…</p>
      </div>
    `;

    try {
      const [
        ordersResponse,
        paymentsResponse
      ] = await Promise.all([
        apiRequest("/orders"),
        apiRequest("/payments")
      ]);

      const orders =
        normaliseArray(ordersResponse);

      const payments =
        normaliseArray(paymentsResponse);

      const paymentByOrder =
        new Map(
          payments.map(payment => [
            Number(payment.OrderID),
            payment
          ])
        );

      if (!orders.length) {
        ordersList.innerHTML = `
          <div class="card empty premium-empty">
            <div class="empty-state-icon">📦</div>
            <h3>No authorised orders</h3>
            <p class="muted">
              New orders for your stall will appear here.
            </p>
          </div>
        `;
        return;
      }

      ordersList.innerHTML = orders.map(order => {
        const payment =
          paymentByOrder.get(Number(order.OrderID));

        const paymentStatus =
          payment?.PaymentStatus || "Not recorded";

        const cashAwaitingPayment =
          payment?.PaymentMethod === "Cash" &&
          paymentStatus === "Pending";

        const canPrepare =
          paymentStatus === "Successful" &&
          order.OrderStatus === "Pending";

        const canMarkReady =
          order.OrderStatus === "Preparing";

        const canComplete =
          order.OrderStatus === "Ready";

        return `
          <article class="card vendor-order-card">
            <div class="row-between wrap">
              <div>
                <span class="small muted">
                  Order #${order.OrderID}
                </span>
                <h3>
                  ${esc(order.CustomerName || "Customer")}
                </h3>
              </div>

              <span class="badge ${order.OrderStatus === "Cancelled"
            ? "unavailable"
            : "warning"
          }">
                ${esc(order.OrderStatus)}
              </span>
            </div>

            <div class="payment-strip">
              <span>
                ${esc(payment?.PaymentMethod || "No payment")}
              </span>
              <span class="badge ${paymentBadgeClass(paymentStatus)}">
                ${esc(paymentLabel(paymentStatus))}
              </span>
            </div>

            ${cashAwaitingPayment
            ? `
                  <div class="cash-warning">
                    <strong>Awaiting cash payment</strong>
                    <p>
                      Confirm payment before beginning preparation.
                    </p>
                  </div>

                  <button
                    class="button primary"
                    type="button"
                    data-confirm-payment="${payment.PaymentID}"
                  >
                    Confirm cash received
                  </button>
                `
            : ""
          }

            ${!cashAwaitingPayment && paymentStatus !== "Successful"
            ? `
                  <div class="cash-warning">
                    <strong>Payment not successful</strong>
                    <p>Preparation is disabled until payment is successful.</p>
                  </div>
                `
            : ""
          }

            <div class="vendor-order-actions">
              ${canPrepare
            ? `
                    <button
                      class="button secondary"
                      type="button"
                      data-status-order="${order.OrderID}"
                      data-next-status="Preparing"
                    >
                      Start preparing
                    </button>
                  `
            : ""
          }

              ${canMarkReady
            ? `
                    <button
                      class="button secondary"
                      type="button"
                      data-status-order="${order.OrderID}"
                      data-next-status="Ready"
                    >
                      Mark ready
                    </button>
                  `
            : ""
          }

              ${canComplete
            ? `
                    <button
                      class="button primary"
                      type="button"
                      data-status-order="${order.OrderID}"
                      data-next-status="Completed"
                    >
                      Complete order
                    </button>
                  `
            : ""
          }

              ${order.OrderStatus === "Pending"
            ? `
                    <button
                      class="button danger"
                      type="button"
                      data-status-order="${order.OrderID}"
                      data-next-status="Cancelled"
                    >
                      Cancel order
                    </button>
                  `
            : ""
          }
            </div>
          </article>
        `;
      }).join("");

      ordersList
        .querySelectorAll("[data-confirm-payment]")
        .forEach(button => {
          button.addEventListener("click", async () => {
            button.disabled = true;
            button.textContent = "Confirming…";

            try {
              await apiRequest(
                `/payments/${button.dataset.confirmPayment}/status`,
                {
                  method: "PUT",
                  body: JSON.stringify({
                    PaymentStatus: "Successful"
                  })
                }
              );

              showToast("Cash payment confirmed.");
              await loadOrders();
            } catch (error) {
              showToast(error.message, "error");
              button.disabled = false;
              button.textContent = "Confirm cash received";
            }
          });
        });

      ordersList
        .querySelectorAll("[data-status-order]")
        .forEach(button => {
          button.addEventListener("click", async () => {
            const nextStatus =
              button.dataset.nextStatus;

            const question =
              nextStatus === "Cancelled"
                ? "Cancel this order?"
                : `Change this order to ${nextStatus}?`;

            if (!window.confirm(question)) return;

            button.disabled = true;

            try {
              await apiRequest(
                `/orders/${button.dataset.statusOrder}/status`,
                {
                  method: "PUT",
                  body: JSON.stringify({
                    OrderStatus: nextStatus
                  })
                }
              );

              showToast(
                `Order updated to ${nextStatus}.`
              );

              await loadOrders();
            } catch (error) {
              showToast(error.message, "error");
              button.disabled = false;
            }
          });
        });
    } catch (error) {
      ordersList.innerHTML = `
        <div class="form-message error">
          ${esc(error.message)}
        </div>
      `;
    }
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    setMessage(message);

    currentStallId = Number(
      document.getElementById("stallId").value
    );

    try {
      const [
        revenueData,
        orderData,
        topItemData
      ] = await Promise.all([
        apiRequest(
          `/analytics/revenue/${currentStallId}`
        ),
        apiRequest(
          `/analytics/orders/${currentStallId}`
        ),
        apiRequest(
          `/analytics/top-items/${currentStallId}`
        )
      ]);

      const revenueRecord = firstRecord(revenueData);
      const orderRecord = firstRecord(orderData);

      const totalRevenue = firstNumber(
        revenueRecord,
        [
          "TotalRevenue",
          "totalRevenue",
          "Revenue",
          "revenue",
          "TotalSales",
          "totalSales",
          "Sales",
          "sales"
        ]
      );

      const totalOrders = firstNumber(
        orderRecord,
        [
          "TotalOrders",
          "totalOrders",
          "OrderCount",
          "orderCount",
          "Orders",
          "orders",
          "Count",
          "count"
        ]
      );

      document.getElementById("revenue").textContent =
        money(totalRevenue);

      document.getElementById("orders").textContent =
        totalOrders;

      const selectedStall =
        window.HAWKER_DATA?.stalls?.find(
          stall => Number(stall.StallID) === currentStallId
        );

      document.getElementById("stall").textContent =
        selectedStall?.StallName ||
        stallSelect.options[stallSelect.selectedIndex]?.textContent.trim() ||
        "Selected stall";

      const topItems = normaliseArray(topItemData);

      document.getElementById("topItems").innerHTML =
        topItems.length
          ? topItems.map((item, index) => {
            const itemName =
              item.ItemName ??
              item.itemName ??
              item.MenuItemName ??
              item.menuItemName ??
              item.Name ??
              item.name ??
              `Item ${index + 1}`;

            const quantity = firstNumber(
              item,
              [
                "TotalQuantity",
                "totalQuantity",
                "QuantitySold",
                "quantitySold",
                "TotalSold",
                "totalSold",
                "Quantity",
                "quantity",
                "OrderCount",
                "orderCount"
              ]
            );

            const itemRevenue = firstNumber(
              item,
              [
                "ItemRevenue",
                "itemRevenue",
                "TotalRevenue",
                "totalRevenue",
                "Revenue",
                "revenue"
              ]
            );

            return `
                <div class="analytics-item-row">
                  <div class="analytics-rank">${index + 1}</div>
                  <div class="analytics-item-copy">
                    <strong>${esc(itemName)}</strong>
                    <span class="small muted">
                      ${quantity} sold
                      ${itemRevenue > 0 ? ` · ${money(itemRevenue)}` : ""}
                    </span>
                  </div>
                  <strong>${quantity}</strong>
                </div>
              `;
          }).join("")
          : `
            <div class="analytics-empty">
              <strong>No top-item records returned</strong>
              <p class="muted">
                The frontend successfully contacted the endpoint, but the
                backend returned no item rows for this stall.
              </p>
            </div>
          `;

      if (totalRevenue === 0 && totalOrders > 0) {
        setMessage(
          message,
          "Orders were found, but the revenue endpoint returned $0.00. Check whether your analytics SQL counts only Successful payments or Completed orders.",
          "warning"
        );
      } else {
        setMessage(
          message,
          "Analytics loaded successfully.",
          "success"
        );
      }

      metrics.hidden = false;
      await loadOrders();
    } catch (error) {
      setMessage(
        message,
        error.status === 403
          ? `${error.message} The selected stall is not assigned to ${currentVendor?.username || "this vendor"}. Check FoodStall.VendorUserID in SQL.`
          : error.message,
        "error"
      );
    }
  });

  loadOrders();

  document
    .querySelectorAll("[data-vendor-tab]")
    .forEach(tab => {
      tab.addEventListener("click", () => {
        document
          .querySelectorAll("[data-vendor-tab]")
          .forEach(item => {
            item.classList.toggle(
              "active",
              item === tab
            );
          });

        const showAnalytics =
          tab.dataset.vendorTab === "analytics";

        document.querySelector(".metrics").hidden =
          !showAnalytics;

        document.getElementById("topItems")
          .closest(".card").hidden =
          !showAnalytics;

        ordersPanel.hidden = showAnalytics;
      });
    });
});
