const assert = require('assert');
const Hook = require('../assets/payload.js');

const hookUrl = 'https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_-0123';
const hook = Hook.parseWebhook(hookUrl);
assert.ok(hook, 'accepts a normal webhook URL');
assert.strictEqual(hook.id, '123456789012345678');
assert.ok(Hook.parseWebhook('https://canary.discordapp.com/api/v10/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz'), 'accepts canary, discordapp and versioned URLs');
assert.strictEqual(Hook.parseWebhook('https://evil.example/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz'), null);
assert.strictEqual(Hook.parseWebhook('http://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz'), null);
assert.strictEqual(Hook.parseWebhook('not a url'), null);

const threaded = Hook.parseWebhook(hookUrl + '?thread_id=987654321098765432');
assert.strictEqual(Hook.webhookUrl(threaded, null, true), hookUrl + '?wait=true&thread_id=987654321098765432');
assert.strictEqual(Hook.webhookUrl(hook, '111111111111111111', false), hookUrl + '/messages/111111111111111111');

assert.strictEqual(Hook.extractMessageId('https://discord.com/channels/123/456/789012345678901234'), '789012345678901234');
assert.strictEqual(Hook.extractMessageId('789012345678901234'), '789012345678901234');
assert.strictEqual(Hook.extractMessageId('https://discord.com/channels/123/456/not-a-snowflake'), null);
assert.strictEqual(Hook.extractMessageId('not a url'), null);

assert.strictEqual(Hook.normaliseColor('#ABC'), '#aabbcc');
assert.strictEqual(Hook.normaliseColor('40e0d0'), '#40e0d0');
assert.strictEqual(Hook.normaliseColor('nope'), null);

const empty = Hook.blankDraft();
assert.ok(Hook.validate(empty).length > 0, 'an empty draft cannot be sent');

const draft = Hook.blankDraft();
draft.content = 'Hello';
draft.title = 'Patch notes';
draft.description = 'Fixed things';
draft.fields = [
    { id: 'a', name: 'One', value: '1', inline: true },
    { id: 'b', name: '', value: '', inline: false },
    { id: 'c', name: 'Three', value: '3', inline: false }
];
assert.deepStrictEqual(Hook.validate(draft), []);
const payload = Hook.buildPayload(draft, false);
assert.strictEqual(payload.content, 'Hello');
assert.strictEqual(payload.embeds[0].title, 'Patch notes');
assert.strictEqual(payload.embeds[0].color, 0xe5383b);
assert.deepStrictEqual(payload.embeds[0].fields.map(f => f.name), ['One', 'Three'], 'blank fields are dropped, later ones kept');

draft.mode = 'embed';
assert.strictEqual(Hook.buildPayload(draft, false).content, undefined, 'embed mode sends no content');
assert.strictEqual(Hook.buildPayload(draft, true).content, '', 'an edit in embed mode clears the old content');

const tooMany = Hook.blankDraft();
tooMany.mode = 'embed';
tooMany.fields = Array.from({ length: 26 }, (_, i) => ({ id: 'x' + i, name: 'n', value: 'v', inline: false }));
assert.ok(Hook.validate(tooMany).some(e => e.field === 'fields'), 'more than 25 fields is refused');

const long = Hook.blankDraft();
long.mode = 'embed';
long.title = 'x'.repeat(257);
assert.ok(Hook.validate(long).some(e => e.field === 'title'), 'titles over 256 are refused');
long.title = 't';
long.description = 'd'.repeat(4000);
long.fields = [{ id: 'z', name: 'n', value: 'v'.repeat(1024), inline: false }, { id: 'y', name: 'n', value: 'v'.repeat(1024), inline: false }];
assert.ok(Hook.validate(long).some(e => e.field === 'embed'), 'the 6000 character embed total is enforced');

const badUrl = Hook.blankDraft();
badUrl.mode = 'embed';
badUrl.title = 'x';
badUrl.image = 'javascript:alert(1)';
assert.ok(Hook.validate(badUrl).some(e => e.field === 'image'), 'only http links are allowed for images');

const roundTrip = Hook.draftFromPayload(payload, () => 'id');
assert.strictEqual(roundTrip.mode, 'both');
assert.strictEqual(roundTrip.title, 'Patch notes');
assert.strictEqual(roundTrip.fields.length, 2);
assert.throws(() => Hook.draftFromPayload([]), /not a webhook message/);

console.log('payload.test.js: all tests passed');
