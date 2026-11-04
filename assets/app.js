(function () {
    'use strict';

    var DRAFT_KEY = 'dms_draft';
    var WEBHOOK_KEY = 'dms_webhook';
    var HOOKS_KEY = 'dms_webhooks';
    var TEMPLATES_KEY = 'dms_templates';
    var MAX_HOOKS = 20;
    var MAX_TEMPLATES = 30;
    var L = Hook.LIMITS;

    var nextFieldId = 1;
    function newId() { return 'f' + (nextFieldId++) + Date.now().toString(36); }

    var draft = loadDraft();
    var sending = false;

    var $ = function (id) { return document.getElementById(id); };
    var webhookInput = $('webhook');
    var hookNameInput = $('hookName');
    var savedHooksBox = $('savedHooks');
    var forgetHookBtn = $('forgetHook');
    var tplNameInput = $('tplName');
    var tplList = $('tplList');
    var editToggle = $('editToggle');
    var editRow = $('editRow');
    var messageLink = $('messageLink');
    var sendBtn = $('send');
    var statusEl = $('status');
    var fieldsBox = $('fields');
    var addFieldBtn = $('addField');
    var preview = $('preview');
    var jsonBox = $('json');

    var SIMPLE = ['content', 'username', 'avatar', 'title', 'url', 'description', 'authorName', 'authorIcon', 'authorUrl', 'thumbnail', 'image', 'footer', 'footerIcon', 'timestamp'];
    var COUNTED = { content: L.content, username: L.username, title: L.title, description: L.description, authorName: L.author, footer: L.footer };

    function loadDraft() {
        return normaliseDraft(ui.get(DRAFT_KEY, null));
    }

    function normaliseDraft(saved) {
        var base = Hook.blankDraft();
        if (!saved || typeof saved !== 'object') return base;
        Object.keys(base).forEach(function (key) {
            if (key === 'fields') return;
            if (typeof saved[key] === typeof base[key]) base[key] = saved[key];
        });
        if (['message', 'embed', 'both'].indexOf(base.mode) === -1) base.mode = 'both';
        base.fields = Array.isArray(saved.fields) ? saved.fields.slice(0, L.fields).map(function (f) {
            return { id: newId(), name: String((f && f.name) || ''), value: String((f && f.value) || ''), inline: !!(f && f.inline) };
        }) : [];
        return base;
    }

    var saveTimer = null;
    function saveDraft() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(function () { ui.set(DRAFT_KEY, draft); }, 300);
    }

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    }

    function setCounter(id, length, max) {
        var c = $(id + 'Count');
        if (!c) return;
        c.textContent = length + ' / ' + max;
        c.className = 'counter' + (length > max ? ' over' : (length > max * 0.9 ? ' warn' : ''));
    }

    function updateCounters() {
        Object.keys(COUNTED).forEach(function (key) { setCounter(key, (draft[key] || '').length, COUNTED[key]); });
        var total = Hook.embedTotal(draft);
        var t = $('embedTotal');
        t.textContent = 'Embed text in total: ' + total + ' / ' + L.embedTotal;
        t.className = 'counter' + (total > L.embedTotal ? ' over' : (total > L.embedTotal * 0.9 ? ' warn' : ''));
        $('fieldCount').textContent = draft.fields.length + ' / ' + L.fields;
        addFieldBtn.disabled = draft.fields.length >= L.fields;
    }

    function syncMode() {
        document.querySelectorAll('[data-mode]').forEach(function (btn) {
            btn.setAttribute('aria-pressed', String(btn.dataset.mode === draft.mode));
        });
        $('messageCard').hidden = draft.mode === 'embed';
        $('embedCard').hidden = draft.mode === 'message';
    }

    function fillForm() {
        SIMPLE.forEach(function (key) {
            var input = $(key);
            if (input) input.value = draft[key] || '';
        });
        var color = Hook.normaliseColor(draft.color) || Hook.DEFAULT_COLOR;
        $('colorPicker').value = color;
        $('color').value = draft.color;
        syncMode();
        renderFields();
    }

    function renderFields() {
        fieldsBox.textContent = '';
        if (!draft.fields.length) {
            fieldsBox.appendChild(el('p', 'empty', 'No fields yet. Fields show as small titled blocks inside the embed.'));
        }
        draft.fields.forEach(function (field, index) {
            var box = el('div', 'field-card');
            box.dataset.fieldId = field.id;
            var head = el('div', 'field-card-head');
            head.appendChild(el('span', 'field-no', 'Field ' + (index + 1)));
            var inlineLabel = el('label', 'check');
            var inline = document.createElement('input');
            inline.type = 'checkbox';
            inline.checked = field.inline;
            inline.addEventListener('change', function () { field.inline = inline.checked; changed(); });
            inlineLabel.append(inline, document.createTextNode('Inline'));
            var up = el('button', 'btn-quiet icon-btn', '↑');
            up.type = 'button';
            up.disabled = index === 0;
            up.setAttribute('aria-label', 'Move field ' + (index + 1) + ' up');
            up.addEventListener('click', function () { moveField(index, -1); });
            var down = el('button', 'btn-quiet icon-btn', '↓');
            down.type = 'button';
            down.disabled = index === draft.fields.length - 1;
            down.setAttribute('aria-label', 'Move field ' + (index + 1) + ' down');
            down.addEventListener('click', function () { moveField(index, 1); });
            var remove = el('button', 'btn-danger', 'Remove');
            remove.type = 'button';
            remove.addEventListener('click', function () {
                draft.fields = draft.fields.filter(function (f) { return f.id !== field.id; });
                renderFields();
                changed();
            });
            head.append(inlineLabel, up, down, remove);

            var name = document.createElement('input');
            name.type = 'text';
            name.placeholder = 'Field name';
            name.value = field.name;
            name.setAttribute('aria-label', 'Field ' + (index + 1) + ' name');
            var nameCount = el('div', 'counter');
            var value = document.createElement('textarea');
            value.rows = 3;
            value.placeholder = 'Field value';
            value.value = field.value;
            value.setAttribute('aria-label', 'Field ' + (index + 1) + ' value');
            var valueCount = el('div', 'counter');
            function count() {
                nameCount.textContent = field.name.length + ' / ' + L.fieldName;
                nameCount.className = 'counter' + (field.name.length > L.fieldName ? ' over' : '');
                valueCount.textContent = field.value.length + ' / ' + L.fieldValue;
                valueCount.className = 'counter' + (field.value.length > L.fieldValue ? ' over' : '');
            }
            name.addEventListener('input', function () { field.name = name.value; count(); changed(); });
            value.addEventListener('input', function () { field.value = value.value; count(); changed(); });
            count();
            box.append(head, name, nameCount, value, valueCount);
            fieldsBox.appendChild(box);
        });
        updateCounters();
    }

    function moveField(index, delta) {
        var target = index + delta;
        if (target < 0 || target >= draft.fields.length) return;
        var item = draft.fields.splice(index, 1)[0];
        draft.fields.splice(target, 0, item);
        renderFields();
        changed();
    }

    function escapeHtml(text) {
        return String(text).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function markdown(text, allowLinks) {
        var blocks = [];
        var html = escapeHtml(text).replace(/```(?:[a-z0-9]+\n)?([\s\S]*?)```/gi, function (_, code) {
            blocks.push('<pre class="dc-pre">' + code.replace(/^\n|\n$/g, '') + '</pre>');
            return '\u0000' + (blocks.length - 1) + '\u0000';
        });
        html = html
            .replace(/`([^`\n]+)`/g, '<code class="dc-code">$1</code>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/__([^_]+)__/g, '<u>$1</u>')
            .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
            .replace(/(^|[^_\w])_([^_\n]+)_(?![\w])/g, '$1<em>$2</em>')
            .replace(/~~([^~]+)~~/g, '<s>$1</s>')
            .replace(/\|\|([^|]+)\|\|/g, '<span class="dc-spoiler" tabindex="0">$1</span>')
            .replace(/^&gt; (.*)$/gm, '<span class="dc-quote">$1</span>')
            .replace(/^### (.*)$/gm, '<span class="dc-h3">$1</span>')
            .replace(/^## (.*)$/gm, '<span class="dc-h2">$1</span>')
            .replace(/^# (.*)$/gm, '<span class="dc-h1">$1</span>');
        if (allowLinks) {
            html = html.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
        }
        html = html.replace(/(^|[\s(])(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
        html = html.replace(/\n/g, '<br>');
        return html.replace(/\u0000(\d+)\u0000/g, function (_, i) { return blocks[Number(i)]; });
    }

    function img(src, className, alt) {
        if (!src || !Hook.isHttpUrl(src)) return null;
        var node = document.createElement('img');
        node.className = className;
        node.src = src;
        node.alt = alt || '';
        node.loading = 'lazy';
        node.referrerPolicy = 'no-referrer';
        node.addEventListener('error', function () { node.classList.add('broken'); });
        return node;
    }

    function timeLabel(date) {
        return 'Today at ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function renderPreview() {
        preview.textContent = '';
        var msg = el('div', 'dc-msg');
        var avatar = img(draft.avatar.trim(), 'dc-avatar', '');
        if (!avatar) {
            avatar = el('div', 'dc-avatar dc-avatar-default', (draft.username.trim() || 'W').charAt(0).toUpperCase());
        }
        var body = el('div', 'dc-body');
        var head = el('div', 'dc-head');
        head.append(el('span', 'dc-name', draft.username.trim() || 'Webhook'), el('span', 'dc-app', 'APP'), el('span', 'dc-time', timeLabel(new Date())));
        body.appendChild(head);

        var hasMessage = draft.mode !== 'embed' && draft.content.trim();
        var hasEmbed = draft.mode !== 'message' && Hook.embedHasContent(draft);
        if (hasMessage) {
            var content = el('div', 'dc-content');
            content.innerHTML = markdown(draft.content, false);
            body.appendChild(content);
        }
        if (hasEmbed) body.appendChild(renderEmbed());
        if (!hasMessage && !hasEmbed) body.appendChild(el('div', 'dc-placeholder', 'Your message will show here as you type.'));
        msg.append(avatar, body);
        preview.appendChild(msg);
        jsonBox.value = JSON.stringify(Hook.buildPayload(draft, false), null, 2);
    }

    function renderEmbed() {
        var color = Hook.normaliseColor(draft.color) || Hook.DEFAULT_COLOR;
        var embed = el('div', 'dc-embed');
        embed.style.borderLeftColor = color;
        var grid = el('div', 'dc-embed-grid');
        var main = el('div', 'dc-embed-main');

        if (draft.authorName.trim()) {
            var author = el('div', 'dc-author');
            var icon = img(draft.authorIcon.trim(), 'dc-author-icon');
            if (icon) author.appendChild(icon);
            var name = draft.authorUrl.trim() && Hook.isHttpUrl(draft.authorUrl) ? el('a', 'dc-author-name', draft.authorName) : el('span', 'dc-author-name', draft.authorName);
            if (name.tagName === 'A') { name.href = draft.authorUrl.trim(); name.target = '_blank'; name.rel = 'noopener noreferrer'; }
            author.appendChild(name);
            main.appendChild(author);
        }
        if (draft.title.trim()) {
            var title = draft.url.trim() && Hook.isHttpUrl(draft.url) ? el('a', 'dc-title is-link') : el('div', 'dc-title');
            title.innerHTML = markdown(draft.title, false);
            if (title.tagName === 'A') { title.href = draft.url.trim(); title.target = '_blank'; title.rel = 'noopener noreferrer'; }
            main.appendChild(title);
        }
        if (draft.description.trim()) {
            var desc = el('div', 'dc-desc');
            desc.innerHTML = markdown(draft.description, true);
            main.appendChild(desc);
        }
        var fields = draft.fields.filter(function (f) { return f.name.trim() || f.value.trim(); });
        if (fields.length) {
            var fieldGrid = el('div', 'dc-fields');
            var run = 0;
            fields.forEach(function (f) {
                var block = el('div', 'dc-field');
                if (f.inline && run < 3) { run++; block.classList.add('inline'); } else { run = f.inline ? 1 : 0; if (f.inline) block.classList.add('inline'); }
                var fname = el('div', 'dc-field-name');
                fname.innerHTML = markdown(f.name || '​', false);
                var fvalue = el('div', 'dc-field-value');
                fvalue.innerHTML = markdown(f.value || '​', true);
                block.append(fname, fvalue);
                fieldGrid.appendChild(block);
            });
            main.appendChild(fieldGrid);
        }
        var image = img(draft.image.trim(), 'dc-image', 'Embed image');
        if (image) main.appendChild(image);
        grid.appendChild(main);
        var thumb = img(draft.thumbnail.trim(), 'dc-thumb', 'Embed thumbnail');
        if (thumb) grid.appendChild(thumb);
        embed.appendChild(grid);

        var ts = draft.timestamp ? new Date(draft.timestamp) : null;
        if (draft.footer.trim() || (ts && !isNaN(ts.getTime()))) {
            var foot = el('div', 'dc-footer');
            var ficon = draft.footer.trim() ? img(draft.footerIcon.trim(), 'dc-footer-icon') : null;
            if (ficon) foot.appendChild(ficon);
            var parts = [];
            if (draft.footer.trim()) parts.push(draft.footer.trim());
            if (ts && !isNaN(ts.getTime())) parts.push(ts.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }));
            foot.appendChild(el('span', null, parts.join(' • ')));
            embed.appendChild(foot);
        }
        return embed;
    }

    var previewTimer = null;
    function changed() {
        updateCounters();
        clearErrors();
        if (statusEl.classList.contains('error')) setStatus('');
        saveDraft();
        clearTimeout(previewTimer);
        previewTimer = setTimeout(renderPreview, 80);
    }

    function clearErrors() {
        document.querySelectorAll('[aria-invalid="true"]').forEach(function (n) { n.removeAttribute('aria-invalid'); });
        document.querySelectorAll('.field-card.invalid').forEach(function (n) { n.classList.remove('invalid'); });
    }

    function showErrors(errors) {
        var first = null;
        errors.forEach(function (error) {
            var target = null;
            if (error.field.indexOf('field:') === 0) {
                var card = fieldsBox.querySelector('[data-field-id="' + error.field.slice(6) + '"]');
                if (card) { card.classList.add('invalid'); target = card.querySelector('input'); }
            } else {
                target = $(error.field);
            }
            if (target && target.setAttribute) {
                target.setAttribute('aria-invalid', 'true');
                if (!first) first = target;
            }
        });
        setStatus(errors[0].message, 'error');
        if (first && typeof first.focus === 'function') first.focus();
    }

    function setStatus(text, kind) {
        statusEl.textContent = text || '';
        statusEl.className = 'status' + (kind ? ' ' + kind : '');
    }

    function editMode() { return editToggle.getAttribute('aria-pressed') === 'true'; }

    function syncSendLabel() {
        sendBtn.textContent = editMode() ? 'Save edit' : 'Send message';
        editRow.hidden = !editMode();
    }

    function loadHooks() {
        var list = ui.get(HOOKS_KEY, []);
        if (!Array.isArray(list)) list = [];
        list = list.filter(function (h) { return h && typeof h.name === 'string' && typeof h.url === 'string' && Hook.parseWebhook(h.url); });
        var legacy = ui.get(WEBHOOK_KEY, '');
        if (typeof legacy === 'string' && Hook.parseWebhook(legacy)) {
            if (!list.some(function (h) { return h.url === legacy; })) list.unshift({ name: 'My webhook', url: legacy });
            ui.set(HOOKS_KEY, list);
            ui.remove(WEBHOOK_KEY);
        }
        return list.slice(0, MAX_HOOKS);
    }

    var hooks = loadHooks();

    function currentHook() {
        var url = webhookInput.value.trim();
        return hooks.find(function (h) { return h.url === url; }) || null;
    }

    function renderHooks() {
        savedHooksBox.textContent = '';
        $('savedHooksRow').hidden = !hooks.length;
        var active = currentHook();
        hooks.forEach(function (h) {
            var btn = el('button', 'opt', h.name);
            btn.type = 'button';
            btn.setAttribute('aria-pressed', String(h === active));
            btn.addEventListener('click', function () {
                webhookInput.value = h.url;
                webhookInput.removeAttribute('aria-invalid');
                hookNameInput.value = h.name;
                renderHooks();
            });
            savedHooksBox.appendChild(btn);
        });
        forgetHookBtn.hidden = !active;
        $('saveHook').textContent = active ? 'Rename' : 'Save';
    }

    function saveHook() {
        var url = webhookInput.value.trim();
        if (!Hook.parseWebhook(url)) {
            webhookInput.setAttribute('aria-invalid', 'true');
            ui.toast('Paste a working webhook link first.');
            webhookInput.focus();
            return;
        }
        var name = hookNameInput.value.trim();
        if (!name) {
            ui.toast('Give the webhook a name so you can tell them apart.');
            hookNameInput.focus();
            return;
        }
        var existing = currentHook();
        var clash = hooks.find(function (h) { return h.name.toLowerCase() === name.toLowerCase() && h !== existing; });
        if (clash) { ui.toast('There is already a webhook called "' + clash.name + '".'); return; }
        if (existing) {
            existing.name = name;
        } else {
            if (hooks.length >= MAX_HOOKS) { ui.toast('You can save up to ' + MAX_HOOKS + ' webhooks. Forget one first.'); return; }
            hooks.push({ name: name, url: url });
        }
        ui.set(HOOKS_KEY, hooks);
        renderHooks();
        ui.toast(existing ? 'Renamed.' : 'Saved "' + name + '".', 'ok');
    }

    function forgetHook() {
        var active = currentHook();
        if (!active) return;
        ui.confirm({ title: 'Forget "' + active.name + '"?', text: 'The link is removed from this browser. The webhook itself keeps working in Discord.', ok: 'Forget it', danger: true })
            .then(function (yes) {
                if (!yes) return;
                hooks = hooks.filter(function (h) { return h !== active; });
                if (hooks.length) ui.set(HOOKS_KEY, hooks); else ui.remove(HOOKS_KEY);
                hookNameInput.value = '';
                renderHooks();
            });
    }

    function loadTemplates() {
        var list = ui.get(TEMPLATES_KEY, []);
        if (!Array.isArray(list)) return [];
        return list.filter(function (t) { return t && typeof t.name === 'string' && t.draft && typeof t.draft === 'object'; }).slice(0, MAX_TEMPLATES);
    }

    var templates = loadTemplates();

    function snapshot() {
        var copy = JSON.parse(JSON.stringify(draft));
        copy.fields = draft.fields.map(function (f) { return { name: f.name, value: f.value, inline: f.inline }; });
        return copy;
    }

    function storeTemplates() {
        if (!ui.set(TEMPLATES_KEY, templates)) {
            ui.toast('This browser would not save that. Its storage may be full.');
            return false;
        }
        return true;
    }

    function renderTemplates() {
        tplList.textContent = '';
        $('tplEmpty').hidden = templates.length > 0;
        $('tplCount').textContent = templates.length ? templates.length + ' saved' : '';
        templates.forEach(function (t) {
            var li = el('li', 'tpl-item');
            var info = el('div', 'tpl-info');
            info.appendChild(el('span', 'tpl-name', t.name));
            var bits = [];
            if (t.draft.title) bits.push(t.draft.title);
            else if (t.draft.content) bits.push(t.draft.content.slice(0, 60));
            info.appendChild(el('span', 'tpl-meta', bits.join('') || 'Empty draft'));
            var load = el('button', 'btn-quiet', 'Load');
            load.type = 'button';
            load.setAttribute('aria-label', 'Load template ' + t.name);
            load.addEventListener('click', function () { loadTemplate(t); });
            var del = el('button', 'btn-quiet tpl-del', 'Delete');
            del.type = 'button';
            del.setAttribute('aria-label', 'Delete template ' + t.name);
            del.addEventListener('click', function () {
                ui.confirm({ title: 'Delete "' + t.name + '"?', text: 'Only the template goes. What is in the editor now stays.', ok: 'Delete', danger: true })
                    .then(function (yes) {
                        if (!yes) return;
                        templates = templates.filter(function (x) { return x !== t; });
                        storeTemplates();
                        renderTemplates();
                    });
            });
            li.append(info, load, del);
            tplList.appendChild(li);
        });
    }

    function saveTemplate() {
        var name = tplNameInput.value.trim();
        if (!name) { ui.toast('Give the template a name first.'); tplNameInput.focus(); return; }
        if (!Hook.embedHasContent(draft) && !draft.content.trim()) { ui.toast('There is nothing in the editor to save yet.'); return; }
        var existing = templates.find(function (t) { return t.name.toLowerCase() === name.toLowerCase(); });
        var apply = function () {
            var entry = { name: name, draft: snapshot(), saved: Date.now() };
            if (existing) templates[templates.indexOf(existing)] = entry;
            else templates.unshift(entry);
            if (!storeTemplates()) { templates = loadTemplates(); return; }
            tplNameInput.value = '';
            renderTemplates();
            ui.toast('Template "' + name + '" saved.', 'ok');
        };
        if (existing) {
            ui.confirm({ title: 'Replace "' + existing.name + '"?', text: 'A template with that name already exists. Saving overwrites it with what is in the editor now.', ok: 'Replace' })
                .then(function (yes) { if (yes) apply(); });
            return;
        }
        if (templates.length >= MAX_TEMPLATES) { ui.toast('You can keep up to ' + MAX_TEMPLATES + ' templates. Delete one first.'); return; }
        apply();
    }

    function loadTemplate(t) {
        var go = function () {
            draft = normaliseDraft(t.draft);
            fillForm();
            changed();
            setStatus('');
            ui.toast('Loaded "' + t.name + '".', 'ok');
        };
        if (!Hook.embedHasContent(draft) && !draft.content.trim()) { go(); return; }
        ui.confirm({ title: 'Load "' + t.name + '"?', text: 'This replaces what is in the editor now.', ok: 'Load it' })
            .then(function (yes) { if (yes) go(); });
    }

    async function send() {
        if (sending) return;
        clearErrors();
        var hook = Hook.parseWebhook(webhookInput.value);
        if (!hook) {
            webhookInput.setAttribute('aria-invalid', 'true');
            webhookInput.focus();
            setStatus('That is not a Discord webhook link. It starts with https://discord.com/api/webhooks/.', 'error');
            return;
        }
        var messageId = null;
        if (editMode()) {
            messageId = Hook.extractMessageId(messageLink.value);
            if (!messageId) {
                messageLink.setAttribute('aria-invalid', 'true');
                messageLink.focus();
                setStatus('Paste the message link (right-click the message, Copy Message Link) or its ID.', 'error');
                return;
            }
        }
        var errors = Hook.validate(draft);
        if (errors.length) { showErrors(errors); return; }

        var ok = await ui.confirm({
            title: messageId ? 'Save this edit?' : 'Send this message?',
            text: messageId ? 'The message will be replaced with what is in the preview.' : 'It will be posted straight away to the channel this webhook belongs to.',
            ok: messageId ? 'Save edit' : 'Send'
        });
        if (!ok) return;

        sending = true;
        sendBtn.disabled = true;
        setStatus(messageId ? 'Saving the edit…' : 'Sending…');
        try {
            var response = await fetch(Hook.webhookUrl(hook, messageId, !messageId), {
                method: messageId ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(Hook.buildPayload(draft, !!messageId))
            });
            var data = await response.json().catch(function () { return {}; });
            if (!response.ok) throw new Error(describeError(response.status, data, !!messageId));
            if (messageId) {
                setStatus('Edit saved.', 'ok');
                ui.toast('Message updated.', 'ok');
            } else {
                setStatus('', 'ok');
                statusEl.appendChild(document.createTextNode('Sent. Message ID ' + (data.id || 'unknown') + '. '));
                if (data.id) {
                    var reuse = el('button', 'linkish', 'Edit this one next');
                    reuse.type = 'button';
                    reuse.addEventListener('click', function () {
                        editToggle.setAttribute('aria-pressed', 'true');
                        messageLink.value = data.id;
                        syncSendLabel();
                        messageLink.focus();
                    });
                    statusEl.appendChild(reuse);
                }
                ui.toast('Message sent.', 'ok');
            }
        } catch (error) {
            setStatus(error.message || 'Sending failed.', 'error');
        } finally {
            sending = false;
            sendBtn.disabled = false;
        }
    }

    function describeError(status, data, editing) {
        if (status === 401 || status === 403) return 'Discord refused the webhook. It may have been deleted or the link is wrong.';
        if (status === 404) return editing ? 'Message not found. It has to be a message this same webhook sent, in the same channel.' : 'That webhook no longer exists.';
        if (status === 429) return 'Discord says slow down. Try again in ' + Math.ceil((data && data.retry_after) || 2) + ' seconds.';
        if (status === 400 && data && data.message) return 'Discord rejected the message: ' + data.message + '.';
        return 'Sending failed (HTTP ' + status + ')' + (data && data.message ? ': ' + data.message : '.');
    }

    SIMPLE.forEach(function (key) {
        var input = $(key);
        if (!input) return;
        input.addEventListener('input', function () { draft[key] = input.value; changed(); });
    });
    $('color').addEventListener('input', function () {
        draft.color = $('color').value.trim();
        var norm = Hook.normaliseColor(draft.color);
        if (norm) $('colorPicker').value = norm;
        changed();
    });
    $('colorPicker').addEventListener('input', function () {
        draft.color = $('colorPicker').value;
        $('color').value = draft.color;
        changed();
    });
    $('timestampNow').addEventListener('click', function () {
        var now = new Date();
        now.setSeconds(0, 0);
        var pad = function (n) { return String(n).padStart(2, '0'); };
        draft.timestamp = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + 'T' + pad(now.getHours()) + ':' + pad(now.getMinutes());
        $('timestamp').value = draft.timestamp;
        changed();
    });
    $('timestampClear').addEventListener('click', function () {
        draft.timestamp = '';
        $('timestamp').value = '';
        changed();
    });
    document.querySelectorAll('[data-mode]').forEach(function (btn) {
        btn.addEventListener('click', function () { draft.mode = btn.dataset.mode; syncMode(); changed(); });
    });
    addFieldBtn.addEventListener('click', function () {
        if (draft.fields.length >= L.fields) return;
        draft.fields.push({ id: newId(), name: '', value: '', inline: false });
        renderFields();
        changed();
        var last = fieldsBox.querySelector('.field-card:last-child input[type="text"]');
        if (last) last.focus();
    });
    editToggle.addEventListener('click', function () {
        editToggle.setAttribute('aria-pressed', String(!editMode()));
        syncSendLabel();
        if (editMode()) messageLink.focus();
    });
    $('toggleSecret').addEventListener('click', function () {
        var show = webhookInput.type === 'password';
        webhookInput.type = show ? 'text' : 'password';
        $('toggleSecret').textContent = show ? 'Hide' : 'Show';
    });
    webhookInput.addEventListener('input', function () {
        webhookInput.removeAttribute('aria-invalid');
        var active = currentHook();
        if (active) hookNameInput.value = active.name;
        renderHooks();
    });
    $('saveHook').addEventListener('click', saveHook);
    hookNameInput.addEventListener('keydown', function (event) { if (event.key === 'Enter') { event.preventDefault(); saveHook(); } });
    forgetHookBtn.addEventListener('click', forgetHook);
    $('saveTpl').addEventListener('click', saveTemplate);
    tplNameInput.addEventListener('keydown', function (event) { if (event.key === 'Enter') { event.preventDefault(); saveTemplate(); } });
    sendBtn.addEventListener('click', send);
    $('reset').addEventListener('click', function () {
        ui.confirm({ title: 'Start over?', text: 'This clears the message, the embed and its fields. Your webhook link stays.', ok: 'Clear everything', danger: true })
            .then(function (yes) {
                if (!yes) return;
                draft = Hook.blankDraft();
                messageLink.value = '';
                editToggle.setAttribute('aria-pressed', 'false');
                syncSendLabel();
                fillForm();
                changed();
                setStatus('');
            });
    });
    $('copyJson').addEventListener('click', function () {
        ui.copy(jsonBox.value).then(function () { ui.toast('JSON copied.', 'ok'); }, function () { ui.toast('Copying is blocked here. Select the JSON and copy it by hand.'); });
    });
    $('applyJson').addEventListener('click', function () {
        try {
            var parsed = JSON.parse(jsonBox.value);
            draft = Hook.draftFromPayload(parsed, newId);
            fillForm();
            changed();
            ui.toast('Loaded into the editor.', 'ok');
        } catch (error) {
            ui.toast(error instanceof SyntaxError ? 'That JSON has a mistake in it: ' + error.message : error.message);
        }
    });
    document.addEventListener('keydown', function (event) {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); send(); }
    });

    if (hooks.length) {
        webhookInput.value = hooks[0].url;
        hookNameInput.value = hooks[0].name;
    }
    renderHooks();
    renderTemplates();
    fillForm();
    syncSendLabel();
    updateCounters();
    renderPreview();
})();
