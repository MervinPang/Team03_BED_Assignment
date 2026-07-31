document.addEventListener("DOMContentLoaded", async () => {
    const officer = requireNeaOfficer();
    if (!officer) return;

    const inspectionForm = document.getElementById("inspectionForm");
    const historyForm = document.getElementById("historyForm");
    const stallSelect = document.getElementById("stallId");
    const historyStallSelect = document.getElementById("historyStallId");
    const scoreInput = document.getElementById("score");
    const remarksInput = document.getElementById("remarks");
    const remarksCounter = document.getElementById("remarksCounter");
    const gradeValue = document.getElementById("gradeValue");
    const selectedScore = document.getElementById("selectedScore");
    const gradeDescription = document.getElementById("gradeDescription");
    const gradePreview = document.getElementById("gradePreview");
    const inspectionMessage = document.getElementById("inspectionMessage");
    const historyMessage = document.getElementById("historyMessage");
    const historyContainer = document.getElementById("inspectionHistory");
    const submitButton = document.getElementById("submitInspectionButton");

    let stalls = [];

    // An officer picks a stall by name, so the ID behind the option is only
    // used when the report is sent and when a record is labelled.
    function stallName(stallId) {
        const stall = stalls.find(
            item => Number(item.StallID) === Number(stallId)
        );

        return stall?.StallName || `Stall #${stallId}`;
    }

    async function loadStalls() {
        const selects = [stallSelect, historyStallSelect];

        selects.forEach(select => {
            select.disabled = true;

            select.innerHTML = `
                <option value="">Loading stalls...</option>
            `;
        });

        submitButton.disabled = true;

        try {
            const response = await apiRequest("/stalls");

            stalls = Array.isArray(response) ? response : [];

            if (!stalls.length) {
                selects.forEach(select => {
                    select.innerHTML = `
                        <option value="">No stalls available</option>
                    `;
                });

                setMessage(
                    historyMessage,
                    "No food stalls are available to inspect at the moment.",
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

            submitButton.disabled = false;

            return true;
        } catch (error) {
            console.error("Unable to load stalls:", error);

            selects.forEach(select => {
                select.innerHTML = `
                    <option value="">Unable to load stalls</option>
                `;
            });

            setMessage(historyMessage, error.message, "error");
            showToast(error.message, "error");

            return false;
        }
    }

    function deriveGrade(score) {
        if (score >= 85) return "A";
        if (score >= 70) return "B";
        if (score >= 50) return "C";
        return "D";
    }

    function gradeText(grade) {
        return {
            A: "Excellent hygiene performance",
            B: "Good hygiene performance",
            C: "Improvement is required",
            D: "Significant corrective action is required"
        }[grade];
    }

    function updateGradePreview() {
        if (scoreInput.value === "") {
            gradeValue.textContent = "—";
            selectedScore.textContent = "—";
            gradeDescription.textContent =
                "Enter a score to preview the hygiene grade.";
            gradePreview.dataset.grade = "";
            return;
        }

        const score = Number(scoreInput.value);
        const grade = deriveGrade(score);

        gradeValue.textContent = grade;
        selectedScore.textContent = score;
        gradeDescription.textContent = gradeText(grade);
        gradePreview.dataset.grade = grade;
    }

    function renderHistory(records) {
        if (!Array.isArray(records) || records.length === 0) {
            historyContainer.innerHTML = `
                <div class="empty">
                    <div class="empty-state-icon">📋</div>
                    <h3>No inspection records found</h3>
                    <p class="muted">This stall does not have inspection history yet.</p>
                </div>
            `;
            return;
        }

        historyContainer.innerHTML = records.map(record => `
            <article class="inspection-record">
                <div class="grade-orb grade-${esc(record.HygieneGrade)}">
                    ${esc(record.HygieneGrade)}
                </div>

                <div class="inspection-record-main">
                    <div class="row-between wrap">
                        <div>
                            <span class="small muted">
                                Inspection #${esc(record.InspectionID)}
                            </span>
                            <h3>${esc(stallName(record.StallID))}</h3>
                        </div>

                        <span class="badge badge-neutral">
                            ${esc(record.InspectionStatus || "Recorded")}
                        </span>
                    </div>

                    <p class="muted">
                        ${formatDate(record.InspectionDate)}
                    </p>

                    ${record.RemarkText ? `
                        <p>${esc(record.RemarkText)}</p>
                    ` : `
                        <p class="muted">No remarks were recorded.</p>
                    `}
                </div>
            </article>
        `).join("");
    }

    async function loadHistory(stallId) {
        setMessage(historyMessage);
        historyContainer.innerHTML =
            '<div class="empty"><p class="muted">Loading inspection history…</p></div>';

        try {
            const records = await apiRequest(
                `/inspections/${encodeURIComponent(stallId)}`
            );

            renderHistory(records);
        } catch (error) {
            setMessage(historyMessage, error.message, "error");
            showToast(error.message, "error");
            historyContainer.innerHTML = "";
        }
    }

    scoreInput.addEventListener("input", updateGradePreview);

    remarksInput.addEventListener("input", () => {
        remarksCounter.textContent =
            `${remarksInput.value.length} / 500`;
    });

    inspectionForm.addEventListener("submit", async event => {
        event.preventDefault();
        setMessage(inspectionMessage);

        const stallId = Number(stallSelect.value);

        if (!Number.isInteger(stallId) || stallId <= 0) {
            setMessage(
                inspectionMessage,
                "Please select a food stall.",
                "error"
            );

            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = "Submitting report…";

        try {
            const payload = {
                stall_id: stallId,
                score: Number(scoreInput.value),
                remarks: remarksInput.value.trim()
            };

            const result = await apiRequest("/inspections", {
                method: "POST",
                body: JSON.stringify(payload)
            });

            showToast(
                `Inspection submitted. Hygiene grade ${result.HygieneGrade}.`,
                "success"
            );

            setMessage(
                inspectionMessage,
                `Inspection report submitted successfully with hygiene grade ${result.HygieneGrade}.`,
                "success"
            );

            historyStallSelect.value = String(stallId);

            await loadHistory(stallId);

            inspectionForm.reset();
            remarksCounter.textContent = "0 / 500";
            updateGradePreview();
        } catch (error) {
            setMessage(
                inspectionMessage,
                error.message,
                "error"
            );

            showToast(error.message, "error");
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = "Submit inspection report";
        }
    });

    historyForm.addEventListener("submit", event => {
        event.preventDefault();
        loadHistory(historyStallSelect.value);
    });

    historyStallSelect.addEventListener("change", () => {
        loadHistory(historyStallSelect.value);
    });

    updateGradePreview();

    const stallsLoaded = await loadStalls();

    if (stallsLoaded) {
        await loadHistory(historyStallSelect.value);
    }
});
