document.addEventListener("DOMContentLoaded", () => {
    if (redirectNonCustomerFromOrdering()) return;

    const form = document.getElementById("checkoutForm");
    const cartContainer = document.getElementById("checkoutCart");
    const messageContainer = document.getElementById("checkoutMessage");
    const guestFields = document.getElementById("guestFields");
    const guestNameInput = document.getElementById("guestName");
    const guestEmailInput = document.getElementById("guestEmail");
    const referenceField = document.getElementById("referenceField");
    const transactionReference = document.getElementById("transactionReference");
    const instructions = document.getElementById("specialInstructions");
    const counter = document.getElementById("instructionLimit");
    const submitButton = document.getElementById("submitButton");

    const currentUser = getCurrentUser();
    const currentRole = role(currentUser?.role);
    const isMember = currentRole === "customer";
    let limitToastShown = false;

    if (currentUser && !isMember) {
        const destination =
            currentRole === "vendor"
                ? "/vendor.html"
                : "/inspection.html";

        showToast(
            "Only customers and guests can place food orders.",
            "error"
        );
        window.location.replace(destination);
        return;
    }

    /*
     * Critical fix:
     * Hidden required guest fields previously blocked form submission for
     * authenticated customers before JavaScript or the API could run.
     */
    guestFields.hidden = isMember;
    guestNameInput.disabled = isMember;
    guestEmailInput.disabled = isMember;
    guestNameInput.required = !isMember;
    guestEmailInput.required = !isMember;

    function renderSummary() {
        const currentCart = getCart();

        if (!currentCart.items.length) {
            cartContainer.innerHTML = `
                <div class="empty premium-empty">
                    <div class="empty-state-icon">🛒</div>
                    <h3>Your cart is empty</h3>
                    <p class="muted">Browse the stalls to begin a new order.</p>
                    <a class="button primary" href="/stalls.html">Browse stalls</a>
                </div>
            `;
            form.hidden = true;
            return;
        }

        cartContainer.innerHTML = `
            <div class="receipt-summary stack">
                <div class="receipt-stall">
                    <div>
                        <span class="small muted">Your order</span>
                        <h3>${esc(currentCart.StallName)}</h3>
                    </div>
                    <a class="text-link" href="/menu.html?stall=${currentCart.StallID}">
                        Edit
                    </a>
                </div>

                <div class="checkout-items">
                    ${currentCart.items.map(item => `
                        <div class="checkout-item">
                            <div>
                                <strong>${esc(item.ItemName)}</strong>
                                <span class="small muted">
                                    ${item.Quantity} × ${money(item.Price)}
                                </span>
                            </div>
                            <strong>${money(item.Price * item.Quantity)}</strong>
                        </div>
                    `).join("")}
                </div>

                <div class="summary-line">
                    <span>Subtotal</span>
                    <strong>${money(subtotal(currentCart))}</strong>
                </div>

                <div class="summary-line total">
                    <span>Total</span>
                    <strong>${money(subtotal(currentCart))}</strong>
                </div>
            </div>
        `;
    }

    function updatePaymentFields() {
        const paymentMethod = document.querySelector(
            'input[name="paymentMethod"]:checked'
        )?.value;

        const requiresReference = paymentMethod !== "Cash";

        referenceField.hidden = !requiresReference;
        transactionReference.disabled = !requiresReference;
        transactionReference.required = requiresReference;

        if (!requiresReference) {
            transactionReference.value = "";
        }

        submitButton.textContent =
            paymentMethod === "Cash"
                ? "Place order"
                : "Place order and pay";
    }

    function updateCounter() {
        const length = instructions.value.length;
        counter.textContent = `${length} / 300`;

        counter.closest(".counter")?.classList.toggle(
            "limit-reached",
            length === 300
        );

        if (length === 300 && !limitToastShown) {
            showToast(
                "Special instructions are limited to 300 characters.",
                "info"
            );
            limitToastShown = true;
        }

        if (length < 300) {
            limitToastShown = false;
        }
    }

    instructions.addEventListener("input", updateCounter);

    instructions.addEventListener("beforeinput", event => {
        const insertingText = event.inputType?.startsWith("insert");
        const noSelectedText =
            instructions.selectionStart === instructions.selectionEnd;

        if (
            insertingText &&
            noSelectedText &&
            instructions.value.length >= 300
        ) {
            showToast(
                "You have reached the 300-character limit.",
                "info"
            );
        }
    });

    document
        .querySelectorAll('input[name="paymentMethod"]')
        .forEach(input => {
            input.addEventListener("change", updatePaymentFields);
        });

    form.addEventListener("submit", async event => {
        event.preventDefault();
        setMessage(messageContainer);

        const currentCart = getCart();

        if (!currentCart.items.length) {
            setMessage(messageContainer, "Your cart is empty.", "error");
            return;
        }

        /*
         * Use explicit validation instead of allowing hidden controls
         * to silently stop the form.
         */
        if (!isMember) {
            if (!guestNameInput.value.trim()) {
                setMessage(
                    messageContainer,
                    "Please enter your name.",
                    "error"
                );
                guestNameInput.focus();
                return;
            }

            if (
                !guestEmailInput.value.trim() ||
                !guestEmailInput.validity.valid
            ) {
                setMessage(
                    messageContainer,
                    "Please enter a valid email address.",
                    "error"
                );
                guestEmailInput.focus();
                return;
            }
        }

        const paymentMethod = document.querySelector(
            'input[name="paymentMethod"]:checked'
        )?.value;

        if (!paymentMethod) {
            setMessage(
                messageContainer,
                "Please select a payment method.",
                "error"
            );
            return;
        }

        if (
            paymentMethod !== "Cash" &&
            !transactionReference.value.trim()
        ) {
            setMessage(
                messageContainer,
                "Transaction reference is required for Card and PayNow payments.",
                "error"
            );
            transactionReference.focus();
            return;
        }

        submitButton.disabled = true;
        submitButton.innerHTML =
            '<span class="button-spinner"></span> Placing order…';

        try {
            /*
             * Request 1: Create the CustomerOrder and OrderItem records.
             * The server calculates all prices from MenuItem.
             */
            const orderPayload = {
                OrderType: isMember ? "Member" : "Guest",
                SpecialInstructions: instructions.value.trim(),
                items: currentCart.items.map(item => ({
                    MenuItemID: Number(item.MenuItemID),
                    Quantity: Number(item.Quantity)
                }))
            };

            if (!isMember) {
                orderPayload.GuestName =
                    guestNameInput.value.trim();

                orderPayload.GuestEmail =
                    guestEmailInput.value.trim();
            }

            const order = await apiRequest("/orders", {
                method: "POST",
                body: JSON.stringify(orderPayload)
            });

            /*
             * orderModel.getOrderById returns a flattened order object
             * with an items property. Support both shapes defensively.
             */
            const orderId = Number(
                order?.OrderID ??
                order?.order?.OrderID
            );

            const guestReference =
                order?.GuestOrderReference ??
                order?.order?.GuestOrderReference ??
                null;

            if (!Number.isInteger(orderId) || orderId <= 0) {
                throw new Error(
                    "The order was created, but the server did not return a valid Order ID."
                );
            }

            localStorage.setItem(
                PENDING_ORDER_KEY,
                JSON.stringify(order)
            );

            submitButton.innerHTML =
                '<span class="button-spinner"></span> Processing payment…';

            /*
             * Request 2: Create exactly one Payment for the order.
             * Cash accepts an empty reference. Card and PayNow require one.
             */
            const paymentPayload = {
                OrderID: orderId,
                PaymentMethod: paymentMethod,
                TransactionReference:
                    paymentMethod === "Cash"
                        ? ""
                        : transactionReference.value.trim()
            };

            if (!isMember) {
                if (!guestReference) {
                    throw new Error(
                        "The server did not return a guest order reference."
                    );
                }

                paymentPayload.GuestOrderReference =
                    guestReference;
            }

            const payment = await apiRequest("/payments", {
                method: "POST",
                body: JSON.stringify(paymentPayload)
            });

            if (!isMember) {
                saveGuestOrder({
                    OrderID: orderId,
                    GuestOrderReference: guestReference
                });
            }

            /*
             * The backend and SQL database are the source of truth for price.
             * Use the created order returned by the server whenever available,
             * instead of trusting the browser's earlier cart calculation.
             */
            const serverOrder = order?.order || order;
            const serverItems = Array.isArray(order?.items)
                ? order.items
                : Array.isArray(serverOrder?.items)
                    ? serverOrder.items
                    : [];

            const confirmationItems = serverItems.length
                ? serverItems.map(item => ({
                    MenuItemID: item.MenuItemID,
                    ItemName: item.ItemName,
                    Quantity: Number(item.Quantity),
                    Price: Number(
                        item.UnitPrice ??
                        item.Price ??
                        (Number(item.Subtotal) / Number(item.Quantity || 1))
                    )
                }))
                : currentCart.items;

            const serverTotal = Number(
                serverOrder?.TotalAmount ??
                order?.TotalAmount
            );

            const confirmation = {
                orderId,
                guestReference,
                isMember,
                stallName: currentCart.StallName,
                items: confirmationItems,
                subtotal: Number.isFinite(serverTotal)
                    ? serverTotal
                    : subtotal(currentCart),
                paymentMethod,
                paymentStatus:
                    payment?.PaymentStatus ||
                    (paymentMethod === "Cash"
                        ? "Pending"
                        : "Successful"),
                placedAt: new Date().toISOString()
            };

            sessionStorage.setItem(
                ORDER_CONFIRMATION_KEY,
                JSON.stringify(confirmation)
            );

            /*
             * Do not clear the cart until both API operations succeed.
             */
            clearCart();
            localStorage.removeItem(PENDING_ORDER_KEY);

            window.location.assign("/confirmation.html");
        } catch (error) {
            const errorMessage =
                error?.message ||
                "Unable to place your order.";

            setMessage(
                messageContainer,
                errorMessage,
                "error"
            );

            showToast(errorMessage, "error");

            messageContainer.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });
        } finally {
            submitButton.disabled = false;
            updatePaymentFields();
        }
    });

    renderSummary();
    updatePaymentFields();
    updateCounter();
});
