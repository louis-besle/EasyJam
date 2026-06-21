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
  let currentView = 'jam';

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
    localStorage.setItem('easyjam_name', myName);

    socket = new WebSocket(getWebSocketUrl());

    socket.addEventListener('open', function () {
      document.querySelector('.user-count-dot').style.background = '#22c55e';
      socket.send(JSON.stringify({ type: 'join', name: myName }));
    });

    socket.addEventListener('message', function (event) {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      handleMessage(msg);
    });

    socket.addEventListener('close', function () {
      document.querySelector('.user-count-dot').style.background = '#ef4444';
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
        window.__isAdmin = isAdmin;
        document.getElementById('viewNav').style.display = 'flex';
        document.getElementById('tournamentStartBtn').classList.toggle('hidden', !isAdmin);
        break;

      case 'state':
        if (msg.socketId) mySocketId = msg.socketId;
        if (msg.isAdmin !== undefined) isAdmin = msg.isAdmin;
        currentTrack = msg.currentTrack || null;
        isPlaying = msg.isPlaying || false;

        UI.renderPlayer(currentTrack, isPlaying, isAdmin);
        UI.renderQueue(msg.queue || [], currentTrack, isAdmin);
        UI.renderUsers(msg.users || [], mySocketId);
        UI.renderChatHistory(msg.chatHistory || []);

        if (msg.votes) {
          UI.renderVotes(msg.votes.count, msg.votes.threshold, (msg.users || []).length, isAdmin);
        }

        if (msg.tournamentPool) Tournament.updatePool(msg.tournamentPool);

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
        if (player && !player.isPaused()) UI.startProgressUpdates(player);
        UI.setPlayButtonState(true);
        break;

      case 'pause':
        isPlaying = false;
        if (player) player.pauseAt(msg.position);
        UI.stopProgressUpdates();
        UI.setPlayButtonState(false);
        break;

      case 'skip':
        currentTrack = msg.nextTrack || null;
        isPlaying = !!msg.nextTrack;
        hasVoted = false;
        UI.resetVoteButton();

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
          UI.renderQueue(msg.queue, currentTrack, isAdmin);
        }
        break;

      case 'sync':
        if (player && currentTrack && !player.isPaused()) {
          player.syncPosition(msg.position || 0);
        }
        break;

      case 'queue_updated':
        UI.renderQueue(msg.queue || [], currentTrack, isAdmin);
        break;

      case 'votes_updated':
        UI.renderVotes(msg.count, msg.threshold, msg.totalUsers || 0, isAdmin);
        break;

      case 'admin_changed':
        if (msg.socketId === mySocketId) {
          isAdmin = msg.isAdmin;
          window.__isAdmin = isAdmin;
          document.getElementById('tournamentStartBtn').classList.toggle('hidden', !isAdmin);
          UI.showToast(isAdmin ? 'You are now the admin' : 'You are no longer admin');
          UI.renderPlayer(currentTrack, isPlaying, isAdmin);
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
        if (currentView === 'tournament') {
          Tournament.onSearchResults(msg.results || []);
        } else {
          UI.renderSearchResults(msg.results || []);
        }
        break;

      case 'rename_ok':
        myName = msg.name;
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

      // ── Tournament ──
      case 'tournament_state':
        Tournament.updateState(msg.state);
        Tournament.updateState = Tournament.updateState; // ensure bound
        break;

      case 'tournament_matchup':
        Tournament.showMatchup(msg.match || { trackA: msg.trackA, trackB: msg.trackB, id: msg.matchId }, msg.round || 0, msg.matchIndex || 0);
        break;

      case 'tournament_play':
        Tournament.setPlaying(msg.trackId);
        if (player) {
          var t = Tournament.getCurrentTrack(msg.trackId);
          if (t) {
            var url = t.url || t.streamUrl;
            if (url) player.setSource(url);
            player.playFrom(0);
          }
        }
        break;

      case 'tournament_vote_open':
        Tournament.setVoting();
        break;

      case 'tournament_vote_update':
        Tournament.updateVotes(msg.votesA || 0, msg.votesB || 0, msg.total || 0);
        break;

      case 'tournament_match_result':
        Tournament.showMatchResult(msg.winnerId);
        break;

      case 'tournament_round_done':
        UI.showToast('Round ' + (msg.round + 1) + ' complete');
        break;

      case 'tournament_finished':
        Tournament.showChampion(msg.champion);
        UI.showToast('Tournament finished!');
        break;

      case 'tournament_pool_updated':
        Tournament.updatePool(msg.pool || []);
        break;

      case 'tournament_pool_added':
        break;

      case 'tournament_left':
        Tournament.reset();
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
      nameJoinBtn.addEventListener('click', function () {
        var n = nameInput.value.trim() || generateName();
        nameOverlay.classList.add('hidden');
        connect(n);
      });
      nameInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') nameJoinBtn.click();
      });
    }

    const playBtn = document.getElementById('playBtn');
    const nextBtn = document.getElementById('nextBtn');
    const addInput = document.getElementById('addInput');
    const addBtn = document.getElementById('addBtn');
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

    addBtn.addEventListener('click', function () {
      const text = addInput.value.trim();
      if (!text) return;
      if (isUrl(text)) {
        send({ type: 'add_to_queue', url: text });
        addInput.value = '';
        UI.hideSearchResults();
      } else {
        triggerSearch(text);
      }
    });

    addInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        const text = addInput.value.trim();
        if (!text) return;
        if (isUrl(text)) {
          send({ type: 'add_to_queue', url: text });
          addInput.value = '';
          UI.hideSearchResults();
        } else {
          triggerSearch(text);
        }
      }
    });

    addInput.addEventListener('input', function () {
      const text = addInput.value.trim();
      if (!text || isUrl(text) || text.length < 2 || searchPending) {
        if (!text || isUrl(text)) UI.hideSearchResults();
        return;
      }
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        triggerSearch(text);
      }, 500);
    });

    function triggerSearch(query) {
      searchPending = true;
      UI.showSearchLoading();
      send({ type: 'search', query: query });
    }

    document.getElementById('searchResults').addEventListener('click', function (e) {
      const item = e.target.closest('.search-result-item');
      if (!item) return;
      const url = 'https://www.youtube.com/watch?v=' + item.getAttribute('data-id');
      send({ type: 'add_to_queue', url: url });
      addInput.value = '';
      UI.hideSearchResults();
    });

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

    // ── View toggle (Jam / Tournament) ──

    document.querySelectorAll('.view-nav-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var view = btn.getAttribute('data-view');
        if (view === currentView) return;
        currentView = view;
        document.querySelectorAll('.view-nav-btn').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-view') === view); });
        if (view === 'tournament') {
          Tournament.show();
        } else {
          Tournament.hide();
        }
      });
    });

    // ── Tournament module ──
    Tournament.init(
      function onStart(size) { send({ type: 'tournament_start', size: size }); },
      function onVote(matchId, trackVoted) { send({ type: 'tournament_vote', matchId: matchId, trackVoted: trackVoted }); },
      function onLeave() { send({ type: 'tournament_leave' }); },
      function(data) { send(data); }
    );

    UI.updateProgress(0, 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
