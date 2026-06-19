class Player {
  constructor(audioElement, onEnded) {
    this.audio = audioElement;
    this.currentSrc = null;
    this._seekTarget = null;
    this._onEnded = onEnded;
    this._playBlocked = false;
    this._retryCallback = null;

    this.audio.addEventListener('ended', () => {
      if (this._onEnded) this._onEnded();
    });

    this.audio.addEventListener('loadedmetadata', () => {
      if (this._seekTarget != null) {
        this.audio.currentTime = this._seekTarget;
        this._seekTarget = null;
      }
    });

    this.audio.addEventListener('canplay', () => {
      if (this._seekTarget != null) {
        this.audio.currentTime = this._seekTarget;
        this._seekTarget = null;
      }
    });
  }

  _tryPlay() {
    return this.audio.play().then(() => {
      this._playBlocked = false;
    }).catch((err) => {
      if (err.name === 'NotAllowedError') {
        this._playBlocked = true;
        if (this._retryCallback) this._retryCallback();
      }
    });
  }

  playFrom(position) {
    if (this.audio.readyState >= 1) {
      this.audio.currentTime = position;
    } else {
      this._seekTarget = position;
    }
    this._tryPlay();
  }

  pauseAt(position) {
    this.audio.pause();
    if (this.audio.readyState >= 1) {
      if (position != null) this.audio.currentTime = position;
    } else {
      this._seekTarget = position;
    }
  }

  resumeOnInteraction() {
    if (this._playBlocked) {
      this._playBlocked = false;
      this._tryPlay();
    }
  }

  isPlayBlocked() { return this._playBlocked; }

  syncPosition(serverPosition) {
    if (this.audio.paused) return;
    var current = this.audio.currentTime;
    var drift = Math.abs(current - serverPosition);
    if (drift > 0.5 && serverPosition > 3) {
      this.audio.currentTime = serverPosition;
    }
  }

  getCurrentTime() { return this.audio.currentTime; }
  getDuration() { return this.audio.duration || 0; }
  isPaused() { return this.audio.paused; }

  setSource(url) {
    if (url !== this.currentSrc) {
      this.currentSrc = url;
      this.audio.src = url;
      this.audio.load();
    }
  }

  onPlayBlocked(cb) { this._retryCallback = cb; }

  play() { this._tryPlay(); }
  pause() { this.audio.pause(); }
  seek(time) { this.audio.currentTime = time; }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Player;
}
