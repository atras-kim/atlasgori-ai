import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanReplyCc } from '../lib/reply-cc';
test('CC preserves other recipients and removes sender, own accounts and duplicates',()=>{
 assert.equal(cleanReplyCc(['Me <me@example.com>','A <a@example.com>','A@EXAMPLE.COM','sender@example.com','second@example.com'],['me@example.com','sender@example.com']), 'a@example.com, second@example.com');
});
test('CC refuses malformed envelope addresses',()=>{assert.throws(()=>cleanReplyCc(['bad\r\nBcc: evil@example.com'],[]));});
