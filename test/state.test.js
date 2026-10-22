const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const os = require('os');
const fs = require('fs');
const path = require('path');

// Isoler les tests : ne jamais écrire dans le vrai queue.json
const TEST_QUEUE_FILE = path.join(os.tmpdir(), 'easyjam-test-queue-' + process.pid + '.json');
process.env.EASYJAM_QUEUE_FILE = TEST_QUEUE_FILE;

const {
  createRoom, addToQueue, removeFromQueue, playTrack, pauseTrack, skipTrack,
  addUser, removeUser, voteSkip, resetVotes, getCurrentPosition, getFullState,
  saveQueue, loadQueue
} = require('../server/state');

process.on('exit', () => {
  try { fs.unlinkSync(TEST_QUEUE_FILE); } catch {}
});

const trackData = {
  title: 'Test Song',
  artist: 'Test Artist',
  duration: 200,
  thumbnail: 'http://example.com/thumb.jpg',
  youtubeId: 'dQw4w9WgXcQ',
  streamUrl: 'http://example.com/stream',
  addedBy: 'socket1'
};

describe('createRoom', () => {
  it('should create a room with default values', () => {
    const room = createRoom();
    assert.deepStrictEqual(room.queue, []);
    assert.strictEqual(room.current, null);
    assert.strictEqual(room.isPlaying, false);
    assert.deepStrictEqual(room.votesSkip, {});
    assert.deepStrictEqual(room.users, {});
    assert.strictEqual(room.skipThreshold, 0.5);
  });
});

describe('addToQueue', () => {
  it('should add a track with id and addedAt', () => {
    const room = createRoom();
    const track = addToQueue(room, trackData);
    assert.ok(track.id);
    assert.ok(track.addedAt);
    assert.strictEqual(track.title, 'Test Song');
    assert.strictEqual(room.queue.length, 1);
  });
});

describe('removeFromQueue', () => {
  it('should remove a track by id', () => {
    const room = createRoom();
    const track = addToQueue(room, trackData);
    const removed = removeFromQueue(room, track.id);
    assert.strictEqual(removed.id, track.id);
    assert.strictEqual(room.queue.length, 0);
  });

  it('should return null for non-existent track', () => {
    const room = createRoom();
    const result = removeFromQueue(room, 'nonexistent');
    assert.strictEqual(result, null);
  });
});

describe('playTrack', () => {
  it('should shift first track from queue to current', () => {
    const room = createRoom();
    addToQueue(room, trackData);
    addToQueue(room, { ...trackData, title: 'Second' });
    const track = playTrack(room, 0);
    assert.strictEqual(track.title, 'Test Song');
    assert.strictEqual(room.queue.length, 1);
    assert.strictEqual(room.queue[0].title, 'Second');
    assert.ok(room.current);
    assert.strictEqual(room.current.position, 0);
    assert.strictEqual(room.isPlaying, true);
  });

  it('should return null if queue is empty', () => {
    const room = createRoom();
    const result = playTrack(room);
    assert.strictEqual(result, null);
  });
});

describe('pauseTrack', () => {
  it('should set isPlaying to false and store position', () => {
    const room = createRoom();
    addToQueue(room, trackData);
    playTrack(room, 0);
    pauseTrack(room);
    assert.strictEqual(room.isPlaying, false);
    assert.ok(typeof room.current.position === 'number');
  });
});

describe('skipTrack', () => {
  it('should skip to next track if queue has items', () => {
    const room = createRoom();
    addToQueue(room, trackData);
    addToQueue(room, { ...trackData, title: 'Next Song' });
    playTrack(room, 0);
    const skipped = skipTrack(room);
    assert.strictEqual(skipped.title, 'Test Song');
    assert.strictEqual(room.current.track.title, 'Next Song');
    assert.strictEqual(room.isPlaying, true);
  });

  it('should set current to null if queue is empty', () => {
    const room = createRoom();
    addToQueue(room, trackData);
    playTrack(room, 0);
    const skipped = skipTrack(room);
    assert.strictEqual(skipped.title, 'Test Song');
    assert.strictEqual(room.current, null);
    assert.strictEqual(room.isPlaying, false);
  });
});

describe('addUser', () => {
  it('should add user and set first as admin', () => {
    const room = createRoom();
    const user1 = addUser(room, 'socket1', 'Alice');
    assert.strictEqual(user1.name, 'Alice');
    assert.strictEqual(user1.isAdmin, true);
    assert.ok(user1.joinedAt);

    const user2 = addUser(room, 'socket2', 'Bob');
    assert.strictEqual(user2.isAdmin, false);
  });
});

describe('removeUser', () => {
  it('should reassign admin to oldest remaining user', () => {
    const room = createRoom();
    addUser(room, 'socket1', 'Alice');
    addUser(room, 'socket2', 'Bob');
    addUser(room, 'socket3', 'Charlie');
    const newAdmin = removeUser(room, 'socket1');
    assert.strictEqual(newAdmin, 'socket2');
    assert.strictEqual(room.users['socket2'].isAdmin, true);
  });

  it('should return null if no users remain', () => {
    const room = createRoom();
    addUser(room, 'socket1', 'Alice');
    const result = removeUser(room, 'socket1');
    assert.strictEqual(result, null);
  });
});

describe('voteSkip', () => {
  it('should add vote and return result', () => {
    const room = createRoom();
    addUser(room, 'socket1', 'Alice');
    addUser(room, 'socket2', 'Bob');
    addUser(room, 'socket3', 'Charlie');
    const result = voteSkip(room, 'socket2');
    assert.strictEqual(result.voted, true);
    assert.strictEqual(result.votesCount, 1);
  });

  it('should return voted false if already voted', () => {
    const room = createRoom();
    addUser(room, 'socket1', 'Alice');
    addUser(room, 'socket2', 'Bob');
    voteSkip(room, 'socket2');
    const result = voteSkip(room, 'socket2');
    assert.strictEqual(result.voted, false);
  });

  it('should reach threshold with enough votes', () => {
    const room = createRoom();
    addUser(room, 'socket1', 'Admin');
    addUser(room, 'socket2', 'User1');
    addUser(room, 'socket3', 'User2');
    addUser(room, 'socket4', 'User3');
    voteSkip(room, 'socket2');
    voteSkip(room, 'socket3');
    const result = voteSkip(room, 'socket4');
    assert.strictEqual(result.voted, true);
    assert.strictEqual(result.reachedThreshold, true);
  });
});

describe('resetVotes', () => {
  it('should clear all votes', () => {
    const room = createRoom();
    addUser(room, 'socket1', 'Admin');
    addUser(room, 'socket2', 'User');
    voteSkip(room, 'socket2');
    resetVotes(room);
    assert.deepStrictEqual(room.votesSkip, {});
  });
});

describe('getCurrentPosition', () => {
  it('should return 0 if nothing is playing', () => {
    const room = createRoom();
    assert.strictEqual(getCurrentPosition(room), 0);
  });

  it('should return correct position while playing', () => {
    const room = createRoom();
    addToQueue(room, trackData);
    playTrack(room, 5);
    const pos = getCurrentPosition(room);
    assert.ok(pos >= 5);
  });
});

describe('getFullState', () => {
  it('should return a serializable copy of room state', () => {
    const room = createRoom();
    addUser(room, 'socket1', 'Alice');
    addToQueue(room, trackData);
    const state = getFullState(room);
    assert.strictEqual(state.queue.length, 1);
    assert.strictEqual(state.users['socket1'].name, 'Alice');
    assert.strictEqual(state.isPlaying, false);
    assert.strictEqual(state.current, null);
    assert.deepStrictEqual(state.votesSkip, {});
    JSON.parse(JSON.stringify(state));
    assert.ok(true, 'state is serializable');
  });
});

describe('addToQueue resolvedAt', () => {
  it('should stamp resolvedAt with the current time', () => {
    const room = createRoom();
    const before = Date.now();
    const track = addToQueue(room, trackData);
    const after = Date.now();
    assert.strictEqual(typeof track.resolvedAt, 'number');
    assert.ok(track.resolvedAt >= before, 'resolvedAt should not be in the past');
    assert.ok(track.resolvedAt <= after, 'resolvedAt should be around now');
  });
});

describe('queue persistence (saveQueue / loadQueue)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'easyjam-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should restore the queue and keep the queue file on disk', () => {
    const file = path.join(tmpDir, 'queue.json');

    const room = createRoom();
    addToQueue(room, trackData);
    addToQueue(room, { ...trackData, title: 'Second Song', youtubeId: 'abcdefghijk' });
    saveQueue(room, file);

    assert.ok(fs.existsSync(file), 'saveQueue should write the file');

    const restored = createRoom();
    loadQueue(restored, file);

    assert.strictEqual(restored.queue.length, 2);
    assert.strictEqual(restored.queue[0].title, 'Test Song');
    assert.strictEqual(restored.queue[1].title, 'Second Song');
    assert.ok(fs.existsSync(file), 'loadQueue must not delete the queue file');

    // Loading a second time must still work (persistence, not a one-shot import).
    const again = createRoom();
    loadQueue(again, file);
    assert.strictEqual(again.queue.length, 2);
  });

  it('should normalize legacy entries missing id and resolvedAt', () => {
    const file = path.join(tmpDir, 'legacy-queue.json');
    fs.writeFileSync(file, JSON.stringify([{
      title: 'Legacy Song',
      artist: 'Legacy Artist',
      duration: 180,
      thumbnail: 'http://example.com/legacy.jpg',
      youtubeId: 'dQw4w9WgXcQ',
      streamUrl: 'http://example.com/expired-stream',
      addedBy: 'Alice',
      addedAt: 1700000000000
    }]), 'utf8');

    const room = createRoom();
    loadQueue(room, file);

    assert.strictEqual(room.queue.length, 1);
    assert.strictEqual(typeof room.queue[0].id, 'string');
    assert.ok(room.queue[0].id.length > 0, 'a missing id should be generated');
    assert.strictEqual(room.queue[0].resolvedAt, 0, 'missing resolvedAt should default to 0');
    assert.strictEqual(room.queue[0].title, 'Legacy Song');
    assert.ok(fs.existsSync(file), 'loadQueue must not delete the queue file');
  });
});
