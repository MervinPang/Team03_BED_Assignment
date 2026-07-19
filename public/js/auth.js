document.addEventListener("DOMContentLoaded", () => {
  const existingUser = getCurrentUser();

  if (existingUser) {
    const currentRole = role(existingUser.role);
    const destination =
      currentRole === "vendor"
        ? "/vendor.html"
        : currentRole === "nea_officer"
          ? "/inspection.html"
          : "/stalls.html";

    window.location.replace(destination);
    return;
  }

  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");

  if (loginForm) {
    loginForm.addEventListener("submit", async event => {
      event.preventDefault();

      const message = document.getElementById("authMessage");
      const submitButton = loginForm.querySelector("button[type='submit']");

      setMessage(message);
      submitButton.disabled = true;
      submitButton.textContent = "Signing in…";

      try {
        const data = await apiRequest("/login", {
          method: "POST",
          body: JSON.stringify({
            Email: document.getElementById("email").value.trim(),
            Password: document.getElementById("password").value
          })
        });

        localStorage.setItem(TOKEN_KEY, data.token);

        /*
         * A customer may add items before signing in. Move that guest cart
         * into the authenticated account, then keep both sessions separate.
         */
        transferGuestCartToCurrentUser();

        const requestedNext =
          new URLSearchParams(location.search).get("next");

        const next =
          requestedNext &&
            requestedNext.startsWith("/") &&
            !requestedNext.startsWith("//")
            ? requestedNext
            : null;

        const currentUser = getCurrentUser();
        const currentRole = role(currentUser?.role);
        const destination =
          next ||
          (currentRole === "vendor"
            ? "/vendor.html"
            : currentRole === "nea_officer"
              ? "/inspection.html"
              : "/stalls.html");

        window.location.replace(destination);
      } catch (error) {
        setMessage(message, error.message, "error");
        showToast(error.message, "error");
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Sign in";
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener("submit", async event => {
      event.preventDefault();

      const message = document.getElementById("authMessage");
      const submitButton =
        registerForm.querySelector("button[type='submit']");

      setMessage(message);
      submitButton.disabled = true;
      submitButton.textContent = "Creating account…";

      try {
        await apiRequest("/register", {
          method: "POST",
          body: JSON.stringify({
            Username:
              document.getElementById("username").value.trim(),
            Email:
              document.getElementById("email").value.trim(),
            Password:
              document.getElementById("password").value,
            Role:
              document.getElementById("role").value
          })
        });

        showToast("Account created successfully.");
        window.setTimeout(() => {
          window.location.replace("/login.html");
        }, 500);
      } catch (error) {
        setMessage(message, error.message, "error");
        showToast(error.message, "error");
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Create Account";
      }
    });
  }
});
