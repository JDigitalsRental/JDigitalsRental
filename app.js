
/* ==========================================
   JDIGITALSRENTAL — COMPLETE APP.JS
   Rental Plans + UNLI SWAP Update
   ========================================== */

const FACEBOOK_URL =
  "https://www.facebook.com/share/1DajrF4mTy/";

const RENTAL_PLANS = {
  trophyMonthly: 800,
  nonTrophyMonthly: 700,
  weeklySwaps: 1,
  monthlySwapsPerWeek: 1
};

/* ==========================================
   DEFAULT GAME LIBRARY
   Firestore games will replace these when loaded.
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

/* ==========================================
   ELEMENTS AND STATE
   ========================================== */

const grid = document.getElementById("gameGrid");
const search = document.getElementById("search");

const rentalModal =
  document.getElementById("rentalModal");

const modalTitle =
  document.getElementById("modalTitle");

const modalPrice =
  document.getElementById("modalPrice");

const continueRental =
  document.getElementById("continueRental");

const upcomingReservationModal =
  document.getElementById("upcomingReservationModal");

const upcomingReservationGame =
  document.getElementById("upcomingReservationGame");

const continueUpcomingReservation =
  document.getElementById("continueUpcomingReservation");

let filter = "all";
let availabilityFilter = "all";

let selectedGame = null;
let selectedPeriod = "";
let selectedAccount = "";

let selectedUpcomingGame = "";
let selectedUpcomingDate = "";
let selectedUpcomingAccount = "";
let selectedUpcomingPeriod = "";

let favoriteGames = new Set();

try {
  favoriteGames = new Set(
    JSON.parse(
      localStorage.getItem("jdrFavorites") || "[]"
    )
  );
} catch (error) {
  favoriteGames = new Set();
}

/* ==========================================
   GENERAL HELPERS
   ========================================== */

function peso(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return "Price TBA";
  }

  return "₱" + amount.toLocaleString("en-PH");
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function accountLabel(account) {
  return account === "trophy"
    ? "Trophy"
    : "Non-Trophy";
}

function normalizePeriod(period) {
  return period === "week" ? "week" : "month";
}

function rentalPeriodLabel(period) {
  return normalizePeriod(period) === "week"
    ? "1 Week"
    : "1 Month";
}

function rentalPlanLabel(period) {
  return normalizePeriod(period) === "week"
    ? "Regular Weekly Rental"
    : "Monthly UNLI SWAP";
}

function rentalSwapRules(period) {
  if (normalizePeriod(period) === "week") {
    return "Includes 1 game swap during the rental period. One game at a time, subject to availability.";
  }

  return "Unlimited game swaps, maximum 1 swap per week. One game at a time, subject to availability.";
}

/* ==========================================
   RENTAL PRICING
   ========================================== */

function getRentalPrice(game, period, account) {
  if (!game || !period || !account) {
    return null;
  }

  if (normalizePeriod(period) === "week") {
    const weekly = Number(game.weekly);

    return Number.isFinite(weekly) && weekly > 0
      ? weekly
      : null;
  }

  if (account === "trophy") {
    return RENTAL_PLANS.trophyMonthly;
  }

  if (account === "nonTrophy") {
    return RENTAL_PLANS.nonTrophyMonthly;
  }

  return null;
}

function getRentalPriceText(game, period, account) {
  return peso(getRentalPrice(game, period, account));
}

/* ==========================================
   SLOT AVAILABILITY
   ========================================== */

function slotIsRented(game, type) {
  if (!game) return false;

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

    if (
      [
        "available",
        "available now",
        "vacant",
        "open",
        "false"
      ].includes(value)
    ) {
      return false;
    }

    if (
      [
        "currently-rented",
        "currently rented",
        "rented",
        "occupied",
        "true"
      ].includes(value)
    ) {
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

  if (game.status === "available") {
    return false;
  }

  return game.status === "currently-rented";
}

function formatSlotDate(value) {
  if (
    !value ||
    /^(available now|available)$/i.test(
      String(value).trim()
    )
  ) {
    return "Available Now";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit"
  });
}

function slotAvailabilityHtml(
  game,
  type,
  label,
  icon
) {
  const rented = slotIsRented(game, type);

  const key =
    type === "trophy"
      ? "trophyDate"
      : "nonTrophyDate";

  const dateText = rented
    ? formatSlotDate(game[key])
    : "Available Now";

  const background = rented
    ? "rgba(120,14,33,.35)"
    : "rgba(0,115,65,.28)";

  const border = rented
    ? "#ff4768"
    : "#19d97c";

  const color = rented
    ? "#ff839a"
    : "#55f5a5";

  return `
    <div
      class="availability ${
        rented ? "rented" : "available"
      }"
      style="
        margin-bottom:6px;
        padding:8px;
        border:1px solid ${border};
        border-radius:9px;
        background:${background};
      "
    >
      <strong style="color:${color}">
        ${
          rented
            ? "🔴 CURRENTLY RENTED"
            : "🟢 AVAILABLE"
        }
      </strong>

      <div>
        ${icon} ${label}:
        ${escapeHTML(dateText)}
      </div>
    </div>
  `;
}

/* ==========================================
   FACEBOOK REMINDER
   ========================================== */

function showRentalFacebookReminder(message) {
  if (
    typeof window.showFacebookReminder ===
    "function"
  ) {
    window.showFacebookReminder(message);
    return;
  }

  if (navigator.clipboard?.writeText) {
    navigator.clipboard
      .writeText(message)
      .catch(() => {});
  }

  alert(
    "One More Step! 🎮\n\n" +
    "Please send your completed form to our " +
    "Facebook Page via Messenger.\n\n" +
    "Your request is not confirmed until " +
    "you message our page."
  );

  window.open(
    FACEBOOK_URL,
    "_blank",
    "noopener,noreferrer"
  );
}

/* ==========================================
   GAME LIBRARY
   ========================================== */

function render() {
  if (!grid) return;

  const q = search
    ? search.value.toLowerCase().trim()
    : "";

  grid.innerHTML = "";

  const gameCount =
    document.getElementById("gameCount");

  if (gameCount) {
    gameCount.textContent = String(
      games.length
    ).padStart(2, "0");
  }

  const filteredGames = games.filter(game => {
    const genreMatches =
      filter === "all" ||
      game.type === filter;

    const nameMatches =
      (game.name || "")
        .toLowerCase()
        .includes(q);

    const trophyAvailable =
      !slotIsRented(game, "trophy");

    const nonTrophyAvailable =
      !slotIsRented(game, "nonTrophy");

    let slotMatches = true;

    switch (availabilityFilter) {
      case "available":
        slotMatches =
          trophyAvailable ||
          nonTrophyAvailable;
        break;

      case "trophy":
        slotMatches = trophyAvailable;
        break;

      case "nonTrophy":
        slotMatches = nonTrophyAvailable;
        break;

      case "favorites":
        slotMatches =
          favoriteGames.has(game.name);
        break;

      default:
        slotMatches = true;
    }

    return (
      genreMatches &&
      nameMatches &&
      slotMatches
    );
  });

  const resultCount =
    document.getElementById(
      "libraryResultCount"
    );

  if (resultCount) {
    resultCount.textContent =
      `${filteredGames.length} game` +
      (filteredGames.length === 1 ? "" : "s") +
      " found";
  }

  if (!filteredGames.length) {
    grid.innerHTML = `
      <p class="mega-empty">
        No games match this filter.
        Try All Games.
      </p>
    `;
  }

  renderFeaturedGames();

  filteredGames.forEach(game => {
    const card =
      document.createElement("article");

    card.className = "game-card";

    const availability =
      slotAvailabilityHtml(
        game,
        "trophy",
        "Trophy",
        "🏆"
      ) +
      slotAvailabilityHtml(
        game,
        "nonTrophy",
        "Non-Trophy",
        "🎮"
      );

    const allSlotsRented =
      slotIsRented(game, "trophy") &&
      slotIsRented(game, "nonTrophy");

    const counts =
      window.waitingListCounts?.[
        game.name
      ] || {
        trophy: 0,
        nonTrophy: 0
      };

    const isFavorite =
      favoriteGames.has(game.name);

    card.innerHTML = `
      <div class="cover-wrap">
        <img
          class="cover"
          src="${escapeHTML(game.image || "")}"
          alt="${escapeHTML(game.name)}"
          loading="lazy"
        >

        <span class="tag">
          ${escapeHTML(
            (game.genre || "GAME").toUpperCase()
          )}
        </span>

        <button
          type="button"
          class="mega-favorite ${
            isFavorite ? "is-favorite" : ""
          }"
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
        <h3>${escapeHTML(game.name)}</h3>

        <div class="meta">
          ${escapeHTML(
            game.meta ||
            "PS5 • Digital rental"
          )}
        </div>

        ${availability}

        <div
          style="
            margin-top:6px;
            padding:8px;
            border:1px solid rgba(57,169,255,.28);
            border-radius:7px;
            background:rgba(57,169,255,.06);
            text-align:center;
            font-size:11px;
          "
        >
          <strong>WAITING LIST</strong>

          <div>
            🏆 Trophy:
            ${Number(counts.trophy) || 0}
          </div>

          <div>
            🎮 Non-Trophy:
            ${Number(counts.nonTrophy) || 0}
          </div>
        </div>

        <div
          class="mega-savings"
          style="margin-top:8px"
        >
          🔄 Weekly: 1 game swap
          <br>
          ♾️ Monthly: UNLI SWAP
          (max 1 swap/week)
        </div>

        <div class="game-bottom">
          <div class="price">
            <span>
              WEEKLY:
              ${peso(game.weekly)}
            </span>

            <span>
              MONTHLY UNLI SWAP:
            </span>

            <span>
              🏆 Trophy: ₱800
            </span>

            <span>
              🎮 Non-Trophy: ₱700
            </span>
          </div>

          <button
            class="rent"
            type="button"
          >
            ${
              allSlotsRented
                ? "Join Waiting List ↗"
                : "Rent Now ↗"
            }
          </button>
        </div>
      </div>
    `;

    card
      .querySelector(".rent")
      ?.addEventListener("click", () => {
        openRentalModal(game);
      });

    card
      .querySelector(".mega-favorite")
      ?.addEventListener("click", () => {
        if (favoriteGames.has(game.name)) {
          favoriteGames.delete(game.name);
        } else {
          favoriteGames.add(game.name);
        }

        try {
          localStorage.setItem(
            "jdrFavorites",
            JSON.stringify(
              [...favoriteGames]
            )
          );
        } catch (error) {}

        render();
      });

    grid.appendChild(card);
  });
}

/* ==========================================
   MOST REQUESTED GAMES
   ========================================== */

function renderFeaturedGames() {
  const featured =
    document.getElementById(
      "featuredGames"
    );

  if (!featured) return;

  const counts =
    window.waitingListCounts || {};

  const popular = games
    .map(game => ({
      name: game.name,
      count:
        Number(
          counts[game.name]?.trophy || 0
        ) +
        Number(
          counts[game.name]?.nonTrophy || 0
        )
    }))
    .filter(game => game.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  if (!popular.length) {
    featured.innerHTML = "";
    return;
  }

  featured.innerHTML = `
    <div class="mega-featured-heading">
      🔥 MOST REQUESTED

      <small>
        Based on current waiting-list entries
      </small>
    </div>

    <div class="mega-featured-tags"></div>
  `;

  const tags =
    featured.querySelector(
      ".mega-featured-tags"
    );

  popular.forEach(game => {
    const tag =
      document.createElement("span");

    tag.textContent =
      `${game.name} · ` +
      `${game.count} waiting`;

    tags.appendChild(tag);
  });
}

/* ==========================================
   SEARCH AND FILTERS
   ========================================== */

document
  .querySelectorAll(".filter")
  .forEach(button => {
    button.addEventListener(
      "click",
      () => {
        document
          .querySelectorAll(".filter")
          .forEach(b => {
            b.classList.remove("active");
          });

        button.classList.add("active");

        filter =
          button.dataset.filter || "all";

        render();
      }
    );
  });

document
  .querySelectorAll("[data-availability]")
  .forEach(button => {
    button.addEventListener(
      "click",
      () => {
        availabilityFilter =
          button.dataset.availability ||
          "all";

        document
          .querySelectorAll(
            "[data-availability]"
          )
          .forEach(b => {
            b.classList.toggle(
              "active",
              b === button
            );
          });

        render();
      }
    );
  });

if (search) {
  search.addEventListener(
    "input",
    render
  );
}

/* ==========================================
   RENTAL MODAL
   ========================================== */

function updateRentalPrice() {
  if (!modalPrice) return;

  const price = getRentalPrice(
    selectedGame,
    selectedPeriod,
    selectedAccount
  );

  modalPrice.textContent =
    price === null
      ? "Select rental period and slot"
      : peso(price);
}

function updateRentalButton() {
  if (
    !continueRental ||
    !selectedGame
  ) {
    return;
  }

  if (!selectedAccount) {
    const bothRented =
      slotIsRented(
        selectedGame,
        "trophy"
      ) &&
      slotIsRented(
        selectedGame,
        "nonTrophy"
      );

    continueRental.textContent =
      bothRented
        ? "Join Waiting List"
        : "Continue to Facebook";

    return;
  }

  continueRental.textContent =
    slotIsRented(
      selectedGame,
      selectedAccount
    )
      ? "Join Waiting List"
      : "Continue to Facebook";
}

function openRentalModal(game) {
  if (
    !rentalModal ||
    !modalTitle ||
    !modalPrice ||
    !continueRental
  ) {
    return;
  }

  selectedGame = game;
  selectedPeriod = "";
  selectedAccount = "";

  const bothRented =
    slotIsRented(game, "trophy") &&
    slotIsRented(game, "nonTrophy");

  modalTitle.textContent =
    bothRented
      ? `Join Waiting List — ${game.name}`
      : `Rent — ${game.name}`;

  const nameInput =
    document.getElementById(
      "rentalCustomerName"
    );

  if (nameInput) {
    nameInput.value = "";
  }

  document
    .querySelectorAll(
      "#rentalModal .period-option, " +
      "#rentalModal .account-option"
    )
    .forEach(button => {
      button.classList.remove("active");
    });

  updateRentalPrice();
  updateRentalButton();

  rentalModal.classList.add("active");
}

/* ==========================================
   RENTAL PERIOD SELECTION
   ========================================== */

document
  .querySelectorAll(
    "#rentalModal .period-option"
  )
  .forEach(button => {
    button.addEventListener(
      "click",
      () => {
        if (!selectedGame) return;

        document
          .querySelectorAll(
            "#rentalModal .period-option"
          )
          .forEach(b => {
            b.classList.remove("active");
          });

        button.classList.add("active");

        selectedPeriod =
          button.dataset.period || "";

        updateRentalPrice();
      }
    );
  });

/* ==========================================
   TROPHY / NON-TROPHY SELECTION
   ========================================== */

document
  .querySelectorAll(
    "#rentalModal .account-option"
  )
  .forEach(button => {
    button.addEventListener(
      "click",
      () => {
        if (!selectedGame) return;

        document
          .querySelectorAll(
            "#rentalModal .account-option"
          )
          .forEach(b => {
            b.classList.remove("active");
          });

        button.classList.add("active");

        selectedAccount =
          button.dataset.account || "";

        updateRentalPrice();
        updateRentalButton();
      }
    );
  });

/* ==========================================
   RENTAL SUBMISSION
   ========================================== */

if (continueRental) {
  continueRental.addEventListener(
    "click",
    async () => {
      if (!selectedGame) return;

      const customerName =
        document.getElementById(
          "rentalCustomerName"
        )?.value.trim() || "";

      if (!customerName) {
        alert(
          "Please enter your First and Last Name."
        );
        return;
      }

      if (!selectedPeriod) {
        alert(
          "Please choose 1 Week or 1 Month."
        );
        return;
      }

      if (!selectedAccount) {
        alert(
          "Please choose Trophy or Non-Trophy."
        );
        return;
      }

      const price = getRentalPrice(
        selectedGame,
        selectedPeriod,
        selectedAccount
      );

      if (price === null) {
        alert(
          "Price is unavailable. Please contact our page."
        );
        return;
      }

      const duration =
        rentalPeriodLabel(selectedPeriod);

      const plan =
        rentalPlanLabel(selectedPeriod);

      const swapRules =
        rentalSwapRules(selectedPeriod);

      const accountType =
        accountLabel(selectedAccount);

      const isWaitingList =
        slotIsRented(
          selectedGame,
          selectedAccount
        );

      if (isWaitingList) {
        if (
          typeof window.saveWaitingList !==
          "function"
        ) {
          alert(
            "Unable to save your waiting list request. Please try again."
          );
          return;
        }

        continueRental.disabled = true;

        let saved = false;

        try {
          saved =
            await window.saveWaitingList({
              gameId:
                selectedGame.id ||
                selectedGame.name,
              gameName:
                selectedGame.name,
              customerName,
              accountType,
              rentalPeriod: duration
            });
        } catch (error) {
          console.error(
            "Waiting list error:",
            error
          );
        } finally {
          continueRental.disabled = false;
        }

        if (!saved) {
          alert(
            "Unable to save your waiting list request. Please try again."
          );
          return;
        }
      }

      const requestTitle = isWaitingList
        ? "I would like to join the waiting list."
        : "I would like to rent this game.";

      const message =
`Hi JDigitalsRental! 🎮

${requestTitle}

First and Last Name: ${customerName}
Game: ${selectedGame.name}
Rental Period: ${duration}
Rental Plan: ${plan}
Account Type: ${accountType}
Price: ${peso(price)}

SWAP RULES:
${swapRules}

📌 My name matches the name shown on my Facebook account.

${
  isWaitingList
    ? "Please let me know when a slot becomes available."
    : "Please let me know how to proceed with my rental."
}

Thank you!`;

      rentalModal.classList.remove(
        "active"
      );

      showRentalFacebookReminder(
        message
      );
    }
  );
}

/* ==========================================
   CLOSE RENTAL MODAL
   ========================================== */

document
  .getElementById("closeRentalModal")
  ?.addEventListener(
    "click",
    () => {
      rentalModal?.classList.remove(
        "active"
      );
    }
  );

rentalModal?.addEventListener(
  "click",
  event => {
    if (event.target === rentalModal) {
      rentalModal.classList.remove(
        "active"
      );
    }
  }
);

/* ==========================================
   FIRESTORE GAME LIBRARY
   ========================================== */

function loadFirestoreGames() {
  if (
    Array.isArray(
      window.firestoreGames
    )
  ) {
    games = window.firestoreGames;
    render();
  }
}

window.addEventListener(
  "firestoreGamesLoaded",
  loadFirestoreGames
);

/* ==========================================
   UPCOMING GAMES
   ========================================== */

function renderUpcomingGames() {
  const container =
    document.getElementById(
      "upcomingGames"
    );

  if (!container) return;

  const upcomingGames =
    Array.isArray(window.upcomingGames)
      ? window.upcomingGames
      : [];

  const waitingCounts =
    window.waitingListCounts || {};

  container.innerHTML = "";

  if (!upcomingGames.length) {
    container.innerHTML = `
      <p class="empty-upcoming">
        No upcoming games at the moment. 🎮
      </p>
    `;
    return;
  }

  upcomingGames.forEach(game => {
    const card =
      document.createElement("article");

    card.className =
      "game-card upcoming-game-card";

    const availableDate =
      game.availableDate ||
      "Date to be announced";

    const counts =
      waitingCounts[game.name] || {
        trophy: 0,
        nonTrophy: 0
      };

    card.innerHTML = `
      <div class="cover-wrap">
        <img
          class="cover"
          src="${escapeHTML(game.image || "")}"
          alt="${escapeHTML(game.name)}"
          loading="lazy"
        >

        <span class="badge upcoming-badge">
          COMING SOON
        </span>
      </div>

      <div class="game-info">
        <h3>
          ${escapeHTML(game.name)}
        </h3>

        <div class="meta">
          ${escapeHTML(
            game.meta ||
            "PS5 • Digital rental"
          )}
        </div>

        <div
          class="availability upcoming-availability"
        >
          <strong>
            📅 AVAILABLE FOR RENT
          </strong>

          <div>
            ${escapeHTML(availableDate)}
          </div>

          <div
            class="mega-countdown"
            data-release-date="${escapeHTML(
              availableDate
            )}"
          >
            ⏳ Checking release date...
          </div>
        </div>

        <div
          class="availability waiting-list-count"
        >
          <strong>WAITING LIST</strong>

          <div>
            🏆 Trophy:
            ${Number(counts.trophy) || 0}
          </div>

          <div>
            🎮 Non-Trophy:
            ${Number(counts.nonTrophy) || 0}
          </div>
        </div>

        <div class="game-bottom">
          <div class="price">
            <span>
              WEEKLY:
              ${peso(game.weekly)}
            </span>

            <span>
              MONTHLY UNLI SWAP:
            </span>

            <span>
              🏆 Trophy: ₱800
            </span>

            <span>
              🎮 Non-Trophy: ₱700
            </span>
          </div>

          <button
            class="reserve-slot-button"
            type="button"
          >
            📝 Reserve Slot /
            Join Waiting List
          </button>
        </div>
      </div>
    `;

    const button =
      card.querySelector(
        ".reserve-slot-button"
      );

    if (button) {
      button.dataset.game =
        game.name;

      button.dataset.date =
        availableDate;
    }

    container.appendChild(card);
  });

  updateUpcomingCountdowns();
}

/* ==========================================
   UPCOMING RELEASE COUNTDOWN
   ========================================== */

function updateUpcomingCountdowns() {
  document
    .querySelectorAll(
      ".mega-countdown"
    )
    .forEach(element => {
      const raw =
        element.dataset.releaseDate || "";

      const target =
        new Date(raw).getTime();

      if (!Number.isFinite(target)) {
        element.textContent =
          "📅 Release date to be announced";
        return;
      }

      const diff =
        target - Date.now();

      if (diff <= 0) {
        element.textContent =
          "🎮 Release date reached — contact us to confirm availability";
        return;
      }

      const days =
        Math.floor(
          diff / 86400000
        );

      const hours =
        Math.floor(
          (diff % 86400000) /
          3600000
        );

      const minutes =
        Math.floor(
          (diff % 3600000) /
          60000
        );

      element.textContent =
        `⏳ ${days}d ${hours}h ` +
        `${minutes}m until release`;
    });
}

setInterval(
  updateUpcomingCountdowns,
  60000
);

/* ==========================================
   UPCOMING RESERVATION MODAL
   ========================================== */

function getSelectedUpcomingGame() {
  if (!Array.isArray(
    window.upcomingGames
  )) {
    return null;
  }

  return window.upcomingGames.find(
    game =>
      game.name ===
      selectedUpcomingGame
  ) || null;
}

function updateUpcomingPrice() {
  if (!upcomingReservationModal) {
    return;
  }

  let priceElement =
    document.getElementById(
      "upcomingRentalPrice"
    );

  if (!priceElement) {
    priceElement =
      document.createElement("div");

    priceElement.id =
      "upcomingRentalPrice";

    priceElement.style.cssText = `
      margin:12px 0;
      padding:12px;
      border:1px solid rgba(57,169,255,.35);
      border-radius:10px;
      text-align:center;
      font-weight:800;
      color:#79c8ff;
    `;

    const target =
      continueUpcomingReservation;

    if (target?.parentNode) {
      target.parentNode.insertBefore(
        priceElement,
        target
      );
    } else {
      return;
    }
  }

  const game =
    getSelectedUpcomingGame();

  const price = getRentalPrice(
    game,
    selectedUpcomingPeriod,
    selectedUpcomingAccount
  );

  priceElement.textContent =
    price === null
      ? "Select period and account type to see the price"
      : `Rental Price: ${peso(price)}`;
}

/* ==========================================
   OPEN UPCOMING RESERVATION
   ========================================== */

document.addEventListener(
  "click",
  event => {
    const button =
      event.target.closest(
        ".reserve-slot-button"
      );

    if (!button) return;

    selectedUpcomingGame =
      button.dataset.game || "";

    selectedUpcomingDate =
      button.dataset.date || "";

    selectedUpcomingAccount = "";
    selectedUpcomingPeriod = "";

    if (upcomingReservationGame) {
      upcomingReservationGame.textContent =
        selectedUpcomingGame;
    }

    const nameInput =
      document.getElementById(
        "upcomingReservationCustomerName"
      );

    if (nameInput) {
      nameInput.value = "";
    }

    document
      .querySelectorAll(
        "#upcomingReservationModal " +
        ".upcoming-account-option, " +
        "#upcomingReservationModal " +
        ".upcoming-period-option"
      )
      .forEach(b => {
        b.classList.remove("active");
      });

    updateUpcomingPrice();

    upcomingReservationModal
      ?.classList.add("active");
  }
);

/* ==========================================
   UPCOMING ACCOUNT SELECTION
   ========================================== */

document
  .querySelectorAll(
    "#upcomingReservationModal " +
    ".upcoming-account-option"
  )
  .forEach(button => {
    button.addEventListener(
      "click",
      () => {
        document
          .querySelectorAll(
            "#upcomingReservationModal " +
            ".upcoming-account-option"
          )
          .forEach(b => {
            b.classList.remove("active");
          });

        button.classList.add("active");

        selectedUpcomingAccount =
          button.dataset.account || "";

        updateUpcomingPrice();
      }
    );
  });

/* ==========================================
   UPCOMING PERIOD SELECTION
   ========================================== */

document
  .querySelectorAll(
    "#upcomingReservationModal " +
    ".upcoming-period-option"
  )
  .forEach(button => {
    button.addEventListener(
      "click",
      () => {
        document
          .querySelectorAll(
            "#upcomingReservationModal " +
            ".upcoming-period-option"
          )
          .forEach(b => {
            b.classList.remove("active");
          });

        button.classList.add("active");

        selectedUpcomingPeriod =
          button.dataset.period || "";

        updateUpcomingPrice();
      }
    );
  });

/* ==========================================
   CLOSE UPCOMING MODAL
   ========================================== */

document
  .getElementById(
    "closeUpcomingReservationModal"
  )
  ?.addEventListener(
    "click",
    () => {
      upcomingReservationModal
        ?.classList.remove("active");
    }
  );

upcomingReservationModal
  ?.addEventListener(
    "click",
    event => {
      if (
        event.target ===
        upcomingReservationModal
      ) {
        upcomingReservationModal
          .classList.remove("active");
      }
    }
  );

/* ==========================================
   UPCOMING RESERVATION SUBMISSION
   ========================================== */

if (continueUpcomingReservation) {
  continueUpcomingReservation.addEventListener(
    "click",
    async () => {
      const customerName =
        document.getElementById(
          "upcomingReservationCustomerName"
        )?.value.trim() || "";

      if (!customerName) {
        alert(
          "Please enter your First and Last Name."
        );
        return;
      }

      if (!selectedUpcomingPeriod) {
        alert(
          "Please choose 1 Week or 1 Month."
        );
        return;
      }

      if (!selectedUpcomingAccount) {
        alert(
          "Please choose Trophy or Non-Trophy."
        );
        return;
      }

      const game =
        getSelectedUpcomingGame();

      if (!game) {
        alert(
          "Unable to find this upcoming game. Please refresh the page."
        );
        return;
      }

      const price = getRentalPrice(
        game,
        selectedUpcomingPeriod,
        selectedUpcomingAccount
      );

      if (price === null) {
        alert(
          "Price is not available yet. Please contact our Facebook page."
        );
        return;
      }

      const rentalPeriod =
        rentalPeriodLabel(
          selectedUpcomingPeriod
        );

      const plan =
        rentalPlanLabel(
          selectedUpcomingPeriod
        );

      const accountType =
        accountLabel(
          selectedUpcomingAccount
        );

      const swapRules =
        rentalSwapRules(
          selectedUpcomingPeriod
        );

      if (
        typeof window.saveWaitingList !==
        "function"
      ) {
        alert(
          "Unable to save your reservation. Please try again."
        );
        return;
      }

      continueUpcomingReservation.disabled =
        true;

      let saved = false;

      try {
        saved =
          await window.saveWaitingList({
            gameId:
              game.id ||
              selectedUpcomingGame,
            gameName:
              selectedUpcomingGame,
            customerName,
            accountType,
            rentalPeriod
          });
      } catch (error) {
        console.error(
          "Upcoming reservation error:",
          error
        );
      } finally {
        continueUpcomingReservation.disabled =
          false;
      }

      if (!saved) {
        alert(
          "Unable to save your reservation. Please try again."
        );
        return;
      }

      const message =
`Hi JDigitalsRental! 🎮

I would like to reserve a slot / join the waiting list.

First and Last Name: ${customerName}
Game: ${selectedUpcomingGame}
Rental Period: ${rentalPeriod}
Rental Plan: ${plan}
Account Type: ${accountType}
Price: ${peso(price)}
Available Date: ${selectedUpcomingDate}

SWAP RULES:
${swapRules}

📌 My First and Last Name matches the name shown on my Facebook account.

Please let me know when a slot becomes available.

Thank you!`;

      upcomingReservationModal
        ?.classList.remove("active");

      showRentalFacebookReminder(
        message
      );
    }
  );
}

/* ==========================================
   UPCOMING GAMES AUTO SLIDER
   ========================================== */

let upcomingSlideTimer = null;

function startUpcomingAutoSlide() {
  const slider =
    document.getElementById(
      "upcomingGames"
    );

  if (!slider) return;

  if (upcomingSlideTimer) {
    clearInterval(
      upcomingSlideTimer
    );
  }

  let currentIndex = 0;

  upcomingSlideTimer =
    setInterval(() => {
      const cards =
        slider.querySelectorAll(
          ".upcoming-game-card"
        );

      if (cards.length <= 3) {
        return;
      }

      currentIndex++;

      if (
        currentIndex >= cards.length
      ) {
        currentIndex = 0;
      }

      const card =
        cards[currentIndex];

      slider.scrollTo({
        left:
          card.offsetLeft -
          slider.offsetLeft,
        behavior: "smooth"
      });
    }, 3500);
}

/* ==========================================
   SORT UPCOMING GAMES
   ========================================== */

function sortUpcomingGamesByDate() {
  if (
    !Array.isArray(
      window.upcomingGames
    )
  ) {
    return;
  }

  window.upcomingGames.sort(
    (a, b) => {
      const dateA =
        new Date(
          a.availableDate
        );

      const dateB =
        new Date(
          b.availableDate
        );

      const timeA =
        Number.isNaN(
          dateA.getTime()
        )
          ? Infinity
          : dateA.getTime();

      const timeB =
        Number.isNaN(
          dateB.getTime()
        )
          ? Infinity
          : dateB.getTime();

      return timeA - timeB;
    }
  );

  renderUpcomingGames();
}

/* ==========================================
   FIRESTORE EVENT LISTENERS
   ========================================== */

window.addEventListener(
  "upcomingGamesLoaded",
  () => {
    sortUpcomingGamesByDate();

    document
      .getElementById(
        "upcomingGames"
      )
      ?.scrollTo({
        left: 0,
        behavior: "auto"
      });

    setTimeout(
      startUpcomingAutoSlide,
      300
    );
  }
);

window.addEventListener(
  "waitingListCountsLoaded",
  () => {
    render();
    renderUpcomingGames();
  }
);

/* ==========================================
   INITIAL RENDER
   ========================================== */

render();

if (
  Array.isArray(
    window.firestoreGames
  )
) {
  loadFirestoreGames();
}

if (
  Array.isArray(
    window.upcomingGames
  )
) {
  sortUpcomingGamesByDate();

  setTimeout(
    startUpcomingAutoSlide,
    300
  );
}

/* ==========================================
   END OF APP.JS
   JDIGITALSRENTAL
   ========================================== */
