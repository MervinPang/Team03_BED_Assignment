document.addEventListener("DOMContentLoaded", async () => {
    const stallId = Number(
        new URLSearchParams(location.search).get("stall")
    );

    const grid = document.getElementById("menuGrid");
    const cartList = document.getElementById("cartList");
    const summary = document.getElementById("cartSummary");
    const checkout = document.getElementById("checkoutButton");
    const modal = document.getElementById("switchModal");
    const stallTitle = document.getElementById("stallTitle");
    const stallSubtitle =
        document.getElementById("stallSubtitle");

    let stall = null;
    let items = [];
    let pending = null;

    function showMenuError(title, message) {
        stallTitle.textContent = title;
        stallSubtitle.textContent = message;

        grid.innerHTML = `
            <div class="card empty">
                <h3>${esc(title)}</h3>
                <p class="muted">${esc(message)}</p>
            </div>
        `;
    }

    function add(item) {
        if (!item || !item.IsAvailable) {
            return;
        }

        const cart = getCart();

        if (
            cart.items.length &&
            Number(cart.StallID) !== Number(item.StallID)
        ) {
            pending = item;

            document.getElementById("oldStall").textContent =
                cart.StallName;

            document.getElementById("newStall").textContent =
                stall.StallName;

            modal.hidden = false;

            return;
        }

        const cartItem = cart.items.find(
            (existingItem) =>
                existingItem.MenuItemID === item.MenuItemID
        );

        if (cartItem) {
            if (cartItem.Quantity >= 50) {
                return showToast(
                    "Maximum quantity is 50.",
                    "error"
                );
            }

            cartItem.Quantity++;
        } else {
            cart.StallID = stall.StallID;
            cart.StallName = stall.StallName;

            cart.items.push({
                ...item,
                Quantity: 1,
            });
        }

        saveCart(cart);
        renderCart();
        showToast(`${item.ItemName} added.`);
    }

    function change(menuItemId, amount) {
        const cart = getCart();

        const cartItem = cart.items.find(
            (item) => item.MenuItemID === menuItemId
        );

        if (!cartItem) {
            return;
        }

        cartItem.Quantity += amount;

        if (cartItem.Quantity <= 0) {
            cart.items = cart.items.filter(
                (item) => item.MenuItemID !== menuItemId
            );
        }

        if (!cart.items.length) {
            cart.StallID = null;
            cart.StallName = "";
        }

        saveCart(cart);
        renderCart();
    }

    function renderMenu() {
        if (!items.length) {
            grid.innerHTML = `
                <div class="card empty">
                    <h3>No Menu Items Available</h3>
                    <p class="muted">
                        This stall does not currently have any menu
                        items available.
                    </p>
                </div>
            `;

            return;
        }

        grid.innerHTML = items
            .map((item) => {
                const isAvailable = Boolean(item.IsAvailable);

                return `
                    <article
                        class="card menu-card ${isAvailable ? "" : "disabled"
                    }"
                    >
                        <img
                            src="${esc(item.ItemImage)}"
                            alt="${esc(item.ItemName)}"
                        >

                        <div class="stack">
                            <div class="row-between">
                                <h3>${esc(item.ItemName)}</h3>

                                ${isAvailable
                        ? ""
                        : `
                                            <span
                                                class="badge unavailable"
                                            >
                                                Unavailable
                                            </span>
                                        `
                    }
                            </div>

                            <p class="muted small">
                                ${esc(
                        item.ItemDesc ||
                        "No description available."
                    )}
                            </p>

                            <div class="row-between">
                                <span class="price">
                                    ${money(item.Price)}
                                </span>

                                <button
                                    class="button primary"
                                    data-add="${item.MenuItemID}"
                                    ${isAvailable ? "" : "disabled"}
                                >
                                    ${isAvailable
                        ? "Add"
                        : "Unavailable"
                    }
                                </button>
                            </div>
                        </div>
                    </article>
                `;
            })
            .join("");

        grid
            .querySelectorAll("[data-add]")
            .forEach((button) => {
                button.onclick = () => {
                    const menuItemId = Number(
                        button.dataset.add
                    );

                    const selectedItem = items.find(
                        (item) =>
                            item.MenuItemID === menuItemId
                    );

                    add(selectedItem);
                };
            });
    }

    function renderCart() {
        const cart = getCart();

        if (!cart.items.length) {
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

        cartList.innerHTML = cart.items
            .map(
                (item) => `
                    <div class="cart-item">
                        <div class="row-between">
                            <strong>
                                ${esc(item.ItemName)}
                            </strong>

                            <strong>
                                ${money(
                    item.Price * item.Quantity
                )}
                            </strong>
                        </div>

                        <div
                            class="row-between"
                            style="margin-top: 8px"
                        >
                            <div class="qty">
                                <button
                                    data-minus="${item.MenuItemID}"
                                    aria-label="Decrease quantity"
                                >
                                    −
                                </button>

                                <span>${item.Quantity}</span>

                                <button
                                    data-plus="${item.MenuItemID}"
                                    aria-label="Increase quantity"
                                >
                                    +
                                </button>
                            </div>

                            <button
                                class="button secondary"
                                data-remove="${item.MenuItemID}"
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
                <span>Items (${cartQty(cart)})</span>
                <span>${money(subtotal(cart))}</span>
            </div>

            <div class="summary-line">
                <span>Subtotal</span>
                <strong>${money(subtotal(cart))}</strong>
            </div>

            <div class="summary-line total">
                <span>Total</span>
                <strong>${money(subtotal(cart))}</strong>
            </div>
        `;

        checkout.disabled = false;

        cartList
            .querySelectorAll("[data-minus]")
            .forEach((button) => {
                button.onclick = () => {
                    change(
                        Number(button.dataset.minus),
                        -1
                    );
                };
            });

        cartList
            .querySelectorAll("[data-plus]")
            .forEach((button) => {
                button.onclick = () => {
                    change(
                        Number(button.dataset.plus),
                        1
                    );
                };
            });

        cartList
            .querySelectorAll("[data-remove]")
            .forEach((button) => {
                button.onclick = () => {
                    const currentCart = getCart();

                    const cartItem = currentCart.items.find(
                        (item) =>
                            item.MenuItemID ===
                            Number(button.dataset.remove)
                    );

                    change(
                        Number(button.dataset.remove),
                        -Number(cartItem?.Quantity || 1)
                    );
                };
            });
    }

    async function loadMenu() {
        if (!Number.isInteger(stallId) || stallId <= 0) {
            showMenuError(
                "Menu Currently Unavailable",
                "This stall is temporarily unavailable. Please browse another stall or try again later."
            );

            return;
        }

        stallTitle.textContent = "Loading Menu...";
        stallSubtitle.textContent =
            "Please wait while we prepare the menu for you.";

        grid.innerHTML = `
            <div class="card empty">
                Loading menu...
            </div>
        `;

        try {
            const [stallResponse, menuResponse] =
                await Promise.all([
                    apiRequest(`/stalls/${stallId}`),
                    apiRequest(
                        `/stalls/${stallId}/menu-items`
                    ),
                ]);

            if (
                !stallResponse ||
                typeof stallResponse !== "object"
            ) {
                throw new Error(
                    "Invalid stall data received from the server."
                );
            }

            if (!Array.isArray(menuResponse)) {
                throw new Error(
                    "Invalid menu data received from the server."
                );
            }

            stall = stallResponse;
            items = menuResponse;

            stallTitle.textContent = stall.StallName;
            stallSubtitle.textContent =
                stall.Description ||
                "Browse the available menu items below.";

            renderMenu();
        } catch (error) {
            console.error("Unable to load menu:", error);

            pageTitle.textContent = "Menu Currently Unavailable";
            pageDescription.textContent = "This stall is temporarily unavailable. Please browse another stall or try again later.";
        }
    }

    checkout.onclick = () => {
        location.href = "/checkout.html";
    };

    document.getElementById("keepCart").onclick = () => {
        modal.hidden = true;

        showToast(
            `Your ${getCart().StallName} cart was kept.`,
            "error"
        );

        pending = null;
    };

    document.getElementById("replaceCart").onclick = () => {
        clearCart();
        modal.hidden = true;

        if (pending) {
            add(pending);
        }

        pending = null;
    };

    renderCart();
    await loadMenu();
});