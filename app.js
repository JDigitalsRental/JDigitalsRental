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
    if (!selectedGame) return;

    if (!selectedPeriod) {
      alert('Please choose 1 Week or 1 Month.');
      return;
    }

    if (!selectedAccount) {
      alert('Please choose Trophy or Non-Trophy.');
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

    const isWaitingList =
      selectedGame.status === 'currently-rented';

    const message = isWaitingList
      ? `Hi JDigitalsRental! 🎮

I would like to join the waiting list.

Game: ${selectedGame.name}
Rental Period: ${duration}
Account Type: ${accountType}
Price: ₱${price}

Please let me know when a slot becomes available.

Thank you!`
      : `Hi JDigitalsRental! 🎮

I would like to rent this game.

Game: ${selectedGame.name}
Rental Period: ${duration}
Account Type: ${accountType}
Price: ₱${price}

Thank you!`;

    navigator.clipboard
      .writeText(message)
      .catch(() => {});

    alert(
      'Your rental details have been copied! 🎮\n\n' +
      'Continue to Facebook and paste the message in Messenger.'
    );

    window.open(
      'https://www.facebook.com/share/1DajrF4mTy/',
      '_blank',
      'noopener,noreferrer'
    );

    rentalModal.classList.remove('active');
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

/* UPCOMING GAME RESERVATION */

const upcomingReservationModal =
  document.getElementById('upcomingReservationModal');

const closeUpcomingReservationModal =
  document.getElementById('closeUpcomingReservationModal');

const upcomingReservationGame =
  document.getElementById('upcomingReservationGame');

const upcomingReservationCustomerName =
  document.getElementById('upcomingReservationCustomerName');

const continueUpcomingReservation =
  document.getElementById('continueUpcomingReservation');

let selectedUpcomingGame = '';
let selectedUpcomingDate = '';
let selectedUpcomingAccount = '';
let selectedUpcomingPeriod = '';

/* OPEN RESERVATION MODAL */

document.addEventListener('click', event => {
  const button =
    event.target.closest('.reserve-slot-button');

  if (!button) return;

  selectedUpcomingGame =
    button.dataset.game || '';

  selectedUpcomingDate =
    button.dataset.date || '';

  selectedUpcomingAccount = '';
selectedUpcomingPeriod = '';

  if (upcomingReservationGame) {
    upcomingReservationGame.textContent =
      selectedUpcomingGame;
  }

  if (upcomingReservationCustomerName) {
    upcomingReservationCustomerName.value = '';
  }

  document
    .querySelectorAll('.upcoming-account-option')
    .forEach(btn => {
      btn.classList.remove('active');
    });
document
  .querySelectorAll('.upcoming-period-option')
  .forEach(btn => {
    btn.classList.remove('active');
  });

document
  .querySelectorAll('.upcoming-period-option')
  .forEach(btn => {
    btn.addEventListener('click', () => {
      document
        .querySelectorAll('.upcoming-period-option')
        .forEach(b => {
          b.classList.remove('active');
        });

      btn.classList.add('active');

      selectedUpcomingPeriod =
        btn.dataset.period;
    });
  });
  if (upcomingReservationModal) {
    upcomingReservationModal.classList.add('active');
  }
});

/* TROPHY / NON-TROPHY SELECTION */

document
  .querySelectorAll('.upcoming-account-option')
  .forEach(btn => {
    btn.addEventListener('click', () => {
      document
        .querySelectorAll('.upcoming-account-option')
        .forEach(b => {
          b.classList.remove('active');
        });

      btn.classList.add('active');

      selectedUpcomingAccount =
        btn.dataset.account;
    });
  });

/* CLOSE BUTTON */

if (closeUpcomingReservationModal) {
  closeUpcomingReservationModal.addEventListener(
    'click',
    () => {
      upcomingReservationModal.classList.remove('active');
    }
  );
}

/* CLOSE WHEN CLICKING OUTSIDE */

if (upcomingReservationModal) {
  upcomingReservationModal.addEventListener(
    'click',
    event => {
      if (event.target === upcomingReservationModal) {
        upcomingReservationModal.classList.remove('active');
      }
    }
  );
}

/* CONTINUE TO FACEBOOK */

if (continueUpcomingReservation) {
  continueUpcomingReservation.addEventListener(
    'click',
    async () => {
      const customerName =
  document
    .getElementById('upcomingReservationCustomerName')
    ?.value
    .trim() || '';

      if (!customerName) {
  alert(
    'Please enter your First and Last Name.'
  );
  return;
}

if (!selectedUpcomingPeriod) {
  alert(
    'Please choose 1 Week or 1 Month.'
  );
  return;
}

if (!selectedUpcomingAccount) {
  alert(
    'Please choose Trophy or Non-Trophy.'
  );
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
      if (window.saveWaitingList) {
  
    const saved = await window.saveWaitingList({
  gameId: selectedUpcomingGame,
  gameName: selectedUpcomingGame,
  customerName: customerName,
  accountType: accountType,
  rentalPeriod: rentalPeriod
});

  if (!saved) {
    alert('Unable to save your reservation. Please try again.');
    return;
  }
      }
const message =
`Hi JDigitalsRental! 🎮

I would like to reserve a slot / join the waiting list.

First and Last Name: ${customerName}
Game: ${selectedUpcomingGame}
Rental Period: ${rentalPeriod}
Account Type: ${accountType}
Available Date: ${selectedUpcomingDate}

📌 I understand that my First and Last Name should match the name shown on my Facebook account so JDigitalsRental can easily find and contact me when it is my turn to rent.

Thank you!`;

      navigator.clipboard
        .writeText(message)
        .catch(() => {});

      alert(
        'Your reservation details have been copied! 🎮\n\n' +
        'Continue to Facebook and paste the message in Messenger.'
      );

      window.open(
        'https://www.facebook.com/share/1DajrF4mTy/',
        '_blank',
        'noopener,noreferrer'
      );

      upcomingReservationModal.classList.remove('active');
    }
  );
}
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
