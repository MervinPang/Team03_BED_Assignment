document.addEventListener("DOMContentLoaded", async () => {
  const grid = document.getElementById("stallGrid");
  const search = document.getElementById("stallSearch");

  let allStalls = [];

  function render() {
    const query = search.value.trim().toLowerCase();

    const filteredStalls = allStalls.filter((stall) => {
      const searchableText =
        `${stall.StallName} ${stall.Cuisine || ""}`.toLowerCase();

      return searchableText.includes(query);
    });

    grid.innerHTML =
      filteredStalls
        .map((stall) => {
          const isAvailable = Boolean(stall.IsAvailable);

          const availabilityClass = isAvailable
            ? "success"
            : "unavailable";

          const availabilityText = isAvailable
            ? "Open"
            : "Unavailable";

          const menuLink = isAvailable
            ? `/menu.html?stall=${stall.StallID}`
            : "#";

          const buttonText = isAvailable
            ? "View Menu"
            : "Currently Unavailable";

          return `
                        <article class="card stall-card">
                            <img
                                src="${esc(stall.StallImage)}"
                                alt="${esc(stall.StallName)}"
                            >

                            <div class="stall-body stack">
                                <div class="row-between">
                                    <span class="badge ${availabilityClass}">
                                        ${availabilityText}
                                    </span>

                                    <span class="small muted">
                                        ${esc(stall.Cuisine || "General")}
                                    </span>
                                </div>

                                <div>
                                    <h3>${esc(stall.StallName)}</h3>

                                    <p class="muted">
                                        ${esc(
            stall.Description ||
            "No description available."
          )}
                                    </p>
                                </div>

                                <a
                                    class="button primary"
                                    href="${menuLink}"
                                    ${isAvailable
              ? ""
              : 'aria-disabled="true"'
            }
                                >
                                    ${buttonText}
                                </a>
                            </div>
                        </article>
                    `;
        })
        .join("") ||
      `
                <div class="card empty">
                    No stalls found.
                </div>
            `;
  }

  async function loadStalls() {
    grid.innerHTML = `
            <div class="card empty">
                Loading stalls...
            </div>
        `;

    try {
      const stalls = await apiRequest("/stalls");

      if (!Array.isArray(stalls)) {
        throw new Error("Invalid stall data received from the server.");
      }

      allStalls = stalls;
      render();
    } catch (error) {
      console.error("Unable to load stalls:", error);

      grid.innerHTML = `
                <div class="card empty">
                    <h3>Unable to Load Stalls</h3>
                    <p class="muted">
                        Please refresh the page or try again later.
                    </p>
                </div>
            `;
    }
  }

  search.addEventListener("input", render);

  await loadStalls();
});