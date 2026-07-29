document.addEventListener("DOMContentLoaded", async () => {
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
  let analyticsLoaded = false;

  const stallSelect =
    document.getElementById("stallId");

  const currentVendor = getCurrentUser();

  let vendorStalls = [];

  async function loadVendorStalls() {
    if (!stallSelect) {
      console.error(
        'Vendor stall dropdown with id="stallId" was not found.'
      );
      return false;
    }

    const submitButton =
      form?.querySelector('button[type="submit"]');

    if (submitButton) {
      submitButton.disabled = true;
    }

    stallSelect.disabled = true;

    stallSelect.innerHTML = `
    <option value="">
      Loading your stalls...
    </option>
  `;

    try {
      const response = await apiRequest(
        "/vendors/me/stalls"
      );

      console.log(
        "Vendor stalls API response:",
        response
      );

      vendorStalls = normaliseArray(response);

      console.log(
        "Normalised vendor stalls:",
        vendorStalls
      );

      if (!vendorStalls.length) {
        stallSelect.innerHTML = `
        <option value="">
          No assigned stalls
        </option>
      `;

        setMessage(
          message,
          "No food stall is assigned to your vendor account yet. Please contact the hawker centre operator.",
          "warning"
        );

        metrics.hidden = true;
        return false;
      }

      stallSelect.innerHTML = vendorStalls
        .map(stall => `
        <option value="${Number(stall.StallID)}">
          ${esc(stall.StallName || "Unnamed stall")}
        </option>
      `)
        .join("");

      stallSelect.disabled = false;

      if (submitButton) {
        submitButton.disabled = false;
      }

      return true;
    } catch (error) {
      console.error(
        "Unable to load vendor stalls:",
        error
      );

      stallSelect.innerHTML = `
      <option value="">
        Unable to load stalls
      </option>
    `;

      setMessage(
        message,
        error.message ||
        "Unable to load your assigned stalls.",
        "error"
      );

      return false;
    }
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
      /*
       * Requests are sent one at a time. Each model function closes the shared
       * connection pool when it finishes, so two requests that overlap make the
       * second one fail with ECONNCLOSED.
       */
      const ordersResponse = await apiRequest("/orders");
      const paymentsResponse = await apiRequest("/payments");

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

      /*
       GET /orders returns order headers only, so each order is read through
       GET /orders/:id to obtain the items the vendor has to prepare. A failed
       detail request never removes the order from the list.
       */
      const detailedOrders = [];

      for (const order of orders) {
        try {
          const detail = await apiRequest(
            `/orders/${order.OrderID}`
          );

          detailedOrders.push({ ...order, ...unwrap(detail) });
        } catch (error) {
          console.error(
            `Unable to load items for order ${order.OrderID}:`,
            error
          );

          detailedOrders.push(order);
        }
      }

      ordersList.innerHTML = detailedOrders.map(order => {
        const payment =
          paymentByOrder.get(Number(order.OrderID));

        const paymentStatus =
          payment?.PaymentStatus || "Not recorded";

        const isCancelled =
          order.OrderStatus === "Cancelled";

        const isCompleted =
          order.OrderStatus === "Completed";

        const cashAwaitingPayment =
          !isCancelled &&
          !isCompleted &&
          payment?.PaymentMethod === "Cash" &&
          paymentStatus === "Pending";

        const canPrepare =
          !isCancelled &&
          paymentStatus === "Successful" &&
          order.OrderStatus === "Pending";

        const canMarkReady =
          order.OrderStatus === "Preparing";

        const canComplete =
          order.OrderStatus === "Ready";

        const items = normaliseArray(order.items);

        const itemCount = items.reduce(
          (total, item) =>
            total + Number(item.Quantity || 0),
          0
        );

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

            <div class="vendor-order-items">
              <div class="row-between">
                <span class="small muted">
                  Items to prepare
                </span>
                <span class="small muted">
                  ${itemCount}
                  ${itemCount === 1 ? "item" : "items"}
                </span>
              </div>

              ${items.length
            ? items.map(item => `
                      <div class="vendor-order-item">
                        <span class="vendor-order-qty">
                          ${Number(item.Quantity || 0)}×
                        </span>
                        <span class="vendor-order-item-name">
                          ${esc(item.ItemName || "Menu item")}
                        </span>
                        <span class="vendor-order-item-price">
                          ${money(item.Subtotal)}
                        </span>
                      </div>
                    `).join("")
            : `
                    <p class="small muted">
                      No item details were returned for this order.
                    </p>
                  `
          }

              <div class="row-between vendor-order-total">
                <strong>Order total</strong>
                <strong>${money(order.TotalAmount)}</strong>
              </div>
            </div>

            ${order.SpecialInstructions
            ? `
                  <div class="vendor-order-note">
                    <strong>Special instructions</strong>
                    <p>${esc(order.SpecialInstructions)}</p>
                  </div>
                `
            : ""
          }

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

            ${!isCancelled && !isCompleted && !cashAwaitingPayment && paymentStatus !== "Successful"
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
              await refreshAnalytics();
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

              /*
               A completed order adds its items to the top-selling
               totals, so the analytics panel is re-read here.
               */
              await refreshAnalytics();
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

  /*
   Analytics counts only change when an order reaches a new status. So the
   panel is reading again from the API instead of being rendered once and left
   behind. The announce is used for the explicit load analytics. the
   silent form is used when refreshing after an order status change.
   */
  async function loadAnalytics({ announce = false } = {}) {
    if (
      !Number.isInteger(currentStallId) ||
      currentStallId <= 0
    ) {
      return false;
    }

    try {
      // Read one endpoint at a time so the requests never overlap
      const revenueData = await apiRequest(
        `/analytics/revenue/${currentStallId}`
      );

      const orderData = await apiRequest(
        `/analytics/orders/${currentStallId}`
      );

      const topItemData = await apiRequest(
        `/analytics/top-items/${currentStallId}`
      );

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

      const selectedStall = vendorStalls.find(
        stall =>
          Number(stall.StallID) === currentStallId
      );

      document.getElementById("stall").textContent =
        selectedStall?.StallName ||
        stallSelect.options[
          stallSelect.selectedIndex
        ]?.textContent.trim() ||
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
                // Name returned by GET /analytics/top-items/:stallId
                "TotalQuantitySold",
                "totalQuantitySold",
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
              <strong>No best-selling items yet</strong>
              <p class="muted">
                Your top items will appear here once orders for this
                stall have been completed.
              </p>
            </div>
          `;

      analyticsLoaded = true;

      if (announce) {
        if (totalRevenue === 0 && totalOrders > 0) {
          setMessage(
            message,
            "Your stall has orders, but no revenue yet. Revenue is counted once an order is marked as completed.",
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
      }

      return true;
    } catch (error) {
      if (!announce) {
        console.error(
          "Unable to refresh analytics:",
          error
        );

        return false;
      }

      setMessage(
        message,
        error.status === 403
          ? "You can only view analytics for a stall assigned to your account."
          : error.message,
        "error"
      );

      return false;
    }
  }

  /*Called after an order status change so the metrics and
   top-selling item reflect the order that was just completed 
   or cancelled*/
  async function refreshAnalytics() {
    if (!analyticsLoaded) {
      return;
    }

    await loadAnalytics();
  }

  /* Menu and stall management functions*/

  const menuPanel = document.getElementById("vendorMenuPanel");
  const menuList = document.getElementById("menuItemList");
  const menuMessage = document.getElementById("menuMessage");
  const menuStallName = document.getElementById("menuStallName");
  const menuBackdrop = document.getElementById("menuItemBackdrop");
  const menuForm = document.getElementById("menuItemForm");
  const menuFormTitle = document.getElementById("menuItemFormTitle");
  const menuItemId = document.getElementById("menuItemId");
  const menuItemName = document.getElementById("menuItemName");
  const menuItemDesc = document.getElementById("menuItemDesc");
  const menuItemPrice = document.getElementById("menuItemPrice");
  const menuItemCategory = document.getElementById("menuItemCategory");
  const menuItemImage = document.getElementById("menuItemImage");
  const menuItemAvailable = document.getElementById("menuItemAvailable");
  const menuItemMessage = document.getElementById("menuItemMessage");

  const stallSettingsForm = document.getElementById("stallSettingsForm");
  const stallNameInput = document.getElementById("stallNameInput");
  const stallDescInput = document.getElementById("stallDescInput");
  const stallImageInput = document.getElementById("stallImageInput");
  const stallActiveInput = document.getElementById("stallActiveInput");
  const stallSettingsMessage = document.getElementById("stallSettingsMessage");
  const tenancyPanel = document.getElementById("vendorTenancy");

  // The menu is always managed for the stall chosen in the selector
  function selectedStallId() {
    const stallId = Number(stallSelect.value);

    return Number.isInteger(stallId) && stallId > 0
      ? stallId
      : null;
  }

  function renderMenuItems(menuItems) {
    if (!menuItems.length) {
      menuList.innerHTML = `
        <div class="empty premium-empty">
          <div class="empty-state-icon">🍜</div>
          <h3>No menu items yet</h3>
          <p class="muted">
            Add your first dish so customers can order from your stall.
          </p>
        </div>
      `;

      return;
    }

    menuList.innerHTML = menuItems.map(item => {
      const isAvailable =
        item.IsAvailable === true ||
        Number(item.IsAvailable) === 1;

      const timesOrdered = Number(item.TimesOrdered || 0);

      return `
        <article class="menu-manage-row">
          <div class="menu-manage-main">
            <div class="row-between wrap">
              <strong>${esc(item.ItemName)}</strong>
              <span class="badge ${isAvailable ? "success" : "unavailable"}">
                ${isAvailable ? "Available" : "Sold out"}
              </span>
            </div>

            <p class="small muted">
              ${esc(item.ItemCategory || "Uncategorised")}
              · ${money(item.Price)}
              ${timesOrdered
          ? ` · ordered ${timesOrdered} ${timesOrdered === 1 ? "time" : "times"}`
          : ""
        }
            </p>

            ${item.ItemDesc
          ? `<p class="small muted">${esc(item.ItemDesc)}</p>`
          : ""
        }
          </div>

          <div class="menu-manage-actions">
            <button
              class="button secondary"
              type="button"
              data-toggle-item="${item.MenuItemID}"
              data-next-available="${isAvailable ? "false" : "true"}"
            >
              ${isAvailable ? "Mark sold out" : "Mark available"}
            </button>

            <button
              class="button secondary"
              type="button"
              data-edit-item="${item.MenuItemID}"
            >
              Edit
            </button>

            <button
              class="button danger"
              type="button"
              data-delete-item="${item.MenuItemID}"
            >
              Delete
            </button>
          </div>
        </article>
      `;
    }).join("");

    menuList.querySelectorAll("[data-edit-item]").forEach(button => {
      button.addEventListener("click", () => {
        const item = menuItems.find(
          entry =>
            Number(entry.MenuItemID) ===
            Number(button.dataset.editItem)
        );

        openMenuItemEditor(item);
      });
    });

    menuList.querySelectorAll("[data-toggle-item]").forEach(button => {
      button.addEventListener("click", () =>
        toggleAvailability(
          button.dataset.toggleItem,
          button.dataset.nextAvailable === "true"
        )
      );
    });

    menuList.querySelectorAll("[data-delete-item]").forEach(button => {
      button.addEventListener("click", () =>
        deleteMenuItem(button.dataset.deleteItem)
      );
    });
  }

  function fillStallSettings(stallId) {
    const stall = vendorStalls.find(
      entry => Number(entry.StallID) === Number(stallId)
    );

    if (!stall) {
      return;
    }

    stallNameInput.value = stall.StallName || "";
    stallDescInput.value = stall.Description || stall.StallDesc || "";
    stallImageInput.value = stall.StallImage || "";

    stallActiveInput.checked =
      stall.IsAvailable === true ||
      Number(stall.IsAvailable) === 1 ||
      stall.IsActive === true ||
      Number(stall.IsActive) === 1;
  }

  async function loadMenu() {
    const stallId = selectedStallId();

    if (!stallId) {
      setMessage(
        menuMessage,
        "Select one of your stalls to manage its menu.",
        "info"
      );

      return;
    }

    menuList.innerHTML = `
      <div class="card empty">
        <span class="page-spinner"></span>
        <p>Loading menu items…</p>
      </div>
    `;

    setMessage(menuMessage);

    try {
      const response = await apiRequest(
        `/stalls/${stallId}/manage/menu-items`
      );

      menuStallName.textContent =
        response?.stall || "Your menu";

      renderMenuItems(normaliseArray(response?.menuItems));
      fillStallSettings(stallId);
    } catch (error) {
      console.error("Unable to load menu items:", error);

      setMessage(menuMessage, error.message, "error");
      menuList.innerHTML = "";
    }
  }

  function openMenuItemEditor(item = null) {
    menuItemId.value = item?.MenuItemID || "";
    menuItemName.value = item?.ItemName || "";
    menuItemDesc.value = item?.ItemDesc || "";
    menuItemPrice.value = item ? Number(item.Price) : "";
    menuItemCategory.value = item?.ItemCategory || "";
    menuItemImage.value = item?.ItemImage || "";

    menuItemAvailable.checked = item
      ? item.IsAvailable === true || Number(item.IsAvailable) === 1
      : true;

    menuFormTitle.textContent = item
      ? "Edit menu item"
      : "Add menu item";

    setMessage(menuItemMessage);

    menuBackdrop.hidden = false;
    document.body.classList.add("modal-open");
  }

  function closeMenuItemEditor() {
    menuBackdrop.hidden = true;
    document.body.classList.remove("modal-open");
  }

  async function toggleAvailability(menuItemIdValue, nextAvailable) {
    const stallId = selectedStallId();

    try {
      const response = await apiRequest(
        `/stalls/${stallId}/menu-items/${menuItemIdValue}/availability`,
        {
          method: "PATCH",
          body: JSON.stringify({ IsAvailable: nextAvailable })
        }
      );

      showToast(response.message);
      await loadMenu();
    } catch (error) {
      setMessage(menuMessage, error.message, "error");
      showToast(error.message, "error");
    }
  }

  async function deleteMenuItem(menuItemIdValue) {
    if (!window.confirm("Delete this menu item?")) {
      return;
    }

    const stallId = selectedStallId();

    try {
      await apiRequest(
        `/stalls/${stallId}/menu-items/${menuItemIdValue}`,
        { method: "DELETE" }
      );

      showToast("Menu item deleted.");
      await loadMenu();
    } catch (error) {
      /*
       * An item that belongs to a past order cannot be removed, so the
       * suggested alternative is shown instead of a bare failure.
       */
      setMessage(menuMessage, error.message, "error");
      showToast(error.message, "error");
    }
  }

  menuForm.addEventListener("submit", async event => {
    event.preventDefault();
    setMessage(menuItemMessage);

    const stallId = selectedStallId();

    if (!stallId) {
      setMessage(
        menuItemMessage,
        "Select one of your stalls first.",
        "error"
      );

      return;
    }

    const payload = {
      ItemName: menuItemName.value.trim(),
      ItemDesc: menuItemDesc.value.trim(),
      ItemPrice: Number(menuItemPrice.value),
      ItemCategory: menuItemCategory.value.trim(),
      ItemImage: menuItemImage.value.trim(),
      IsAvailable: menuItemAvailable.checked
    };

    const existingId = menuItemId.value;

    try {
      const response = await apiRequest(
        existingId
          ? `/stalls/${stallId}/menu-items/${existingId}`
          : `/stalls/${stallId}/menu-items`,
        {
          method: existingId ? "PUT" : "POST",
          body: JSON.stringify(payload)
        }
      );

      closeMenuItemEditor();
      showToast(response.message);
      await loadMenu();
    } catch (error) {
      setMessage(menuItemMessage, error.message, "error");
    }
  });

  stallSettingsForm.addEventListener("submit", async event => {
    event.preventDefault();
    setMessage(stallSettingsMessage);

    const stallId = selectedStallId();

    if (!stallId) {
      setMessage(
        stallSettingsMessage,
        "Select one of your stalls first.",
        "error"
      );

      return;
    }

    try {
      const response = await apiRequest(`/stalls/${stallId}`, {
        method: "PUT",
        body: JSON.stringify({
          StallName: stallNameInput.value.trim(),
          StallDesc: stallDescInput.value.trim(),
          StallImage: stallImageInput.value.trim(),
          IsActive: stallActiveInput.checked
        })
      });

      setMessage(
        stallSettingsMessage,
        response.message,
        "success"
      );

      showToast(response.message);

      // The stall list feeds the selector and the settings form
      await loadVendorStalls();
      stallSelect.value = String(stallId);
      fillStallSettings(stallId);
    } catch (error) {
      setMessage(stallSettingsMessage, error.message, "error");
    }
  });

  document
    .getElementById("addMenuItemButton")
    .addEventListener("click", () => openMenuItemEditor());

  document
    .getElementById("closeMenuItemButton")
    .addEventListener("click", closeMenuItemEditor);

  menuBackdrop.addEventListener("click", event => {
    if (event.target === menuBackdrop) {
      closeMenuItemEditor();
    }
  });

  /* ---------------- Rental agreement ---------------- */

  function agreementBadgeClass(status) {
    if (status === "Active") return "success";
    if (status === "Upcoming") return "warning";

    return "unavailable";
  }

  /*
   * Builds one entry per calendar month the vendor holds the stall. The rent of
   * a month is taken from the agreement that covers it, so a renewal at a new
   * price appears as a step instead of being averaged away.
   */
  function buildRentMonths(stallAgreements) {
    const periods = stallAgreements
      .map(agreement => ({
        start: new Date(agreement.StartDate),
        end: new Date(agreement.EndDate),
        rent: Number(agreement.RentalPrice || 0)
      }))
      .filter(
        period =>
          !Number.isNaN(period.start.getTime()) &&
          !Number.isNaN(period.end.getTime())
      )
      .sort((a, b) => a.start - b.start);

    if (!periods.length) {
      return [];
    }

    const firstMonth = new Date(
      periods[0].start.getFullYear(),
      periods[0].start.getMonth(),
      1
    );

    const lastEnd = periods.reduce(
      (latest, period) =>
        period.end > latest ? period.end : latest,
      periods[0].end
    );

    const months = [];
    const cursor = new Date(firstMonth);

    // A tenancy of a few years would produce too many bars to read
    while (cursor <= lastEnd && months.length < 240) {
      const monthStart = new Date(cursor);

      const monthEnd = new Date(
        cursor.getFullYear(),
        cursor.getMonth() + 1,
        0
      );

      // The latest agreement overlapping the month sets its rent
      const covering = periods
        .filter(
          period =>
            period.start <= monthEnd && period.end >= monthStart
        )
        .pop();

      if (covering) {
        months.push({
          date: monthStart,
          rent: covering.rent
        });
      }

      cursor.setMonth(cursor.getMonth() + 1);
    }

    return months;
  }

  /*
   * A column per month, with the current month in the accent colour and the
   * remaining months in a lighter step of the same hue. Values are reachable
   * from the bar labels and the table view, never from the tooltip alone.
   */
  function renderRentChart(months) {
    /*
     * A single month would draw one lonely bar that says no more than the
     * monthly rent figure above it, so the chart only appears once there are
     * months to compare.
     */
    if (months.length < 2) {
      return "";
    }

    const now = new Date();

    const currentIndex = months.findIndex(
      month =>
        month.date.getFullYear() === now.getFullYear() &&
        month.date.getMonth() === now.getMonth()
    );

    // At most twelve columns stay readable in the card
    const maxColumns = 12;
    let visible = months;
    let truncated = false;

    if (months.length > maxColumns) {
      const start = Math.min(
        Math.max(currentIndex === -1 ? 0 : currentIndex - 2, 0),
        months.length - maxColumns
      );

      visible = months.slice(start, start + maxColumns);
      truncated = true;
    }

    const highestRent = Math.max(
      ...visible.map(month => month.rent)
    );

    const rents = [...new Set(months.map(month => month.rent))];

    const monthName = date =>
      new Intl.DateTimeFormat("en-SG", { month: "short" }).format(date);

    const fullMonthName = date =>
      new Intl.DateTimeFormat("en-SG", {
        month: "long",
        year: "numeric"
      }).format(date);

    // The axis shows month names only, so the caption carries the years
    const monthYear = date =>
      new Intl.DateTimeFormat("en-SG", {
        month: "short",
        year: "numeric"
      }).format(date);

    const isCurrent = date =>
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth();

    const columns = visible
      .map(month => {
        const height = highestRent
          ? Math.max((month.rent / highestRent) * 100, 4)
          : 4;

        const current = isCurrent(month.date);

        return `
          <div
            class="rent-column${current ? " is-current" : ""}"
            role="listitem"
            tabindex="0"
            aria-label="${esc(fullMonthName(month.date))}: ${esc(money(month.rent))}"
          >
            <span class="rent-tip">
              ${esc(monthName(month.date))}
              ${month.date.getFullYear()}
              · ${esc(money(month.rent))}
            </span>

            <div class="rent-bar-track">
              <div class="rent-bar" style="height:${height.toFixed(1)}%"></div>
            </div>

            <span class="rent-month">
              ${esc(monthName(month.date))}
            </span>
          </div>
        `;
      })
      .join("");

    const currentMonth =
      currentIndex === -1 ? null : months[currentIndex];

    return `
      <figure class="rent-chart">
        <figcaption class="rent-chart-head">
          <span class="small muted">Rent by month</span>

          <span class="small rent-chart-value">
            ${currentMonth
        ? `This month · ${esc(money(currentMonth.rent))}`
        : `${esc(money(rents[0]))} per month`
      }
          </span>
        </figcaption>

        <div class="rent-bars" role="list">
          ${columns}
        </div>

        <p class="small muted rent-caption">
          ${truncated
        ? `Showing ${maxColumns} of ${months.length} months`
        : `${months.length} ${months.length === 1 ? "month" : "months"}`
      }
          · ${esc(monthYear(visible[0].date))}
          to ${esc(monthYear(visible[visible.length - 1].date))}
          · ${rents.length === 1
        ? `${esc(money(rents[0]))} each`
        : `${esc(money(Math.min(...rents)))} to ${esc(money(Math.max(...rents)))}`
      }
        </p>

        <details class="rent-table">
          <summary class="small muted">
            View as table
          </summary>

          <table>
            <thead>
              <tr>
                <th scope="col">Month</th>
                <th scope="col">Rent</th>
              </tr>
            </thead>
            <tbody>
              ${months
        .map(
          month => `
                    <tr${isCurrent(month.date) ? ` class="is-current"` : ""}>
                      <td>${esc(fullMonthName(month.date))}</td>
                      <td>${esc(money(month.rent))}</td>
                    </tr>
                  `
        )
        .join("")}
            </tbody>
          </table>
        </details>
      </figure>
    `;
  }

  async function loadTenancy() {
    tenancyPanel.innerHTML = `
      <p class="small muted">Loading your agreement…</p>
    `;

    try {
      const response = await apiRequest("/rental-agreements");
      const agreements = normaliseArray(response?.agreements);

      if (!agreements.length) {
        tenancyPanel.innerHTML = `
          <p class="small muted">
            No rental agreement is recorded for your account.
            The hawker centre operator creates one when your
            tenancy begins.
          </p>
        `;

        return;
      }

      const stallId = selectedStallId();

      // The agreement of the selected stall is the relevant one
      const relevant =
        agreements.find(
          agreement =>
            Number(agreement.StallID) === Number(stallId)
        ) || agreements[0];

      const daysRemaining = Number(relevant.DaysRemaining || 0);

      // Every agreement of this stall, so a renewal shows as a rent change
      const stallAgreements = agreements.filter(
        agreement =>
          Number(agreement.StallID) === Number(relevant.StallID)
      );

      const rentChart = renderRentChart(
        buildRentMonths(stallAgreements)
      );

      tenancyPanel.innerHTML = `
        <div class="row-between wrap">
          <strong>${esc(relevant.StallName)}</strong>
          <span class="badge ${agreementBadgeClass(relevant.AgreementStatus)}">
            ${esc(relevant.AgreementStatus)}
          </span>
        </div>

        <div class="tenancy-figures">
          <div>
            <span class="small muted">Monthly rent</span>
            <strong>${money(relevant.RentalPrice)}</strong>
          </div>
          <div>
            <span class="small muted">Ends</span>
            <strong>${formatDate(relevant.EndDate).split(",")[0]}</strong>
          </div>
          <div>
            <span class="small muted">Days left</span>
            <strong>${daysRemaining > 0 ? daysRemaining : 0}</strong>
          </div>
        </div>

        ${rentChart}

        ${daysRemaining >= 0 && daysRemaining <= 30
          ? `
            <div class="cash-warning">
              <strong>Renewal due soon</strong>
              <p>
                Contact the hawker centre operator to renew before
                ${formatDate(relevant.EndDate).split(",")[0]}.
              </p>
            </div>
          `
          : ""
        }

        ${relevant.TermCondition
          ? `<p class="small muted">${esc(relevant.TermCondition)}</p>`
          : ""
        }
      `;
    } catch (error) {
      console.error("Unable to load rental agreement:", error);

      tenancyPanel.innerHTML = `
        <p class="small muted">
          Unable to load your rental agreement.
        </p>
      `;
    }
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    setMessage(message);

    currentStallId = Number(stallSelect.value);

    if (
      !Number.isInteger(currentStallId) ||
      currentStallId <= 0
    ) {
      setMessage(
        message,
        "Please select a valid assigned stall.",
        "error"
      );

      return;
    }

    const ownsSelectedStall = vendorStalls.some(
      stall =>
        Number(stall.StallID) === currentStallId
    );

    if (!ownsSelectedStall) {
      setMessage(
        message,
        "You are not authorised to view analytics for this stall.",
        "error"
      );

      return;
    }

    const loaded = await loadAnalytics({
      announce: true
    });

    if (loaded) {
      await loadOrders();
    }
  });

  const stallsLoaded = await loadVendorStalls();

  if (stallsLoaded) {
    currentStallId = Number(stallSelect.value);
  }

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

        const activeTab = tab.dataset.vendorTab;

        const showAnalytics = activeTab === "analytics";
        const showOrders = activeTab === "orders";
        const showMenu = activeTab === "menu";

        document.querySelector(".metrics").hidden =
          !showAnalytics;

        document.getElementById("topItems")
          .closest(".card").hidden =
          !showAnalytics;

        ordersPanel.hidden = !showOrders;
        menuPanel.hidden = !showMenu;

        // Returning to the analytics tab always shows current figures.
        if (showAnalytics) {
          refreshAnalytics();
        }

        // The menu and tenancy are read when the tab is opened
        if (showMenu) {
          loadMenu();
          loadTenancy();
        }
      });
    });

  // Changing the selected stall reloads whatever the menu tab is showing
  stallSelect.addEventListener("change", () => {
    if (!menuPanel.hidden) {
      loadMenu();
      loadTenancy();
    }
  });
});
