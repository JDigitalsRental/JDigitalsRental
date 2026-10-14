
/* ==========================================
   JDIGITALSRENTAL — MEGA UPGRADE
   Complete app.js replacement
   ========================================== */

let games = [
  {
    name: "Final Fantasy VII Rebirth",
    genre: "RPG",
    type: "rpg",
    meta: "PS5 • Digital rental",
    weekly: 250,
    monthly: 500,
    image: "assets/final-fantasy-vii-rebirth.jpg",
    status: "available"
  },
  {
    name: "The Witcher 3: Wild Hunt – Remastered",
    genre: "Adventure",
    type: "adventure",
    meta: "PS5 • Digital rental",
    weekly: 250,
    monthly: 500,
    image: "assets/the-witcher-3-remastered.jpg",
    status: "available"
  },
  {
    name: "Marvel’s Wolverine",
    genre: "Action",
    type: "action",
    meta: "PS5 • Digital rental",
    weekly: 350,
    monthly: 700,
    image: "assets/marvel-wolverine.jpg",
    status: "currently-rented",
    trophyDate: "September 23, 2026",
    nonTrophyDate: "September 23, 2026"
  },
  {
    name: "Onimusha: Way of the Sword",
    genre: "Action",
    type: "action",
    meta: "PS5 • Digital rental",
    weekly: 350,
    monthly: 700,
    image: "assets/onimusha-way-of-the-sword.jpg",
    status: "currently-rented",
    trophyDate: "September 25, 2026",
    nonTrophyDate: "September 20, 2026"
  }
];

const grid = document.getElementById("gameGrid");
const search = document.getElementById("search");
const facebookUrl =
  "https://www.facebook.com/share/1DajrF4mTy/";

let filter = "all";
let availabilityFilter = "all";
let selectedGame = null;
let selectedPeriod = null;
let selectedAccount = null;
let rentalSubmitting = false;
let upcomingSubmitting = false;

let favoriteGames = new Set();

try {
  const stored = JSON.parse(
    localStorage.getItem("jdrFavorites") || "[]"
  );
  if (Array.isArray(stored)) {
    favoriteGames = new Set(stored);
  }
} catch (error) {
  console.warn("Favorites storage unavailable.");
}

/* HELPERS */

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]
  );
}

function money(value) {
  return "₱" + Number(value || 0).toLocaleString("en-PH");
}

function dateValue(value) {
  if (!value) return null;

  if (
    value instanceof Date &&
    !Number.isNaN(value.getTime())
  ) {
    return value;
  }

  if (
    typeof value === "object" &&
    typeof value.toDate === "function"
  ) {
    return value.toDate();
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function formatSlotDate(value) {
  if (
    !value ||
    /^(available now|available|open)$/i.test(
      String(value).trim()
    )
  ) {
    return "Available Now";
  }

  const date = dateValue(value);

  if (!date) return String(value);

  return date.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit"
  });
}

/* TROPHY / NON-TROPHY AVAILABILITY */

function slotIsRented(game, type) {
  const key =
    type === "trophy" ? "trophy" : "nonTrophy";

  const explicit =
    game[key + "Status"] ??
    game[key + "Rented"];

  if (typeof explicit === "boolean") {
    return explicit;
  }

  if (typeof explicit === "string") {
    const value = explicit.toLowerCase().trim();

    if ([
      "available",
      "available now",
      "vacant",
      "open",
      "false"
    ].includes(value)) {
      return false;
    }

    if ([
      "currently-rented",
      "currently rented",
      "rented",
      "occupied",
      "true"
    ].includes(value)) {
      return true;
    }
  }

  const date = game[key + "Date"];

  if (
    typeof date === "string" &&
    /^(available now|available|open)$/i.test(
      date.trim()
    )
  ) {
    return false;
  }

  if (game.status === "available") return false;

  return game.status === "currently-rented";
}

function slotAvailabilityHtml(game, type, label, icon) {
  const rented = slotIsRented(game, type);

  const key =
    type === "trophy" ? "trophyDate" : "nonTrophyDate";

  const dateText = rented
    ? formatSlotDate(game[key])
    : "Available Now";

  const background = rented
    ? "rgba(120,14,33,.35)"
    : "rgba(0,115,65,.28)";

  const border = rented ? "#ff4768" : "#19d97c";
  const color = rented ? "#ff839a" : "#55f5a5";

  return `
    <div
      class="availability ${rented ? "rented" : "available"}"
      style="
        margin-bottom:6px;
        padding:8px;
        border:1px solid ${border};
        border-radius:9px;
        background:${background};
      "
    >
      <strong style="color:${color}">
        ${rented ? "🔴 CURRENTLY RENTED" : "🟢 AVAILABLE"}
      </strong>
      <div>
        ${icon} ${label}: ${escapeHtml(dateText)}
      </div>
    </div>
  `;
}

/* FACEBOOK REMINDER */

function showRentalFacebookReminder(message) {
  if (
    typeof window.showFacebookReminder === "function"
  ) {
    window.showFacebookReminder(message);
    return;
  }

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(message)
      .catch(() => {});
  }

  alert(
    "One More Step! 🎮\n\n" +
    "Please send your completed form to our " +
    "Facebook Page via Messenger.\n\n" +
    "Your request is not confirmed until " +
    "you send the form."
  );

  window.open(
    facebookUrl,
    "_blank",
    "noopener,noreferrer"
  );
}

/* WAITING LIST COUNTS */

function getWaitingCounts(game) {
  const counts =
    window.waitingListCounts?.[game.name] || {};

  return {
    trophy: Number(counts.trophy) || 0,
    nonTrophy: Number(counts.nonTrophy) || 0
  };
}

function waitingCountersHtml(game) {
  const counts = getWaitingCounts(game);

  return `
    <div class="waiting-list-count"
      style="
        margin-top:6px;
        padding:7px 5px;
        border:1px solid rgba(57,169,255,.28);
        border-radius:8px;
        background:rgba(57,169,255,.06);
        text-align:center;
      "
    >
      <strong>WAITING LIST</strong>
      <div style="color:#f7b84b">
        🏆 Trophy: ${counts.trophy}
      </div>
      <div style="color:#79c8ff">
        🎮 Non-Trophy: ${counts.nonTrophy}
      </div>
    </div>
  `;
}

/* FAVORITES */

function toggleFavorite(name) {
  if (favoriteGames.has(name)) {
    favoriteGames.delete(name);
  } else {
    favoriteGames.add(name);
  }

  try {
    localStorage.setItem(
      "jdrFavorites",
      JSON.stringify([...favoriteGames])
    );
  } catch (error) {
    console.warn("Unable to save favorites.");
  }

  render();
}

/* FEATURED / MOST REQUESTED */

function renderFeaturedGames() {
  const container =
    document.getElementById("featuredGames");

  if (!container) return;

  const ranked = games.map(game => {
    const counts = getWaitingCounts(game);

    return {
      name: game.name,
      total: counts.trophy + counts.nonTrophy
    };
  })
  .filter(game => game.total > 0)
  .sort((a, b) => b.total - a.total)
  .slice(0, 3);

  container.innerHTML = "";

  if (!ranked.length) return;

  const heading = document.createElement("div");
  heading.className = "mega-featured-heading";
  heading.innerHTML = `
    🔥 MOST REQUESTED
    <small>Based on current waiting-list entries</small>
  `;

  const tags = document.createElement("div");
  tags.className = "mega-featured-tags";

  ranked.forEach(game => {
    const tag = document.createElement("span");
    tag.textContent =
      `${game.name} • ${game.total} request` +
      (game.total === 1 ? "" : "s");
    tags.appendChild(tag);
  });

  container.appendChild(heading);
  container.appendChild(tags);
}

/* GAME LIBRARY */

function render() {
  if (!grid) return;

  const q = (search?.value || "")
    .trim()
    .toLowerCase();

  const filteredGames = games.filter(game => {
    const genreMatches =
      filter === "all" || game.type === filter;

    const searchMatches =
      (game.name || "").toLowerCase().includes(q);

    const trophyAvailable =
      !slotIsRented(game, "trophy");

    const nonTrophyAvailable =
      !slotIsRented(game, "nonTrophy");

    let availabilityMatches = true;

    if (availabilityFilter === "available") {
      availabilityMatches =
        trophyAvailable || nonTrophyAvailable;
    } else if (availabilityFilter === "trophy") {
      availabilityMatches = trophyAvailable;
    } else if (
      availabilityFilter === "nonTrophy"
    ) {
      availabilityMatches = nonTrophyAvailable;
    } else if (
      availabilityFilter === "favorites"
    ) {
      availabilityMatches =
        favoriteGames.has(game.name);
    }

    return (
      genreMatches &&
      searchMatches &&
      availabilityMatches
    );
  });

  const count =
    document.getElementById("libraryResultCount");

  if (count) {
    count.textContent =
      `${filteredGames.length} game` +
      (filteredGames.length === 1 ? "" : "s") +
      " found";
  }

  const oldCount =
    document.getElementById("gameCount");

  if (oldCount) {
    oldCount.textContent =
      games.length.toString().padStart(2, "0");
  }

  grid.innerHTML = "";

  if (!filteredGames.length) {
    grid.innerHTML = `
      <p class="mega-empty">
        No games match your search or filter.
        Try All Games.
      </p>
    `;
  }

  filteredGames.forEach(game => {
    const card = document.createElement("article");
    card.className = "game-card";

    const allSlotsRented =
      slotIsRented(game, "trophy") &&
      slotIsRented(game, "nonTrophy");

    const isFavorite =
      favoriteGames.has(game.name);

    const weekly = Number(game.weekly) || 0;
    const monthly = Number(game.monthly) || 0;

    const savings =
      weekly > 0 && monthly > 0
        ? Math.max(0, weekly * 4 - monthly)
        : 0;

    const savingsHtml = savings > 0
      ? `
        <div class="mega-savings">
          💰 Save ${money(savings)} with 1 month
          compared with four 1-week rentals!
        </div>
      `
      : `
        <div class="mega-savings">
          📅 Weekly and monthly rental options
        </div>
      `;

    card.innerHTML = `
      <div class="cover-wrap">
        <img
          class="cover"
          src="${escapeHtml(game.image || "")}"
          alt="${escapeHtml(game.name)}"
          loading="lazy"
        >

        <span class="tag">
          ${escapeHtml(
            (game.genre || "GAME").toUpperCase()
          )}
        </span>

        <button
          type="button"
          class="mega-favorite
            ${isFavorite ? "is-favorite" : ""}"
          aria-label="${
            isFavorite
              ? "Remove from favorites"
              : "Add to favorites"
          }"
          aria-pressed="${isFavorite}"
        >
          ${isFavorite ? "♥" : "♡"}
        </button>
      </div>

      <div class="game-info">
        <h3>${escapeHtml(game.name)}</h3>

        <div class="meta">
          ${escapeHtml(
            game.meta || "PS5 • Digital rental"
          )}
        </div>

        ${slotAvailabilityHtml(
          game, "trophy", "Trophy", "🏆"
        )}

        ${slotAvailabilityHtml(
          game, "nonTrophy", "Non-Trophy", "🎮"
        )}

        ${waitingCountersHtml(game)}

        ${savingsHtml}

        <div class="game-bottom">
          <div class="price">
            <span>WEEKLY: ${money(weekly)}</span>
            <span>MONTHLY: ${money(monthly)}</span>
          </div>

          <button class="rent" type="button">
            ${
              allSlotsRented
                ? "Join Waiting List ↗"
                : "Rent Now ↗"
            }
          </button>
        </div>
      </div>
    `;

    card.querySelector(".rent")
      ?.addEventListener("click", () => {
        openRentalModal(game);
      });

    card.querySelector(".mega-favorite")
      ?.addEventListener("click", () => {
        toggleFavorite(game.name);
      });

    grid.appendChild(card);
  });

  renderFeaturedGames();
}

/* SMART AVAILABILITY FILTERS */

document.querySelectorAll(
  "[data-availability]"
).forEach(button => {
  button.addEventListener("click", () => {
    availabilityFilter =
      button.dataset.availability || "all";

    document.querySelectorAll(
      "[data-availability]"
    ).forEach(other => {
      other.classList.toggle(
        "active",
        other === button
      );
    });

    render();
  });
});

/* OPTIONAL OLD GENRE FILTER SUPPORT */

document.querySelectorAll(".filter")
  .forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".filter")
        .forEach(other => {
          other.classList.remove("active");
        });

      button.classList.add("active");
      filter = button.dataset.filter || "all";
      render();
    });
  });

search?.addEventListener("input", render);

/* RENTAL MODAL */

const rentalModal =
  document.getElementById("rentalModal");

const modalTitle =
  document.getElementById("modalTitle");

const modalPrice =
  document.getElementById("modalPrice");

const continueRental =
  document.getElementById("continueRental");

function updateRentalButton() {
  if (!continueRental || !selectedGame) return;

  const rented = selectedAccount
    ? slotIsRented(selectedGame, selectedAccount)
    : (
      slotIsRented(selectedGame, "trophy") &&
      slotIsRented(selectedGame, "nonTrophy")
    );

  continueRental.textContent = rented
    ? "Join Waiting List"
    : "📝 Continue to Facebook";
}

function openRentalModal(game) {
  if (!rentalModal) return;

  selectedGame = game;
  selectedPeriod = null;
  selectedAccount = null;

  const bothRented =
    slotIsRented(game, "trophy") &&
    slotIsRented(game, "nonTrophy");

  if (modalTitle) {
    modalTitle.textContent =
      (bothRented ? "Join Waiting List — " : "Rent — ") +
      game.name;
  }

  if (modalPrice) {
    modalPrice.textContent = "₱0";
  }

  rentalModal.querySelectorAll(
    ".period-option, .account-option"
  ).forEach(button => {
    button.classList.remove("active");
  });

  const nameInput =
    document.getElementById("rentalCustomerName");

  if (nameInput) nameInput.value = "";

  updateRentalButton();
  rentalModal.classList.add("active");
}

rentalModal?.querySelectorAll(".period-option")
  .forEach(button => {
    button.addEventListener("click", () => {
      if (!selectedGame) return;

      rentalModal.querySelectorAll(
        ".period-option"
      ).forEach(other => {
        other.classList.remove("active");
      });

      button.classList.add("active");
      selectedPeriod = button.dataset.period;

      const price = selectedPeriod === "week"
        ? selectedGame.weekly
        : selectedGame.monthly;

      if (modalPrice) {
        modalPrice.textContent = money(price);
      }
    });
  });

rentalModal?.querySelectorAll(".account-option")
  .forEach(button => {
    button.addEventListener("click", () => {
      rentalModal.querySelectorAll(
        ".account-option"
      ).forEach(other => {
        other.classList.remove("active");
      });

      button.classList.add("active");
      selectedAccount = button.dataset.account;

      updateRentalButton();
    });
  });

continueRental?.addEventListener(
  "click",
  async () => {
    if (!selectedGame || rentalSubmitting) return;

    const customerName =
      document.getElementById("rentalCustomerName")
        ?.value.trim() || "";

    if (!customerName) {
      alert("Please enter your First and Last Name.");
      return;
    }

    if (!selectedPeriod) {
      alert("Please choose 1 Week or 1 Month.");
      return;
    }

    if (!selectedAccount) {
      alert("Please choose Trophy or Non-Trophy.");
      return;
    }

    const duration =
      selectedPeriod === "week"
        ? "1 Week"
        : "1 Month";

    const accountType =
      selectedAccount === "trophy"
        ? "Trophy"
        : "Non-Trophy";

    const price =
      selectedPeriod === "week"
        ? selectedGame.weekly
        : selectedGame.monthly;

    const isWaitingList =
      slotIsRented(selectedGame, selectedAccount);

    rentalSubmitting = true;
    continueRental.disabled = true;

    try {
      if (isWaitingList) {
        if (
          typeof window.saveWaitingList !== "function"
        ) {
          alert(
            "Waiting list is unavailable. Please try again."
          );
          return;
        }

        const saved = await window.saveWaitingList({
          gameId:
            selectedGame.id || selectedGame.name,
          gameName: selectedGame.name,
          customerName,
          accountType,
          rentalPeriod: duration
        });

        if (!saved) {
          alert(
            "Unable to save your waiting list request."
          );
          return;
        }
      }

      const message = isWaitingList
        ? `Hi JDigitalsRental! 🎮

I would like to join the waiting list.

First and Last Name: ${customerName}
Game: ${selectedGame.name}
Rental Period: ${duration}
Account Type: ${accountType}
Price: ${money(price)}

📌 My name matches the name shown on my Facebook account.

Please let me know when a slot becomes available.

Thank you!`
        : `Hi JDigitalsRental! 🎮

I would like to rent this game.

First and Last Name: ${customerName}
Game: ${selectedGame.name}
Rental Period: ${duration}
Account Type: ${accountType}
Price: ${money(price)}

📌 My name matches the name shown on my Facebook account.

Thank you!`;

      rentalModal.classList.remove("active");
      showRentalFacebookReminder(message);

    } finally {
      rentalSubmitting = false;
      continueRental.disabled = false;
    }
  }
);

document.getElementById("closeRentalModal")
  ?.addEventListener("click", () => {
    rentalModal?.classList.remove("active");
  });

rentalModal?.addEventListener("click", event => {
  if (event.target === rentalModal) {
    rentalModal.classList.remove("active");
  }
});

/* FIRESTORE GAME LIBRARY */

function loadFirestoreGames() {
  if (Array.isArray(window.firestoreGames)) {
    games = window.firestoreGames;
    render();
  }
}

window.addEventListener(
  "firestoreGamesLoaded",
  loadFirestoreGames
);

window.addEventListener(
  "waitingListCountsLoaded",
  render
);

/* UPCOMING GAMES */

function sortUpcomingGamesByDate() {
  if (!Array.isArray(window.upcomingGames)) return;

  window.upcomingGames.sort((a, b) => {
    const dateA = dateValue(a.availableDate);
    const dateB = dateValue(b.availableDate);

    return (
      (dateA ? dateA.getTime() : Infinity) -
      (dateB ? dateB.getTime() : Infinity)
    );
  });
}

function countdownText(value) {
  const date = dateValue(value);

  if (!date) return "";

  const remaining = date.getTime() - Date.now();

  if (remaining <= 0) {
    return "🎮 Release date has arrived!";
  }

  const totalDays = Math.floor(
    remaining / 86400000
  );

  const hours = Math.floor(
    (remaining % 86400000) / 3600000
  );

  const minutes = Math.floor(
    (remaining % 3600000) / 60000
  );

  return (
    `⏳ ${totalDays}d ${hours}h ${minutes}m remaining`
  );
}

function updateUpcomingCountdowns() {
  document.querySelectorAll(
    ".mega-countdown"
  ).forEach(element => {
    const value = element.dataset.releaseDate;
    element.textContent = countdownText(value);
  });
}

function renderUpcomingGames() {
  const container =
    document.getElementById("upcomingGames");

  if (!container) return;

  const upcomingGames =
    Array.isArray(window.upcomingGames)
      ? window.upcomingGames
      : [];

  container.innerHTML = "";

  if (!upcomingGames.length) {
    container.innerHTML = `
      <p class="empty-upcoming">
        No upcoming games at the moment. 🎮
      </p>
    `;
    return;
  }

  sortUpcomingGamesByDate();

  upcomingGames.forEach(game => {
    const card = document.createElement("article");

    card.className =
      "game-card upcoming-game-card";

    const availableDate =
      game.availableDate || "Date to be announced";

    const countdown = countdownText(availableDate);

    card.innerHTML = `
      <div class="cover-wrap">
        <img
          class="cover"
          src="${escapeHtml(game.image || "")}"
          alt="${escapeHtml(game.name)}"
          loading="lazy"
        >

        <span class="badge upcoming-badge">
          COMING SOON
        </span>
      </div>

      <div class="game-info">
        <h3>${escapeHtml(game.name)}</h3>

        <div class="meta">
          ${escapeHtml(
            game.meta || "PS5 • Digital rental"
          )}
        </div>

        <div class="availability upcoming-availability">
          <strong>📅 AVAILABLE FOR RENT</strong>
          <div>${escapeHtml(availableDate)}</div>
          ${
            countdown
              ? `<div
                   class="mega-countdown"
                   data-release-date="${
                     escapeHtml(availableDate)
                   }"
                 >${escapeHtml(countdown)}</div>`
              : ""
          }
        </div>

        ${waitingCountersHtml(game)}

        <div class="game-bottom">
          <div class="price">
            <span>
              WEEKLY<br>${money(game.weekly)}
            </span>
            <span>
              MONTHLY<br>${money(game.monthly)}
            </span>
          </div>

          <button
            class="reserve-slot-button"
            type="button"
          >
            📝 Reserve Slot / Join Waiting List
          </button>
        </div>
      </div>
    `;

    card.querySelector(".reserve-slot-button")
      ?.addEventListener("click", () => {
        openUpcomingReservationModal(game);
      });

    container.appendChild(card);
  });

  updateUpcomingCountdowns();
}

/* UPCOMING RESERVATION MODAL */

const upcomingReservationModal =
  document.getElementById(
    "upcomingReservationModal"
  );

const upcomingReservationGame =
  document.getElementById(
    "upcomingReservationGame"
  );

const continueUpcomingReservation =
  document.getElementById(
    "continueUpcomingReservation"
  );

let selectedUpcomingGame = null;
let selectedUpcomingAccount = "";
let selectedUpcomingPeriod = "";

function openUpcomingReservationModal(game) {
  if (!upcomingReservationModal) return;

  selectedUpcomingGame = game;
  selectedUpcomingAccount = "";
  selectedUpcomingPeriod = "";

  if (upcomingReservationGame) {
    upcomingReservationGame.textContent =
      game.name;
  }

  const nameInput =
    document.getElementById(
      "upcomingReservationCustomerName"
    );

  if (nameInput) nameInput.value = "";

  upcomingReservationModal.querySelectorAll(
    ".upcoming-account-option, .upcoming-period-option"
  ).forEach(button => {
    button.classList.remove("active");
  });

  upcomingReservationModal.classList.add("active");
}

upcomingReservationModal?.querySelectorAll(
  ".upcoming-account-option"
).forEach(button => {
  button.addEventListener("click", () => {
    upcomingReservationModal.querySelectorAll(
      ".upcoming-account-option"
    ).forEach(other => {
      other.classList.remove("active");
    });

    button.classList.add("active");
    selectedUpcomingAccount =
      button.dataset.account || "";
  });
});

upcomingReservationModal?.querySelectorAll(
  ".upcoming-period-option"
).forEach(button => {
  button.addEventListener("click", () => {
    upcomingReservationModal.querySelectorAll(
      ".upcoming-period-option"
    ).forEach(other => {
      other.classList.remove("active");
    });

    button.classList.add("active");
    selectedUpcomingPeriod =
      button.dataset.period || "";
  });
});

document.getElementById(
  "closeUpcomingReservationModal"
)?.addEventListener("click", () => {
  upcomingReservationModal?.classList.remove(
    "active"
  );
});

upcomingReservationModal?.addEventListener(
  "click",
  event => {
    if (event.target === upcomingReservationModal) {
      upcomingReservationModal.classList.remove(
        "active"
      );
    }
  }
);

continueUpcomingReservation?.addEventListener(
  "click",
  async () => {
    if (
      !selectedUpcomingGame ||
      upcomingSubmitting
    ) {
      return;
    }

    const customerName =
      document.getElementById(
        "upcomingReservationCustomerName"
      )?.value.trim() || "";

    if (!customerName) {
      alert("Please enter your First and Last Name.");
      return;
    }

    if (!selectedUpcomingPeriod) {
      alert("Please choose 1 Week or 1 Month.");
      return;
    }

    if (!selectedUpcomingAccount) {
      alert("Please choose Trophy or Non-Trophy.");
      return;
    }

    const rentalPeriod =
      selectedUpcomingPeriod === "week"
        ? "1 Week"
        : "1 Month";

    const accountType =
      selectedUpcomingAccount === "trophy"
        ? "Trophy"
        : "Non-Trophy";

    if (
      typeof window.saveWaitingList !== "function"
    ) {
      alert(
        "Reservation is unavailable. Please try again."
      );
      return;
    }

    upcomingSubmitting = true;
    continueUpcomingReservation.disabled = true;

    try {
      const game = selectedUpcomingGame;

      const saved = await window.saveWaitingList({
        gameId: game.id || game.name,
        gameName: game.name,
        customerName,
        accountType,
        rentalPeriod
      });

      if (!saved) {
        alert(
          "Unable to save your reservation. Please try again."
        );
        return;
      }

      const message = `Hi JDigitalsRental! 🎮

I would like to reserve a slot / join the waiting list.

First and Last Name: ${customerName}
Game: ${game.name}
Rental Period: ${rentalPeriod}
Account Type: ${accountType}
Available Date: ${game.availableDate || "To be announced"}

📌 I understand that my First and Last Name should match the name shown on my Facebook account so JDigitalsRental can easily find and contact me when it is my turn to rent.

Thank you!`;

      upcomingReservationModal.classList.remove(
        "active"
      );

      showRentalFacebookReminder(message);

    } finally {
      upcomingSubmitting = false;
      continueUpcomingReservation.disabled = false;
    }
  }
);

/* UPCOMING AUTO SLIDER */

let upcomingSlideTimer = null;

function startUpcomingAutoSlide() {
  const slider =
    document.getElementById("upcomingGames");

  if (!slider) return;

  if (upcomingSlideTimer) {
    clearInterval(upcomingSlideTimer);
  }

  let currentIndex = 0;

  upcomingSlideTimer = setInterval(() => {
    const cards = slider.querySelectorAll(
      ".upcoming-game-card"
    );

    if (cards.length <= 3) return;

    currentIndex++;

    if (currentIndex >= cards.length) {
      currentIndex = 0;
    }

    const card = cards[currentIndex];

    slider.scrollTo({
      left: card.offsetLeft - slider.offsetLeft,
      behavior: "smooth"
    });
  }, 3500);
}

function refreshUpcomingGames() {
  renderUpcomingGames();

  const slider =
    document.getElementById("upcomingGames");

  slider?.scrollTo({
    left: 0,
    behavior: "instant"
  });

  startUpcomingAutoSlide();
}

window.addEventListener(
  "upcomingGamesLoaded",
  refreshUpcomingGames
);

window.addEventListener(
  "waitingListCountsLoaded",
  renderUpcomingGames
);

/* UPDATE COUNTDOWNS EVERY MINUTE */

setInterval(
  updateUpcomingCountdowns,
  60000
);

/* INITIAL LOAD */

render();

if (Array.isArray(window.firestoreGames)) {
  loadFirestoreGames();
}

if (Array.isArray(window.upcomingGames)) {
  refreshUpcomingGames();
}

/* ==========================================
   END — JDIGITALSRENTAL MEGA UPGRADE
   ========================================== */
