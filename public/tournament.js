const Tournament = {
  _state: null,
  _currentMatch: null,
  _hasVoted: false,
  _pool: [],
  _searchPending: false,
  _searchTimer: null,

  init(onStart, onVote, onLeave, sendFn) {
    this._onStart = onStart;
    this._onVote = onVote;
    this._onLeave = onLeave;
    this._send = sendFn;

    document.getElementById('tournamentAddBtn').addEventListener('click', () => {
      if (this._pool && this._pool.length >= 16) return;
      var text = document.getElementById('tournamentAddInput').value.trim();
      if (!text) return;
      if (this._isUrl(text)) {
        this._send({ type: 'tournament_add_to_pool', url: text });
        document.getElementById('tournamentAddInput').value = '';
      } else {
        this._triggerTournamentSearch(text);
      }
    });

    document.getElementById('tournamentAddInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('tournamentAddBtn').click();
    });

    document.getElementById('tournamentAddInput').addEventListener('input', () => {
      var text = document.getElementById('tournamentAddInput').value.trim();
      if (!text || this._isUrl(text) || text.length < 2 || this._searchPending) {
        if (!text || this._isUrl(text)) document.getElementById('tournamentSearchResults').classList.add('hidden');
        return;
      }
      clearTimeout(this._searchTimer);
      this._searchTimer = setTimeout(() => {
        this._triggerTournamentSearch(text);
      }, 500);
    });

    document.getElementById('tournamentSearchResults').addEventListener('click', (e) => {
      var item = e.target.closest('.search-result-item');
      if (!item) return;
      var url = 'https://www.youtube.com/watch?v=' + item.getAttribute('data-id');
      this._send({ type: 'tournament_add_to_pool', url: url });
      document.getElementById('tournamentAddInput').value = '';
      document.getElementById('tournamentSearchResults').classList.add('hidden');
    });

    document.getElementById('tournamentPoolList').addEventListener('click', (e) => {
      var btn = e.target.closest('[data-action="remove-from-pool"]');
      if (!btn) return;
      this._send({ type: 'tournament_remove_from_pool', trackId: btn.getAttribute('data-id') });
    });

    document.getElementById('tournamentStartBtn').addEventListener('click', () => {
      if (this._onStart) this._onStart(16);
    });

    document.getElementById('voteBtnA').addEventListener('click', () => {
      if (this._hasVoted || !this._currentMatch) return;
      this._hasVoted = true;
      this._disableVoteButtons();
      if (this._onVote) this._onVote(this._currentMatch.id, 'a');
    });

    document.getElementById('voteBtnB').addEventListener('click', () => {
      if (this._hasVoted || !this._currentMatch) return;
      this._hasVoted = true;
      this._disableVoteButtons();
      if (this._onVote) this._onVote(this._currentMatch.id, 'b');
    });
  },

  _isUrl(text) { return /^https?:\/\//.test(text) || /youtube\.com|youtu\.be/.test(text); },

  _triggerTournamentSearch(query) {
    if (this._pool && this._pool.length >= 16) return;
    this._searchPending = true;
    document.getElementById('tournamentSearchResults').classList.remove('hidden');
    document.getElementById('tournamentSearchResults').innerHTML = '<div class="search-loading">Searching...</div>';
    this._send({ type: 'search', query: query });
  },

  onSearchResults(results) {
    this._searchPending = false;
    var el = document.getElementById('tournamentSearchResults');
    if (!results || !results.length) {
      el.innerHTML = '<div class="search-loading">No results</div>';
      return;
    }
    el.classList.remove('hidden');
    el.innerHTML = results.map(r =>
      '<div class="search-result-item" data-id="' + r.youtubeId + '">' +
      '<img class="search-result-thumb" src="' + (r.thumbnail || '') + '" alt="">' +
      '<div class="search-result-info">' +
      '<div class="search-result-title">' + (r.title || '').replace(/</g,'&lt;') + '</div>' +
      '<div class="search-result-artist">' + (r.artist || '').replace(/</g,'&lt;') + '</div>' +
      '</div>' +
      '<span class="search-result-duration">' + formatTime(r.duration) + '</span>' +
      '</div>'
    ).join('');
  },

  updatePool(pool) {
    this._pool = pool;
    var list = document.getElementById('tournamentPoolList');
    var count = document.getElementById('tournamentPoolCount');
    var btn = document.getElementById('tournamentStartBtn');
    var addBtn = document.getElementById('tournamentAddBtn');
    var addInput = document.getElementById('tournamentAddInput');

    var full = pool.length >= 16;
    count.textContent = pool.length + ' / 16';
    if (full) count.style.color = '#e74c3c';
    else count.style.color = '';
    addBtn.disabled = full;
    addBtn.textContent = full ? 'Full' : 'Add';
    addInput.disabled = full;
    addInput.placeholder = full ? 'Pool is full (16/16)' : 'Search YouTube or paste a link...';
    btn.classList.toggle('hidden', pool.length < 2 || !window.__isAdmin);

    if (!pool.length) {
      list.innerHTML = '<div class="tournament-pool-empty">No tracks yet — search and add some!</div>';
      return;
    }

    list.innerHTML = pool.map(t =>
      '<div class="tournament-pool-item">' +
      '<img class="tournament-pool-thumb" src="' + (t.thumbnail || '') + '" alt="">' +
      '<div class="tournament-pool-info">' +
      '<div class="tournament-pool-title-text">' + (t.title || '???').replace(/</g,'&lt;') + '</div>' +
      '<div class="tournament-pool-artist">' + (t.artist || '').replace(/</g,'&lt;') + ' · added by ' + (t.addedBy || '').replace(/</g,'&lt;') + '</div>' +
      '</div>' +
      '<button class="tournament-pool-remove" data-action="remove-from-pool" data-id="' + t.id + '" title="Remove">&times;</button>' +
      '</div>'
    ).join('');
  },

  show() {
    document.getElementById('mainGrid').style.display = 'none';
    document.getElementById('tournamentView').classList.remove('hidden');
    document.getElementById('tournamentStartBtn').classList.toggle('hidden', !window.__isAdmin);
  },

  hide() {
    document.getElementById('mainGrid').style.display = '';
    document.getElementById('tournamentView').classList.add('hidden');
  },

  updateState(state) {
    this._state = state;
    this._renderBracket(state);
    if (state.status === 'finished' && state.champion) {
      this.showChampion(state.champion);
    }
  },

  showMatchup(match, round, matchIndex) {
    this._currentMatch = match;
    this._hasVoted = false;

    document.getElementById('tournamentEmpty').classList.add('hidden');
    document.getElementById('tournamentActive').classList.remove('hidden');

    const cardA = document.getElementById('matchTrackA');
    const cardB = document.getElementById('matchTrackB');

    cardA.querySelector('.matchup-thumb').src = match.trackA.thumbnail || '';
    cardA.querySelector('.matchup-title').textContent = match.trackA.title;
    cardA.querySelector('.matchup-pct').textContent = '0%';
    cardA.querySelector('.matchup-progress-fill').style.width = '0%';
    cardA.querySelector('.matchup-vote-btn').disabled = false;
    cardA.querySelector('.matchup-vote-btn').textContent = 'VOTE';
    cardA.querySelector('.matchup-vote-btn').classList.remove('voted');
    cardA.classList.remove('winner', 'loser');

    cardB.querySelector('.matchup-thumb').src = match.trackB.thumbnail || '';
    cardB.querySelector('.matchup-title').textContent = match.trackB.title;
    cardB.querySelector('.matchup-pct').textContent = '0%';
    cardB.querySelector('.matchup-progress-fill').style.width = '0%';
    cardB.querySelector('.matchup-vote-btn').disabled = false;
    cardB.querySelector('.matchup-vote-btn').textContent = 'VOTE';
    cardB.querySelector('.matchup-vote-btn').classList.remove('voted');
    cardB.classList.remove('winner', 'loser');

    document.getElementById('tournamentStatus').querySelector('.tournament-phase').textContent = 'Round ' + (round + 1) + ' · Match ' + (matchIndex + 1);
  },

  setPlaying(trackId) {
    const card = trackId === 'a' ? document.getElementById('matchTrackA') : document.getElementById('matchTrackB');
    card.style.borderColor = '#ffb800';
    document.getElementById('tournamentStatus').querySelector('.tournament-phase').textContent += ' · Track ' + trackId.toUpperCase();
  },

  getCurrentTrack(trackId) {
    if (!this._currentMatch) return null;
    return trackId === 'a' ? this._currentMatch.trackA : this._currentMatch.trackB;
  },

  setVoting() {
    document.getElementById('matchTrackA').style.borderColor = '';
    document.getElementById('matchTrackB').style.borderColor = '';
    this._enableVoteButtons();
    document.getElementById('tournamentStatus').querySelector('.tournament-phase').textContent += ' · Vote now!';
  },

  updateVotes(votesA, votesB, total) {
    const pctA = total > 0 ? Math.round((votesA / total) * 100) : 0;
    const pctB = total > 0 ? Math.round((votesB / total) * 100) : 0;
    document.getElementById('matchTrackA').querySelector('.matchup-progress-fill').style.width = pctA + '%';
    document.getElementById('matchTrackA').querySelector('.matchup-pct').textContent = pctA + '% (' + votesA + ')';
    document.getElementById('matchTrackB').querySelector('.matchup-progress-fill').style.width = pctB + '%';
    document.getElementById('matchTrackB').querySelector('.matchup-pct').textContent = pctB + '% (' + votesB + ')';
  },

  showMatchResult(winnerId) {
    this._disableVoteButtons();
    document.getElementById('matchTrackA').classList.add(winnerId === 'a' ? 'winner' : 'loser');
    document.getElementById('matchTrackB').classList.add(winnerId === 'b' ? 'winner' : 'loser');
    document.getElementById('tournamentStatus').querySelector('.tournament-phase').textContent += ' · Done!';
  },

  showChampion(champion) {
    const area = document.getElementById('matchupArea');
    area.innerHTML = '<div class="champion-card">' +
      '<div class="champion-icon">🏆</div>' +
      '<div class="matchup-thumb-wrap" style="width:160px;height:160px;margin:0 auto"><img class="matchup-thumb" src="' + (champion.thumbnail || '') + '" style="width:100%;height:100%;object-fit:cover"></div>' +
      '<h2 style="font-family:var(--font-display);font-size:24px;color:var(--amber);margin-top:8px">' + (champion.title || 'Champion') + '</h2>' +
      '<p style="color:var(--text-muted)">' + (champion.artist || '') + '</p>' +
      '</div>';
    document.getElementById('tournamentStatus').querySelector('.tournament-phase').textContent = 'Champion crowned!';
  },

  reset() {
    this._state = null;
    this._currentMatch = null;
    this._hasVoted = false;
    document.getElementById('tournamentEmpty').classList.remove('hidden');
    document.getElementById('tournamentActive').classList.add('hidden');
    document.getElementById('tournamentStartBtn').classList.add('hidden');
  },

  _renderBracket(state) {
    var area = document.getElementById('bracketArea');
    if (!state || !state.rounds) { area.innerHTML = ''; return; }

    var roundLabels = ['R1', 'R2', 'R3', 'R4', 'Final'];
    if (state.size === 32) roundLabels = ['R1', 'R2', 'R3', 'R4', 'R5', 'Final'];

    var html = '';
    state.rounds.forEach(function(round, ri) {
      var label = ri === state.rounds.length - 1 ? 'Final' : roundLabels[ri];
      var lastRound = ri === state.rounds.length - 1;

      html += '<div class="bracket-round">';
      html += '<div class="bracket-round-label">' + label + '</div>';

      round.forEach(function(match) {
        var tA = match.trackA || {};
        var tB = match.trackB || {};
        var nameA = (tA.title || '???').substring(0, 18);
        var nameB = (tB.title || '???').substring(0, 18);
        var wonA = match.winnerId === 'a';
        var wonB = match.winnerId === 'b';

        html += '<div class="bracket-match">';
        html += '<div class="bracket-match-entry top' +
          (wonA ? (lastRound ? ' champion' : ' winner') : '') + '">' + nameA + '</div>';
        html += '<div class="bracket-match-entry bottom' +
          (wonB ? (lastRound ? ' champion' : ' winner') : '') + '">' + nameB + '</div>';
        if (!lastRound) html += '<div class="bracket-connector"></div>';
        html += '</div>';
      });

      html += '</div>';
    });

    area.innerHTML = html;
  },

  _enableVoteButtons() {
    const btnA = document.getElementById('voteBtnA');
    const btnB = document.getElementById('voteBtnB');
    btnA.disabled = this._hasVoted;
    btnB.disabled = this._hasVoted;
  },

  _disableVoteButtons() {
    document.getElementById('voteBtnA').disabled = true;
    document.getElementById('voteBtnB').disabled = true;
  }
};

function formatTime(seconds) {
  if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
  var s = Math.floor(seconds), m = Math.floor(s / 60), sec = s % 60;
  return m + ':' + (sec < 10 ? '0' : '') + sec;
}
