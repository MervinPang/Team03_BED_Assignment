document.addEventListener("DOMContentLoaded", () => {
    const grid = document.getElementById("stallGrid");
    const search = document.getElementById("stallSearch");

    function render() {
        const query = search.value.trim().toLowerCase();

        const stalls = HAWKER_DATA.stalls.filter((stall) => {
            const searchableText = `${stall.StallName} ${stall.Cuisine}`.toLowerCase();

            return searchableText.includes(query);
        });

        grid.innerHTML =
            stalls
                .map((stall) => {
                    const availabilityClass = stall.IsAvailable
                        ? "success"
                        : "unavailable";

                    const availabilityText = stall.IsAvailable
                        ? "Open"
                        : "Unavailable";

                    const menuLink = stall.IsAvailable
                        ? `/menu.html?stall=${stall.StallID}`
                        : "#";

                    const buttonText = stall.IsAvailable
                        ? "View Menu"
                        : "Currently Unavailable";

                    return `
            <article class="card stall-card">
              <img
                src="${stall.StallImage}"
                alt="${esc(stall.StallName)}"
              >

              <div class="stall-body stack">
                <div class="row-between">
                  <span class="badge ${availabilityClass}">
                    ${availabilityText}
                  </span>

                  <span class="small muted">
                    ${esc(stall.Cuisine)}
                  </span>
                </div>

                <div>
                  <h3>${esc(stall.StallName)}</h3>

                  <p class="muted">
                    ${esc(stall.Description)}
                  </p>
                </div>

                <a class="button primary" href="${menuLink}">
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

    search.addEventListener("input", render);

    render();
});