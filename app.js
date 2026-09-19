
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

function render() {
  const q = search.value.toLowerCase();
  grid.innerHTML = '';
const gameCount = document.querySelector('#gameCount');
if (gameCount) {
  gameCount.textContent = `${games.length.toString().padStart(2, '0')} TITLES`;
}
  games
    .filter(g =>
      (filter === 'all' || g.type === filter) &&
      g.name.toLowerCase().includes(q)
    )
    .forEach(g => {
      const card = document.createElement('article');
      card.className = 'game-card';

      const availability = g.status === 'currently-rented'
        ? `
          <div class="availability rented">
            <strong>🔴 CURRENTLY RENTED</strong>
            <div>🏆 Trophy: Available on ${g.trophyDate}</div>
            <div>🎮 Non-Trophy: Available on ${g.nonTrophyDate}</div>
          </div>
        `
        : `
          <div class="availability available">
            <strong>🟢 AVAILABLE FOR RENT</strong>
          </div>
        `;

      card.innerHTML = `
        <div class="cover-wrap">
          <img class="cover" src="${g.image}" alt="${g.name}" loading="lazy">
          <span class="tag">${g.genre.toUpperCase()}</span>
        </div>

        <div class="game-info">
          <h3>${g.name}</h3>
          <div class="meta">${g.meta}</div>
          ${availability}

          <div class="game-bottom">
            <div class="price">
              <span>WEEKLY: ₱${g.weekly}</span>
              <span>MONTHLY: ₱${g.monthly}</span>
            </div>
            <button class="rent" type="button">Rent Now ↗</button>
          </div>
        </div>
      `;

      card.querySelector('.rent').addEventListener('click', () => {
  openRentalModal(g);
});

      grid.appendChild(card);
    });
}

document.querySelectorAll('.filter').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter').forEach(b =>
      b.classList.remove('active')
    );

    btn.classList.add('active');
    filter = btn.dataset.filter;
    render();
  });
});

search.addEventListener('input', render);

let selectedGame = null;
let selectedPeriod = null;
let selectedAccount = null;

const rentalModal = document.getElementById('rentalModal');
const modalTitle = document.getElementById('modalTitle');
const modalPrice = document.getElementById('modalPrice');
const continueRental = document.getElementById('continueRental');

function openRentalModal(g) {
  selectedGame = g;
  selectedPeriod = null;
  selectedAccount = null;

  modalTitle.textContent =
    g.status === 'currently-rented'
      ? `Join Waiting List — ${g.name}`
      : `Rent — ${g.name}`;

  modalPrice.textContent = '₱0';

  document.querySelectorAll('.period-option, .account-option')
    .forEach(btn => btn.classList.remove('active'));

  continueRental.textContent =
    g.status === 'currently-rented'
      ? 'Join Waiting List'
      : 'Continue to Facebook';

  rentalModal.classList.add('active');
}

document.querySelectorAll('.period-option').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.period-option')
      .forEach(b => b.classList.remove('active'));

    btn.classList.add('active');
    selectedPeriod = btn.dataset.period;

    const price =
      selectedPeriod === 'week'
        ? selectedGame.weekly
        : selectedGame.monthly;

    modalPrice.textContent = `₱${price}`;
  });
});

document.querySelectorAll('.account-option').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.account-option')
      .forEach(b => b.classList.remove('active'));

    btn.classList.add('active');
    selectedAccount = btn.dataset.account;
  });
});

continueRental.addEventListener('click', () => {
  if (!selectedGame || !selectedPeriod || !selectedAccount) {
    alert('Please choose rental period and account type.');
    return;
  }

const duration =
  selectedPeriod === 'week' ? '1 Week' : '1 Month';

  const price =
    selectedPeriod === 'week'
      ? selectedGame.weekly
      : selectedGame.monthly;

  const accountType =
    selectedAccount === 'trophy' ? 'Trophy' : 'Non-Trophy';

  const message =
    `${selectedGame.status === 'currently-rented'
      ? 'I want to join the waiting list for:'
      : 'I want to rent:'} ${selectedGame.name}\n` +
    `For how long: ${duration}\n` +
    `Trophy or Non-Trophy: ${accountType}\n` +
    `Price: ₱${price}`;

  navigator.clipboard.writeText(message).catch(() => {});

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

rentalModal.addEventListener('click', e => {
  if (e.target === rentalModal) {
    rentalModal.classList.remove('active');
  }
});
window.addEventListener("firestoreGamesLoaded", () => {
  games = window.firestoreGames;
  render();
});
          // ===============================
// UPCOMING GAMES
// ===============================

function renderUpcomingGames() {
  const upcomingContainer = document.getElementById('upcomingGames');

  if (!upcomingContainer) return;

  const upcomingGames = window.upcomingGames || [];

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
    const card = document.createElement('article');
    card.className = 'game-card upcoming-game-card';

    const availableDate = game.availableDate
      ? game.availableDate
      : 'Date to be announced';

    card.innerHTML = `
      <div class="cover-wrap">
        <img
          class="cover"
          src="${game.image}"
          alt="${game.name}"
          loading="lazy"
        >
        <span class="badge upcoming-badge">COMING SOON</span>
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

        <div class="game-bottom">
          <div class="price">
            <span>WEEKLY: ₱${game.weekly}</span>
            <span>MONTHLY: ₱${game.monthly}</span>
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

document.addEventListener('click', event => {
  const button = event.target.closest('.reserve-slot-button');

  if (!button) return;

  const gameName = button.dataset.game;
  const availableDate = button.dataset.date;

  const message =
`Hi JDigitalsRental! 🎮

I would like to reserve a slot / join the waiting list.

Game: ${gameName}
Available Date: ${availableDate}

Please let me know when a slot becomes available. Thank you!`;

  navigator.clipboard.writeText(message).catch(() => {});

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

function checkUpcomingGames() {
  if (window.upcomingGames) {
    renderUpcomingGames();
  } else {
    setTimeout(checkUpcomingGames, 300);
  }
}

window.addEventListener('upcomingGamesLoaded', renderUpcomingGames);

checkUpcomingGames();     
