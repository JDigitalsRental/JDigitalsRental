/* JDigitalsRental Phase 2 — safe, additive game details popup.
   Uses the existing app.js games, pricing, availability and rental modal.
   No Firebase changes. */
(() => {
  const $ = id => document.getElementById(id);
  const overlay = $('jdrDetails');
  if (!overlay) return;
  let currentGame = null;
  let previousFocus = null;
  const escapeText = v => String(v ?? '');
  const peso = v => Number.isFinite(Number(v)) ? '₱' + Number(v).toLocaleString('en-PH') : 'Price TBA';
  const priceLine = (label, trophy, nonTrophy, extra = '') => {
    const row = document.createElement('div');
    row.className = 'jdr-details-price ' + extra;
    const heading = document.createElement('strong');
    heading.textContent = label;
    const values = document.createElement('span');
    values.textContent = '🏆 ' + peso(trophy) + '  •  🎮 ' + peso(nonTrophy);
    row.append(heading, values);
    return row;
  };
  const setGallery = game => {
    const gallery = $('jdrDetailsGallery');
    gallery.replaceChildren();
    const sources = [game.image, ...(Array.isArray(game.screenshots) ? game.screenshots : [])]
      .filter(src => typeof src === 'string' && src.trim() && !/^javascript:/i.test(src));
    const image = $('jdrDetailsImage');
    image.src = sources[0] || '';
    image.alt = escapeText(game.name) + ' cover';
    for (const src of sources) {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-label', 'View game image');
      const thumb = document.createElement('img');
      thumb.src = src;
      thumb.alt = '';
      button.appendChild(thumb);
      button.addEventListener('click', () => { image.src = src; });
      gallery.appendChild(button);
    }
  };
  function open(game) {
    if (!game) return;
    currentGame = game;
    previousFocus = document.activeElement;
    $('jdrDetailsTitle').textContent = escapeText(game.name);
    $('jdrDetailsGenre').textContent = [game.genre || game.type || 'PS5 Game', 'PS5 • Digital Rental'].join('  •  ');
    $('jdrDetailsDescription').textContent = game.description ||
      'Explore this PS5 title through JDigitalsRental. Choose your rental plan and account type to check pricing and availability.';
    setGallery(game);
    const availability = $('jdrDetailsAvailability');
    availability.innerHTML = '';
    if (typeof availabilityHTML === 'function') {
      availability.innerHTML = availabilityHTML(game, 'trophy') + availabilityHTML(game, 'nonTrophy');
    }
    const prices = typeof gamePrices === 'function' ? gamePrices(game) : {};
    const priceBox = $('jdrDetailsPrices');
    priceBox.replaceChildren(
      priceLine('📅 WEEKLY', prices.weeklyTrophy, prices.weeklyNonTrophy),
      priceLine('🎮 1 MONTH SINGLE GAME', prices.singleMonthlyTrophy, prices.singleMonthlyNonTrophy),
      priceLine('♾️ MONTHLY UNLI SWAP', prices.monthlyTrophy, prices.monthlyNonTrophy, 'unli')
    );
    const rented = typeof slotIsRented === 'function' && slotIsRented(game,'trophy') && slotIsRented(game,'nonTrophy');
    $('jdrDetailsRent').textContent = rented ? 'Join Waiting List ↗' : 'Rent Now ↗';
    const trailer = $('jdrDetailsTrailer');
    const validTrailer = typeof game.trailerUrl === 'string' && /^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(game.trailerUrl);
    trailer.href = validTrailer ? game.trailerUrl : 'https://www.youtube.com/results?search_query=' + encodeURIComponent(game.name + ' official game trailer');
    trailer.textContent = validTrailer ? '▶ Watch Trailer ↗' : '▶ Find Game Trailer ↗';
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    $('jdrDetailsClose').focus();
  }
  function close() {
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    previousFocus?.focus?.();
  }
  $('jdrDetailsClose').addEventListener('click', close);
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
  document.addEventListener('keydown', event => {
    if (!overlay.classList.contains('open')) return;
    if (event.key === 'Escape') close();
    if (event.key === 'Tab') {
      const focusable = [...overlay.querySelectorAll('button,a[href]')].filter(el => el.getClientRects().length);
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length-1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  function findGame(card) {
    const name = card.querySelector('.game-info h3')?.textContent?.trim();
    if (!name) return null;
    const allGames = typeof games !== 'undefined' && Array.isArray(games) ? games : [];
    const upcoming = Array.isArray(window.upcomingGames) ? window.upcomingGames : [];
    return [...allGames, ...upcoming].find(game => game.name === name) || null;
  }
  document.addEventListener('click', event => {
    const cover = event.target.closest('#gameGrid .cover-wrap, #upcomingGames .cover-wrap');
    if (!cover || event.target.closest('.mega-favorite, button, a')) return;
    const game = findGame(cover.closest('.game-card'));
    if (game) open(game);
  });
  // Add accessible keyboard opening to dynamically rendered covers.
  for (const gridId of ['gameGrid','upcomingGames']) {
    const grid = $(gridId);
    if (!grid) continue;
    const makeAccessible = () => grid.querySelectorAll('.cover-wrap').forEach(cover => {
      cover.tabIndex = 0;
      cover.setAttribute('role','button');
      cover.setAttribute('aria-label', 'View game details');
    });
    new MutationObserver(makeAccessible).observe(grid,{childList:true});
    makeAccessible();
    grid.addEventListener('keydown', event => {
      if (!['Enter',' '].includes(event.key) || !event.target.matches('.cover-wrap')) return;
      event.preventDefault();
      const game = findGame(event.target.closest('.game-card'));
      if (game) open(game);
    });
  }
  $('jdrDetailsRent').addEventListener('click', () => {
    if (!currentGame) return;
    const game = currentGame;
    close();
    if (typeof openRentalModal === 'function' && !(Array.isArray(window.upcomingGames) && window.upcomingGames.some(g => g.name === game.name))) {
      openRentalModal(game);
    } else {
      // Upcoming games retain their existing reservation flow.
      const card = [...document.querySelectorAll('#upcomingGames .game-card')].find(el => el.querySelector('h3')?.textContent?.trim() === game.name);
      card?.querySelector('.reserve-slot-button')?.click();
    }
  });
})();
