const { describe, it } = require('node:test');
const assert = require('node:assert');
const { extractYoutubeId, checkYtDlpExists } = require('../server/ytdlp');

describe('extractYoutubeId', () => {
  it('should extract ID from standard youtube.com URL', () => {
    const id = extractYoutubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    assert.strictEqual(id, 'dQw4w9WgXcQ');
  });

  it('should extract ID from short youtu.be URL', () => {
    const id = extractYoutubeId('https://youtu.be/dQw4w9WgXcQ');
    assert.strictEqual(id, 'dQw4w9WgXcQ');
  });

  it('should extract ID from music.youtube.com URL', () => {
    const id = extractYoutubeId('https://music.youtube.com/watch?v=dQw4w9WgXcQ');
    assert.strictEqual(id, 'dQw4w9WgXcQ');
  });

  it('should return null for invalid URL', () => {
    const id = extractYoutubeId('https://example.com');
    assert.strictEqual(id, null);
  });

  it('should return null for empty string', () => {
    const id = extractYoutubeId('');
    assert.strictEqual(id, null);
  });

  it('should return null for null input', () => {
    const id = extractYoutubeId(null);
    assert.strictEqual(id, null);
  });
});

describe('checkYtDlpExists', () => {
  it('should return a boolean', async () => {
    const result = await checkYtDlpExists();
    assert.strictEqual(typeof result, 'boolean');
  });
});
