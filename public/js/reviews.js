document.addEventListener("DOMContentLoaded", () => {
    const stallIdInput = document.getElementById("reviewStallId");
    const sortInput = document.getElementById("reviewSort");
    const loadButton = document.getElementById("loadReviewsButton");
    const writeButton = document.getElementById("writeReviewButton");
    const summary = document.getElementById("reviewSummary");
    const list = document.getElementById("reviewList");
    const backdrop = document.getElementById("reviewBackdrop");
    const form = document.getElementById("reviewForm");
    const formTitle = document.getElementById("reviewFormTitle");
    const reviewId = document.getElementById("reviewId");
    const comment = document.getElementById("reviewComment");
    const counter = document.getElementById("reviewCounter");
    const message = document.getElementById("reviewMessage");

    let selectedRating = 0;

    if (window.HAWKER_DATA?.stalls) {
        stallIdInput.innerHTML = window.HAWKER_DATA.stalls
            .map(stall => `
                <option value="${stall.StallID}">
                    ${esc(stall.StallName)}
                </option>
            `)
            .join("");
    }

    function paintStars() {
        document
            .querySelectorAll("#reviewStars button")
            .forEach(button => {
                button.classList.toggle(
                    "selected",
                    Number(button.dataset.rating) <= selectedRating
                );
            });
    }

    function openEditor(review = null) {
        const currentUser = getCurrentUser();

        if (!currentUser || role(currentUser.role) !== "customer") {
            window.location.href =
                `/login.html?next=${encodeURIComponent("/reviews.html")}`;
            return;
        }

        reviewId.value = review?.ReviewID || "";
        selectedRating = Number(review?.Rating || 0);
        comment.value = review?.ReviewComment || "";
        formTitle.textContent =
            review ? "Edit review" : "Write a review";
        counter.textContent = `${comment.value.length} / 500`;
        setMessage(message);
        paintStars();

        backdrop.hidden = false;
        document.body.classList.add("modal-open");
    }

    function closeEditor() {
        backdrop.hidden = true;
        document.body.classList.remove("modal-open");
    }

    async function loadReviews() {
        const stallId = Number(stallIdInput.value);

        if (!Number.isInteger(stallId) || stallId <= 0) {
            showToast("Enter a valid Stall ID.", "error");
            return;
        }

        list.innerHTML =
            '<div class="card empty"><p class="muted">Loading reviews…</p></div>';

        try {
            const data = await apiRequest(
                `/feedback/stall/${stallId}?sort=${encodeURIComponent(sortInput.value)}`
            );

            const reviews = Array.isArray(data?.reviews)
                ? data.reviews
                : Array.isArray(data)
                    ? data
                    : [];

            const averageRating = Number(
                data?.averageRating ??
                data?.AverageRating ??
                (reviews.length
                    ? reviews.reduce((sum, review) => sum + Number(review.Rating || 0), 0) / reviews.length
                    : 0)
            );

            const reviewCount = Number(
                data?.reviewCount ??
                data?.ReviewCount ??
                reviews.length
            );

            summary.hidden = false;
            summary.innerHTML = `
                <div class="row-between wrap">
                    <div>
                        <span class="small muted">Average rating</span>
                        <div class="rating-value">
                            ${averageRating.toFixed(1)}
                            <span>★</span>
                        </div>
                    </div>
                    <strong>${reviewCount} review(s)</strong>
                </div>
            `;

            if (!reviews.length) {
                list.innerHTML = `
                    <div class="card empty">
                        <div class="empty-state-icon">★</div>
                        <h3>No reviews yet</h3>
                        <p class="muted">Be the first customer to leave feedback.</p>
                    </div>
                `;
                return;
            }

            const currentUser = getCurrentUser();

            list.innerHTML = reviews.map(review => `
                <article class="card review-card">
                    <div class="row-between wrap">
                        <div>
                            <strong>${esc(review.Username)}</strong>
                            <p class="small muted">${formatDate(review.ReviewDateTime)}</p>
                        </div>
                        <span class="review-rating">
                            ${"★".repeat(review.Rating)}
                        </span>
                    </div>
                    <p>${esc(review.ReviewComment || "")}</p>
                    ${currentUser?.id === review.UserID
                    ? `<div class="row">
                                <button
                                  class="button secondary"
                                  type="button"
                                  data-edit="${review.ReviewID}"
                                >Edit</button>
                                <button
                                  class="button danger"
                                  type="button"
                                  data-delete="${review.ReviewID}"
                                >Delete</button>
                              </div>`
                    : ""
                }
                </article>
            `).join("");

            list.querySelectorAll("[data-edit]").forEach(button => {
                button.addEventListener("click", () => {
                    const review = reviews.find(
                        item => item.ReviewID === Number(button.dataset.edit)
                    );
                    openEditor(review);
                });
            });

            list.querySelectorAll("[data-delete]").forEach(button => {
                button.addEventListener("click", async () => {
                    if (!window.confirm("Delete this review?")) return;

                    try {
                        await apiRequest(
                            `/feedback/${button.dataset.delete}`,
                            { method: "DELETE" }
                        );
                        showToast("Review deleted.");
                        loadReviews();
                    } catch (error) {
                        showToast(error.message, "error");
                    }
                });
            });
        } catch (error) {
            list.innerHTML = "";
            showToast(error.message, "error");
        }
    }

    document
        .querySelectorAll("#reviewStars button")
        .forEach(button => {
            button.addEventListener("click", () => {
                selectedRating = Number(button.dataset.rating);
                paintStars();
            });
        });

    comment.addEventListener("input", () => {
        counter.textContent = `${comment.value.length} / 500`;
    });

    loadButton.addEventListener("click", loadReviews);
    sortInput.addEventListener("change", loadReviews);
    writeButton.addEventListener("click", () => openEditor());
    document
        .getElementById("closeReviewButton")
        .addEventListener("click", closeEditor);

    backdrop.addEventListener("click", event => {
        if (event.target === backdrop) closeEditor();
    });

    form.addEventListener("submit", async event => {
        event.preventDefault();
        setMessage(message);

        if (selectedRating < 1 || selectedRating > 5) {
            setMessage(message, "Please select a rating.", "error");
            return;
        }

        const payload = {
            StallID: Number(stallIdInput.value),
            Rating: selectedRating,
            ReviewComment: comment.value.trim()
        };

        const existingId = reviewId.value;

        try {
            await apiRequest(
                existingId
                    ? `/feedback/${existingId}`
                    : "/feedback",
                {
                    method: existingId ? "PUT" : "POST",
                    body: JSON.stringify(payload)
                }
            );

            closeEditor();
            showToast(
                existingId
                    ? "Review updated successfully."
                    : "Review submitted successfully."
            );
            loadReviews();
        } catch (error) {
            setMessage(message, error.message, "error");
        }
    });

    loadReviews();
});
