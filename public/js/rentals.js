document.addEventListener("DOMContentLoaded", async () => {
    const currentUser = getCurrentUser();

    // The tenancy register belongs to the NEA officer portal
    if (!currentUser || role(currentUser.role) !== "nea_officer") {
        return;
    }

    const agreementForm = document.getElementById("agreementForm");
    const stallInput = document.getElementById("agreementStallId");
    const vendorInput = document.getElementById("agreementVendorId");
    const startInput = document.getElementById("agreementStartDate");
    const endInput = document.getElementById("agreementEndDate");
    const priceInput = document.getElementById("agreementPrice");
    const termsInput = document.getElementById("agreementTerms");
    const agreementMessage = document.getElementById("agreementMessage");
    const submitButton = document.getElementById("agreementSubmitButton");

    const filterInput = document.getElementById("agreementFilter");
    const agreementList = document.getElementById("agreementList");
    const agreementCount = document.getElementById("agreementCount");

    const renewBackdrop = document.getElementById("renewBackdrop");
    const renewForm = document.getElementById("renewForm");
    const renewAgreementId = document.getElementById("renewAgreementId");
    const renewSummary = document.getElementById("renewSummary");
    const renewEndDate = document.getElementById("renewEndDate");
    const renewPrice = document.getElementById("renewPrice");
    const renewMessage = document.getElementById("renewMessage");

    let agreements = [];

    function statusBadgeClass(status) {
        if (status === "Active") return "success";
        if (status === "Upcoming") return "warning";

        return "unavailable";
    }

    function dateOnly(value) {
        if (!value) return "—";

        return String(value).slice(0, 10);
    }

    // The stall list is public, so it can populate the selector directly
    async function loadStalls() {
        try {
            const stalls = await apiRequest("/stalls");

            stallInput.innerHTML = (Array.isArray(stalls) ? stalls : [])
                .map(
                    stall => `
                        <option value="${Number(stall.StallID)}">
                            ${esc(stall.StallName)}
                        </option>
                    `
                )
                .join("");
        } catch (error) {
            console.error("Unable to load stalls:", error);

            stallInput.innerHTML = `
                <option value="">
                    Unable to load stalls
                </option>
            `;
        }
    }

    /*
     * There is no endpoint that lists vendor accounts, so the vendors already
     * named on an agreement are offered. A vendor ID can still be typed in by
     * an officer creating the first agreement for a new vendor.
     */
    function fillVendorOptions() {
        const vendors = new Map();

        agreements.forEach(agreement => {
            vendors.set(Number(agreement.VendorUserID), agreement.VendorName);
        });

        if (!vendors.size) {
            vendorInput.innerHTML = `
                <option value="">
                    No vendor on record yet
                </option>
            `;

            return;
        }

        vendorInput.innerHTML = [...vendors.entries()]
            .map(
                ([userId, username]) => `
                    <option value="${userId}">
                        ${esc(username)} (ID ${userId})
                    </option>
                `
            )
            .join("");
    }

    function renderAgreements(records) {
        agreementCount.textContent =
            `${records.length} ${records.length === 1 ? "agreement" : "agreements"}`;

        if (!records.length) {
            agreementList.innerHTML = `
                <div class="empty">
                    <div class="empty-state-icon">🗂</div>
                    <h3>No agreements found</h3>
                    <p class="muted">
                        No rental agreement matches the selected filter.
                    </p>
                </div>
            `;

            return;
        }

        agreementList.innerHTML = records
            .map(agreement => {
                const daysRemaining = Number(agreement.DaysRemaining || 0);

                const expiringSoon =
                    agreement.AgreementStatus === "Active" &&
                    daysRemaining <= 30;

                return `
                    <article class="agreement-row">
                        <div class="agreement-main">
                            <div class="row-between wrap">
                                <strong>
                                    ${esc(agreement.StallName)}
                                    <span class="small muted">
                                        ${esc(agreement.StallUnitNo || "")}
                                    </span>
                                </strong>

                                <span class="badge ${statusBadgeClass(agreement.AgreementStatus)}">
                                    ${esc(agreement.AgreementStatus)}
                                </span>
                            </div>

                            <p class="small muted">
                                ${esc(agreement.HCName)}
                                · ${esc(agreement.VendorName)}
                                · ${money(agreement.RentalPrice)} per month
                            </p>

                            <p class="small muted">
                                ${dateOnly(agreement.StartDate)}
                                to ${dateOnly(agreement.EndDate)}
                                ${agreement.AgreementStatus === "Active"
                        ? ` · ${daysRemaining} ${daysRemaining === 1 ? "day" : "days"} left`
                        : ""
                    }
                            </p>

                            ${expiringSoon
                        ? `
                                    <p class="small agreement-warning">
                                        Expires within 30 days — renew to keep the stall assigned.
                                    </p>
                                `
                        : ""
                    }
                        </div>

                        <button
                            class="button secondary"
                            type="button"
                            data-renew="${agreement.AgreementID}"
                        >
                            Renew
                        </button>
                    </article>
                `;
            })
            .join("");

        agreementList
            .querySelectorAll("[data-renew]")
            .forEach(button => {
                button.addEventListener("click", () =>
                    openRenewal(Number(button.dataset.renew))
                );
            });
    }

    async function loadAgreements() {
        agreementList.innerHTML = `
            <div class="empty">
                <p class="muted">Loading agreements…</p>
            </div>
        `;

        const filter = filterInput.value;

        try {
            // The expiry report is a separate endpoint from the register
            const response = await apiRequest(
                filter === "expiring"
                    ? "/rental-agreements/expiring?days=30"
                    : filter
                        ? `/rental-agreements?status=${encodeURIComponent(filter)}`
                        : "/rental-agreements"
            );

            const records = Array.isArray(response?.agreements)
                ? response.agreements
                : [];

            // The unfiltered list is what the vendor selector is built from
            if (!filter) {
                agreements = records;
                fillVendorOptions();
            }

            renderAgreements(records);
        } catch (error) {
            console.error("Unable to load rental agreements:", error);

            agreementCount.textContent = "";
            agreementList.innerHTML = `
                <div class="empty">
                    <h3>Unable to load agreements</h3>
                    <p class="muted">${esc(error.message)}</p>
                </div>
            `;
        }
    }

    function openRenewal(agreementId) {
        const agreement = agreements.find(
            entry => Number(entry.AgreementID) === agreementId
        );

        renewAgreementId.value = agreementId;

        renewSummary.textContent = agreement
            ? `${agreement.StallName} · ${agreement.VendorName} · currently ends ${dateOnly(agreement.EndDate)}`
            : "";

        renewEndDate.value = "";
        renewPrice.value = "";

        setMessage(renewMessage);

        renewBackdrop.hidden = false;
        document.body.classList.add("modal-open");
    }

    function closeRenewal() {
        renewBackdrop.hidden = true;
        document.body.classList.remove("modal-open");
    }

    agreementForm.addEventListener("submit", async event => {
        event.preventDefault();
        setMessage(agreementMessage);

        const payload = {
            StallID: Number(stallInput.value),
            VendorUserID: Number(vendorInput.value),
            StartDate: startInput.value,
            EndDate: endInput.value,
            RentalPrice: Number(priceInput.value),
            TermCondition: termsInput.value.trim(),
        };

        if (!payload.StallID || !payload.VendorUserID) {
            setMessage(
                agreementMessage,
                "Select both a stall and a vendor account.",
                "error"
            );

            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = "Creating agreement…";

        try {
            const response = await apiRequest("/rental-agreements", {
                method: "POST",
                body: JSON.stringify(payload),
            });

            setMessage(agreementMessage, response.message, "success");
            showToast(response.message);

            agreementForm.reset();
            await loadAgreements();
        } catch (error) {
            setMessage(agreementMessage, error.message, "error");
            showToast(error.message, "error");
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = "Create agreement";
        }
    });

    renewForm.addEventListener("submit", async event => {
        event.preventDefault();
        setMessage(renewMessage);

        const payload = { EndDate: renewEndDate.value };

        if (renewPrice.value !== "") {
            payload.RentalPrice = Number(renewPrice.value);
        }

        try {
            const response = await apiRequest(
                `/rental-agreements/${renewAgreementId.value}/renew`,
                {
                    method: "PUT",
                    body: JSON.stringify(payload),
                }
            );

            closeRenewal();
            showToast(response.message);

            await loadAgreements();
        } catch (error) {
            setMessage(renewMessage, error.message, "error");
        }
    });

    document
        .getElementById("closeRenewButton")
        .addEventListener("click", closeRenewal);

    renewBackdrop.addEventListener("click", event => {
        if (event.target === renewBackdrop) {
            closeRenewal();
        }
    });

    filterInput.addEventListener("change", loadAgreements);

    await loadStalls();
    await loadAgreements();
});
