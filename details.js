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
  // Embedded YouTube player; all media remains within the existing game details popup.
  const trailerLink = $('jdrDetailsTrailer');
  const trailerBox = document.createElement('section');
  trailerBox.id = 'jdrTrailerPlayer';
  trailerBox.hidden = true;
  trailerBox.style.cssText = 'margin-top:14px;padding:12px;border:1px solid #285c9a;border-radius:12px;background:#07162e';
  const trailerHead = document.createElement('div');
  trailerHead.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px';
  const trailerTitle = document.createElement('strong');
  trailerTitle.textContent = '🎬 Official Game Trailer';
  const stopButton = document.createElement('button');
  stopButton.type = 'button';
  stopButton.textContent = '✕ Close Video';
  stopButton.style.cssText = 'border:1px solid #467cb9;border-radius:8px;background:#122c4f;color:white;padding:8px;cursor:pointer';
  trailerHead.append(trailerTitle,stopButton);
  const trailerFrameWrap = document.createElement('div');
  trailerFrameWrap.style.cssText = 'width:100%;aspect-ratio:16/9;background:#000;border-radius:9px;overflow:hidden';
  const fallback = document.createElement('a');
  fallback.target = '_blank';
  fallback.rel = 'noopener noreferrer';
  fallback.textContent = '↗ If video cannot play, watch on YouTube';
  fallback.style.cssText = 'display:inline-block;color:#a5d6ff;margin-top:9px;font-size:12px';
  trailerBox.append(trailerHead,trailerFrameWrap,fallback);
  trailerLink.closest('.jdr-details-actions').insertAdjacentElement('afterend',trailerBox);
  const note = overlay.querySelector('.jdr-details-note');
  if(note) note.textContent = 'Official trailers play here when a YouTube link is added in Admin Dashboard. Some videos do not permit embedding.';
  function trailerVideoId(urlText) {
    try {
      const url = new URL(urlText);
      if(url.protocol !== 'https:') return '';
      const host = url.hostname.toLowerCase();
      if(!['youtube.com','www.youtube.com','m.youtube.com','youtu.be','www.youtu.be','youtube-nocookie.com','www.youtube-nocookie.com'].includes(host)) return '';
      let id = '';
      if(host === 'youtu.be' || host === 'www.youtu.be') id = url.pathname.split('/')[1];
      else if(url.pathname === '/watch') id = url.searchParams.get('v');
      else if(/^\/(embed|shorts|live)\//.test(url.pathname)) id = url.pathname.split('/')[2];
      return /^[A-Za-z0-9_-]{11}$/.test(id || '') ? id : '';
    } catch { return ''; }
  }
  function stopTrailer() {
    trailerFrameWrap.replaceChildren(); // Removes iframe and stops playback.
    trailerBox.hidden = true;
  }
  stopButton.addEventListener('click', stopTrailer);
  trailerLink.addEventListener('click', event => {
    if(!currentGame) return;
    const videoId = trailerVideoId(currentGame.trailerUrl);
    if(!videoId) return; // No configured trailer: retain YouTube search link.
    event.preventDefault();
    if(!trailerBox.hidden) { stopTrailer(); return; }
    const frame = document.createElement('iframe');
    frame.src = 'https://www.youtube-nocookie.com/embed/' + videoId + '?autoplay=1&rel=0';
    frame.title = currentGame.name + ' Official Trailer';
    frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.style.cssText = 'width:100%;height:100%;border:0;display:block';
    trailerFrameWrap.replaceChildren(frame);
    fallback.href = 'https://www.youtube.com/watch?v=' + videoId;
    trailerBox.hidden = false;
    trailerBox.scrollIntoView({behavior:'smooth',block:'nearest'});
  });
  function open(game) {
    if (!game) return;
    stopTrailer();
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
    const validTrailer = !!trailerVideoId(game.trailerUrl);
    trailer.href = validTrailer ? game.trailerUrl : 'https://www.youtube.com/results?search_query=' + encodeURIComponent(game.name + ' official game trailer');
    trailer.textContent = validTrailer ? '▶ Watch Official Trailer' : '▶ Find Game Trailer ↗';
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    $('jdrDetailsClose').focus();
  }
  function close() {
    stopTrailer();
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
