const UI = {
  _progressInterval: null,
  _searchTarget: null,
  _remaining: 0,
  _isVoted: false,
  hasTrack: false,
  myName: '',

  _avatarColors: ['#ff6b35', '#4ade80', '#60a5fa', '#c084fc', '#fbbf24', '#f472b6', '#22d3ee'],

  /* ── Helpers ─────────────────────────────────────────────── */

  formatTime(seconds) {
    if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
    const s = Math.floor(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) {
      return h + ':' + (m < 10 ? '0' : '') + m + ':' + (sec < 10 ? '0' : '') + sec;
    }
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  },

  relativeTime(timestamp) {
    if (!timestamp) return '';
    const diff = Math.max(0, Date.now() - timestamp);
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return min + ' min ago';
    const hours = Math.floor(min / 60);
    if (hours < 24) return hours + ' h ago';
    return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
  },

  escapeHtml(str) {
    if (str == null) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  },

  _initial(name) {
    const value = (name || '?').trim();
    return this.escapeHtml(value.charAt(0).toUpperCase() || '?');
  },

  _color(index) {
    return this._avatarColors[index % this._avatarColors.length];
  },

  _avatar(name, index, sizeClass) {
    return (
      '<span class="avatar ' + (sizeClass || '') + '" style="--ring:' + this._color(index) + '">' +
        '<span>' + this._initial(name) + '</span>' +
      '</span>'
    );
  },

  /* ── Player ──────────────────────────────────────────────── */

  renderPlayer(track, isPlaying, isAdmin) {
    const emptyState = document.getElementById('emptyState');
    const playerArea = document.getElementById('playerArea');
    const artwork = document.getElementById('artwork');
    const thumbnail = document.getElementById('playerThumbnail');
    const title = document.getElementById('playerTitle');
    const artist = document.getElementById('playerArtist');
    const playBtn = document.getElementById('playBtn');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const reactions = document.getElementById('reactions');
    const syncState = document.getElementById('syncState');
    const lyricsBtn = document.getElementById('lyricsBtn');
    const stageFooter = document.querySelector('.stage-footer');

    this.hasTrack = !!track;

    if (!track) {
      emptyState.classList.remove('hidden');
      playerArea.classList.add('hidden');
      playBtn.disabled = true;
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      reactions.classList.add('hidden');
      if (stageFooter) stageFooter.classList.add('hidden');
      document.getElementById('voteSection').classList.add('hidden');
      if (lyricsBtn) lyricsBtn.disabled = true;
      this._remaining = 0;
      if (syncState) syncState.textContent = 'Waiting';
      this.setPlayButtonState(false);
      return;
    }

    emptyState.classList.add('hidden');
    playerArea.classList.remove('hidden');
    if (stageFooter) stageFooter.classList.remove('hidden');
    if (lyricsBtn) lyricsBtn.disabled = false;

    if (track.thumbnail) {
      artwork.classList.remove('no-img');
      thumbnail.src = track.thumbnail;
      thumbnail.alt = track.title || '';
    } else {
      artwork.classList.add('no-img');
      thumbnail.removeAttribute('src');
      thumbnail.alt = '';
    }

    title.textContent = track.title || 'Unknown';
    artist.textContent = track.artist || track.channelTitle || 'Unknown';

    const addedBy = document.getElementById('playerAddedBy');
    if (track.addedBy) {
      addedBy.textContent = 'Added by ' + track.addedBy +
        (track.addedAt ? '  ·  ' + this.relativeTime(track.addedAt) : '');
      addedBy.style.display = '';
    } else {
      addedBy.textContent = '';
      addedBy.style.display = 'none';
    }

    reactions.classList.remove('hidden');

    playBtn.disabled = !isAdmin;
    prevBtn.disabled = !isAdmin;
    nextBtn.disabled = !isAdmin;

    if (syncState) syncState.textContent = isPlaying ? 'Playing · synced' : 'Paused';
    this.setPlayButtonState(isPlaying);
  },

  updateProgress(currentTime, duration) {
    const fill = document.getElementById('progressFill');
    const thumb = document.getElementById('progressThumb');
    const currentEl = document.getElementById('currentTime');
    const durationEl = document.getElementById('duration');

    const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
    fill.style.width = Math.min(pct, 100) + '%';
    thumb.style.left = Math.min(pct, 100) + '%';

    currentEl.textContent = this.formatTime(currentTime);
    durationEl.textContent = this.formatTime(duration);
    this._remaining = duration > 0 ? Math.max(0, duration - currentTime) : 0;
  },

  startProgressUpdates(player) {
    this.stopProgressUpdates();
    this._progressInterval = setInterval(() => {
      const dur = player.getDuration();
      if (dur > 0) {
        this.updateProgress(player.getCurrentTime(), dur);
      } else {
        this.updateProgress(0, 0);
      }
    }, 250);
  },

  stopProgressUpdates() {
    if (this._progressInterval) {
      clearInterval(this._progressInterval);
      this._progressInterval = null;
    }
  },

  /* ── Votes ───────────────────────────────────────────────── */

  renderVotes(votesCount, threshold, totalUsers, isAdmin) {
    const section = document.getElementById('voteSection');
    const countEl = document.getElementById('voteCount');
    const thresholdEl = document.getElementById('voteThreshold');
    const fillEl = document.getElementById('voteProgressFill');
    const progress = document.getElementById('voteProgress');
    const btn = document.getElementById('voteBtn');

    if (!this.hasTrack || threshold <= 0 || totalUsers < 2) {
      section.classList.add('hidden');
      return;
    }

    section.classList.remove('hidden');
    countEl.textContent = votesCount;
    thresholdEl.textContent = threshold;

    const pct = threshold > 0 ? (votesCount / threshold) * 100 : 0;
    fillEl.style.width = Math.min(pct, 100) + '%';
    progress.classList.add('is-visible');

    if (this._isVoted) {
      btn.disabled = true;
      btn.classList.add('is-voted');
      document.getElementById('voteLabel').textContent = 'Voted';
    } else {
      btn.disabled = !!isAdmin;
      btn.classList.remove('is-voted');
      document.getElementById('voteLabel').textContent = 'Vote to skip';
    }
  },

  setVoteSkipped() {
    this._isVoted = true;
    const btn = document.getElementById('voteBtn');
    btn.disabled = true;
    btn.classList.add('is-voted');
    document.getElementById('voteLabel').textContent = 'Voted';
  },

  resetVoteButton() {
    this._isVoted = false;
    const btn = document.getElementById('voteBtn');
    btn.disabled = false;
    btn.classList.remove('is-voted');
    document.getElementById('voteLabel').textContent = 'Vote to skip';
  },

  /* ── Queue ───────────────────────────────────────────────── */

  renderQueue(queue, currentTrack, isAdmin) {
    const list = document.getElementById('queueList');
    const count = document.getElementById('queueCount');
    const meta = document.getElementById('queueMeta');
    const clearBtn = document.getElementById('clearQueueBtn');

    queue = queue || [];
    count.textContent = queue.length;
    const toggleBadge = document.getElementById('queueToggleCount');
    if (toggleBadge) {
      toggleBadge.textContent = queue.length;
      toggleBadge.classList.toggle('hidden', queue.length === 0);
    }
    clearBtn.classList.toggle('hidden', !(isAdmin && queue.length > 0));

    const totalSeconds = queue.reduce((sum, item) => sum + (item.duration || 0), 0);
    const minutes = Math.ceil(totalSeconds / 60);
    meta.textContent = queue.length
      ? queue.length + (queue.length === 1 ? ' track' : ' tracks') + ' · ' + minutes + ' min'
      : 'Queue is empty';

    const next = queue[0] || null;
    const rest = queue.slice(1);
    const thenGroup = document.getElementById('thenGroup');
    this.renderNext(next, isAdmin);

    thenGroup.classList.toggle('hidden', rest.length === 0);

    if (!rest.length) {
      list.innerHTML = '';
      return;
    }

    list.innerHTML = rest.map((item) => {
      const title = this.escapeHtml(item.title || 'Unknown');
      const artist = this.escapeHtml(item.artist || item.channelTitle || 'Unknown');
      const thumb = item.thumbnail
        ? '<img src="' + this.escapeHtml(item.thumbnail) + '" alt="" loading="lazy">'
        : '<span class="queue-thumb-letter">' + this._initial(item.title) + '</span>';
      const remove = isAdmin
        ? '<button class="queue-remove-btn" data-action="remove" data-id="' + this.escapeHtml(item.id) + '" title="Remove">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
          '</button>'
        : '';

      return (
        '<li class="queue-row" data-id="' + this.escapeHtml(item.id) + '">' +
          '<span class="queue-thumb">' + thumb + '</span>' +
          '<span class="queue-info">' +
            '<span class="queue-title">' + title + '</span>' +
            '<span class="queue-artist">' + artist + '</span>' +
          '</span>' +
          '<span class="queue-duration">' + this.formatTime(item.duration || 0) + '</span>' +
          remove +
        '</li>'
      );
    }).join('');

    // Keep the current track reference available for row highlighting.
    if (currentTrack) {
      const currentRow = list.querySelector('[data-id="' + currentTrack.id + '"]');
      if (currentRow) currentRow.classList.add('is-current');
    }
  },

  renderNext(track, isAdmin) {
    const card = document.getElementById('nextCard');

    if (!track) {
      card.className = 'next-card is-empty';
      card.innerHTML = '<div class="next-empty">Nothing up next</div>';
      return;
    }

    card.className = 'next-card';
    const thumb = track.thumbnail
      ? '<img src="' + this.escapeHtml(track.thumbnail) + '" alt="" loading="lazy">'
      : '<span class="next-art-letter">' + this._initial(track.title) + '</span>';

    const remaining = this._remaining > 0
      ? ' · in ' + this.formatTime(this._remaining)
      : '';

    card.innerHTML =
      '<div class="next-art">' + thumb + '</div>' +
      '<div class="next-body">' +
        '<p class="next-label">Up next' + remaining + '</p>' +
        '<p class="next-title">' + this.escapeHtml(track.title || 'Unknown') + '</p>' +
        '<p class="next-artist">' + this.escapeHtml(track.artist || track.channelTitle || 'Unknown') + '</p>' +
        '<p class="next-meta">' + (track.addedBy ? 'Added by ' + this.escapeHtml(track.addedBy) : '') + '</p>' +
      '</div>' +
      (isAdmin
        ? '<button class="next-play" data-action="next" title="Skip to this track">' +
            '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>' +
          '</button>'
        : '');
  },

  renderHistory(history) {
    const list = document.getElementById('historyList');
    const group = document.getElementById('playedGroup');

    history = history || [];
    if (!history.length) {
      group.classList.add('hidden');
      list.innerHTML = '';
      return;
    }

    group.classList.remove('hidden');
    list.innerHTML = history.slice(0, 4).map((item) => {
      const thumb = item.thumbnail
        ? '<img src="' + this.escapeHtml(item.thumbnail) + '" alt="" loading="lazy">'
        : '<span class="history-thumb-letter">' + this._initial(item.title) + '</span>';

      const canRequeue = !!item.youtubeId;
      const rowClass = canRequeue ? 'history-row' : 'history-row is-static';
      const attrs = canRequeue
        ? ' data-action="requeue" data-youtube-id="' + this.escapeHtml(item.youtubeId) + '"' +
          ' role="button" tabindex="0" title="Add back to the queue"'
        : '';
      const addIcon = canRequeue
        ? '<span class="history-add" aria-hidden="true">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>' +
          '</span>'
        : '';

      return (
        '<li class="' + rowClass + '"' + attrs + '>' +
          '<span class="history-thumb">' + thumb + '</span>' +
          '<span class="queue-info">' +
            '<span class="history-title">' + this.escapeHtml(item.title || 'Unknown') + '</span>' +
            '<span class="history-artist">' + this.escapeHtml(item.artist || '') + '</span>' +
          '</span>' +
          addIcon +
        '</li>'
      );
    }).join('');
  },

  /* ── Users ───────────────────────────────────────────────── */

  renderUsers(users, mySocketId) {
    const container = document.getElementById('usersContainer');
    const headerAvatars = document.getElementById('headerAvatars');
    const countEl = document.getElementById('userCount');

    users = users || [];
    const me = users.find((u) => u.socketId === mySocketId);
    if (me) this.myName = me.name;

    if (countEl) countEl.textContent = users.length;
    document.getElementById('meName').textContent = me ? me.name : 'You';

    if (headerAvatars) {
      headerAvatars.innerHTML = users.slice(0, 3)
        .map((user, index) => this._avatar(user.name, index, 'avatar--26'))
        .join('');
    }

    container.innerHTML = users.map((user, index) => {
      const isSelf = user.socketId === mySocketId;
      return (
        '<div class="user-badge' + (isSelf ? ' is-self' : '') + '" data-socket="' + this.escapeHtml(user.socketId) + '">' +
          this._avatar(user.name, index, 'avatar--24') +
          '<span class="user-name">' + this.escapeHtml(user.name || 'Anonymous') + '</span>' +
          (user.isAdmin ? '<span class="badge-admin">Admin</span>' : '') +
          (isSelf
            ? '<button class="user-edit-btn" title="Rename">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
              '</button>'
            : '') +
        '</div>'
      );
    }).join('');
  },

  /* ── Connection / play state ─────────────────────────────── */

  setConnection(connected) {
    const dot = document.getElementById('jamDot');
    const status = document.getElementById('syncStatus');
    if (dot) dot.classList.toggle('online', !!connected);
    if (status) {
      status.textContent = connected ? 'Synced' : 'Offline';
      status.classList.toggle('offline', !connected);
    }
  },

  setPlayButtonState(isPlaying) {
    const playIcon = document.getElementById('playIcon');
    const pauseIcon = document.getElementById('pauseIcon');

    if (isPlaying) {
      playIcon.classList.add('hidden');
      pauseIcon.classList.remove('hidden');
    } else {
      playIcon.classList.remove('hidden');
      pauseIcon.classList.add('hidden');
    }
  },

  /* ── Toasts & reactions ──────────────────────────────────── */

  showToast(message, isError) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast visible' + (isError ? ' error' : '');
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => {
      toast.classList.remove('visible');
    }, 3500);
  },

  showReactionToast(name, emoji) {
    const el = document.createElement('div');
    el.className = 'reaction-float';
    el.textContent = emoji;
    el.style.left = (10 + Math.random() * 80) + '%';
    el.style.bottom = '0';
    el.style.fontSize = (24 + Math.random() * 36) + 'px';
    el.style.animation = 'floatUp ' + (2 + Math.random() * 1.5) + 's ease-out forwards';
    document.body.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.remove(); }, 4000);
  },

  /* ── Chat ────────────────────────────────────────────────── */

  addChatMessage(msg) {
    const container = document.getElementById('chatMessages');
    const empty = container.querySelector('.chat-empty');
    if (empty) empty.remove();

    const el = document.createElement('div');
    el.className = 'chat-msg';

    const time = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
    const isMe = msg.name && msg.name === this.myName;

    el.innerHTML =
      '<div class="chat-msg-head">' +
        '<span class="chat-msg-name' + (isMe ? ' is-me' : '') + '">' + this.escapeHtml(msg.name) + '</span>' +
        '<span class="chat-msg-time">' + time + '</span>' +
      '</div>' +
      '<span class="chat-msg-text">' + this.escapeHtml(msg.text) + '</span>';

    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  },

  renderChatHistory(messages) {
    const container = document.getElementById('chatMessages');
    if (!messages || !messages.length) {
      container.innerHTML = '<div class="chat-empty">No messages yet</div>';
      return;
    }
    container.innerHTML = '';
    messages.forEach((m) => this.addChatMessage(m));
  },

  /* ── Search ──────────────────────────────────────────────── */

  setSearchTarget(resultsEl) {
    this._searchTarget = resultsEl;
  },

  _resultsEl() {
    return this._searchTarget || document.getElementById('headerSearchResults');
  },

  showSearchLoading() {
    const results = this._resultsEl();
    if (!results) return;
    results.classList.remove('hidden');
    results.innerHTML = '<div class="search-loading">Searching...</div>';
  },

  hideSearchResults() {
    ['searchResults', 'headerSearchResults'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.add('hidden');
        el.innerHTML = '';
      }
    });
  },

  renderSearchResults(items) {
    const results = this._resultsEl();
    if (!results) return;

    if (!items || !items.length) {
      results.innerHTML = '<div class="search-loading">No results</div>';
      results.classList.remove('hidden');
      return;
    }

    results.classList.remove('hidden');
    results.innerHTML = items.map((r) => {
      const badge = r.fromHistory ? '<span class="search-result-badge">History</span>' : '';
      const thumb = r.thumbnail
        ? '<img class="search-result-thumb" src="' + this.escapeHtml(r.thumbnail) + '" alt="" loading="lazy">'
        : '<span class="search-result-thumb search-result-thumb--empty"></span>';
      return (
        '<div class="search-result-item" data-id="' + this.escapeHtml(r.youtubeId) + '">' +
          thumb +
          '<div class="search-result-info">' +
            '<div class="search-result-title">' + this.escapeHtml(r.title) + badge + '</div>' +
            '<div class="search-result-artist">' + this.escapeHtml(r.artist) + '</div>' +
          '</div>' +
          '<span class="search-result-duration">' + this.formatTime(r.duration) + '</span>' +
        '</div>'
      );
    }).join('');
  },

  /* ── Rename ──────────────────────────────────────────────── */

  startRename(socketId, currentName, onRename) {
    const badge = document.querySelector('.user-badge[data-socket="' + socketId + '"]');
    if (!badge) return;
    const nameEl = badge.querySelector('.user-name');
    if (!nameEl) return;

    const input = document.createElement('input');
    input.className = 'user-rename-input';
    input.type = 'text';
    input.value = currentName;
    input.maxLength = 20;
    nameEl.replaceWith(input);
    input.focus();
    input.select();

    let finished = false;
    function finish(commit) {
      if (finished) return;
      finished = true;
      const newName = commit ? input.value.trim() : currentName;
      const span = document.createElement('span');
      span.className = 'user-name';
      span.textContent = newName || currentName;
      input.replaceWith(span);
      if (commit && newName && newName !== currentName) {
        onRename(newName);
      }
    }

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', function () { finish(true); });
  }
};
