document.addEventListener("DOMContentLoaded", () => {
    const sid = Number(
        new URLSearchParams(location.search).get("stall")
    ),
        stall = HAWKER_DATA.stalls.find(
            (s) => s.StallID === sid
        ),
        items = HAWKER_DATA.menuItems.filter(
            (i) => i.StallID === sid
        ),
        grid = document.getElementById("menuGrid"),
        cartList = document.getElementById("cartList"),
        summary = document.getElementById("cartSummary"),
        checkout = document.getElementById("checkoutButton"),
        modal = document.getElementById("switchModal");

    let pending = null;

    if (!stall) {
        document.getElementById("stallTitle").textContent =
            "Stall not found";

        return;
    }

    document.getElementById("stallTitle").textContent =
        stall.StallName;

    document.getElementById("stallSubtitle").textContent =
        stall.Description;

    function add(item) {
        const c = getCart();

        if (
            c.items.length &&
            Number(c.StallID) !== Number(item.StallID)
        ) {
            pending = item;

            document.getElementById("oldStall").textContent =
                c.StallName;

            document.getElementById("newStall").textContent =
                stall.StallName;

            modal.hidden = false;

            return;
        }

        const x = c.items.find(
            (i) => i.MenuItemID === item.MenuItemID
        );

        if (x) {
            if (x.Quantity >= 50) {
                return showToast(
                    "Maximum quantity is 50.",
                    "error"
                );
            }

            x.Quantity++;
        } else {
            c.StallID = stall.StallID;
            c.StallName = stall.StallName;

            c.items.push({
                ...item,
                Quantity: 1,
            });
        }

        saveCart(c);
        renderCart();
        showToast(`${item.ItemName} added.`);
    }

    function change(id, n) {
        const c = getCart(),
            x = c.items.find(
                (i) => i.MenuItemID === id
            );

        if (!x) return;

        x.Quantity += n;

        if (x.Quantity <= 0) {
            c.items = c.items.filter(
                (i) => i.MenuItemID !== id
            );
        }

        if (!c.items.length) {
            c.StallID = null;
            c.StallName = "";
        }

        saveCart(c);
        renderCart();
    }

    function renderMenu() {
        grid.innerHTML = items
            .map(
                (i) => `
          <article class="card menu-card ${i.IsAvailable ? "" : "disabled"
                    }">
            <img
              src="${i.ItemImage}"
              alt="${esc(i.ItemName)}"
            >

            <div class="stack">
              <div class="row-between">
                <h3>${esc(i.ItemName)}</h3>

                ${i.IsAvailable
                        ? ""
                        : '<span class="badge unavailable">Unavailable</span>'
                    }
              </div>

              <p class="muted small">
                ${esc(i.ItemDesc)}
              </p>

              <div class="row-between">
                <span class="price">
                  ${money(i.Price)}
                </span>

                <button
                  class="button primary"
                  data-add="${i.MenuItemID}"
                  ${i.IsAvailable
                        ? ""
                        : "disabled"
                    }
                >
                  ${i.IsAvailable
                        ? "Add"
                        : "Unavailable"
                    }
                </button>
              </div>
            </div>
          </article>
        `
            )
            .join("");

        grid
            .querySelectorAll("[data-add]")
            .forEach(
                (b) =>
                (b.onclick = () =>
                    add(
                        items.find(
                            (i) =>
                                i.MenuItemID ===
                                Number(b.dataset.add)
                        )
                    ))
            );
    }

    function renderCart() {
        const c = getCart();

        if (!c.items.length) {
            cartList.innerHTML = `
        <div class="empty">
          <h3>
            Browse the menu and add your first item
            to begin your order.
          </h3>

          <p>
            Add an available item to begin.
          </p>
        </div>
      `;

            summary.innerHTML = `
        <div class="summary-line">
          <span>Subtotal</span>
          <strong>${money(0)}</strong>
        </div>

        <div class="summary-line total">
          <span>Total</span>
          <strong>${money(0)}</strong>
        </div>
      `;

            checkout.disabled = true;

            return;
        }

        cartList.innerHTML = c.items
            .map(
                (i) => `
          <div class="cart-item">
            <div class="row-between">
              <strong>${esc(i.ItemName)}</strong>

              <strong>
                ${money(i.Price * i.Quantity)}
              </strong>
            </div>

            <div
              class="row-between"
              style="margin-top:8px"
            >
              <div class="qty">
                <button data-minus="${i.MenuItemID}">
                  −
                </button>

                <span>${i.Quantity}</span>

                <button data-plus="${i.MenuItemID}">
                  +
                </button>
              </div>

              <button
                class="button secondary"
                data-remove="${i.MenuItemID}"
              >
                Remove
              </button>
            </div>
          </div>
        `
            )
            .join("");

        summary.innerHTML = `
      <div class="summary-line">
        <span>Items (${cartQty(c)})</span>
        <span>${money(subtotal(c))}</span>
      </div>

      <div class="summary-line">
        <span>Subtotal</span>
        <strong>${money(subtotal(c))}</strong>
      </div>

      <div class="summary-line total">
        <span>Total</span>
        <strong>${money(subtotal(c))}</strong>
      </div>
    `;

        checkout.disabled = false;

        cartList
            .querySelectorAll("[data-minus]")
            .forEach(
                (b) =>
                (b.onclick = () =>
                    change(
                        Number(b.dataset.minus),
                        -1
                    ))
            );

        cartList
            .querySelectorAll("[data-plus]")
            .forEach(
                (b) =>
                (b.onclick = () =>
                    change(
                        Number(b.dataset.plus),
                        1
                    ))
            );

        cartList
            .querySelectorAll("[data-remove]")
            .forEach((b) => {
                b.onclick = () => {
                    const c = getCart(),
                        x = c.items.find(
                            (i) =>
                                i.MenuItemID ===
                                Number(b.dataset.remove)
                        );

                    change(
                        Number(b.dataset.remove),
                        -Number(x?.Quantity || 1)
                    );
                };
            });
    }

    checkout.onclick = () =>
        (location.href = "/checkout.html");

    document.getElementById("keepCart").onclick =
        () => {
            modal.hidden = true;

            showToast(
                `Your ${getCart().StallName} cart was kept.`,
                "error"
            );
        };

    document.getElementById("replaceCart").onclick =
        () => {
            clearCart();
            modal.hidden = true;

            if (pending) {
                add(pending);
            }

            pending = null;
        };

    renderMenu();
    renderCart();
});