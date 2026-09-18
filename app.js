
const games = [
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
render();
function openRentalModal(g) {
  const isRented = g.status === 'currently-rented';

  const period = prompt(
    `${isRented ? 'JOIN WAITING LIST' : 'RENT GAME'}\n\n` +
    `${g.name}\n\n` +
    `Choose rental period:\n` +
    `1 - 1 Week (₱${g.weekly})\n` +
    `2 - 1 Month (₱${g.monthly})`
  );

  if (period !== '1' && period !== '2') return;

  const account = prompt(
    `Choose account type:\n\n` +
    `1 - Trophy\n` +
    `2 - Non-Trophy`
  );

  if (account !== '1' && account !== '2') return;

  const duration = period === '1' ? '1 Week' : '1 Month';
  const price = period === '1' ? g.weekly : g.monthly;
  const accountType = account === '1' ? 'Trophy' : 'Non-Trophy';

  const message =
    `${isRented ? 'I want to join the waiting list for:' : 'I want to rent:'} ${g.name}\n` +
    `For how long: ${duration}\n` +
    `Trophy or Non-Trophy: ${accountType}\n` +
    `Price: ₱${price}`;

  alert(message);

  window.open(
    'https://www.facebook.com/share/1DajrF4mTy/',
    '_blank',
    'noopener,noreferrer'
  );
}
