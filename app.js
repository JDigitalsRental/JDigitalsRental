
let games = [
  {
    name: 'Final Fantasy VII Rebirth',
    genre: 'RPG',
    type: 'rpg',
    meta: 'PS5 • Digital rental',
    weekly: 250,
    monthly: 500,
    image: 'assets/final-fantasy-vii-rebirth.jpg',
    status: 'available'
  },
  {
    name: 'The Witcher 3: Wild Hunt – Remastered',
    genre: 'Adventure',
    type: 'adventure',
    meta: 'PS5 • Digital rental',
    weekly: 250,
    monthly: 500,
    image: 'assets/the-witcher-3-remastered.jpg',
    status: 'available'
  },
  {
    name: 'Marvel’s Wolverine',
    genre: 'Action',
    type: 'action',
    meta: 'PS5 • Digital rental',
    weekly: 350,
    monthly: 700,
    image: 'assets/marvel-wolverine.jpg',
    status: 'currently-rented',
    trophyDate: 'September 23, 2026',
    nonTrophyDate: 'September 23, 2026'
  },
  {
    name: 'Onimusha: Way of the Sword',
    genre: 'Action',
    type: 'action',
    meta: 'PS5 • Digital rental',
    weekly: 350,
    monthly: 700,
    image: 'assets/onimusha-way-of-the-sword.jpg',
    status: 'currently-rented',
    trophyDate: 'September 25, 2026',
    nonTrophyDate: 'September 20, 2026'
  }
];

const grid = document.querySelector('#gameGrid');
const search = document.querySelector('#search');
const facebookUrl = 'https://www.facebook.com/share/1DajrF4mTy/';

let filter = 'all';
let selectedGame = null;
let selectedPeriod = null;
let selectedAccount = null;

// SLOT AVAILABILITY
// Explicit slot statuses are preferred.
// A future or past date alone does not prove availability.

function slotIsRented(game, type) {
  const key = type === 'trophy' ? 'trophy' : 'nonTrophy';

  const explicit =
    game[key + 'Status'] ??
    game[key + 'Rented'];

  if (typeof explicit === 'boolean') {
    return explicit;
  }

  if (typeof explicit === 'string') {
    const value = explicit.toLowerCase().trim();

    if ([
      'available',
      'available now',
      'vacant',
      'open',
      'false'
    ].includes(value)) {
      return false;
    }

    if ([
      'currently-rented',
      'currently rented',
      'rented',
      'occupied',
      'true'
    ].includes(value)) {
      return true;
    }
  }

  const date = game[key + 'Date'];

  if (
    typeof date === 'string' &&
    /^(available now|available|open)$/i.test(date.trim())
  ) {
    return false;
  }

  if (game.status === 'available') return false;

  return game.status === 'currently-rented';
}

function formatSlotDate(value) {
  if (
    !value ||
    /^(available now|available)$/i.test(String(value).trim())
  ) {
    return 'Available Now';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: '2-digit'
  });
}

function slotAvailabilityHtml(game, type, label, icon) {
  const rented = slotIsRented(game, type);

  const key =
    type === 'trophy' ? 'trophyDate' : 'nonTrophyDate';

  const dateText = rented
    ? formatSlotDate(game[key])
    : 'Available Now';

  const background = rented
    ? 'rgba(120,14,33,.35)'
    : 'rgba(0,115,65,.28)';

  const border = rented ? '#ff4768' : '#19d97c';
  const color = rented ? '#ff839a' : '#55f5a5';

  return `
    <div class="availability ${rented ? 'rented' : 'available'}"
      style="
        margin-bottom:6px;
        padding:8px;
        border:1px solid ${border};
        border-radius:9px;
        background:${background};
      ">
      <strong style="color:${color}">
        ${rented ? '🔴 CURRENTLY RENTED' : '🟢 AVAILABLE'}
      </strong>
      <div>${icon} ${label}: ${dateText}</div>
    </div>
  `;
}

// GAME LIBRARY

function render() {
  if (!grid) return;

  const q = search ? search.value.toLowerCase() : '';
  grid.innerHTML = '';

  const gameCount = document.querySelector('#gameCount');

  if (gameCount) {
    gameCount.textContent =
      games.length.toString().padStart(2, '0');
  }

  games
    .filter(g =>
      (filter === 'all' || g.type === filter) &&
      (g.name || '').toLowerCase().includes(q)
    )
    .forEach(g => {
      const card = document.createElement('article');
      card.className = 'game-card';

      const availability =
        slotAvailabilityHtml(g, 'trophy', 'Trophy', '🏆') +
        slotAvailabilityHtml(g, 'nonTrophy', 'Non-Trophy', '🎮');

      const allSlotsRented =
        slotIsRented(g, 'trophy') &&
        slotIsRented(g, 'nonTrophy');

      const counts =
        window.waitingListCounts?.[g.name] || {
          trophy: 0,
          nonTrophy: 0
        };

      const waitingCounters = `
        <div style="
          margin-top:6px;
          padding:6px 4px;
          border:1px solid rgba(57,169,255,.28);
          border-radius:7px;
          background:rgba(57,169,255,.06);
          font-size:8px;
          line-height:1.35;
          text-align:center;
        ">
          <div style="
            color:#8ea0c5;
            font-size:8px;
            font-weight:800;
            letter-spacing:.4px;
            margin-bottom:3px;
          ">
            WAITING LIST
          </div>
          <div style="
            color:#f7b84b;
            font-size:8px;
            font-weight:800;
            margin-bottom:2px;
          ">
            🏆 Trophy: ${counts.trophy}
          </div>
          <div style="
            color:#79c8ff;
            font-size:8px;
            font-weight:800;
          ">
            🎮 Non-Trophy: ${counts.nonTrophy}
          </div>
        </div>
      `;

      card.innerHTML = `
        <div class="cover-wrap">
          <img
            class="cover"
            src="${g.image}"
            alt="${g.name}"
            loading="lazy"
          >
          <span class="tag">
            ${(g.genre || 'GAME').toUpperCase()}
          </span>
        </div>

        <div class="game-info">
          <h3>${g.name}</h3>

          <div class="meta">
            ${g.meta || 'PS5 • Digital rental'}
          </div>

          ${availability}
          ${waitingCounters}

          <div class="game-bottom">
            <div class="price">
              <span>WEEKLY: ₱${g.weekly}</span>
              <span>MONTHLY: ₱${g.monthly}</span>
            </div>

            <button class="rent" type="button">
              ${allSlotsRented
                ? 'Join Waiting List ↗'
                : 'Rent Now ↗'}
            </button>
          </div>
        </div>
      `;

      card.querySelector('.rent')
        ?.addEventListener('click', () => {
          openRentalModal(g);
        });

      grid.appendChild(card);
    });
}

window.addEventListener('waitingListCountsLoaded', render);

// SEARCH AND FILTERS

document.querySelectorAll('.filter').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter').forEach(b => {
      b.classList.remove('active');
    });

    btn.classList.add('active');
    filter = btn.dataset.filter;
    render();
  });
});

if (search) {
  search.addEventListener('input', render);
}

// RENTAL MODAL

const rentalModal =
  document.getElementById('rentalModal');

const modalTitle =
  document.getElementById('modalTitle');

const modalPrice =
  document.getElementById('modalPrice');

const continueRental =
  document.getElementById('continueRental');

function updateRentalButton() {
  if (!continueRental || !selectedGame) return;

  if (!selectedAccount) {
    const bothRented =
      slotIsRented(selectedGame, 'trophy') &&
      slotIsRented(selectedGame, 'nonTrophy');

    continueRental.textContent = bothRented
      ? 'Join Waiting List'
      : 'Continue to Facebook';

    return;
  }

  continueRental.textContent =
    slotIsRented(selectedGame, selectedAccount)
      ? 'Join Waiting List'
      : 'Continue to Facebook';
}

function openRentalModal(g) {
  if (
    !rentalModal ||
    !modalTitle ||
    !modalPrice ||
    !continueRental
  ) {
    return;
  }

  selectedGame = g;
  selectedPeriod = null;
  selectedAccount = null;

  const bothRented =
    slotIsRented(g, 'trophy') &&
    slotIsRented(g, 'nonTrophy');

  modalTitle.textContent = bothRented
    ? `Join Waiting List — ${g.name}`
    : `Rent — ${g.name}`;

  modalPrice.textContent = '₱0';

  document
    .querySelectorAll('.period-option, .account-option')
    .forEach(btn => btn.classList.remove('active'));

  const nameInput =
    document.getElementById('rentalCustomerName');

  if (nameInput) nameInput.value = '';

  updateRentalButton();
  rentalModal.classList.add('active');
}

document.querySelectorAll('.period-option').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!selectedGame) return;

    document.querySelectorAll('.period-option')
      .forEach(b => b.classList.remove('active'));

    btn.classList.add('active');
    selectedPeriod = btn.dataset.period;

    const price = selectedPeriod === 'week'
      ? selectedGame.weekly
      : selectedGame.monthly;

    if (modalPrice) {
      modalPrice.textContent = `₱${price}`;
    }
  });
});

document.querySelectorAll('.account-option').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.account-option')
      .forEach(b => b.classList.remove('active'));

    btn.classList.add('active');
    selectedAccount = btn.dataset.account;

    updateRentalButton();
  });
});

function copyRentalMessage(message) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(message).catch(() => {});
  }
}

if (continueRental) {
  continueRental.addEventListener('click', async () => {
    if (!selectedGame) return;

    const customerName =
      document.getElementById('rentalCustomerName')
        ?.value.trim() || '';

    if (!customerName) {
      alert('Please enter your First and Last Name.');
      return;
    }

    if (!selectedPeriod) {
      alert('Please choose 1 Week or 1 Month.');
      return;
    }

    if (!selectedAccount) {
      alert('Please choose Trophy or Non-Trophy.');
      return;
    }

    const duration = selectedPeriod === 'week'
      ? '1 Week'
      : '1 Month';

    const price = selectedPeriod === 'week'
      ? selectedGame.weekly
      : selectedGame.monthly;

    const accountType = selectedAccount === 'trophy'
      ? 'Trophy'
      : 'Non-Trophy';

    const isWaitingList =
      slotIsRented(selectedGame, selectedAccount);

    if (isWaitingList) {
      if (!window.saveWaitingList) {
        alert('Unable to save your waiting list request. Please try again.');
        return;
      }

      const saved = await window.saveWaitingList({
        gameId: selectedGame.id || selectedGame.name,
        gameName: selectedGame.name,
        customerName,
        accountType,
        rentalPeriod: duration
      });

      if (!saved) {
        alert('Unable to save your waiting list request. Please try again.');
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
Price: ₱${price}

📌 My name matches the name shown on my Facebook account.

Please let me know when a slot becomes available.

Thank you!`
      : `Hi JDigitalsRental! 🎮

I would like to rent this game.

First and Last Name: ${customerName}
Game: ${selectedGame.name}
Rental Period: ${duration}
Account Type: ${accountType}
Price: ₱${price}

📌 My name matches the name shown on my Facebook account.

Thank you!`;

    copyRentalMessage(message);

    alert(isWaitingList
      ? 'You have been added to the waiting list! 🎮\n\nContinue to Facebook and paste the message in Messenger.'
      : 'Your rental details have been copied! 🎮\n\nContinue to Facebook and paste the message in Messenger.'
    );

    window.open(
      facebookUrl,
      '_blank',
      'noopener,noreferrer'
    );

    rentalModal.classList.remove('active');
  });
}

document.getElementById('closeRentalModal')
  ?.addEventListener('click', () => {
    rentalModal?.classList.remove('active');
  });

rentalModal?.addEventListener('click', event => {
  if (event.target === rentalModal) {
    rentalModal.classList.remove('active');
  }
});

// FIRESTORE GAME LIBRARY

function loadFirestoreGames() {
  if (Array.isArray(window.firestoreGames)) {
    games = window.firestoreGames;
    render();
  }
}

window.addEventListener(
  'firestoreGamesLoaded',
  loadFirestoreGames
);

// UPCOMING GAMES

function renderUpcomingGames() {
  const container =
    document.getElementById('upcomingGames');

  if (!container) return;

  const upcomingGames =
    Array.isArray(window.upcomingGames)
      ? window.upcomingGames
      : [];

  const waitingCounts = window.waitingListCounts || {};

  container.innerHTML = '';

  if (upcomingGames.length === 0) {
    container.innerHTML = `
      <p class="empty-upcoming">
        No upcoming games at the moment. 🎮
      </p>
    `;
    return;
  }

  upcomingGames.forEach(game => {
    const card = document.createElement('article');
    card.className = 'game-card upcoming-game-card';

    const availableDate =
      game.availableDate || 'Date to be announced';

    const counts = waitingCounts[game.name] || {
      trophy: 0,
      nonTrophy: 0
    };

    card.innerHTML = `
      <div class="cover-wrap">
        <img
          class="cover"
          src="${game.image}"
          alt="${game.name}"
          loading="lazy"
        >
        <span class="badge upcoming-badge">
          COMING SOON
        </span>
      </div>

      <div class="game-info">
        <h3>${game.name}</h3>

        <div class="meta">
          ${game.meta || 'PS5 • Digital rental'}
        </div>

        <div class="availability upcoming-availability">
          <strong>📅 AVAILABLE FOR RENT</strong>
          <div>${availableDate}</div>
        </div>

        <div class="availability waiting-list-count">
          <strong>WAITING LIST</strong>
          <div>🏆 Trophy: ${counts.trophy}</div>
          <div>🎮 Non-Trophy: ${counts.nonTrophy}</div>
        </div>

        <div class="game-bottom">
          <div class="price">
            <span>WEEKLY<br>₱${game.weekly}</span>
            <span>MONTHLY<br>₱${game.monthly}</span>
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

    const button =
      card.querySelector('.reserve-slot-button');

    button.dataset.game = game.name;
    button.dataset.date = availableDate;

    container.appendChild(card);
  });
}

window.addEventListener(
  'upcomingGamesLoaded',
  renderUpcomingGames
);

window.addEventListener(
  'waitingListCountsLoaded',
  renderUpcomingGames
);

// UPCOMING RESERVATION MODAL

const upcomingReservationModal =
  document.getElementById('upcomingReservationModal');

const upcomingReservationGame =
  document.getElementById('upcomingReservationGame');

const continueUpcomingReservation =
  document.getElementById('continueUpcomingReservation');

let selectedUpcomingGame = '';
let selectedUpcomingDate = '';
let selectedUpcomingAccount = '';
let selectedUpcomingPeriod = '';

document.addEventListener('click', event => {
  const button =
    event.target.closest('.reserve-slot-button');

  if (!button) return;

  selectedUpcomingGame = button.dataset.game || '';
  selectedUpcomingDate = button.dataset.date || '';
  selectedUpcomingAccount = '';
  selectedUpcomingPeriod = '';

  if (upcomingReservationGame) {
    upcomingReservationGame.textContent =
      selectedUpcomingGame;
  }

  const nameInput =
    document.getElementById('upcomingReservationCustomerName');

  if (nameInput) nameInput.value = '';

  document.querySelectorAll(
    '.upcoming-account-option, .upcoming-period-option'
  ).forEach(btn => btn.classList.remove('active'));

  upcomingReservationModal?.classList.add('active');
});

document.querySelectorAll('.upcoming-account-option')
  .forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.upcoming-account-option')
        .forEach(b => b.classList.remove('active'));

      btn.classList.add('active');
      selectedUpcomingAccount = btn.dataset.account;
    });
  });

document.querySelectorAll('.upcoming-period-option')
  .forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.upcoming-period-option')
        .forEach(b => b.classList.remove('active'));

      btn.classList.add('active');
      selectedUpcomingPeriod = btn.dataset.period;
    });
  });

document.getElementById('closeUpcomingReservationModal')
  ?.addEventListener('click', () => {
    upcomingReservationModal?.classList.remove('active');
  });

upcomingReservationModal?.addEventListener('click', event => {
  if (event.target === upcomingReservationModal) {
    upcomingReservationModal.classList.remove('active');
  }
});

if (continueUpcomingReservation) {
  continueUpcomingReservation.addEventListener(
    'click',
    async () => {
      const customerName =
        document.getElementById('upcomingReservationCustomerName')
          ?.value.trim() || '';

      if (!customerName) {
        alert('Please enter your First and Last Name.');
        return;
      }

      if (!selectedUpcomingPeriod) {
        alert('Please choose 1 Week or 1 Month.');
        return;
      }

      if (!selectedUpcomingAccount) {
        alert('Please choose Trophy or Non-Trophy.');
        return;
      }

      const rentalPeriod =
        selectedUpcomingPeriod === 'week'
          ? '1 Week'
          : '1 Month';

      const accountType =
        selectedUpcomingAccount === 'trophy'
          ? 'Trophy'
          : 'Non-Trophy';

      if (!window.saveWaitingList) {
        alert('Unable to save your reservation. Please try again.');
        return;
      }

      const saved = await window.saveWaitingList({
        gameId: selectedUpcomingGame,
        gameName: selectedUpcomingGame,
        customerName,
        accountType,
        rentalPeriod
      });

      if (!saved) {
        alert('Unable to save your reservation. Please try again.');
        return;
      }

      const message = `Hi JDigitalsRental! 🎮

I would like to reserve a slot / join the waiting list.

First and Last Name: ${customerName}
Game: ${selectedUpcomingGame}
Rental Period: ${rentalPeriod}
Account Type: ${accountType}
Available Date: ${selectedUpcomingDate}

📌 I understand that my First and Last Name should match the name shown on my Facebook account so JDigitalsRental can easily find and contact me when it is my turn to rent.

Thank you!`;

      copyRentalMessage(message);

      alert(
        'Your reservation details have been copied! 🎮\n\n' +
        'Continue to Facebook and paste the message in Messenger.'
      );

      window.open(
        facebookUrl,
        '_blank',
        'noopener,noreferrer'
      );

      upcomingReservationModal?.classList.remove('active');
    }
  );
}

// INITIAL RENDER

render();

if (window.firestoreGames) {
  loadFirestoreGames();
}

if (window.upcomingGames) {
  renderUpcomingGames();
}

// UPCOMING AUTO SLIDE

let upcomingSlideTimer = null;

function startUpcomingAutoSlide() {
  const slider = document.getElementById('upcomingGames');

  if (!slider) return;

  if (upcomingSlideTimer) {
    clearInterval(upcomingSlideTimer);
  }

  let currentIndex = 0;

  upcomingSlideTimer = setInterval(() => {
    const cards =
      slider.querySelectorAll('.upcoming-game-card');

    if (cards.length <= 3) return;

    currentIndex++;

    if (currentIndex >= cards.length) {
      currentIndex = 0;
    }

    const card = cards[currentIndex];

    slider.scrollTo({
      left: card.offsetLeft - slider.offsetLeft,
      behavior: 'smooth'
    });
  }, 3500);
}

window.addEventListener(
  'upcomingGamesLoaded',
  () => setTimeout(startUpcomingAutoSlide, 300)
);

if (window.upcomingGames) {
  setTimeout(startUpcomingAutoSlide, 300);
}

// SORT UPCOMING GAMES

function sortUpcomingGamesByDate() {
  if (!Array.isArray(window.upcomingGames)) return;

  window.upcomingGames.sort((a, b) => {
    const dateA = new Date(a.availableDate);
    const dateB = new Date(b.availableDate);

    const timeA = Number.isNaN(dateA.getTime())
      ? Infinity
      : dateA.getTime();

    const timeB = Number.isNaN(dateB.getTime())
      ? Infinity
      : dateB.getTime();

    return timeA - timeB;
  });

  renderUpcomingGames();
}

window.addEventListener(
  'upcomingGamesLoaded',
  () => {
    sortUpcomingGamesByDate();

    document.getElementById('upcomingGames')
      ?.scrollTo({
        left: 0,
        behavior: 'auto'
      });
  }
);

if (window.upcomingGames) {
  sortUpcomingGamesByDate();
}
