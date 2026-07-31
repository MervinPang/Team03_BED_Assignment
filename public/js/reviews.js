document.addEventListener("DOMContentLoaded", async () => {
    const stallIdInput = document.getElementById("reviewStallId");
    const sortInput = document.getElementById("reviewSort");
    const loadButton = document.getElementById(
        "loadReviewsButton"
    );
    const writeButton = document.getElementById(
        "writeReviewButton"
    );
    const summary = document.getElementById("reviewSummary");
    const list = document.getElementById("reviewList");
    const backdrop = document.getElementById(
        "reviewBackdrop"
    );
    const form = document.getElementById("reviewForm");
    const formTitle = document.getElementById(
        "reviewFormTitle"
    );
    const reviewId = document.getElementById("reviewId");
    const comment = document.getElementById(
        "reviewComment"
    );
    const counter = document.getElementById(
        "reviewCounter"
    );
    const message = document.getElementById(
        "reviewMessage"
    );

    let selectedRating = 0;
    let stalls = [];

    /* Vendors only manage the stalls assigned to their own account,
     so the page shows their own stalls instead of every stall on the platform.*/
    const isVendor = role(getCurrentUser()?.role) === "vendor";

    function applyVendorCopy() {
        if (!isVendor) {
            return;
        }

        document.getElementById("reviewsEyebrow").textContent =
            "Your customer feedback";

        document.getElementById("reviewsTitle").textContent =
            "My stall reviews";

        document.getElementById("reviewsLead").textContent =
            "Read the reviews customers have left for the food stalls assigned to your vendor account.";

        document.getElementById("reviewStallLabel").textContent =
            "Your stall";
    }

    async function loadStalls() {
        stallIdInput.disabled = true;
        loadButton.disabled = true;
        writeButton.disabled = true;

        stallIdInput.innerHTML = `
            <option value="">
                Loading stalls...
            </option>
        `;

        try {
            const response = await apiRequest(
                isVendor ? "/vendors/me/stalls" : "/stalls"
            );

            if (!Array.isArray(response)) {
                throw new Error(
                    "Invalid stall data received from the server."
                );
            }

            stalls = response;

            if (!stalls.length) {
                stallIdInput.innerHTML = `
                    <option value="">
                        ${isVendor
                        ? "No stall assigned"
                        : "No stalls available"
                    }
                    </option>
                `;

                list.innerHTML = isVendor
                    ? `
                        <div class="card empty">
                            <h3>No Stall Assigned</h3>

                            <p class="muted">
                                No food stall is assigned to your
                                vendor account, so there are no
                                reviews to display.
                            </p>
                        </div>
                    `
                    : `
                        <div class="card empty">
                            <h3>No Stalls Available</h3>

                            <p class="muted">
                                Reviews cannot be loaded because there
                                are currently no available stalls.
                            </p>
                        </div>
                    `;

                return false;
            }

            stallIdInput.innerHTML = stalls
                .map(
                    (stall) => `
                        <option value="${stall.StallID}">
                            ${esc(stall.StallName)}
                        </option>
                    `
                )
                .join("");

            stallIdInput.disabled = false;
            loadButton.disabled = false;
            writeButton.disabled = false;

            return true;
        } catch (error) {
            console.error("Unable to load stalls:", error);

            stallIdInput.innerHTML = `
                <option value="">
                    Unable to load stalls
                </option>
            `;

            list.innerHTML = `
                <div class="card empty">
                    <h3>Unable to Load Stalls</h3>

                    <p class="muted">
                        Please refresh the page or try again later.
                    </p>
                </div>
            `;

            showToast(
                error.message || "Unable to load stalls.",
                "error"
            );

            return false;
        }
    }

    function paintStars() {
        document
            .querySelectorAll("#reviewStars button")
            .forEach((button) => {
                button.classList.toggle(
                    "selected",
                    Number(button.dataset.rating) <=
                    selectedRating
                );
            });
    }

    function openEditor(review = null) {
        const currentUser = getCurrentUser();

        if (
            !currentUser ||
            role(currentUser.role) !== "customer"
        ) {
            window.location.href =
                `/login.html?next=${encodeURIComponent(
                    "/reviews.html"
                )}`;

            return;
        }

        reviewId.value = review?.ReviewID || "";
        selectedRating = Number(review?.Rating || 0);
        comment.value = review?.ReviewComment || "";

        formTitle.textContent = review
            ? "Edit Review"
            : "Write a Review";

        counter.textContent =
            `${comment.value.length} / 500`;

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

        if (
            !Number.isInteger(stallId) ||
            stallId <= 0
        ) {
            showToast(
                "Please select a valid stall.",
                "error"
            );

            return;
        }

        list.innerHTML = `
            <div class="card empty">
                <p class="muted">
                    Loading reviews...
                </p>
            </div>
        `;

        loadButton.disabled = true;

        try {
            /*
             * The reviews and the vendor's answers to them are read together.
             * A reply lives in its own table so that answering a review never
             * rewrites what the customer wrote, and the two are only brought
             * back together here for display.
             */
            const [data, replyData] = await Promise.all([
                apiRequest(
                    `/feedback/stall/${stallId}?sort=${encodeURIComponent(
                        sortInput.value
                    )}`
                ),
                apiRequest(`/stalls/${stallId}/review-replies`).catch(
                    (error) => {
                        console.error(
                            "Unable to load vendor replies:",
                            error
                        );

                        return null;
                    }
                )
            ]);

            const repliesByReview = new Map(
                (Array.isArray(replyData?.replies) ? replyData.replies : []).map(
                    (reply) => [Number(reply.ReviewID), reply]
                )
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
                    ? reviews.reduce(
                        (sum, review) =>
                            sum +
                            Number(
                                review.Rating || 0
                            ),
                        0
                    ) / reviews.length
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
                        <span class="small muted">
                            Average Rating
                        </span>

                        <div class="rating-value">
                            ${averageRating.toFixed(1)}
                            <span>★</span>
                        </div>
                    </div>

                    <strong>
                        ${reviewCount}
                        ${reviewCount === 1
                    ? "review"
                    : "reviews"
                }
                    </strong>
                </div>
            `;

            if (!reviews.length) {
                list.innerHTML = `
                    <div class="card empty">
                        <div class="empty-state-icon">
                            ★
                        </div>

                        <h3>No Reviews Yet</h3>

                        <p class="muted">
                            ${isVendor
                        ? "No customer has reviewed this stall yet."
                        : "Be the first customer to leave feedback."
                    }
                        </p>
                    </div>
                `;

                return;
            }

            const currentUser = getCurrentUser();

            list.innerHTML = reviews
                .map(
                    (review) => `
                        <article class="card review-card">
                            <div class="row-between wrap">
                                <div>
                                    <strong>
                                        ${esc(
                        review.Username ||
                        "Customer"
                    )}
                                    </strong>

                                    <p class="small muted">
                                        ${formatDate(
                        review.ReviewDateTime
                    )}
                                    </p>
                                </div>

                                <span class="review-rating">
                                    ${"★".repeat(
                        Number(
                            review.Rating || 0
                        )
                    )}
                                </span>
                            </div>

                            <p>
                                ${esc(
                        review.ReviewComment || ""
                    )}
                            </p>

                            ${repliesByReview.has(Number(review.ReviewID))
                            ? (() => {
                                const reply = repliesByReview.get(
                                    Number(review.ReviewID)
                                );

                                return `
                                        <div class="vendor-reply">
                                            <div class="row-between wrap">
                                                <span class="small vendor-reply-author">
                                                    Reply from
                                                    ${esc(reply.StallName)}
                                                </span>

                                                <span class="small muted">
                                                    ${formatDate(
                                    reply.UpdatedAt ||
                                    reply.CreatedAt
                                )}
                                                </span>
                                            </div>

                                            <p>${esc(reply.ReplyText)}</p>
                                        </div>
                                    `;
                            })()
                            : ""
                        }

                            ${Number(currentUser?.id) ===
                            Number(review.UserID)
                            ? `
                                        <div class="row">
                                            <button
                                                class="button secondary"
                                                type="button"
                                                data-edit="${review.ReviewID}"
                                            >
                                                Edit
                                            </button>

                                            <button
                                                class="button danger"
                                                type="button"
                                                data-delete="${review.ReviewID}"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    `
                            : ""
                        }
                        </article>
                    `
                )
                .join("");

            list
                .querySelectorAll("[data-edit]")
                .forEach((button) => {
                    button.addEventListener(
                        "click",
                        () => {
                            const selectedReview =
                                reviews.find(
                                    (review) =>
                                        review.ReviewID ===
                                        Number(
                                            button.dataset
                                                .edit
                                        )
                                );

                            openEditor(selectedReview);
                        }
                    );
                });

            list
                .querySelectorAll("[data-delete]")
                .forEach((button) => {
                    button.addEventListener(
                        "click",
                        async () => {
                            const shouldDelete =
                                window.confirm(
                                    "Delete this review?"
                                );

                            if (!shouldDelete) {
                                return;
                            }

                            try {
                                await apiRequest(
                                    `/feedback/${button.dataset.delete}`,
                                    {
                                        method: "DELETE",
                                    }
                                );

                                showToast(
                                    "Review deleted successfully."
                                );

                                await loadReviews();
                            } catch (error) {
                                showToast(
                                    error.message,
                                    "error"
                                );
                            }
                        }
                    );
                });
        } catch (error) {
            console.error(
                "Unable to load reviews:",
                error
            );

            summary.hidden = true;

            list.innerHTML = `
                <div class="card empty">
                    <h3>Unable to Load Reviews</h3>

                    <p class="muted">
                        Please refresh the page or try again
                        later.
                    </p>
                </div>
            `;

            showToast(error.message, "error");
        } finally {
            loadButton.disabled = false;
        }
    }

    document
        .querySelectorAll("#reviewStars button")
        .forEach((button) => {
            button.addEventListener("click", () => {
                selectedRating = Number(
                    button.dataset.rating
                );

                paintStars();
            });
        });

    comment.addEventListener("input", () => {
        counter.textContent =
            `${comment.value.length} / 500`;
    });

    loadButton.addEventListener(
        "click",
        loadReviews
    );

    sortInput.addEventListener(
        "change",
        loadReviews
    );

    stallIdInput.addEventListener(
        "change",
        loadReviews
    );

    writeButton.addEventListener(
        "click",
        () => openEditor()
    );

    document
        .getElementById("closeReviewButton")
        .addEventListener("click", closeEditor);

    backdrop.addEventListener("click", (event) => {
        if (event.target === backdrop) {
            closeEditor();
        }
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        setMessage(message);

        const stallId = Number(stallIdInput.value);

        if (
            !Number.isInteger(stallId) ||
            stallId <= 0
        ) {
            setMessage(
                message,
                "Please select a valid stall.",
                "error"
            );

            return;
        }

        if (
            selectedRating < 1 ||
            selectedRating > 5
        ) {
            setMessage(
                message,
                "Please select a rating.",
                "error"
            );

            return;
        }

        const payload = {
            StallID: stallId,
            Rating: selectedRating,
            ReviewComment: comment.value.trim(),
        };

        const existingId = reviewId.value;

        try {
            await apiRequest(
                existingId
                    ? `/feedback/${existingId}`
                    : "/feedback",
                {
                    method: existingId
                        ? "PUT"
                        : "POST",
                    body: JSON.stringify(payload),
                }
            );

            closeEditor();

            showToast(
                existingId
                    ? "Review updated successfully."
                    : "Review submitted successfully."
            );

            await loadReviews();
        } catch (error) {
            setMessage(
                message,
                error.message,
                "error"
            );
        }
    });

    applyVendorCopy();

    const stallsLoaded = await loadStalls();

    if (stallsLoaded) {
        await loadReviews();
    }
});