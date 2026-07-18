document.addEventListener("DOMContentLoaded", () => {
    const officer = requireNeaOfficer();
    if (!officer) return;

    const inspectionForm = document.getElementById("inspectionForm");
    const historyForm = document.getElementById("historyForm");
    const stallIdInput = document.getElementById("stallId");
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
                            <h3>Stall #${esc(record.StallID)}</h3>
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

        submitButton.disabled = true;
        submitButton.textContent = "Submitting report…";

        try {
            const payload = {
                stall_id: Number(stallIdInput.value),
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

            document.getElementById("historyStallId").value =
                stallIdInput.value;

            await loadHistory(stallIdInput.value);

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

        const stallId =
            document.getElementById("historyStallId").value;

        loadHistory(stallId);
    });

    updateGradePreview();
});
