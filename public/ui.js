const UI = {
  _progressInterval: null,

  renderPlayer(track, isPlaying, isAdmin) {
    const emptyState = document.getElementById('emptyState');
    const playerArea = document.getElementById('playerArea');
    const thumbnail = document.getElementById('playerThumbnail');
    const title = document.getElementById('playerTitle');
    const artist = document.getElementById('playerArtist');
    const playBtn = document.getElementById('playBtn');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');

    if (!track) {
      emptyState.classList.remove('hidden');
      playerArea.classList.add('hidden');
      playBtn.disabled = true;
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      document.getElementById('reactions').classList.add('hidden');
      this.setPlayButtonState(false);
      return;
    }

    emptyState.classList.add('hidden');
    playerArea.classList.remove('hidden');

    thumbnail.src = track.thumbnail || '';
    thumbnail.alt = track.title || '';
    title.textContent = track.title || 'Unknown';
    artist.textContent = track.artist || track.channelTitle || 'Unknown';

    var addedBy = document.getElementById('playerAddedBy');
    if (track.addedBy) {
      addedBy.textContent = 'added by ' + track.addedBy;
      addedBy.style.display = '';
    } else {
      addedBy.style.display = 'none';
    }

    var reactions = document.getElementById('reactions');
    reactions.classList.remove('hidden');

    playBtn.disabled = !isAdmin || !track;
    prevBtn.disabled = !isAdmin;
    nextBtn.disabled = !isAdmin;

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

  renderVotes(votesCount, threshold, totalUsers, isAdmin) {
    const section = document.getElementById('voteSection');
    const countEl = document.getElementById('voteCount');
    const thresholdEl = document.getElementById('voteThreshold');
    const fillEl = document.getElementById('voteProgressFill');
    const btn = document.getElementById('voteBtn');

    if (threshold <= 0 || totalUsers < 2) {
      section.classList.add('hidden');
      return;
    }

    section.classList.remove('hidden');
    countEl.textContent = votesCount;
    thresholdEl.textContent = threshold;

    const pct = threshold > 0 ? (votesCount / threshold) * 100 : 0;
    fillEl.style.width = Math.min(pct, 100) + '%';

    btn.disabled = isAdmin;
  },

  setVoteSkipped() {
    const btn = document.getElementById('voteBtn');
    btn.disabled = true;
    btn.textContent = 'Voted';
  },

  resetVoteButton() {
    const btn = document.getElementById('voteBtn');
    btn.disabled = false;
    btn.textContent = 'Vote Skip';
  },

  renderQueue(queue, currentTrack, isAdmin) {
    const list = document.getElementById('queueList');
    const count = document.getElementById('queueCount');

    count.textContent = queue.length;

    if (!queue.length) {
      const msg = currentTrack
        ? 'Nothing up next'
        : 'Queue is empty &mdash; add a song!';
      list.innerHTML =
        '<li class="queue-empty">' +
          '<svg class="queue-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>' +
          '</svg>' +
          '<span class="queue-empty-text">' + msg + '</span>' +
        '</li>';
      return;
    }

    let html = '';
    const currentId = currentTrack ? currentTrack.id : null;

    for (const item of queue) {
      const isCurrent = item.id === currentId;
      const addedBy = item.addedBy || item.added_by || 'unknown';
      const title = this.escapeHtml(item.title || 'Unknown');
      const artist = this.escapeHtml(item.artist || item.channelTitle || 'Unknown');
      const thumb = item.thumbnail || '';
      const duration = item.duration || 0;

      html +=
        '<li class="queue-item' + (isCurrent ? ' current' : '') + '" data-id="' + item.id + '">' +
          '<img class="queue-item-thumb" src="' + this.escapeHtml(thumb) + '" alt="" loading="lazy">' +
          '<div class="queue-item-info">' +
            '<div class="queue-item-title">' + title + '</div>' +
            '<div class="queue-item-artist">' + artist + '</div>' +
          '</div>' +
          '<div class="queue-item-meta">' +
            '<span class="queue-item-duration">' + this.formatTime(duration) + '</span>' +
            '<span class="queue-item-added">' + this.escapeHtml(addedBy) + '</span>' +
          '</div>';

      if (isAdmin && !isCurrent) {
        html +=
          '<button class="queue-remove-btn" data-action="remove" data-id="' + item.id + '" title="Remove">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
          '</button>';
      }

      html += '</li>';
    }

    list.innerHTML = html;
  },

  renderUsers(users, mySocketId) {
    const container = document.getElementById('usersContainer');

    let html = '<span class="users-label">In the jam</span>';

    for (const user of users) {
      const isSelf = user.socketId === mySocketId;
      const name = this.escapeHtml(user.name || 'Anonymous');

      html +=
        '<div class="user-badge' + (isSelf ? ' is-self' : '') + '" data-socket="' + user.socketId + '">' +
          '<span class="user-dot"></span>' +
          '<span class="user-name">' + name + '</span>';

      if (isSelf) {
        html += '<button class="user-edit-btn" title="Rename">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>' +
        '</button>';
      }

      if (user.isAdmin) {
        html += '<span class="user-admin-badge">Admin</span>';
      }

      html += '</div>';
    }

    container.innerHTML = html;
  },

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
    var el = document.createElement('div');
    el.className = 'reaction-float';
    el.textContent = emoji;
    el.style.left = (10 + Math.random() * 80) + '%';
    el.style.bottom = '0';
    el.style.fontSize = (24 + Math.random() * 36) + 'px';
    el.style.animation = 'floatUp ' + (2 + Math.random() * 1.5) + 's ease-out forwards';
    el.style.transform = 'rotate(' + (Math.random() * 40 - 20) + 'deg)';
    document.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.remove(); }, 4000);
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

  formatTime(seconds) {
    if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
    const s = Math.floor(seconds);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  },

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  addChatMessage(msg) {
    const container = document.getElementById('chatMessages');
    const empty = container.querySelector('.chat-empty');
    if (empty) empty.remove();

    const el = document.createElement('div');
    el.className = 'chat-msg';

    const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    el.innerHTML =
      '<span class="chat-msg-name">' + this.escapeHtml(msg.name) + '</span>' +
      '<span class="chat-msg-text">' + this.escapeHtml(msg.text) + '</span>' +
      '<span class="chat-msg-time">' + time + '</span>';

    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  },

  renderChatHistory(messages) {
    if (!messages || !messages.length) return;
    const container = document.getElementById('chatMessages');
    const empty = container.querySelector('.chat-empty');
    if (empty) empty.remove();
    container.innerHTML = '';
    messages.forEach(m => this.addChatMessage(m));
  },

  showSearchLoading() {
    const results = document.getElementById('searchResults');
    results.classList.remove('hidden');
    results.innerHTML = '<div class="search-loading">Searching...</div>';
  },

  hideSearchResults() {
    const results = document.getElementById('searchResults');
    results.classList.add('hidden');
    results.innerHTML = '';
  },

  renderSearchResults(items) {
    const results = document.getElementById('searchResults');
    if (!items.length) {
      results.innerHTML = '<div class="search-loading">No results</div>';
      results.classList.remove('hidden');
      return;
    }
    results.classList.remove('hidden');
    results.innerHTML = items.map(function (r) {
      var badge = r.fromHistory ? '<span class="search-result-badge">History</span>' : '';
      return '<div class="search-result-item" data-id="' + r.youtubeId + '">' +
        '<img class="search-result-thumb" src="' + (r.thumbnail || '') + '" alt="" loading="lazy">' +
        '<div class="search-result-info">' +
          '<div class="search-result-title">' + this.escapeHtml(r.title) + badge + '</div>' +
          '<div class="search-result-artist">' + this.escapeHtml(r.artist) + '</div>' +
        '</div>' +
        '<span class="search-result-duration">' + this.formatTime(r.duration) + '</span>' +
      '</div>';
    }.bind(this)).join('');
  },

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

    function finish(commit) {
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
