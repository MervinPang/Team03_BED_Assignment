document.addEventListener("DOMContentLoaded", () => {
  const user = getCurrentUser();

  if (!user) {
    const returnUrl = encodeURIComponent("/profile.html");
    window.location.replace(`/login.html?returnUrl=${returnUrl}`);
    return;
  }

  const displayName =
    user.name ||
    user.fullName ||
    user.username ||
    user.Username ||
    user.email ||
    user.Email ||
    "HawkerHub User";

  const username =
    user.username ||
    user.Username ||
    user.name ||
    "Not provided";

  const email =
    user.email ||
    user.Email ||
    "Not provided";

  const rawRole =
    user.role ||
    user.Role ||
    "customer";

  const userId =
    user.id ??
    user.UserID ??
    user.userId ??
    "Not available";

  const normalizedRole = role(rawRole);

  const readableRole =
    normalizedRole === "nea_officer"
      ? "NEA Officer"
      : normalizedRole
        .replaceAll("_", " ")
        .replace(/\b\w/g, character => character.toUpperCase());

  document.getElementById("profileDisplayName").textContent =
    displayName;

  document.getElementById("profileUsername").textContent =
    username;

  document.getElementById("profileEmail").textContent =
    email;

  document.getElementById("profileRole").textContent =
    readableRole;

  document.getElementById("profileRoleValue").textContent =
    readableRole;

  document.getElementById("profileUserId").textContent =
    userId;

  document.getElementById("profileAvatar").textContent =
    String(displayName).trim().charAt(0).toUpperCase() || "U";

  // Profile picture, use the saved avatar
  const AVATAR_KEY = `hawker_avatar_${userId}`;
  const avatarBox = document.getElementById("profileAvatar");

  function applyAvatar() {
    const saved = localStorage.getItem(AVATAR_KEY);

    if (saved) {
      avatarBox.innerHTML = `<img src="${esc(saved)}" alt="Profile picture">`;
    } else {
      avatarBox.textContent =
        String(displayName).trim().charAt(0).toUpperCase() || "U";
    }
  }

  document.querySelectorAll("[data-avatar]").forEach(button => {
    button.addEventListener("click", () => {
      localStorage.setItem(AVATAR_KEY, button.dataset.avatar);
      applyAvatar();
      showToast("Profile picture updated.");
    });
  });

  applyAvatar();

  const actionsByRole = {
    customer: [
      {
        href: "/stalls.html",
        icon: "🍽",
        title: "Place Order",
        description: "Browse available stalls and order your next meal."
      },
      {
        href: "/order-history.html",
        icon: "🧾",
        title: "Your Orders",
        description: "Track active orders and review your order history."
      },
      {
        href: "/reviews.html",
        icon: "★",
        title: "Reviews",
        description: "View stall reviews and share your experience."
      }
    ],
    vendor: [
      {
        href: "/vendor-dashboard.html",
        icon: "▦",
        title: "Vendor Dashboard",
        description: "Manage incoming orders and monitor stall performance."
      }
    ],
    nea_officer: [
      {
        href: "/inspection-reports.html",
        icon: "✓",
        title: "Inspection Workspace",
        description: "Submit inspections and review regulatory information."
      }
    ]
  };

  const actions =
    actionsByRole[normalizedRole] ||
    actionsByRole.customer;

  document.getElementById("profileActions").innerHTML =
    actions.map(action => `
      <a class="profile-action" href="${action.href}">
        <span class="profile-action-icon" aria-hidden="true">
          ${action.icon}
        </span>
        <span>
          <strong>${action.title}</strong>
          <small>${action.description}</small>
        </span>
        <span class="profile-action-arrow" aria-hidden="true">→</span>
      </a>
    `).join("");
});
