(function () {
  'use strict';

  const audioEl = document.getElementById('audioPlayer');
  let player = audioEl ? new Player(audioEl) : null;
  let socket = null;
  let mySocketId = null;
  let isAdmin = false;
  let reconnectTimer = null;
  let currentTrack = null;
  let isPlaying = false;
  let hasVoted = false;
  let myName = '';
  let searchPending = false;
  let searchTimer = null;
  let lastQueue = [];
  let history = [];

  function rememberPlayed(track) {
    if (!track || !track.id) return;
    const key = track.youtubeId || track.id;
    history = [track].concat(history.filter(function (t) {
      return (t.youtubeId || t.id) !== key;
    })).slice(0, 50);
  }

  function renderHistory() {
    const visible = history.filter(function (t) {
      return !currentTrack || (t.youtubeId || t.id) !== (currentTrack.youtubeId || currentTrack.id);
    });
    UI.renderHistory(visible);
  }

  function getWebSocketUrl() {
    const loc = window.location;
    const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    return proto + '//' + loc.host;
  }

  function generateName() {
    const adj = ['Groovy', 'Funky', 'Smooth', 'Chill', 'Wavy', 'Cosmic', 'Neon', 'Sonic', 'Rhythm', 'Bluesy'];
    const noun = ['Jammer', 'Beats', 'Groove', 'Melody', 'Echo', 'Pulse', 'Wave', 'Vibe', 'Tune', 'Flow'];
    return adj[Math.floor(Math.random() * adj.length)] + noun[Math.floor(Math.random() * noun.length)] + Math.floor(Math.random() * 100);
  }

  function connect(name) {
    myName = name || 'Anonymous';
    UI.myName = myName;
    localStorage.setItem('easyjam_name', myName);

    socket = new WebSocket(getWebSocketUrl());

    socket.addEventListener('open', function () {
      UI.setConnection(true);
      socket.send(JSON.stringify({ type: 'join', name: myName }));
    });

    socket.addEventListener('message', function (event) {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      handleMessage(msg);
    });

    socket.addEventListener('close', function () {
      UI.setConnection(false);
      scheduleReconnect();
    });

    socket.addEventListener('error', function () {
      socket.close();
    });
  }

  function scheduleReconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(function () { window.location.reload(); }, 3000);
  }

  function send(data) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data));
    }
  }

  function handleMessage(msg) {
    switch (msg.type) {
      case 'welcome':
        mySocketId = msg.socketId;
        isAdmin = !!msg.isAdmin;
        break;

      case 'state':
        if (msg.socketId) mySocketId = msg.socketId;
        if (msg.isAdmin !== undefined) isAdmin = msg.isAdmin;
        currentTrack = msg.currentTrack || null;
        isPlaying = msg.isPlaying || false;
        lastQueue = msg.queue || [];
        history = msg.history || [];

        UI.renderPlayer(currentTrack, isPlaying, isAdmin);
        UI.renderQueue(lastQueue, currentTrack, isAdmin);
        UI.renderUsers(msg.users || [], mySocketId);
        UI.renderChatHistory(msg.chatHistory || []);
        renderHistory();

        if (msg.votes) {
          UI.renderVotes(msg.votes.count, msg.votes.threshold, (msg.users || []).length, isAdmin);
        }

        if (currentTrack && player) {
          const url = currentTrack.url || currentTrack.streamUrl;
          if (url) player.setSource(url);
          if (isPlaying) {
            player.playFrom(msg.position || 0);
            UI.startProgressUpdates(player);
          } else {
            player.pauseAt(msg.position || 0);
            UI.updateProgress(msg.position || 0, currentTrack.duration || 0);
            UI.stopProgressUpdates();
          }
        } else {
          UI.updateProgress(0, 0);
          UI.stopProgressUpdates();
        }
        break;

      case 'play':
        if (msg.track) {
          if (currentTrack && currentTrack.id !== msg.track.id) rememberPlayed(currentTrack);
          currentTrack = msg.track;
          var url = msg.track.url || msg.track.streamUrl;
          if (url && player) player.setSource(url);
          if (player) player.playFrom(msg.position || 0);
        } else if (player) {
          if (player.isPaused()) {
            if (msg.position != null) player.seek(msg.position);
            player.play();
          }
        }
        isPlaying = true;
        UI.renderPlayer(currentTrack, true, isAdmin);
        renderHistory();
        if (player && !player.isPaused()) UI.startProgressUpdates(player);
        UI.setPlayButtonState(true);
        break;

      case 'pause':
        isPlaying = false;
        if (player) player.pauseAt(msg.position);
        UI.stopProgressUpdates();
        UI.renderPlayer(currentTrack, false, isAdmin);
        UI.setPlayButtonState(false);
        break;

      case 'skip':
        if (msg.prevTrack) rememberPlayed(msg.prevTrack);
        currentTrack = msg.nextTrack || null;
        isPlaying = !!msg.nextTrack;
        hasVoted = false;
        UI.resetVoteButton();
        if (msg.queue) lastQueue = msg.queue;
        renderHistory();

        if (msg.nextTrack && player) {
          var url = msg.nextTrack.url || msg.nextTrack.streamUrl;
          if (url !== player.currentSrc) {
            if (url) player.audio.src = url;
            player.audio.load();
          }
          player.playFrom(0);
          UI.startProgressUpdates(player);
        } else if (player) {
          player.pause();
          player.audio.removeAttribute('src');
          player.audio.load();
          UI.stopProgressUpdates();
          UI.updateProgress(0, 0);
        }

        UI.renderPlayer(currentTrack, isPlaying, isAdmin);
        UI.setPlayButtonState(isPlaying);

        if (msg.queue) {
          UI.renderQueue(lastQueue, currentTrack, isAdmin);
        }
        break;

      case 'sync':
        if (player && currentTrack && !player.isPaused()) {
          player.syncPosition(msg.position || 0);
        }
        break;

      case 'queue_updated':
        lastQueue = msg.queue || [];
        UI.renderQueue(lastQueue, currentTrack, isAdmin);
        break;

      case 'votes_updated':
        UI.renderVotes(msg.count, msg.threshold, msg.totalUsers || 0, isAdmin);
        break;

      case 'admin_changed':
        if (msg.socketId === mySocketId) {
          isAdmin = msg.isAdmin;
          UI.showToast(isAdmin ? 'You are now the admin' : 'You are no longer admin');
          UI.renderPlayer(currentTrack, isPlaying, isAdmin);
          UI.renderQueue(lastQueue, currentTrack, isAdmin);
        }
        break;

      case 'user_count':
        const countEl = document.getElementById('userCount');
        if (countEl) countEl.textContent = msg.count || 0;
        break;

      case 'user_joined':
      case 'user_left':
        if (msg.users) UI.renderUsers(msg.users, mySocketId);
        break;

      case 'users_updated':
        if (msg.users) UI.renderUsers(msg.users, mySocketId);
        break;

      case 'chat':
        UI.addChatMessage(msg);
        break;

      case 'search_results':
        searchPending = false;
        UI.renderSearchResults(msg.results || []);
        break;

      case 'rename_ok':
        myName = msg.name;
        UI.myName = myName;
        localStorage.setItem('easyjam_name', myName);
        UI.showToast('Name updated to ' + myName);
        break;

      case 'reaction':
        UI.showReactionToast(msg.name, msg.emoji);
        break;

      case 'toast':
        UI.showToast(msg.message, false);
        break;

      case 'error':
        UI.showToast(msg.message || 'An error occurred', true);
        break;
    }
  }

  function init() {
    // Autoplay recovery: click anywhere to resume
    if (player) {
      player.onPlayBlocked(function () {
        UI.showToast('Click to start listening');
      });
    }

    document.getElementById('playerSection').addEventListener('click', function () {
      if (player && player.isPlayBlocked()) {
        player.resumeOnInteraction();
      }
    });

    // Name prompt
    var storedName = localStorage.getItem('easyjam_name');
    var nameOverlay = document.getElementById('nameOverlay');
    var nameInput = document.getElementById('nameInput');
    var nameJoinBtn = document.getElementById('nameJoinBtn');

    if (storedName) {
      nameOverlay.classList.add('hidden');
      connect(storedName);
    } else {
      nameInput.placeholder = generateName();
      var joinPresence = document.getElementById('joinPresence');
      nameInput.addEventListener('input', function () {
        var value = nameInput.value.trim();
        joinPresence.textContent = value
          ? 'Joining as ' + value + '.'
          : 'No account needed — jump straight in.';
      });
      nameJoinBtn.addEventListener('click', function () {
        var n = nameInput.value.trim() || generateName();
        nameOverlay.classList.add('hidden');
        connect(n);
      });
      nameInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') nameJoinBtn.click();
      });
      setTimeout(function () { nameInput.focus(); }, 60);
    }

    const playBtn = document.getElementById('playBtn');
    const nextBtn = document.getElementById('nextBtn');
    const voteBtn = document.getElementById('voteBtn');
    const progressBar = document.getElementById('progressBar');

    playBtn.addEventListener('click', function () {
      if (isAdmin) {
        if (isPlaying) {
          send({ type: 'control', action: 'pause' });
        } else {
          send({ type: 'control', action: 'play' });
        }
      } else if (player && player.isPlayBlocked()) {
        player.resumeOnInteraction();
      }
    });

    nextBtn.addEventListener('click', function () {
      send({ type: 'control', action: 'skip' });
    });

    // Volume
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeIcon = document.getElementById('volumeIcon');
    const volumeMuteIcon = document.getElementById('volumeMuteIcon');

    let savedVol = localStorage.getItem('easyjam_volume');
    let volume = savedVol != null ? parseInt(savedVol) : 80;
    let muteBefore = volume;

    function applyVolume() {
      if (audioEl) audioEl.volume = volume / 100;
      volumeSlider.value = volume;
      volumeIcon.classList.toggle('hidden', volume === 0);
      volumeMuteIcon.classList.toggle('hidden', volume > 0);
    }

    volumeSlider.addEventListener('input', function () {
      volume = parseInt(volumeSlider.value);
      localStorage.setItem('easyjam_volume', volume);
      applyVolume();
    });

    function toggleMute() {
      if (volume > 0) {
        muteBefore = volume;
        volume = 0;
      } else {
        volume = muteBefore || 80;
      }
      localStorage.setItem('easyjam_volume', volume);
      applyVolume();
    }

    volumeIcon.addEventListener('click', toggleMute);
    volumeMuteIcon.addEventListener('click', toggleMute);
    applyVolume();

    // ── Lyrics ──
    var lyricsCache = {};
    var _syncedLyrics = null;
    var _lyricsTimer = null;

    function _closeLyrics() {
      if (_lyricsTimer) { clearInterval(_lyricsTimer); _lyricsTimer = null; }
    }

    document.getElementById('lyricsBtn').addEventListener('click', function () {
      if (!currentTrack) return;
      var overlay = document.getElementById('lyricsOverlay');
      var content = document.getElementById('lyricsContent');
      var cacheKey = (currentTrack.artist || '') + ' - ' + (currentTrack.title || '');

      overlay.classList.remove('hidden');

      if (lyricsCache[cacheKey]) {
        content.innerHTML = lyricsCache[cacheKey];
        return;
      }

      content.innerHTML = '<div class="lyrics-loading">Loading lyrics...</div>';

      var artist = encodeURIComponent(currentTrack.artist || '');
      var title = encodeURIComponent(currentTrack.title || '');

      if (!currentTrack.title) {
        content.innerHTML = '<div class="lyrics-no-lyrics">No lyrics available for this track</div>';
        return;
      }

      fetch('/api/lyrics?artist=' + artist + '&title=' + title).then(function (r) { return r.json(); }).then(function (data) {
        if (data.lyrics) {
          var html = renderLyrics(data.lyrics, data.synced);
          if (html) { lyricsCache[cacheKey] = html; content.innerHTML = html; }
          else { content.innerHTML = '<div class="lyrics-no-lyrics">No lyrics available for this track</div>'; }
        } else {
          content.innerHTML = '<div class="lyrics-no-lyrics">No lyrics available for this track</div>';
        }
      }).catch(function () {
        content.innerHTML = '<div class="lyrics-no-lyrics">No lyrics available for this track</div>';
      });
    });

    document.getElementById('lyricsClose').addEventListener('click', function () {
      _closeLyrics();
      document.getElementById('lyricsOverlay').classList.add('hidden');
    });

    // ── Reactions ──
    document.querySelectorAll('.reaction-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        send({ type: 'react', emoji: btn.getAttribute('data-emoji') });
      });
    });

    function isUrl(text) {
      return /^https?:\/\//.test(text) || /youtube\.com|youtu\.be/.test(text);
    }

    function triggerSearch(query) {
      searchPending = true;
      UI.showSearchLoading();
      send({ type: 'search', query: query });
    }

    function setupSearch(input, resultsEl) {
      if (!input || !resultsEl) return;

      input.addEventListener('focus', function () {
        UI.setSearchTarget(resultsEl);
      });

      input.addEventListener('input', function () {
        UI.setSearchTarget(resultsEl);
        const text = input.value.trim();
        clearTimeout(searchTimer);

        if (!text || isUrl(text)) {
          UI.hideSearchResults();
          searchPending = false;
          return;
        }

        if (text.length < 2) return;

        searchTimer = setTimeout(function () {
          triggerSearch(text);
        }, 500);
      });

      input.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        UI.setSearchTarget(resultsEl);
        const text = input.value.trim();
        if (!text) return;

        if (isUrl(text)) {
          send({ type: 'add_to_queue', url: text });
          input.value = '';
          UI.hideSearchResults();
        } else {
          triggerSearch(text);
        }
      });
    }

    const headerSearchInput = document.getElementById('headerSearchInput');
    const headerSearchResults = document.getElementById('headerSearchResults');
    setupSearch(headerSearchInput, headerSearchResults);

    function handleSearchResultClick(e) {
      const item = e.target.closest('.search-result-item');
      if (!item) return;
      const url = 'https://www.youtube.com/watch?v=' + item.getAttribute('data-id');
      send({ type: 'add_to_queue', url: url });
      headerSearchInput.value = '';
      UI.hideSearchResults();
    }

    headerSearchResults.addEventListener('click', handleSearchResultClick);

    voteBtn.addEventListener('click', function () {
      if (voteBtn.disabled || hasVoted) return;
      send({ type: 'vote_skip' });
      hasVoted = true;
      UI.setVoteSkipped();
    });

    progressBar.addEventListener('click', function (e) {
      if (!isAdmin || !currentTrack) return;
      const rect = progressBar.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      const seekTime = pct * (currentTrack.duration || 0);
      if (isFinite(seekTime) && seekTime >= 0) {
        send({ type: 'control', action: 'seek', position: seekTime });
      }
    });

    document.getElementById('queueList').addEventListener('click', function (e) {
      const btn = e.target.closest('[data-action="remove"]');
      if (btn) {
        send({ type: 'remove_from_queue', trackId: btn.getAttribute('data-id') });
      }
    });

    document.getElementById('clearQueueBtn').addEventListener('click', function () {
      lastQueue.forEach(function (track) {
        send({ type: 'remove_from_queue', trackId: track.id });
      });
    });

    document.getElementById('nextCard').addEventListener('click', function (e) {
      const btn = e.target.closest('[data-action="next"]');
      if (btn) send({ type: 'control', action: 'skip' });
    });

    // ── Mobile drawers (queue / chat) ──
    const queuePanel = document.getElementById('queueSection');
    const chatPanel = document.getElementById('chatSection');
    const queueToggle = document.getElementById('queueToggle');
    const chatToggle = document.getElementById('chatToggle');
    const drawerBackdrop = document.getElementById('drawerBackdrop');
    let drawerTrigger = null;

    function closeDrawer() {
      queuePanel.classList.remove('is-open');
      chatPanel.classList.remove('is-open');
      drawerBackdrop.classList.remove('visible');
      document.body.classList.remove('drawer-open');
      queueToggle.setAttribute('aria-expanded', 'false');
      chatToggle.setAttribute('aria-expanded', 'false');
      if (drawerTrigger) {
        drawerTrigger.focus({ preventScroll: true });
        drawerTrigger = null;
      }
    }

    function openDrawer(which) {
      closeDrawer();
      const panel = which === 'queue' ? queuePanel : chatPanel;
      const trigger = which === 'queue' ? queueToggle : chatToggle;
      drawerTrigger = trigger;
      panel.classList.add('is-open');
      drawerBackdrop.classList.add('visible');
      document.body.classList.add('drawer-open');
      trigger.setAttribute('aria-expanded', 'true');
      const close = panel.querySelector('.drawer-close');
      if (close) close.focus({ preventScroll: true });
    }

    queueToggle.addEventListener('click', function () {
      if (queuePanel.classList.contains('is-open')) closeDrawer();
      else openDrawer('queue');
    });

    chatToggle.addEventListener('click', function () {
      if (chatPanel.classList.contains('is-open')) closeDrawer();
      else openDrawer('chat');
    });

    drawerBackdrop.addEventListener('click', closeDrawer);

    document.querySelectorAll('[data-close-drawer]').forEach(function (btn) {
      btn.addEventListener('click', closeDrawer);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDrawer();
    });

    const mobileQuery = window.matchMedia('(max-width: 1180px)');
    const onLayoutChange = function (e) {
      if (!e.matches) closeDrawer();
    };
    if (mobileQuery.addEventListener) mobileQuery.addEventListener('change', onLayoutChange);
    else if (mobileQuery.addListener) mobileQuery.addListener(onLayoutChange);

    function focusSearch() {
      closeDrawer();
      headerSearchInput.focus();
      headerSearchInput.select();
    }

    document.getElementById('addFromYt').addEventListener('click', focusSearch);

    function requeueHistoryRow(row) {
      if (!row) return;
      const youtubeId = row.getAttribute('data-youtube-id');
      if (!youtubeId) return;
      const titleEl = row.querySelector('.history-title');
      const title = titleEl ? titleEl.textContent : 'Track';
      UI.showToast('Adding "' + title + '" back to the queue…');
      send({ type: 'add_to_queue', url: 'https://www.youtube.com/watch?v=' + youtubeId });
    }

    const historyList = document.getElementById('historyList');

    historyList.addEventListener('click', function (e) {
      const row = e.target.closest('[data-action="requeue"]');
      if (row) requeueHistoryRow(row);
    });

    historyList.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const row = e.target.closest('[data-action="requeue"]');
      if (!row) return;
      e.preventDefault();
      requeueHistoryRow(row);
    });

    // Header user menu
    const meBtn = document.getElementById('meBtn');
    const meMenu = document.getElementById('meMenu');

    function closeMeMenu() {
      meMenu.classList.add('hidden');
      meBtn.setAttribute('aria-expanded', 'false');
    }

    meBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      const isOpen = !meMenu.classList.toggle('hidden');
      meBtn.setAttribute('aria-expanded', String(isOpen));
    });

    document.addEventListener('click', function (e) {
      if (!meMenu.contains(e.target) && !meBtn.contains(e.target)) closeMeMenu();
    });

    meMenu.addEventListener('click', function (e) {
      const item = e.target.closest('[data-action]');
      if (!item) return;
      const action = item.getAttribute('data-action');
      closeMeMenu();

      if (action === 'leave') {
        localStorage.removeItem('easyjam_name');
        window.location.reload();
        return;
      }

      if (action === 'rename') {
        const badge = document.querySelector('.user-badge.is-self');
        if (!badge) return;
        badge.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        UI.startRename(mySocketId, UI.myName || myName, function (newName) {
          send({ type: 'rename', name: newName });
        });
      }
    });

    // Rename
    document.getElementById('usersContainer').addEventListener('click', function (e) {
      const editBtn = e.target.closest('.user-edit-btn');
      if (!editBtn) return;
      const badge = editBtn.closest('.user-badge');
      const socketId = badge.getAttribute('data-socket');
      const currentName = badge.querySelector('.user-name').textContent;
      UI.startRename(socketId, currentName, function (newName) {
        send({ type: 'rename', name: newName });
      });
    });

    // Chat
    const chatInput = document.getElementById('chatInput');
    const chatSendBtn = document.getElementById('chatSendBtn');

    function sendChat() {
      const text = chatInput.value.trim();
      if (!text) return;
      send({ type: 'chat', text });
      chatInput.value = '';
    }

    chatSendBtn.addEventListener('click', sendChat);
    chatInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') sendChat();
    });

    UI.updateProgress(0, 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
