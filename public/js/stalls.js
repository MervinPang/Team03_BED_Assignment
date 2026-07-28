document.addEventListener("DOMContentLoaded", async () => {
  const grid = document.getElementById("stallGrid");
  const search = document.getElementById("stallSearch");

  const areaInput = document.getElementById("filterArea");
  const minPriceInput = document.getElementById("filterMinPrice");
  const maxPriceInput = document.getElementById("filterMaxPrice");
  const sortInput = document.getElementById("filterSort");
  const gradeInputs = document.querySelectorAll("[data-grade]");
  const resetButton = document.getElementById("resetFilters");
  const filterSummary = document.getElementById("filterSummary");
  const filterMessage = document.getElementById("filterMessage");
  const areaCompare = document.getElementById("areaCompare");

  let allStalls = [];

  /*
   * The grade and price figures come from the search endpoint. When only the
   * plain stall listing is available the cards are rendered without them
   * rather than showing figures that were never returned.
   */
  let comparisonAvailable = true;

  function gradeBadgeClass(grade) {
    if (grade === "A") return "success";
    if (grade === "B") return "warning";
    if (grade === "C" || grade === "D") return "unavailable";

    return "neutral";
  }

  function gradeLabel(grade) {
    return grade ? `Grade ${grade}` : "Not yet graded";
  }

  // Collects the filters that the search endpoint understands
  function buildQuery() {
    const parameters = new URLSearchParams();

    if (areaInput.value) {
      parameters.set("area", areaInput.value);
    }

    const grades = [...gradeInputs]
      .filter((input) => input.checked)
      .map((input) => input.dataset.grade);

    if (grades.length) {
      parameters.set("grades", grades.join(","));
    }

    if (minPriceInput.value !== "") {
      parameters.set("minPrice", minPriceInput.value);
    }

    if (maxPriceInput.value !== "") {
      parameters.set("maxPrice", maxPriceInput.value);
    }

    parameters.set("sort", sortInput.value);

    return parameters.toString();
  }

  function render() {
    const query = search.value.trim().toLowerCase();

    /*
     * A stall is matched when any of its items falls inside the price range,
     * so the number of matching items is shown to make clear why a stall is
     * still listed.
     */
    const priceFilterActive =
      minPriceInput.value !== "" || maxPriceInput.value !== "";

    const filteredStalls = allStalls.filter((stall) => {
      const searchableText =
        `${stall.StallName} ${stall.Cuisine || ""}`.toLowerCase();

      return searchableText.includes(query);
    });

    filterSummary.textContent =
      `${filteredStalls.length} ${filteredStalls.length === 1 ? "stall" : "stalls"} found`;

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

          const averagePrice = Number(stall.AveragePrice || 0);
          const lowestPrice = Number(stall.LowestPrice || 0);

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

                                ${comparisonAvailable
              ? `
                                        <div class="stall-facts">
                                            <span class="badge ${gradeBadgeClass(stall.HygieneGrade)}">
                                                ${gradeLabel(stall.HygieneGrade)}
                                            </span>

                                            <span class="small muted">
                                                ${averagePrice > 0
                ? `Average ${money(averagePrice)}`
                : "No priced items"
              }
                                            </span>
                                        </div>

                                        ${priceFilterActive
                ? `
                                                <p class="small stall-match">
                                                    ${Number(stall.MatchingItemCount || 0)}
                                                    ${Number(stall.MatchingItemCount || 0) === 1
                    ? "item"
                    : "items"
                  }
                                                    within your price range
                                                </p>
                                            `
                : ""
              }

                                        <p class="small muted stall-location">
                                            ${esc(stall.HCName || "Hawker centre")}
                                            ${stall.Area ? ` · ${esc(stall.Area)}` : ""}
                                            ${lowestPrice > 0
                ? ` · from ${money(lowestPrice)}`
                : ""
              }
                                        </p>
                                    `
              : ""
            }

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

  // Shows how the hawker centres of the selected area compare with each other
  function renderAreaComparison(centres) {
    if (!centres.length) {
      areaCompare.hidden = true;
      areaCompare.innerHTML = "";

      return;
    }

    areaCompare.hidden = false;

    areaCompare.innerHTML = `
            <h2 class="area-compare-title">
                Hawker centres in ${esc(areaInput.value)}
            </h2>

            <div class="grid grid-3">
                ${centres
        .map((centre) => {
          const stallCount = Number(centre.StallCount || 0);
          const averagePrice = Number(centre.AveragePrice || 0);
          const lowestPrice = Number(centre.LowestPrice || 0);

          const grades = [
            { grade: "A", total: Number(centre.GradeA || 0) },
            { grade: "B", total: Number(centre.GradeB || 0) },
            { grade: "C", total: Number(centre.GradeC || 0) },
            { grade: "D", total: Number(centre.GradeD || 0) },
          ].filter((entry) => entry.total > 0);

          const ungraded = Number(centre.Ungraded || 0);

          return `
                            <article class="card card-pad centre-card">
                                <h3>${esc(centre.HCName)}</h3>

                                <p class="small muted">
                                    ${esc(centre.HCAddress)}
                                </p>

                                <div class="centre-figures">
                                    <div>
                                        <span class="small muted">Stalls</span>
                                        <strong>${stallCount}</strong>
                                    </div>

                                    <div>
                                        <span class="small muted">Average price</span>
                                        <strong>
                                            ${averagePrice > 0
              ? money(averagePrice)
              : "—"
            }
                                        </strong>
                                    </div>

                                    <div>
                                        <span class="small muted">Cheapest item</span>
                                        <strong>
                                            ${lowestPrice > 0
              ? money(lowestPrice)
              : "—"
            }
                                        </strong>
                                    </div>
                                </div>

                                <div class="centre-grades">
                                    ${grades
              .map(
                (entry) => `
                                                <span class="badge ${gradeBadgeClass(entry.grade)}">
                                                    ${entry.total} × Grade ${entry.grade}
                                                </span>
                                            `
              )
              .join("")
            }

                                    ${ungraded > 0
              ? `
                                                <span class="badge neutral">
                                                    ${ungraded} not yet graded
                                                </span>
                                            `
              : ""
            }
                                </div>

                                <button
                                    class="button secondary"
                                    type="button"
                                    data-centre="${Number(centre.HawkerCentreID)}"
                                >
                                    View these stalls
                                </button>
                            </article>
                        `;
        })
        .join("")}
            </div>
        `;

    areaCompare
      .querySelectorAll("[data-centre]")
      .forEach((button) => {
        button.addEventListener("click", () =>
          loadCentreStalls(button.dataset.centre)
        );
      });
  }

  async function loadAreas() {
    const areaField = areaInput.closest(".field");

    try {
      const areas = await apiRequest("/areas");

      // The area filter is only offered once areas have been recorded
      if (!Array.isArray(areas) || !areas.length) {
        if (areaField) {
          areaField.hidden = true;
        }

        return;
      }

      if (areaField) {
        areaField.hidden = false;
      }

      areaInput.innerHTML =
        `<option value="">All areas</option>` +
        areas
          .map(
            (area) => `
                            <option value="${esc(area.Area)}">
                                ${esc(area.Area)}
                                (${Number(area.StallCount || 0)} stalls)
                            </option>
                        `
          )
          .join("");
    } catch (error) {
      console.error("Unable to load areas:", error);

      if (areaField) {
        areaField.hidden = true;
      }
    }
  }

  async function loadAreaComparison() {
    if (!areaInput.value) {
      areaCompare.hidden = true;
      areaCompare.innerHTML = "";

      return;
    }

    try {
      const centres = await apiRequest(
        `/hawker-centres?area=${encodeURIComponent(areaInput.value)}`
      );

      renderAreaComparison(
        Array.isArray(centres) ? centres : []
      );
    } catch (error) {
      console.error("Unable to load hawker centres:", error);

      areaCompare.hidden = true;
      areaCompare.innerHTML = "";
    }
  }

  /*
   * The plain stall listing is used when the search endpoint cannot be reached,
   * so the stalls and their images are always shown even if the filters are
   * temporarily unavailable.
   */
  async function loadStallsWithoutFilters() {
    const stalls = await apiRequest("/stalls");

    if (!Array.isArray(stalls)) {
      throw new Error("Invalid stall data received from the server.");
    }

    comparisonAvailable = false;
    allStalls = stalls;
    render();
  }

  async function loadStalls() {
    grid.innerHTML = `
            <div class="card empty">
                Loading stalls...
            </div>
        `;

    setMessage(filterMessage);

    try {
      const response = await apiRequest(
        `/stalls/search?${buildQuery()}`
      );

      const stalls = Array.isArray(response?.stalls)
        ? response.stalls
        : Array.isArray(response)
          ? response
          : [];

      comparisonAvailable = true;
      allStalls = stalls;
      render();
    } catch (error) {
      console.error("Unable to load stalls:", error);

      // A rejected filter is a message the customer can act on
      if (error.status === 400) {
        allStalls = [];
        filterSummary.textContent = "";

        setMessage(filterMessage, error.message, "error");

        grid.innerHTML = `
                    <div class="card empty">
                        No stalls found.
                    </div>
                `;

        return;
      }

      try {
        await loadStallsWithoutFilters();

        setMessage(
          filterMessage,
          "Stall filters are unavailable at the moment, so every stall is shown.",
          "info"
        );
      } catch (fallbackError) {
        console.error(
          "Unable to load stalls without filters:",
          fallbackError
        );

        allStalls = [];
        filterSummary.textContent = "";

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
  }

  async function loadCentreStalls(hawkerCentreId) {
    grid.innerHTML = `
            <div class="card empty">
                Loading stalls...
            </div>
        `;

    setMessage(filterMessage);

    try {
      const response = await apiRequest(
        `/hawker-centres/${encodeURIComponent(hawkerCentreId)}/stalls`
      );

      allStalls = Array.isArray(response?.stalls)
        ? response.stalls
        : [];

      render();

      setMessage(
        filterMessage,
        `Showing stalls in ${response?.hawkerCentre?.HCName || "this hawker centre"}.`,
        "success"
      );
    } catch (error) {
      console.error("Unable to load hawker centre stalls:", error);

      setMessage(filterMessage, error.message, "error");
    }
  }

  async function applyFilters() {
    // Sequential so the two requests never share the connection pool
    await loadAreaComparison();
    await loadStalls();
  }

  search.addEventListener("input", render);

  areaInput.addEventListener("change", applyFilters);
  sortInput.addEventListener("change", loadStalls);

  minPriceInput.addEventListener("change", loadStalls);
  maxPriceInput.addEventListener("change", loadStalls);

  gradeInputs.forEach((input) => {
    input.addEventListener("change", loadStalls);
  });

  resetButton.addEventListener("click", async () => {
    areaInput.value = "";
    minPriceInput.value = "";
    maxPriceInput.value = "";
    sortInput.value = "name";
    search.value = "";

    gradeInputs.forEach((input) => {
      input.checked = false;
    });

    await applyFilters();
  });

  await loadAreas();
  await loadStalls();
});
