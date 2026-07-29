document.addEventListener("DOMContentLoaded", async () => {
    // The tenancy register belongs to the hawker centre operator
    const currentUser = requireOperator();

    if (!currentUser) {
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

    const centreList = document.getElementById("centreList");
    const stallTableBody = document.getElementById("stallTableBody");
    const stallMessage = document.getElementById("stallMessage");
    const metricStalls = document.getElementById("metricStalls");
    const metricVacant = document.getElementById("metricVacant");
    const metricRent = document.getElementById("metricRent");

    let agreements = [];
    let managedStalls = [];

    function statusBadgeClass(status) {
        if (status === "Active") return "success";
        if (status === "Upcoming") return "warning";
        if (status === "Ended") return "neutral";

        return "unavailable";
    }

    function dateOnly(value) {
        if (!value) return "—";

        return String(value).slice(0, 10);
    }

    // The hawker centres this operator runs, with how much of each is let
    async function loadCentres() {
        try {
            const response = await apiRequest("/operators/me/centres");

            const centres = Array.isArray(response?.centres)
                ? response.centres
                : [];

            if (!centres.length) {
                centreList.innerHTML = `
                    <p class="small muted">
                        No hawker centre is assigned to your operator account.
                    </p>
                `;

                return;
            }

            centreList.innerHTML = centres
                .map(centre => {
                    const stalls = Number(centre.StallCount || 0);
                    const rented = Number(centre.RentedCount || 0);

                    return `
                        <div class="centre-row">
                            <div>
                                <strong>${esc(centre.HCName)}</strong>
                                <p class="small muted">
                                    ${esc(centre.HCAddress || "")}
                                </p>
                            </div>
                            <span class="centre-occupancy small">
                                ${rented} of ${stalls} rented
                            </span>
                        </div>
                    `;
                })
                .join("");
        } catch (error) {
            console.error("Unable to load your hawker centres:", error);

            centreList.innerHTML = `
                <p class="small muted">
                    Unable to load your hawker centres.
                </p>
            `;
        }
    }

    function gradePill(grade) {
        const known = ["A", "B", "C", "D"].includes(grade);

        return `
            <span class="grade-pill grade-${known ? esc(grade) : "none"}">
                ${known ? esc(grade) : "—"}
            </span>
        `;
    }

    /*
     * Every stall the operator is responsible for. A vacant unit is highlighted
     * because an empty stall is the one thing on this page that costs money for
     * as long as it stays that way.
     */
    function renderStalls() {
        const vacant = managedStalls.filter(
            stall => Number(stall.HasCurrentTenancy) !== 1
        );

        const monthlyRent = managedStalls.reduce(
            (total, stall) => total + Number(stall.RentalPrice || 0),
            0
        );

        metricStalls.textContent = managedStalls.length;
        metricVacant.textContent = vacant.length;
        metricRent.textContent = money(monthlyRent);

        if (!managedStalls.length) {
            stallTableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="small muted">
                        No stall is under your management yet.
                    </td>
                </tr>
            `;

            return;
        }

        stallTableBody.innerHTML = managedStalls
            .map(stall => {
                const isLet = Number(stall.HasCurrentTenancy) === 1;
                const daysLeft = Number(stall.DaysRemaining);

                const tenancy = isLet
                    ? `${esc(stall.TenantName || "Vendor")}
                       <p class="small muted">
                           until ${dateOnly(stall.TenancyEndDate)}${Number.isFinite(daysLeft) ? ` · ${daysLeft} days left` : ""}
                       </p>`
                    : `<span class="tenancy-vacant">Vacant</span>`;

                return `
                    <tr class="${isLet ? "" : "is-vacant"}">
                        <td>
                            <span class="stall-name">${esc(stall.StallName)}</span>
                            <p class="small muted">${esc(stall.StallUnitNo || "")}</p>
                        </td>
                        <td class="small">${esc(stall.HCName)}</td>
                        <td>${tenancy}</td>
                        <td class="numeric">
                            ${isLet ? money(stall.RentalPrice) : "—"}
                        </td>
                        <td>${gradePill(stall.HygieneGrade)}</td>
                        <td>
                            ${isLet
                        ? `<button
                                       class="button secondary"
                                       type="button"
                                       data-end-tenancy="${Number(stall.AgreementID)}"
                                       data-stall-name="${esc(stall.StallName)}"
                                       data-tenant-name="${esc(stall.TenantName || "the vendor")}"
                                   >
                                       End tenancy
                                   </button>`
                        : `<span class="small muted">Ready to let</span>`
                    }
                        </td>
                    </tr>
                `;
            })
            .join("");

        stallTableBody
            .querySelectorAll("[data-end-tenancy]")
            .forEach(button => {
                button.addEventListener("click", () => endTenancy(button));
            });
    }

    /*
     * Ending a tenancy closes the agreement and hands the stall back in one
     * step, so the register and the stall itself cannot disagree about who
     * runs it.
     */
    async function endTenancy(button) {
        const { endTenancy: agreementId, stallName, tenantName } = button.dataset;

        const confirmed = window.confirm(
            `End the tenancy of ${tenantName} at ${stallName}?\n\n` +
            "The agreement closes today and the stall is released."
        );

        if (!confirmed) return;

        button.disabled = true;
        button.textContent = "Ending…";

        try {
            const result = await apiRequest(
                `/rental-agreements/${agreementId}/end`,
                { method: "PUT", body: JSON.stringify({}) }
            );

            showToast(result.message || "Tenancy ended.");
            setMessage(stallMessage, `${stallName} is now vacant.`, "success");

            await loadManagedStalls();
            await loadCentres();
            await loadStalls();
            await loadAgreements();
        } catch (error) {
            showToast(error.message, "error");
            setMessage(stallMessage, error.message, "error");

            button.disabled = false;
            button.textContent = "End tenancy";
        }
    }

    async function loadManagedStalls() {
        try {
            const response = await apiRequest("/operators/me/stalls");

            managedStalls = Array.isArray(response?.stalls)
                ? response.stalls
                : [];

            renderStalls();
        } catch (error) {
            console.error("Unable to load the stalls you manage:", error);

            stallTableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="small muted">
                        Unable to load your stalls.
                    </td>
                </tr>
            `;
        }
    }

    /*
     * Only the stalls inside this operator's own hawker centres are offered.
     * The server refuses an agreement for anyone else's stall either way, so
     * this keeps the form from presenting a choice that cannot be made.
     */
    async function loadStalls() {
        try {
            const response = await apiRequest("/operators/me/stalls");

            const stalls = Array.isArray(response?.stalls)
                ? response.stalls
                : [];

            if (!stalls.length) {
                stallInput.innerHTML = `
                    <option value="">
                        No stall is under your management
                    </option>
                `;

                return;
            }

            stallInput.innerHTML = stalls
                .map(stall => {
                    const letOut = Number(stall.HasCurrentTenancy) === 1;

                    return `
                        <option value="${Number(stall.StallID)}">
                            ${esc(stall.StallName)}
                            · ${esc(stall.HCName)}${letOut ? " · currently rented" : ""}
                        </option>
                    `;
                })
                .join("");
        } catch (error) {
            console.error("Unable to load the stalls you manage:", error);

            stallInput.innerHTML = `
                <option value="">
                    Unable to load your stalls
                </option>
            `;
        }
    }

    /*
     * Every vendor account is offered, not only the ones already named on an
     * agreement, so a vendor who has never rented a stall can still be given
     * one. The number of stalls held is shown to tell the accounts apart.
     */
    async function loadVendorOptions() {
        try {
            const response = await apiRequest("/vendors");

            const vendors = Array.isArray(response?.vendors)
                ? response.vendors
                : [];

            if (!vendors.length) {
                vendorInput.innerHTML = `
                    <option value="">
                        No vendor account registered yet
                    </option>
                `;

                return;
            }

            vendorInput.innerHTML = vendors
                .map(vendor => {
                    const stallCount = Number(vendor.StallCount || 0);

                    const held = stallCount
                        ? `${stallCount} ${stallCount === 1 ? "stall" : "stalls"}`
                        : "no stall yet";

                    return `
                        <option value="${Number(vendor.UserID)}">
                            ${esc(vendor.Username)} · ${held}
                        </option>
                    `;
                })
                .join("");
        } catch (error) {
            console.error("Unable to load vendor accounts:", error);

            vendorInput.innerHTML = `
                <option value="">
                    Unable to load vendor accounts
                </option>
            `;
        }
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
                                ${agreement.TerminatedOn
                        ? ` · ended early on ${dateOnly(agreement.TerminatedOn)}`
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

                        ${agreement.TerminatedOn
                        ? `<span class="small muted">Closed</span>`
                        : `<button
                                    class="button secondary"
                                    type="button"
                                    data-renew="${agreement.AgreementID}"
                                >
                                    Renew
                                </button>`
                    }
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

            // The unfiltered list is what the renewal dialog reads from
            if (!filter) {
                agreements = records;
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

            // A new tenancy fills a unit, so the occupancy figures move too
            await loadAgreements();
            await loadManagedStalls();
            await loadCentres();
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
            await loadManagedStalls();
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

    // One request at a time so they never overlap on the shared pool
    await loadCentres();
    await loadManagedStalls();
    await loadStalls();
    await loadVendorOptions();
    await loadAgreements();
});
