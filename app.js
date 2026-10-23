
/* ==========================================
   JDIGITALSRENTAL — APP.JS
   Separate Trophy / Non-Trophy Prices
   ========================================== */

const FACEBOOK_URL =
  "https://www.facebook.com/share/1DajrF4mTy/";

const DEFAULT_PRICES = {
  weeklyTrophy: 350,
  weeklyNonTrophy: 300,
  monthlyTrophy: 800,
  monthlyNonTrophy: 700
};

let games = [
  {
    name: "Final Fantasy VII Rebirth",
    genre: "RPG",
    type: "rpg",
    meta: "PS5 • Digital rental",
    weekly: 250,
    image: "assets/final-fantasy-vii-rebirth.jpg",
    status: "available"
  },
  {
    name: "The Witcher 3: Wild Hunt – Remastered",
    genre: "Adventure",
    type: "adventure",
    meta: "PS5 • Digital rental",
    weekly: 250,
    image: "assets/the-witcher-3-remastered.jpg",
    status: "available"
  },
  {
    name: "Marvel’s Wolverine",
    genre: "Action",
    type: "action",
    meta: "PS5 • Digital rental",
    weekly: 350,
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
    image: "assets/onimusha-way-of-the-sword.jpg",
    status: "currently-rented",
    trophyDate: "September 25, 2026",
    nonTrophyDate: "September 20, 2026"
  }
];

const $ = id => document.getElementById(id);

const grid = $("gameGrid");
const search = $("search");
const rentalModal = $("rentalModal");
const modalTitle = $("modalTitle");
const modalPrice = $("modalPrice");
const continueRental = $("continueRental");

const upcomingModal = $("upcomingReservationModal");
const upcomingTitle = $("upcomingReservationGame");
const continueUpcoming = $("continueUpcomingReservation");

let selectedGame = null;
let selectedPeriod = "";
let selectedAccount = "";

let selectedUpcomingGame = null;
let selectedUpcomingPeriod = "";
let selectedUpcomingAccount = "";

let genreFilter = "all";
let availabilityFilter = "all";

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
   HELPERS
   ========================================== */

function money(value) {
  if (value === null || value === undefined) {
    return "Price TBA";
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? "₱" + number.toLocaleString("en-PH")
    : "Price TBA";
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizedAccount(account) {
  const value = String(account || "")
    .toLowerCase()
    .replace(/[\s_-]/g, "");

  return value === "trophy"
    ? "trophy"
    : value === "nontrophy"
      ? "nonTrophy"
      : "";
}

function normalizedPeriod(period) {
  return period === "week"
    ? "week"
    : period === "month" || period === "monthly"
      ? "month"
      : "";
}

function accountLabel(account) {
  return normalizedAccount(account) === "trophy"
    ? "Trophy"
    : "Non-Trophy";
}

function periodLabel(period) {
  return normalizedPeriod(period) === "week"
    ? "1 Week"
    : "1 Month";
}

function planLabel(period) {
  return normalizedPeriod(period) === "week"
    ? "Regular Weekly Rental"
    : "Monthly UNLI SWAP";
}

function swapRules(period) {
  return normalizedPeriod(period) === "week"
    ? "Includes 1 game swap during the rental period. One game at a time, subject to availability."
    : "Unlimited game swaps, maximum 1 swap per week. One game at a time, subject to availability.";
}

/* ==========================================
   ADMIN-CONTROLLED PRICES
   ========================================== */

function gamePrices(game) {
  const legacyWeekly = Number(game?.weekly);

  const trophyWeeklyFallback =
    Number.isFinite(legacyWeekly) &&
    legacyWeekly > 0
      ? legacyWeekly
      : DEFAULT_PRICES.weeklyTrophy;

  return {
    weeklyTrophy: Number(
      game?.weeklyTrophy ??
      trophyWeeklyFallback
    ),

    weeklyNonTrophy: Number(
      game?.weeklyNonTrophy ??
      DEFAULT_PRICES.weeklyNonTrophy
    ),

    monthlyTrophy: Number(
      game?.monthlyTrophy ??
      DEFAULT_PRICES.monthlyTrophy
    ),

    monthlyNonTrophy: Number(
      game?.monthlyNonTrophy ??
      DEFAULT_PRICES.monthlyNonTrophy
    )
  };
}

function getRentalPrice(game, period, account) {
  if (!game || !period || !account) {
    return null;
  }

  const type = normalizedAccount(account);
  const duration = normalizedPeriod(period);
  const prices = gamePrices(game);

  if (duration === "week") {
    if (type === "trophy") {
      return prices.weeklyTrophy;
    }

    if (type === "nonTrophy") {
      return prices.weeklyNonTrophy;
    }
  }

  if (duration === "month") {
    if (type === "trophy") {
      return prices.monthlyTrophy;
    }

    if (type === "nonTrophy") {
      return prices.monthlyNonTrophy;
    }
  }

  return null;
}

/* ==========================================
   AVAILABILITY
   ========================================== */

function slotIsRented(game, account) {
  if (!game) return false;

  const type = normalizedAccount(account);

  if (!type) return false;

  const statusKey =
    type === "trophy"
      ? "trophyStatus"
      : "nonTrophyStatus";

  const rentedKey =
    type === "trophy"
      ? "trophyRented"
      : "nonTrophyRented";

  const dateKey =
    type === "trophy"
      ? "trophyDate"
      : "nonTrophyDate";

  const explicit =
    game[statusKey] ?? game[rentedKey];

  if (typeof explicit === "boolean") {
    return explicit;
  }

  if (typeof explicit === "string") {
    const value = explicit
      .toLowerCase()
      .trim();

    if (
      ["available", "available now", "false", "open"]
        .includes(value)
    ) {
      return false;
    }

    if (
      ["rented", "currently rented", "currently-rented", "true"]
        .includes(value)
    ) {
      return true;
    }
  }

  if (
    /^(available now|available)$/i.test(
      String(game[dateKey] || "").trim()
    )
  ) {
    return false;
  }

  return game.status === "currently-rented";
}

function slotIsDueForReturn(game, account) {
  if (!slotIsRented(game, account)) return false;

  const type = normalizedAccount(account);
  if (!type) return false;

  const raw = type === "trophy"
    ? game.trophyDate
    : game.nonTrophyDate;

  if (!raw || /available now/i.test(String(raw))) return false;

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return date <= today;
}

function availabilityHTML(game, account) {
  const rented = slotIsRented(game, account);
  const due = rented && slotIsDueForReturn(game, account);
  const trophy = normalizedAccount(account) === "trophy";
  const date = trophy ? game.trophyDate : game.nonTrophyDate;
  const label = trophy ? "🏆 Trophy" : "🎮 Non-Trophy";
  const border = due ? "#eabf42" : rented ? "#ff4768" : "#19d97c";
  const background = due ? "rgba(120,87,14,.35)" : rented
    ? "rgba(120,14,33,.35)" : "rgba(0,115,65,.28)";
  const color = due ? "#ffe18a" : rented ? "#ff839a" : "#55f5a5";
  const status = due ? "🟡 DUE FOR RETURN" : rented
    ? "🔴 CURRENTLY RENTED" : "🟢 AVAILABLE";

  return `
    <div class="availability ${rented ? "rented" : "available"}"
      style="margin-bottom:6px;padding:9px;border-radius:9px;
      border:1px solid ${border};background:${background};">
      <strong style="color:${color}">${status}</strong>
      <div>${label}: ${escapeHTML(rented ? (date || "Date TBA") : "Available Now")}</div>
      ${due ? '<div style="font-size:11px;color:#ffe18a">Awaiting confirmed return — Join Waiting List</div>' : ''}
    </div>
  `;
}

/* ==========================================
   GAME LIBRARY
   ========================================== */

function render() {
  if (!grid) return;

  const query = (search?.value || "")
    .toLowerCase()
    .trim();

  const filtered = games.filter(game => {
    if (
      genreFilter !== "all" &&
      game.type !== genreFilter
    ) {
      return false;
    }

    if (
      !String(game.name || "")
        .toLowerCase()
        .includes(query)
    ) {
      return false;
    }

    const trophyAvailable =
      !slotIsRented(game, "trophy");

    const nonTrophyAvailable =
      !slotIsRented(game, "nonTrophy");

    switch (availabilityFilter) {
      case "available":
        return trophyAvailable || nonTrophyAvailable;

      case "trophy":
        return trophyAvailable;

      case "nonTrophy":
        return nonTrophyAvailable;

      case "favorites":
        return favoriteGames.has(game.name);

      default:
        return true;
    }
  });

  if ($("gameCount")) {
    $("gameCount").textContent =
      String(games.length).padStart(2, "0");
  }

  if ($("libraryResultCount")) {
    $("libraryResultCount").textContent =
      `${filtered.length} game${filtered.length === 1 ? "" : "s"} found`;
  }

  grid.innerHTML = "";

  if (!filtered.length) {
    grid.innerHTML = `
      <p class="mega-empty">
        No games match your filters.
      </p>
    `;
  }

  filtered.forEach(game => {
    const p = gamePrices(game);

    const trophyRented =
      slotIsRented(game, "trophy");

    const nonTrophyRented =
      slotIsRented(game, "nonTrophy");

    const bothRented =
      trophyRented && nonTrophyRented;

    const counts =
      window.waitingListCounts?.[game.name] || {};

    const isFavorite =
      favoriteGames.has(game.name);

    const card = document.createElement("article");
    card.className = "game-card";

    card.innerHTML = `
      <div class="cover-wrap">
        <img
          class="cover"
          src="${escapeHTML(game.image || "")}"
          alt="${escapeHTML(game.name)}"
          loading="lazy"
        >

        <span class="tag">
          ${escapeHTML((game.genre || "GAME").toUpperCase())}
        </span>

        <button
          class="mega-favorite ${isFavorite ? "is-favorite" : ""}"
          type="button"
          aria-label="Toggle favorite"
        >
          ${isFavorite ? "♥" : "♡"}
        </button>
      </div>

      <div class="game-info">
        <h3>${escapeHTML(game.name)}</h3>

        <div class="meta">
          ${escapeHTML(game.meta || "PS5 • Digital rental")}
        </div>

        ${availabilityHTML(game, "trophy")}
        ${availabilityHTML(game, "nonTrophy")}

        <div
          style="
            margin:8px 0;
            padding:10px;
            border:1px solid rgba(57,169,255,.3);
            border-radius:9px;
            text-align:center;
            font-size:12px;
          "
        >
          <strong>WAITING LIST</strong>
          <div>🏆 Trophy: ${Number(counts.trophy) || 0}</div>
          <div>🎮 Non-Trophy: ${Number(counts.nonTrophy) || 0}</div>
        </div>

        <div class="mega-savings">
          🔄 Weekly: 1 game swap
          <br>
          ♾️ Monthly: UNLI SWAP (max 1/week)
        </div>

        <div class="game-bottom">
          <div class="price">
            <span>📅 WEEKLY</span>
            <span>🏆 Trophy: ${money(p.weeklyTrophy)}</span>
            <span>🎮 Non-Trophy: ${money(p.weeklyNonTrophy)}</span>

            <span>♾️ MONTHLY UNLI SWAP</span>
            <span>🏆 Trophy: ${money(p.monthlyTrophy)}</span>
            <span>🎮 Non-Trophy: ${money(p.monthlyNonTrophy)}</span>
          </div>

          <button class="rent" type="button">
            ${bothRented ? "Join Waiting List ↗" : "Rent Now ↗"}
          </button>
        </div>
      </div>
    `;

    card.querySelector(".rent")
      .addEventListener("click", () => {
        openRentalModal(game);
      });

    card.querySelector(".mega-favorite")
      .addEventListener("click", () => {
        if (favoriteGames.has(game.name)) {
          favoriteGames.delete(game.name);
        } else {
          favoriteGames.add(game.name);
        }

        try {
          localStorage.setItem(
            "jdrFavorites",
            JSON.stringify([...favoriteGames])
          );
        } catch (error) {}

        render();
      });

    grid.appendChild(card);
  });

  renderFeaturedGames();
}

function renderFeaturedGames() {
  const container = $("featuredGames");
  if (!container) return;

  const counts = window.waitingListCounts || {};

  const popular = games
    .map(game => ({
      name: game.name,
      count:
        Number(counts[game.name]?.trophy || 0) +
        Number(counts[game.name]?.nonTrophy || 0)
    }))
    .filter(game => game.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  container.innerHTML = "";

  if (!popular.length) return;

  const heading = document.createElement("div");
  heading.className = "mega-featured-heading";
  heading.textContent = "🔥 MOST REQUESTED";
  container.appendChild(heading);

  const tags = document.createElement("div");
  tags.className = "mega-featured-tags";

  popular.forEach(game => {
    const tag = document.createElement("span");
    tag.textContent = `${game.name} · ${game.count} waiting`;
    tags.appendChild(tag);
  });

  container.appendChild(tags);
}

/* ==========================================
   SEARCH / FILTERS
   ========================================== */

search?.addEventListener("input", render);

document.querySelectorAll(".filter").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".filter")
      .forEach(b => b.classList.remove("active"));

    button.classList.add("active");
    genreFilter = button.dataset.filter || "all";
    render();
  });
});

document.querySelectorAll("[data-availability]")
  .forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-availability]")
        .forEach(b => b.classList.remove("active"));

      button.classList.add("active");
      availabilityFilter =
        button.dataset.availability || "all";

      render();
    });
  });

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
      : money(price);
}

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
    : "Continue to Facebook";
}

function openRentalModal(game) {
  if (!rentalModal) return;

  selectedGame = game;
  selectedPeriod = "";
  selectedAccount = "";

  if (modalTitle) {
    modalTitle.textContent = `Rent — ${game.name}`;
  }

  if ($("rentalCustomerName")) {
    $("rentalCustomerName").value = "";
  }

  document.querySelectorAll(
    "#rentalModal .period-option, #rentalModal .account-option"
  ).forEach(button => button.classList.remove("active"));

  updateRentalPrice();
  updateRentalButton();
  rentalModal.classList.add("active");
}

document.querySelectorAll("#rentalModal .period-option")
  .forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll("#rentalModal .period-option")
        .forEach(b => b.classList.remove("active"));

      button.classList.add("active");
      selectedPeriod = button.dataset.period || "";

      updateRentalPrice();
      updateRentalButton();
    });
  });

document.querySelectorAll("#rentalModal .account-option")
  .forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll("#rentalModal .account-option")
        .forEach(b => b.classList.remove("active"));

      button.classList.add("active");
      selectedAccount = button.dataset.account || "";

      updateRentalPrice();
      updateRentalButton();
    });
  });

function showFacebookReminder(message) {
  if (typeof window.showFacebookReminder === "function") {
    window.showFacebookReminder(message);
    return;
  }

  alert(
    "Your form is ready. Please send your details to our Facebook Page."
  );

  window.open(FACEBOOK_URL, "_blank", "noopener,noreferrer");
}

continueRental?.addEventListener("click", async () => {
  if (!selectedGame) return;

  const customerName =
    $("rentalCustomerName")?.value.trim() || "";

  if (!customerName) {
    alert("Please enter your First and Last Name.");
    return;
  }

  if (!selectedPeriod) {
    alert("Please choose a rental period.");
    return;
  }

  if (!selectedAccount) {
    alert("Please choose Trophy or Non-Trophy.");
    return;
  }

  const price = getRentalPrice(
    selectedGame,
    selectedPeriod,
    selectedAccount
  );

  if (price === null) {
    alert("Price unavailable. Please contact our Facebook Page.");
    return;
  }

  const waiting = slotIsRented(
    selectedGame,
    selectedAccount
  );

  if (waiting) {
    if (typeof window.saveWaitingList !== "function") {
      alert("Waiting list is unavailable. Please try again.");
      return;
    }

    continueRental.disabled = true;

    let saved = false;

    try {
      saved = await window.saveWaitingList({
        gameId: selectedGame.id || selectedGame.name,
        gameName: selectedGame.name,
        customerName,
        accountType: accountLabel(selectedAccount),
        rentalPeriod: periodLabel(selectedPeriod)
      });
    } catch (error) {
      console.error(error);
    } finally {
      continueRental.disabled = false;
    }

    if (!saved) {
      alert("Unable to save waiting list request.");
      return;
    }
  }

  const message = `Hi JDigitalsRental! 🎮

${waiting
  ? "I would like to join the waiting list."
  : "I would like to rent a game."}

First and Last Name: ${customerName}
Game: ${selectedGame.name}
Rental Period: ${periodLabel(selectedPeriod)}
Rental Plan: ${planLabel(selectedPeriod)}
Account Type: ${accountLabel(selectedAccount)}
Price: ${money(price)}

SWAP RULES:
${swapRules(selectedPeriod)}

📌 My name matches the name on my Facebook account.

${waiting
  ? "Please let me know when a slot becomes available."
  : "Please let me know how to proceed with my rental."}

Thank you!`;

  rentalModal.classList.remove("active");
  showFacebookReminder(message);
});

$("closeRentalModal")?.addEventListener("click", () => {
  rentalModal?.classList.remove("active");
});

rentalModal?.addEventListener("click", event => {
  if (event.target === rentalModal) {
    rentalModal.classList.remove("active");
  }
});

/* ==========================================
   UPCOMING GAMES
   ========================================== */

function getUpcomingGames() {
  return Array.isArray(window.upcomingGames)
    ? window.upcomingGames
    : [];
}

function renderUpcomingGames() {
  const container = $("upcomingGames");
  if (!container) return;

  const upcoming = [...getUpcomingGames()].sort((a, b) => {
    const dateA = new Date(a.availableDate).getTime();
    const dateB = new Date(b.availableDate).getTime();

    return (Number.isFinite(dateA) ? dateA : Infinity) -
      (Number.isFinite(dateB) ? dateB : Infinity);
  });

  container.innerHTML = "";

  if (!upcoming.length) {
    container.innerHTML =
      '<p class="empty-upcoming">No upcoming games at the moment. 🎮</p>';
    return;
  }

  upcoming.forEach(game => {
    const p = gamePrices(game);
    const counts =
      window.waitingListCounts?.[game.name] || {};

    const card = document.createElement("article");
    card.className = "game-card upcoming-game-card";

    card.innerHTML = `
      <div class="cover-wrap">
        <img
          class="cover"
          src="${escapeHTML(game.image || "")}"
          alt="${escapeHTML(game.name)}"
          loading="lazy"
        >
        <span class="tag">COMING SOON</span>
      </div>

      <div class="game-info">
        <h3>${escapeHTML(game.name)}</h3>

        <div class="meta">
          ${escapeHTML(game.meta || "PS5 • Digital rental")}
        </div>

        <div class="availability upcoming-availability">
          <strong>📅 AVAILABLE FOR RENT</strong>
          <div>${escapeHTML(game.availableDate || "Date TBA")}</div>
          <div
            class="mega-countdown"
            data-release-date="${escapeHTML(game.availableDate || "")}"
          ></div>
        </div>

        <div class="availability waiting-list-count">
          <strong>WAITING LIST</strong>
          <div>🏆 Trophy: ${Number(counts.trophy) || 0}</div>
          <div>🎮 Non-Trophy: ${Number(counts.nonTrophy) || 0}</div>
        </div>

        <div class="game-bottom">
          <div class="price">
            <span>📅 WEEKLY</span>
            <span>🏆 Trophy: ${money(p.weeklyTrophy)}</span>
            <span>🎮 Non-Trophy: ${money(p.weeklyNonTrophy)}</span>

            <span>♾️ MONTHLY UNLI SWAP</span>
            <span>🏆 Trophy: ${money(p.monthlyTrophy)}</span>
            <span>🎮 Non-Trophy: ${money(p.monthlyNonTrophy)}</span>
          </div>

          <button class="reserve-slot-button" type="button">
            📝 Reserve Slot / Join Waiting List
          </button>
        </div>
      </div>
    `;

    card.querySelector(".reserve-slot-button")
      .addEventListener("click", () => {
        openUpcomingModal(game);
      });

    container.appendChild(card);
  });

  updateUpcomingCountdowns();
}

function updateUpcomingCountdowns() {
  document.querySelectorAll(".mega-countdown")
    .forEach(element => {
      const target = new Date(
        element.dataset.releaseDate || ""
      ).getTime();

      if (!Number.isFinite(target)) {
        element.textContent = "📅 Date TBA";
        return;
      }

      const difference = target - Date.now();

      if (difference <= 0) {
        element.textContent =
          "🎮 Release date reached — confirm availability";
        return;
      }

      const days = Math.floor(difference / 86400000);
      const hours = Math.floor(
        (difference % 86400000) / 3600000
      );

      element.textContent =
        `⏳ ${days}d ${hours}h until release`;
    });
}

setInterval(updateUpcomingCountdowns, 60000);

/* ==========================================
   UPCOMING RESERVATION MODAL
   ========================================== */

function updateUpcomingPrice() {
  if (!upcomingModal) return;

  let element = $("upcomingRentalPrice");

  if (!element) {
    element = document.createElement("div");
    element.id = "upcomingRentalPrice";

    element.style.cssText = `
      padding:12px;
      margin:12px 0;
      border:1px solid rgba(57,169,255,.35);
      border-radius:10px;
      text-align:center;
      color:#79c8ff;
      font-weight:bold;
    `;

    continueUpcoming?.parentNode?.insertBefore(
      element,
      continueUpcoming
    );
  }

  const price = getRentalPrice(
    selectedUpcomingGame,
    selectedUpcomingPeriod,
    selectedUpcomingAccount
  );

  element.textContent = price === null
    ? "Select rental period and account type"
    : `Rental Price: ${money(price)}`;
}

function openUpcomingModal(game) {
  if (!upcomingModal) return;

  selectedUpcomingGame = game;
  selectedUpcomingPeriod = "";
  selectedUpcomingAccount = "";

  if (upcomingTitle) {
    upcomingTitle.textContent = game.name;
  }

  if ($("upcomingReservationCustomerName")) {
    $("upcomingReservationCustomerName").value = "";
  }

  document.querySelectorAll(
    "#upcomingReservationModal .upcoming-period-option, " +
    "#upcomingReservationModal .upcoming-account-option"
  ).forEach(button => button.classList.remove("active"));

  updateUpcomingPrice();
  upcomingModal.classList.add("active");
}

document.querySelectorAll(
  "#upcomingReservationModal .upcoming-period-option"
).forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(
      "#upcomingReservationModal .upcoming-period-option"
    ).forEach(b => b.classList.remove("active"));

    button.classList.add("active");
    selectedUpcomingPeriod = button.dataset.period || "";
    updateUpcomingPrice();
  });
});

document.querySelectorAll(
  "#upcomingReservationModal .upcoming-account-option"
).forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(
      "#upcomingReservationModal .upcoming-account-option"
    ).forEach(b => b.classList.remove("active"));

    button.classList.add("active");
    selectedUpcomingAccount = button.dataset.account || "";
    updateUpcomingPrice();
  });
});

continueUpcoming?.addEventListener("click", async () => {
  const game = selectedUpcomingGame;
  if (!game) return;

  const customerName =
    $("upcomingReservationCustomerName")?.value.trim() || "";

  if (!customerName) {
    alert("Please enter your First and Last Name.");
    return;
  }

  if (!selectedUpcomingPeriod || !selectedUpcomingAccount) {
    alert("Please select rental period and account type.");
    return;
  }

  const price = getRentalPrice(
    game,
    selectedUpcomingPeriod,
    selectedUpcomingAccount
  );

  if (price === null) {
    alert("Price unavailable. Please contact our page.");
    return;
  }

  if (typeof window.saveWaitingList !== "function") {
    alert("Reservation system is unavailable.");
    return;
  }

  continueUpcoming.disabled = true;

  let saved = false;

  try {
    saved = await window.saveWaitingList({
      gameId: game.id || game.name,
      gameName: game.name,
      customerName,
      accountType: accountLabel(selectedUpcomingAccount),
      rentalPeriod: periodLabel(selectedUpcomingPeriod)
    });
  } catch (error) {
    console.error(error);
  } finally {
    continueUpcoming.disabled = false;
  }

  if (!saved) {
    alert("Unable to save your reservation.");
    return;
  }

  const message = `Hi JDigitalsRental! 🎮

I would like to reserve a slot / join the waiting list.

First and Last Name: ${customerName}
Game: ${game.name}
Rental Period: ${periodLabel(selectedUpcomingPeriod)}
Rental Plan: ${planLabel(selectedUpcomingPeriod)}
Account Type: ${accountLabel(selectedUpcomingAccount)}
Price: ${money(price)}
Available Date: ${game.availableDate || "Date TBA"}

SWAP RULES:
${swapRules(selectedUpcomingPeriod)}

📌 My name matches the name on my Facebook account.

Please let me know when a slot becomes available.

Thank you!`;

  upcomingModal.classList.remove("active");
  showFacebookReminder(message);
});

$("closeUpcomingReservationModal")?.addEventListener(
  "click",
  () => upcomingModal?.classList.remove("active")
);

upcomingModal?.addEventListener("click", event => {
  if (event.target === upcomingModal) {
    upcomingModal.classList.remove("active");
  }
});

/* ==========================================
   UPCOMING AUTO SLIDER
   ========================================== */

let upcomingSlideTimer = null;

function startUpcomingAutoSlide() {
  const slider = $("upcomingGames");
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

    currentIndex = (currentIndex + 1) % cards.length;

    slider.scrollTo({
      left:
        cards[currentIndex].offsetLeft -
        slider.offsetLeft,
      behavior: "smooth"
    });
  }, 3500);
}

/* ==========================================
   FIREBASE EVENT CONNECTION
   ========================================== */

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
  "upcomingGamesLoaded",
  () => {
    renderUpcomingGames();
    startUpcomingAutoSlide();
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
   INITIAL LOAD
   ========================================== */

render();

if (Array.isArray(window.firestoreGames)) {
  loadFirestoreGames();
}

if (Array.isArray(window.upcomingGames)) {
  renderUpcomingGames();
  startUpcomingAutoSlide();
}

/* ==========================================
   END — JDIGITALSRENTAL
   ========================================== */


/* ==========================================
   JDIGITALSRENTAL — FACEBOOK NOTICE POPUP
   ========================================== */

window.showFacebookReminder = function(message) {
  let notice = document.getElementById("facebookNoticePopup");

  if (!notice) {
    notice = document.createElement("div");
    notice.id = "facebookNoticePopup";

    notice.innerHTML = `
      <div class="jdr-notice-card">
        <div class="jdr-notice-icon">💬</div>

        <h2>One Last Step!</h2>

        <p>
          Thank you for choosing
          <strong>JDigitalsRental!</strong> 🎮
        </p>

        <p>
          Please message our Facebook Page to
          confirm your rental or reservation.
        </p>

        <div class="jdr-notice-reminder">
          ⚠️ Your rental or reservation is not yet
          confirmed until we respond on Facebook.
        </div>

        <button id="jdrCopyMessage" type="button">
          📋 Copy Rental Details
        </button>

        <a
          id="jdrGoFacebook"
          href="https://www.facebook.com/share/1DajrF4mTy/"
          target="_blank"
          rel="noopener noreferrer"
        >
          💬 Go to Facebook Page
        </a>

        <button id="jdrCloseNotice" type="button">
          Close
        </button>
      </div>
    `;

    const style = document.createElement("style");

    style.textContent = `
      #facebookNoticePopup {
        position: fixed;
        inset: 0;
        z-index: 999999;
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 18px;
        background: rgba(0, 5, 20, .9);
        backdrop-filter: blur(8px);
      }

      .jdr-notice-card {
        width: 100%;
        max-width: 420px;
        padding: 28px 22px;
        border: 1px solid #168cff;
        border-radius: 20px;
        background: linear-gradient(145deg, #0a2450, #020817);
        color: white;
        text-align: center;
        box-shadow: 0 20px 70px rgba(0,0,0,.6);
        font-family: Arial, sans-serif;
      }

      .jdr-notice-icon {
        font-size: 46px;
        margin-bottom: 12px;
      }

      .jdr-notice-card h2 {
        font-size: 25px;
        margin: 0 0 14px;
      }

      .jdr-notice-card p {
        color: #c5d5f1;
        line-height: 1.6;
        font-size: 14px;
      }

      .jdr-notice-reminder {
        padding: 13px;
        margin: 18px 0;
        background: rgba(255,193,7,.1);
        border: 1px solid #977722;
        border-radius: 10px;
        color: #ffe18a;
        font-size: 12px;
        line-height: 1.6;
      }

      #jdrCopyMessage,
      #jdrGoFacebook,
      #jdrCloseNotice {
        display: block;
        width: 100%;
        box-sizing: border-box;
        padding: 13px;
        margin-top: 10px;
        border-radius: 10px;
        font-weight: bold;
        font-size: 14px;
        text-decoration: none;
        cursor: pointer;
      }

      #jdrCopyMessage {
        background: #102c55;
        border: 1px solid #168cff;
        color: white;
      }

      #jdrGoFacebook {
        background: linear-gradient(135deg, #168cff, #0754d9);
        border: none;
        color: white;
      }

      #jdrCloseNotice {
        background: transparent;
        border: 1px solid #334d76;
        color: #a9bbd9;
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(notice);

    notice.querySelector("#jdrCloseNotice")
      .addEventListener("click", () => {
        notice.remove();
      });

    notice.addEventListener("click", event => {
      if (event.target === notice) {
        notice.remove();
      }
    });
  }

  notice.style.display = "flex";

  const copyButton =
    notice.querySelector("#jdrCopyMessage");

  copyButton.textContent = "📋 Copy Rental Details";

  copyButton.onclick = async () => {
    try {
      await navigator.clipboard.writeText(message);
      copyButton.textContent = "✅ Details Copied!";
    } catch (error) {
      const textArea = document.createElement("textarea");
      textArea.value = message;
      document.body.appendChild(textArea);
      textArea.select();
      const copied = document.execCommand("copy");
      textArea.remove();

      copyButton.textContent = copied
        ? "✅ Details Copied!"
        : "Please copy your details manually";
    }
  };
};
