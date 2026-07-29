document.addEventListener("DOMContentLoaded", async () => {
  const grid = document.getElementById("stallGrid");
  const search = document.getElementById("stallSearch");
  const cuisineFilter = document.getElementById("cuisineFilter");
  const areaFilter = document.getElementById("areaFilter");
  const gradeFilter = document.getElementById("gradeFilter");
  const clearFiltersButton = document.getElementById("clearFiltersButton");
  const stallResultsMessage = document.getElementById("stallResultsMessage");
  const activeFiltersMessage = document.getElementById("activeFiltersMessage");

  let searchTimer;

  function addFilterOption(select, value) {
    const option = document.createElement("option");

    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }

  async function loadFilterOptions() {
    try {
      const options = await apiRequest("/stalls/filter-options");

      const areas = Array.isArray(options.areas) ? options.areas : [];
      const cuisines = Array.isArray(options.cuisines) ? options.cuisines : [];
      const grades = Array.isArray(options.hygieneGrades)
        ? options.hygieneGrades
        : [];

      areas.forEach((area) => addFilterOption(areaFilter, area));
      cuisines.forEach((cuisine) => {
        addFilterOption(cuisineFilter, cuisine);
      });
      grades.forEach((grade) => addFilterOption(gradeFilter, grade));
    } catch (error) {
      console.error("Unable to load stall filter options:", error);
    }
  }

  function getStallRequestUrl() {
    const parameters = new URLSearchParams();
    const stallName = search.value.trim();

    if (stallName) parameters.append("name", stallName);
    if (cuisineFilter.value) {
      parameters.append("cuisine", cuisineFilter.value);
    }
    if (areaFilter.value) {
      parameters.append("area", areaFilter.value);
    }
    if (gradeFilter.value) {
      parameters.append("grade", gradeFilter.value);
    }

    const queryString = parameters.toString();

    return queryString ? `/stalls?${queryString}` : "/stalls";
  }

  function updateActiveFiltersMessage() {
    const selectedFilters = [];

    if (search.value.trim()) {
      selectedFilters.push(`Name: ${search.value.trim()}`);
    }

    if (cuisineFilter.value) {
      selectedFilters.push(`${cuisineFilter.value}`);
    }

    if (areaFilter.value) {
      selectedFilters.push(`${areaFilter.value}`);
    }

    if (gradeFilter.value) {
      selectedFilters.push(`${gradeFilter.value}`);
    }

    activeFiltersMessage.textContent = selectedFilters.length
      ? `Active Filters: ${selectedFilters.join(" | ")}`
      : "Showing all hawker stalls";
  }

  function getAveragePrice(stall) {
    if (stall.AveragePrice === null || stall.AveragePrice === undefined) {
      return "Not available";
    }

    const averagePrice = Number(stall.AveragePrice);

    if (Number.isNaN(averagePrice)) {
      return "Not available";
    }

    return `$${averagePrice.toFixed(2)}`;
  }

  function render(stalls) {
    if (stalls.length === 0) {
      stallResultsMessage.textContent = "No Stalls Found";
    } else if (stalls.length === 1) {
      stallResultsMessage.textContent = "1 Stall Found";
    } else {
      stallResultsMessage.textContent = `${stalls.length} Stalls Found`;
    }

    updateActiveFiltersMessage();

    grid.innerHTML =
      stalls
        .map((stall) => {
          const isAvailable = stall.IsAvailable === true || Number(stall.IsAvailable) === 1;
          const availabilityClass = isAvailable ? "success" : "unavailable";
          const availabilityText = isAvailable ? "Open" : "Unavailable";

          const description =
            stall.StallDesc ||
            stall.Description ||
            "No description available.";

          const hygieneGrade = stall.HygieneGrade || "Not graded";
          const hawkerCentre = stall.HCName || "Not available";
          const area = stall.Area || "Not available";
          const averagePrice = getAveragePrice(stall);

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

                <div class="stall-description">
                  <h3>${esc(stall.StallName)}</h3>

                  <p class="muted">
                    ${esc(description)}
                  </p>
                </div>

                <div class="stall-information">
                  <div class="stall-information-heading">
                    Stall Details
                  </div>

                  <div class="stall-information-row">
                    <span>Hawker Centre</span>
                    <strong>${esc(hawkerCentre)}</strong>
                  </div>

                  <div class="stall-information-row">
                    <span>Location</span>
                    <strong>${esc(area)}</strong>
                  </div>

                  <div class="stall-information-row">
                    <span>Hygiene Grade</span>
                    <strong>${esc(hygieneGrade)}</strong>
                  </div>

                  <div class="stall-information-row">
                    <span>Average Price</span>
                    <strong>${averagePrice}</strong>
                  </div>
                </div>

                ${
                  isAvailable
                    ? `
                      <a class="button primary" href="/menu.html?stall=${stall.StallID}">
                        View Menu
                      </a>
                    `
                    : `
                      <button class="button stall-unavailable-button" type="button" disabled>
                        Currently Unavailable
                      </button>
                    `
                }
              </div>
            </article>
          `;
        })
        .join("") ||
      `
        <div class="card empty">
          <h3>No Matching Stalls</h3>

          <p class="muted">
            No stalls match your selected filters. Try adjusting your search or clear the filters to view all stalls.
          </p>

          <button
            class="button secondary"
            id="emptyClearFiltersButton"
            type="button"
          >
            Clear Filters
          </button>
        </div>
      `;

    const emptyClearFiltersButton = document.getElementById(
      "emptyClearFiltersButton"
    );

    if (emptyClearFiltersButton) {
      emptyClearFiltersButton.addEventListener("click", clearFilters);
    }
  }

  async function loadStalls() {
    grid.innerHTML = `
      <div class="card empty">
        Loading stalls...
      </div>
    `;

    stallResultsMessage.textContent = "Loading stalls...";

    try {
      const stalls = await apiRequest(getStallRequestUrl());

      if (!Array.isArray(stalls)) {
        throw new Error("Invalid stall data received from the server.");
      }

      render(stalls);
    } catch (error) {
      console.error("Unable to load stalls:", error);

      stallResultsMessage.textContent = "Unable to load stalls";
      activeFiltersMessage.textContent = "";

      grid.innerHTML = `
        <div class="card empty">
          <h3>Unable to Load Stalls</h3>

          <p class="muted">
            Please refresh the page or try again later.
          </p>

          <button
            class="button secondary"
            id="retryStallsButton"
            type="button"
          >
            Try Again
          </button>
        </div>
      `;

      const retryStallsButton = document.getElementById("retryStallsButton");

      if (retryStallsButton) {
        retryStallsButton.addEventListener("click", loadStalls);
      }
    }
  }

  function clearFilters() {
    search.value = "";
    cuisineFilter.value = "";
    areaFilter.value = "";
    gradeFilter.value = "";

    loadStalls();
    search.focus();
  }

  search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadStalls, 300);
  });

  cuisineFilter.addEventListener("change", loadStalls);
  areaFilter.addEventListener("change", loadStalls);
  gradeFilter.addEventListener("change", loadStalls);
  clearFiltersButton.addEventListener("click", clearFilters);

  await loadFilterOptions();
  await loadStalls();
});