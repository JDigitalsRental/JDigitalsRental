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

let filter = 'all';
let selectedGame = null;
let selectedPeriod = null;
let selectedAccount = null;

function render() {
  if (!grid) return;

  const q = search ? search.value.toLowerCase() : '';

  grid.innerHTML = '';

  const gameCount = document.querySelector('#gameCount');

  if (gameCount) {
    gameCount.textContent =
      `${games.length.toString().padStart(2, '0')} TITLES`;
  }

  games
    .filter(g =>
      (filter === 'all' || g.type === filter) &&
      (g.name || '').toLowerCase().includes(q)
    )
    .forEach(g => {
      const card = document.createElement('article');
      card.className = 'game-card';

      const formatShortDate = (dateValue) => {
  if (!dateValue || dateValue === 'Available Now') return '';

  const date = new Date(dateValue);

  if (isNaN(date.getTime())) return dateValue;

  return date.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: '2-digit'
  });
};

const availability =
  g.status === 'currently-rented'
    ? `
      <div class="availability rented">
        <strong>🔴 CURRENTLY RENTED</strong>
        <div>🏆 Trophy: ${formatShortDate(g.trophyDate)}</div>
        <div>🎮 Non-Trophy: ${formatShortDate(g.nonTrophyDate)}</div>
      </div>
    `
    : `
      <div class="availability available">
        <strong>🟢 AVAILABLE</strong>
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

          <div class="game-bottom">
            <div class="price">
              <span>WEEKLY: ₱${g.weekly}</span>
              <span>MONTHLY: ₱${g.monthly}</span>
            </div>

            <button class="rent" type="button">
              ${
                g.status === 'currently-rented'
                  ? 'Join Waiting List ↗'
                  : 'Rent Now ↗'
              }
            </button>
          </div>
        </div>
      `;

      const rentButton = card.querySelector('.rent');

      if (rentButton) {
        rentButton.addEventListener('click', () => {
          openRentalModal(g);
        });
      }

      grid.appendChild(card);
    });
}

/* FILTERS */

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

/* RENTAL MODAL */

const rentalModal =
  document.getElementById('rentalModal');

const modalTitle =
  document.getElementById('modalTitle');

const modalPrice =
  document.getElementById('modalPrice');

const continueRental =
  document.getElementById('continueRental');

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

  modalTitle.textContent =
    g.status === 'currently-rented'
      ? `Join Waiting List — ${g.name}`
      : `Rent — ${g.name}`;

  modalPrice.textContent = '₱0';

  document
    .querySelectorAll('.period-option, .account-option')
    .forEach(btn => {
      btn.classList.remove('active');
    });

  continueRental.textContent =
    g.status === 'currently-rented'
      ? 'Join Waiting List'
      : 'Continue to Facebook';

  rentalModal.classList.add('active');
}

document.querySelectorAll('.period-option').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!selectedGame) return;

    document.querySelectorAll('.period-option')
      .forEach(b => {
        b.classList.remove('active');
      });

    btn.classList.add('active');
    selectedPeriod = btn.dataset.period;

    const price =
      selectedPeriod === 'week'
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
      .forEach(b => {
        b.classList.remove('active');
      });

    btn.classList.add('active');
    selectedAccount = btn.dataset.account;
  });
});

if (continueRental) {
  continueRental.addEventListener('click', () => {
    if (
      !selectedGame ||
      !selectedPeriod ||
      !selectedAccount
    ) {
      alert(
        'Please choose rental period and account type.'
      );
      return;
    }

    const duration =
      selectedPeriod === 'week'
        ? '1 Week'
        : '1 Month';

    const price =
      selectedPeriod === 'week'
        ? selectedGame.weekly
        : selectedGame.monthly;

    const accountType =
      selectedAccount === 'trophy'
        ? 'Trophy'
        : 'Non-Trophy';

    const message =
      `${
        selectedGame.status === 'currently-rented'
          ? 'I want to join the waiting list for:'
          : 'I want to rent:'
      } ${selectedGame.name}\n` +
      `For how long: ${duration}\n` +
      `Trophy or Non-Trophy: ${accountType}\n` +
      `Price: ₱${price}`;

    navigator.clipboard
      .writeText(message)
      .catch(() => {});

    alert(
      message +
      '\n\nYour rental details have been copied. Paste them in Messenger. 😊'
    );

    window.open(
      'https://www.facebook.com/share/1DajrF4mTy/',
      '_blank',
      'noopener,noreferrer'
    );
  });
}

if (rentalModal) {
  rentalModal.addEventListener('click', e => {
    if (e.target === rentalModal) {
      rentalModal.classList.remove('active');
    }
  });
}

/* FIRESTORE RENTAL GAMES */

function loadFirestoreGames() {
  if (
    Array.isArray(window.firestoreGames)
  ) {
    games = window.firestoreGames;
    render();
  }
}

window.addEventListener(
  'firestoreGamesLoaded',
  loadFirestoreGames
);

/* UPCOMING GAMES */

function renderUpcomingGames() {
  const upcomingContainer =
    document.getElementById('upcomingGames');

  if (!upcomingContainer) return;

  const upcomingGames =
    Array.isArray(window.upcomingGames)
      ? window.upcomingGames
      : [];

  upcomingContainer.innerHTML = '';

  if (upcomingGames.length === 0) {
    upcomingContainer.innerHTML = `
      <p class="empty-upcoming">
        No upcoming games at the moment. 🎮
      </p>
    `;
    return;
  }

  upcomingGames.forEach(game => {
    const card =
      document.createElement('article');

    card.className =
      'game-card upcoming-game-card';

    const availableDate =
      game.availableDate ||
      'Date to be announced';

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
          <strong>
            📅 AVAILABLE FOR RENT
          </strong>

          <div>${availableDate}</div>
        </div>

        <div class="game-bottom">
          <div class="price">
  <span>
    WEEKLY<br>₱${game.weekly}
  </span>

  <span>
    MONTHLY<br>₱${game.monthly}
  </span>
</div>

          <button
            class="reserve-slot-button"
            type="button"
            data-game="${game.name}"
            data-date="${availableDate}"
          >
            📝 Reserve Slot / Join Waiting List
          </button>
        </div>
      </div>
    `;

    upcomingContainer.appendChild(card);
  });
}

window.addEventListener(
  'upcomingGamesLoaded',
  renderUpcomingGames
);

/* UPCOMING WAITING LIST BUTTON */

document.addEventListener('click', event => {
  const button =
    event.target.closest('.reserve-slot-button');

  if (!button) return;

  const gameName =
    button.dataset.game;

  const availableDate =
    button.dataset.date;

  const message =
`Hi JDigitalsRental! 🎮

I would like to reserve a slot / join the waiting list.

Game: ${gameName}
Available Date: ${availableDate}

Please let me know when a slot becomes available. Thank you!`;

  navigator.clipboard
    .writeText(message)
    .catch(() => {});

  alert(
    'Your waiting list request has been copied! 🎮\n\n' +
    'Continue to Facebook and send us the message.'
  );

  window.open(
    'https://www.facebook.com/share/1DajrF4mTy/',
    '_blank',
    'noopener,noreferrer'
  );
});

/*
  IMPORTANT:
  Render immediately so the website never stays blank
  while Firebase is loading.
*/

render();

if (window.firestoreGames) {
  loadFirestoreGames();
}

if (window.upcomingGames) {
  renderUpcomingGames();
      }

/* AUTO SLIDE UPCOMING GAMES */

let upcomingSlideTimer = null;

function startUpcomingAutoSlide() {
  const slider = document.getElementById('upcomingGames');

  if (!slider) return;

  if (upcomingSlideTimer) {
    clearInterval(upcomingSlideTimer);
  }

  let currentIndex = 0;

  upcomingSlideTimer = setInterval(() => {
    const cards = slider.querySelectorAll('.upcoming-game-card');

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
  () => {
    setTimeout(startUpcomingAutoSlide, 300);
  }
);

if (window.upcomingGames) {
  setTimeout(startUpcomingAutoSlide, 300);
}
/* SORT UPCOMING GAMES BY AVAILABLE DATE */

function sortUpcomingGamesByDate() {
  if (!Array.isArray(window.upcomingGames)) return;

  window.upcomingGames.sort((a, b) => {
    const dateA = new Date(a.availableDate);
    const dateB = new Date(b.availableDate);

    const timeA = isNaN(dateA.getTime())
      ? Infinity
      : dateA.getTime();

    const timeB = isNaN(dateB.getTime())
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

    const slider =
      document.getElementById('upcomingGames');

    if (slider) {
      slider.scrollTo({
        left: 0,
        behavior: 'auto'
      });
    }
  }
);

if (window.upcomingGames) {
  sortUpcomingGamesByDate();
}
