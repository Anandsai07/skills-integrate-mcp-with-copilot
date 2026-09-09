document.addEventListener("DOMContentLoaded", () => {
  const activitiesList = document.getElementById("activities-list");
  const activitySelect = document.getElementById("activity");
  const signupForm = document.getElementById("signup-form");
  const messageDiv = document.getElementById("message");
  const loginForm = document.getElementById("login-form");
  const authStatusDiv = document.getElementById("auth-status");
  const dashboardContent = document.getElementById("dashboard-content");
  const logoutButton = document.getElementById("logout-button");

  function getAuthToken() {
    return localStorage.getItem("authToken");
  }

  function getAuthHeaders() {
    const token = getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  function setAuthStatus(message, type = "info") {
    authStatusDiv.textContent = message;
    authStatusDiv.className = `auth-status ${type}`;
  }

  function renderDashboard(data) {
    if (!data || !data.features || !data.features.length) {
      dashboardContent.innerHTML = "<p>Sign in to view role-specific features.</p>";
      return;
    }

    dashboardContent.innerHTML = `
      <p><strong>Signed in as:</strong> ${data.email}</p>
      <p><strong>Role:</strong> ${data.role}</p>
      <ul>
        ${data.features.map((feature) => `<li>${feature}</li>`).join("")}
      </ul>
    `;
  }

  async function loadCurrentUser() {
    const token = getAuthToken();

    if (!token) {
      setAuthStatus("Not signed in.", "info");
      renderDashboard(null);
      return;
    }

    try {
      const response = await fetch("/auth/me", {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error("Invalid or expired session");
      }

      const user = await response.json();
      setAuthStatus(`Signed in as ${user.email} (${user.role}).`, "success");
      await loadDashboard();
    } catch (error) {
      localStorage.removeItem("authToken");
      setAuthStatus("Session expired. Please sign in again.", "error");
      renderDashboard(null);
    }
  }

  async function loadDashboard() {
    const token = getAuthToken();

    if (!token) {
      renderDashboard(null);
      return;
    }

    try {
      const response = await fetch("/auth/dashboard", {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error("Unable to load dashboard");
      }

      const dashboard = await response.json();
      renderDashboard(dashboard);
    } catch (error) {
      console.error("Error loading dashboard:", error);
      renderDashboard(null);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();

    const email = document.getElementById("login-email").value.trim();
    const role = document.getElementById("role-select").value;

    try {
      const response = await fetch("/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, role }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || "Login failed");
      }

      localStorage.setItem("authToken", result.token);
      setAuthStatus(`Signed in as ${result.user.email} (${result.user.role}).`, "success");
      loginForm.reset();
      await loadDashboard();
    } catch (error) {
      setAuthStatus(error.message, "error");
      renderDashboard(null);
    }
  }

  async function handleLogout() {
    const token = getAuthToken();

    if (token) {
      try {
        await fetch("/auth/logout", {
          method: "POST",
          headers: getAuthHeaders(),
        });
      } catch (error) {
        console.error("Error logging out:", error);
      }
    }

    localStorage.removeItem("authToken");
    setAuthStatus("Signed out.", "info");
    renderDashboard(null);
  }

  // Function to fetch activities from API
  async function fetchActivities() {
    try {
      const response = await fetch("/activities");
      const activities = await response.json();

      // Clear loading message
      activitiesList.innerHTML = "";
      activitySelect.innerHTML = '<option value="">-- Select an activity --</option>';

      // Populate activities list
      Object.entries(activities).forEach(([name, details]) => {
        const activityCard = document.createElement("div");
        activityCard.className = "activity-card";

        const spotsLeft =
          details.max_participants - details.participants.length;

        // Create participants HTML with delete icons instead of bullet points
        const participantsHTML =
          details.participants.length > 0
            ? `<div class="participants-section">
              <h5>Participants:</h5>
              <ul class="participants-list">
                ${details.participants
                  .map(
                    (email) =>
                      `<li><span class="participant-email">${email}</span><button class="delete-btn" data-activity="${name}" data-email="${email}">❌</button></li>`
                  )
                  .join("")}
              </ul>
            </div>`
            : `<p><em>No participants yet</em></p>`;

        activityCard.innerHTML = `
          <h4>${name}</h4>
          <p>${details.description}</p>
          <p><strong>Schedule:</strong> ${details.schedule}</p>
          <p><strong>Availability:</strong> ${spotsLeft} spots left</p>
          <div class="participants-container">
            ${participantsHTML}
          </div>
        `;

        activitiesList.appendChild(activityCard);

        // Add option to select dropdown
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        activitySelect.appendChild(option);
      });

      // Add event listeners to delete buttons
      document.querySelectorAll(".delete-btn").forEach((button) => {
        button.addEventListener("click", handleUnregister);
      });
    } catch (error) {
      activitiesList.innerHTML =
        "<p>Failed to load activities. Please try again later.</p>";
      console.error("Error fetching activities:", error);
    }
  }

  // Handle unregister functionality
  async function handleUnregister(event) {
    const button = event.target;
    const activity = button.getAttribute("data-activity");
    const email = button.getAttribute("data-email");

    try {
      const response = await fetch(
        `/activities/${encodeURIComponent(
          activity
        )}/unregister?email=${encodeURIComponent(email)}`,
        {
          method: "DELETE",
        }
      );

      const result = await response.json();

      if (response.ok) {
        messageDiv.textContent = result.message;
        messageDiv.className = "success";

        // Refresh activities list to show updated participants
        fetchActivities();
      } else {
        messageDiv.textContent = result.detail || "An error occurred";
        messageDiv.className = "error";
      }

      messageDiv.classList.remove("hidden");

      // Hide message after 5 seconds
      setTimeout(() => {
        messageDiv.classList.add("hidden");
      }, 5000);
    } catch (error) {
      messageDiv.textContent = "Failed to unregister. Please try again.";
      messageDiv.className = "error";
      messageDiv.classList.remove("hidden");
      console.error("Error unregistering:", error);
    }
  }

  // Handle form submission
  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value;
    const activity = document.getElementById("activity").value;

    try {
      const response = await fetch(
        `/activities/${encodeURIComponent(
          activity
        )}/signup?email=${encodeURIComponent(email)}`,
        {
          method: "POST",
        }
      );

      const result = await response.json();

      if (response.ok) {
        messageDiv.textContent = result.message;
        messageDiv.className = "success";
        signupForm.reset();

        // Refresh activities list to show updated participants
        fetchActivities();
      } else {
        messageDiv.textContent = result.detail || "An error occurred";
        messageDiv.className = "error";
      }

      messageDiv.classList.remove("hidden");

      // Hide message after 5 seconds
      setTimeout(() => {
        messageDiv.classList.add("hidden");
      }, 5000);
    } catch (error) {
      messageDiv.textContent = "Failed to sign up. Please try again.";
      messageDiv.className = "error";
      messageDiv.classList.remove("hidden");
      console.error("Error signing up:", error);
    }
  });

  loginForm.addEventListener("submit", handleLogin);
  logoutButton.addEventListener("click", handleLogout);

  // Initialize app
  fetchActivities();
  loadCurrentUser();
});
