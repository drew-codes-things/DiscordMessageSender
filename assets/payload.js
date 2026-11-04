(function (global) {
    'use strict';

    var LIMITS = {
        content: 2000,
        username: 80,
        title: 256,
        description: 4096,
        fields: 25,
        fieldName: 256,
        fieldValue: 1024,
        footer: 2048,
        author: 256,
        embedTotal: 6000
    };
    var DEFAULT_COLOR = '#e5383b';
    var WEBHOOK_RE = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/(\d{15,22})\/([\w-]{20,})\/?$/;

    function blankDraft() {
        return {
            mode: 'both',
            content: '',
            username: '',
            avatar: '',
            title: '',
            url: '',
            description: '',
            color: DEFAULT_COLOR,
            authorName: '',
            authorIcon: '',
            authorUrl: '',
            thumbnail: '',
            image: '',
            footer: '',
            footerIcon: '',
            timestamp: '',
            fields: []
        };
    }

    function str(value) { return typeof value === 'string' ? value : ''; }

    function parseWebhook(value) {
        var raw = str(value).trim();
        if (!raw) return null;
        var url;
        try { url = new URL(raw); } catch (error) { return null; }
        var base = url.origin + url.pathname;
        var match = base.match(WEBHOOK_RE);
        if (!match) return null;
        var thread = url.searchParams.get('thread_id');
        if (thread && !/^\d{15,22}$/.test(thread)) return null;
        return { id: match[1], base: base.replace(/\/$/, ''), threadId: thread || '' };
    }

    function webhookUrl(hook, messageId, wait) {
        var url = hook.base + (messageId ? '/messages/' + messageId : '');
        var params = [];
        if (wait) params.push('wait=true');
        if (hook.threadId) params.push('thread_id=' + hook.threadId);
        return url + (params.length ? '?' + params.join('&') : '');
    }

    function extractMessageId(value) {
        var raw = str(value).trim();
        if (/^\d{15,22}$/.test(raw)) return raw;
        try {
            var parsed = new URL(raw);
            var parts = parsed.pathname.split('/').filter(Boolean);
            if (parts.length >= 4 && parts[0] === 'channels') {
                var id = parts[parts.length - 1];
                return /^\d{15,22}$/.test(id) ? id : null;
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    function normaliseColor(value) {
        var raw = str(value).trim().replace(/^#/, '');
        if (/^[0-9a-f]{3}$/i.test(raw)) raw = raw.split('').map(function (c) { return c + c; }).join('');
        return /^[0-9a-f]{6}$/i.test(raw) ? '#' + raw.toLowerCase() : null;
    }

    function isHttpUrl(value) {
        var raw = str(value).trim();
        if (!raw) return true;
        try {
            var url = new URL(raw);
            return url.protocol === 'https:' || url.protocol === 'http:';
        } catch (error) {
            return false;
        }
    }

    function usesMessage(draft) { return draft.mode === 'message' || draft.mode === 'both'; }
    function usesEmbed(draft) { return draft.mode === 'embed' || draft.mode === 'both'; }

    function cleanFields(draft) {
        return (draft.fields || []).filter(function (f) { return str(f.name).trim() || str(f.value).trim(); });
    }

    function embedTotal(draft) {
        var total = str(draft.title).length + str(draft.description).length + str(draft.authorName).length + str(draft.footer).length;
        cleanFields(draft).forEach(function (f) { total += str(f.name).length + str(f.value).length; });
        return total;
    }

    function embedHasContent(draft) {
        return !!(str(draft.title).trim() || str(draft.description).trim() || cleanFields(draft).length ||
            str(draft.image).trim() || str(draft.thumbnail).trim() || str(draft.authorName).trim() || str(draft.footer).trim());
    }

    function validate(draft) {
        var errors = [];
        function check(cond, field, message) { if (!cond) errors.push({ field: field, message: message }); }
        var hasMessage = usesMessage(draft) && str(draft.content).trim();
        var hasEmbed = usesEmbed(draft) && embedHasContent(draft);
        check(hasMessage || hasEmbed, usesMessage(draft) ? 'content' : 'description', 'There is nothing to send yet. Write a message or fill in the embed.');
        if (usesMessage(draft)) check(str(draft.content).length <= LIMITS.content, 'content', 'Messages can be at most ' + LIMITS.content + ' characters.');
        check(str(draft.username).length <= LIMITS.username, 'username', 'The name can be at most ' + LIMITS.username + ' characters.');
        check(isHttpUrl(draft.avatar), 'avatar', 'The avatar must be an http or https link.');
        if (usesEmbed(draft)) {
            check(str(draft.title).length <= LIMITS.title, 'title', 'The title can be at most ' + LIMITS.title + ' characters.');
            check(str(draft.description).length <= LIMITS.description, 'description', 'The description can be at most ' + LIMITS.description + ' characters.');
            check(str(draft.authorName).length <= LIMITS.author, 'authorName', 'The author name can be at most ' + LIMITS.author + ' characters.');
            check(str(draft.footer).length <= LIMITS.footer, 'footer', 'The footer can be at most ' + LIMITS.footer + ' characters.');
            check(normaliseColor(draft.color) !== null, 'color', 'The colour must be a hex code such as #e5383b.');
            ['url', 'authorIcon', 'authorUrl', 'thumbnail', 'image', 'footerIcon'].forEach(function (key) {
                check(isHttpUrl(draft[key]), key, 'That has to be an http or https link.');
            });
            check(!str(draft.url).trim() || str(draft.title).trim(), 'title', 'A title link needs a title to attach to.');
            check(!str(draft.authorUrl).trim() && !str(draft.authorIcon).trim() || str(draft.authorName).trim(), 'authorName', 'An author icon or link needs an author name.');
            check(!str(draft.footerIcon).trim() || str(draft.footer).trim(), 'footer', 'A footer icon needs footer text.');
            check(!draft.timestamp || !isNaN(new Date(draft.timestamp).getTime()), 'timestamp', 'That timestamp is not a valid date.');
            var fields = cleanFields(draft);
            check(fields.length <= LIMITS.fields, 'fields', 'An embed can have at most ' + LIMITS.fields + ' fields.');
            fields.forEach(function (f) {
                check(str(f.name).trim() && str(f.value).trim(), 'field:' + f.id, 'Each field needs both a name and a value.');
                check(str(f.name).length <= LIMITS.fieldName, 'field:' + f.id, 'Field names can be at most ' + LIMITS.fieldName + ' characters.');
                check(str(f.value).length <= LIMITS.fieldValue, 'field:' + f.id, 'Field values can be at most ' + LIMITS.fieldValue + ' characters.');
            });
            check(embedTotal(draft) <= LIMITS.embedTotal, 'embed', 'All the embed text together can be at most ' + LIMITS.embedTotal + ' characters.');
        }
        return errors;
    }

    function trimmed(value) {
        var s = str(value).trim();
        return s ? s : undefined;
    }

    function buildEmbed(draft) {
        var color = normaliseColor(draft.color) || DEFAULT_COLOR;
        var embed = {
            title: trimmed(draft.title),
            url: trimmed(draft.title) ? trimmed(draft.url) : undefined,
            description: trimmed(draft.description),
            color: parseInt(color.slice(1), 16),
            author: trimmed(draft.authorName) ? { name: trimmed(draft.authorName), icon_url: trimmed(draft.authorIcon), url: trimmed(draft.authorUrl) } : undefined,
            thumbnail: trimmed(draft.thumbnail) ? { url: trimmed(draft.thumbnail) } : undefined,
            image: trimmed(draft.image) ? { url: trimmed(draft.image) } : undefined,
            footer: trimmed(draft.footer) ? { text: trimmed(draft.footer), icon_url: trimmed(draft.footerIcon) } : undefined,
            timestamp: draft.timestamp ? new Date(draft.timestamp).toISOString() : undefined,
            fields: cleanFields(draft).map(function (f) { return { name: str(f.name).trim(), value: str(f.value).trim(), inline: !!f.inline }; })
        };
        if (!embed.fields.length) delete embed.fields;
        return embed;
    }

    function buildPayload(draft, forEdit) {
        var payload = {};
        var content = usesMessage(draft) ? str(draft.content) : '';
        if (content.trim() || forEdit) payload.content = content;
        if (usesEmbed(draft) && embedHasContent(draft)) payload.embeds = [buildEmbed(draft)];
        else if (forEdit) payload.embeds = [];
        if (!forEdit) {
            if (trimmed(draft.username)) payload.username = trimmed(draft.username);
            if (trimmed(draft.avatar)) payload.avatar_url = trimmed(draft.avatar);
        }
        return JSON.parse(JSON.stringify(payload));
    }

    function toLocalInput(iso) {
        var date = new Date(iso);
        if (isNaN(date.getTime())) return '';
        var pad = function (n) { return String(n).padStart(2, '0'); };
        return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
    }

    function draftFromPayload(payload, makeId) {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('That is not a webhook message object.');
        var draft = blankDraft();
        var embed = Array.isArray(payload.embeds) && payload.embeds.length ? payload.embeds[0] : null;
        draft.content = str(payload.content);
        draft.username = str(payload.username);
        draft.avatar = str(payload.avatar_url);
        if (embed && typeof embed === 'object') {
            draft.title = str(embed.title);
            draft.url = str(embed.url);
            draft.description = str(embed.description);
            if (typeof embed.color === 'number') draft.color = '#' + embed.color.toString(16).padStart(6, '0').slice(-6);
            if (embed.author) { draft.authorName = str(embed.author.name); draft.authorIcon = str(embed.author.icon_url); draft.authorUrl = str(embed.author.url); }
            if (embed.thumbnail) draft.thumbnail = str(embed.thumbnail.url);
            if (embed.image) draft.image = str(embed.image.url);
            if (embed.footer) { draft.footer = str(embed.footer.text); draft.footerIcon = str(embed.footer.icon_url); }
            if (embed.timestamp) draft.timestamp = toLocalInput(embed.timestamp);
            draft.fields = (Array.isArray(embed.fields) ? embed.fields : []).slice(0, LIMITS.fields).map(function (f, i) {
                return { id: makeId ? makeId() : 'f' + i, name: str(f && f.name), value: str(f && f.value), inline: !!(f && f.inline) };
            });
        }
        draft.mode = embed && draft.content.trim() ? 'both' : (embed ? 'embed' : 'message');
        return draft;
    }

    var api = {
        LIMITS: LIMITS,
        DEFAULT_COLOR: DEFAULT_COLOR,
        blankDraft: blankDraft,
        parseWebhook: parseWebhook,
        webhookUrl: webhookUrl,
        extractMessageId: extractMessageId,
        normaliseColor: normaliseColor,
        isHttpUrl: isHttpUrl,
        embedTotal: embedTotal,
        embedHasContent: embedHasContent,
        validate: validate,
        buildPayload: buildPayload,
        draftFromPayload: draftFromPayload
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.Hook = api;
})(typeof window !== 'undefined' ? window : globalThis);
