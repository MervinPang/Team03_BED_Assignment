document.addEventListener("DOMContentLoaded", async () => {
    const currentUser = getCurrentUser();

    // Every complaint endpoint requires a signed-in account.
    if (!currentUser) {
        window.location.href =
            "/login.html?next=" +
            encodeURIComponent("/complaints.html");

        return;
    }

    const currentRole = role(currentUser.role);
    const isCustomer = currentRole === "customer";
    const canManageStatus =
        currentRole === "vendor" ||
        currentRole === "nea_officer";

    const STATUSES = ["Pending", "In Review", "Resolved"];

    const dashboard = document.getElementById("complaintDashboard");
    const complaintForm = document.getElementById("complaintForm");
    const stallIdInput = document.getElementById("stallId");
    const titleInput = document.getElementById("complaintTitle");
    const titleCounter = document.getElementById("titleCounter");
    const descInput = document.getElementById("complaintDesc");
    const descCounter = document.getElementById("descCounter");
    const complaintMessage = document.getElementById("complaintMessage");
    const submitButton = document.getElementById("submitComplaintButton");
    const openCount = document.getElementById("openCount");
    const openCountCaption = document.getElementById("openCountCaption");

    const trackerForm = document.getElementById("trackerForm");
    const trackerStallId = document.getElementById("trackerStallId");
    const trackerStatus = document.getElementById("trackerStatus");
    const trackerMessage = document.getElementById("trackerMessage");
    const onlyMine = document.getElementById("onlyMine");
    const summary = document.getElementById("complaintSummary");
    const complaintList = document.getElementById("complaintList");

    let stalls = [];
    let loadedRecords = [];
    let loadedStallName = "";

    if (!isCustomer) {
        dashboard.classList.add("manage-mode");
    }

    function statusKey(status) {
        if (status === "Resolved") return "resolved";
        if (status === "In Review") return "review";

        return "pending";
    }

    function statusGlyph(status) {
        if (status === "Resolved") return "✓";
        if (status === "In Review") return "⟳";

        return "!";
    }

    function stallName(stallId) {
        const stall = stalls.find(
            item => Number(item.StallID) === Number(stallId)
        );

        return stall?.StallName || `Stall #${stallId}`;
    }

    async function loadStalls() {
        const endpoint =
            currentRole === "vendor"
                ? "/vendors/me/stalls"
                : "/stalls";

        const selects = [trackerStallId];

        if (isCustomer) {
            selects.push(stallIdInput);
        }

        selects.forEach(select => {
            select.disabled = true;

            select.innerHTML = `
                <option value="">
                    Loading stalls...
                </option>
            `;
        });

        if (submitButton) {
            submitButton.disabled = true;
        }

        try {
            const response = await apiRequest(endpoint);

            stalls = Array.isArray(response) ? response : [];

            if (!stalls.length) {
                selects.forEach(select => {
                    select.innerHTML = `
                        <option value="">
                            No stalls available
                        </option>
                    `;
                });

                setMessage(
                    trackerMessage,
                    currentRole === "vendor"
                        ? "No food stall is assigned to your vendor account."
                        : "No food stalls are available at the moment.",
                    "info"
                );

                return false;
            }

            const options = stalls
                .map(
                    stall => `
                        <option value="${Number(stall.StallID)}">
                            ${esc(stall.StallName || "Unnamed stall")}
                        </option>
                    `
                )
                .join("");

            selects.forEach(select => {
                select.innerHTML = options;
                select.disabled = false;
            });

            if (submitButton) {
                submitButton.disabled = false;
            }

            return true;
        } catch (error) {
            console.error("Unable to load stalls:", error);

            selects.forEach(select => {
                select.innerHTML = `
                    <option value="">
                        Unable to load stalls
                    </option>
                `;
            });

            setMessage(trackerMessage, error.message, "error");
            showToast(error.message, "error");

            return false;
        }
    }

    function renderSummary(records) {
        const counts = STATUSES.map(status => ({
            status,
            total: records.filter(
                record => record.ComplaintStatus === status
            ).length
        }));

        summary.hidden = false;

        summary.innerHTML = counts
            .map(
                entry => `
                    <div class="complaint-summary-tile">
                        <span class="badge complaint-status ${statusKey(entry.status)}">
                            ${esc(entry.status)}
                        </span>
                        <strong>${entry.total}</strong>
                    </div>
                `
            )
            .join("");

        const open = counts
            .filter(entry => entry.status !== "Resolved")
            .reduce((total, entry) => total + entry.total, 0);

        openCount.textContent = open;

        openCountCaption.textContent =
            `Pending and in-review cases for ${loadedStallName}.`;
    }

    function renderRecords(records) {
        if (!records.length) {
            complaintList.innerHTML = `
                <div class="empty">
                    <div class="empty-state-icon">📮</div>
                    <h3>No complaints found</h3>
                    <p class="muted">
                        No complaint matches the selected stall and filters.
                    </p>
                </div>
            `;

            return;
        }

        complaintList.innerHTML = records
            .map(record => {
                const status = record.ComplaintStatus || "Pending";
                const key = statusKey(status);

                const isMine =
                    Number(record.UserID) === Number(currentUser.id);

                return `
                    <article class="complaint-record ${isMine ? "is-mine" : ""}">
                        <div class="complaint-orb complaint-status ${key}">
                            ${statusGlyph(status)}
                        </div>

                        <div class="complaint-record-main">
                            <div class="row-between wrap">
                                <div>
                                    <span class="small muted">
                                        Complaint #${esc(record.ComplaintID)}
                                        · ${esc(stallName(record.StallID))}
                                    </span>
                                    <h3>${esc(record.ComplaintTitle)}</h3>
                                </div>

                                <span class="badge complaint-status ${key}">
                                    ${esc(status)}
                                </span>
                            </div>

                            <p class="complaint-desc">
                                ${esc(record.ComplaintDesc)}
                            </p>

                            <div class="complaint-meta">
                                <span>
                                    Submitted ${formatDate(record.CreatedAt)}
                                </span>

                                ${record.ResolvedAt
                        ? `<span>Resolved ${formatDate(record.ResolvedAt)}</span>`
                        : ""
                    }

                                <span class="${isMine ? "complaint-owner-tag" : ""}">
                                    ${isMine
                        ? "Your complaint"
                        : `Customer #${esc(record.UserID)}`
                    }
                                </span>
                            </div>

                            ${canManageStatus
                        ? `
                                    <div class="complaint-actions">
                                        <label
                                            class="small muted"
                                            for="status-${esc(record.ComplaintID)}"
                                        >
                                            Update status
                                        </label>

                                        <select
                                            class="select"
                                            id="status-${esc(record.ComplaintID)}"
                                            data-status-select="${esc(record.ComplaintID)}"
                                        >
                                            ${STATUSES.map(
                            option => `
                                                    <option
                                                        value="${option}"
                                                        ${option === status ? "selected" : ""}
                                                    >
                                                        ${option}
                                                    </option>
                                                `
                        ).join("")}
                                        </select>

                                        <button
                                            class="button secondary"
                                            type="button"
                                            data-update-status="${esc(record.ComplaintID)}"
                                        >
                                            Save status
                                        </button>
                                    </div>
                                `
                        : ""
                    }
                        </div>
                    </article>
                `;
            })
            .join("");

        complaintList
            .querySelectorAll("[data-update-status]")
            .forEach(button => {
                button.addEventListener("click", () =>
                    updateStatus(button)
                );
            });
    }

    function applyFilters() {
        const scoped =
            isCustomer && onlyMine?.checked
                ? loadedRecords.filter(
                    record =>
                        Number(record.UserID) ===
                        Number(currentUser.id)
                )
                : loadedRecords;

        renderSummary(scoped);

        const selectedStatus = trackerStatus.value;

        renderRecords(
            selectedStatus
                ? scoped.filter(
                    record =>
                        record.ComplaintStatus === selectedStatus
                )
                : scoped
        );
    }

    async function loadComplaints() {
        const stallId = Number(trackerStallId.value);

        if (!Number.isInteger(stallId) || stallId <= 0) {
            showToast("Please select a valid stall.", "error");
            return;
        }

        setMessage(trackerMessage);

        complaintList.innerHTML = `
            <div class="empty">
                <p class="muted">Loading complaints…</p>
            </div>
        `;

        try {
            const records = await apiRequest(
                `/complaints/${encodeURIComponent(stallId)}`
            );

            loadedRecords = Array.isArray(records) ? records : [];
            loadedStallName = stallName(stallId);

            applyFilters();
        } catch (error) {
            setMessage(trackerMessage, error.message, "error");
            showToast(error.message, "error");

            loadedRecords = [];
            summary.hidden = true;
            openCount.textContent = "—";

            openCountCaption.textContent =
                "Load a stall to see its open complaints.";

            complaintList.innerHTML = "";
        }
    }

    async function updateStatus(button) {
        const complaintId = button.dataset.updateStatus;

        const select = complaintList.querySelector(
            `[data-status-select="${complaintId}"]`
        );

        const nextStatus = select?.value;

        if (!nextStatus) return;

        button.disabled = true;
        button.textContent = "Saving…";

        try {
            await apiRequest(`/complaints/${complaintId}/status`, {
                method: "PUT",
                body: JSON.stringify({ status: nextStatus })
            });

            showToast(
                `Complaint #${complaintId} updated to ${nextStatus}.`,
                "success"
            );

            await loadComplaints();
        } catch (error) {
            setMessage(trackerMessage, error.message, "error");
            showToast(error.message, "error");

            button.disabled = false;
            button.textContent = "Save status";
        }
    }

    if (isCustomer) {
        titleInput.addEventListener("input", () => {
            titleCounter.textContent =
                `${titleInput.value.length} / 100`;
        });

        descInput.addEventListener("input", () => {
            descCounter.textContent =
                `${descInput.value.length} / 500`;
        });

        complaintForm.addEventListener("submit", async event => {
            event.preventDefault();
            setMessage(complaintMessage);

            const stallId = Number(stallIdInput.value);

            if (!Number.isInteger(stallId) || stallId <= 0) {
                setMessage(
                    complaintMessage,
                    "Please select a valid stall.",
                    "error"
                );

                return;
            }

            const payload = {
                stall_id: stallId,
                complaint_title: titleInput.value.trim(),
                complaint_desc: descInput.value.trim()
            };

            if (!payload.complaint_title || !payload.complaint_desc) {
                setMessage(
                    complaintMessage,
                    "Please provide both a complaint title and a description.",
                    "error"
                );

                return;
            }

            submitButton.disabled = true;
            submitButton.textContent = "Submitting complaint…";

            try {
                const result = await apiRequest("/complaints", {
                    method: "POST",
                    body: JSON.stringify(payload)
                });

                showToast(
                    `Complaint #${result.ComplaintID} submitted.`,
                    "success"
                );

                setMessage(
                    complaintMessage,
                    `Complaint submitted successfully and is now ${result.ComplaintStatus || "Pending"}.`,
                    "success"
                );

                trackerStallId.value = String(stallId);
                trackerStatus.value = "";

                await loadComplaints();

                complaintForm.reset();
                titleCounter.textContent = "0 / 100";
                descCounter.textContent = "0 / 500";
            } catch (error) {
                setMessage(complaintMessage, error.message, "error");
                showToast(error.message, "error");
            } finally {
                submitButton.disabled = false;
                submitButton.textContent = "Submit complaint";
            }
        });

        onlyMine?.addEventListener("change", () => {
            if (loadedRecords.length || !summary.hidden) {
                applyFilters();
            }
        });
    }

    trackerForm.addEventListener("submit", event => {
        event.preventDefault();
        loadComplaints();
    });

    trackerStallId.addEventListener("change", loadComplaints);

    trackerStatus.addEventListener("change", () => {
        if (!summary.hidden) {
            applyFilters();
        }
    });

    const stallsLoaded = await loadStalls();

    if (stallsLoaded) {
        await loadComplaints();
    }
});
