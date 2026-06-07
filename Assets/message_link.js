(function (global) {
    function extractMessageId(messageLink) {
        try {
            const parsed = new URL(messageLink);
            const segments = parsed.pathname.split('/').filter(Boolean);
            if (segments.length >= 4 && segments[0] === 'channels') {
                const id = segments[segments.length - 1];
                return /^\d+$/.test(id) ? id : null;
            }
            return null;
        } catch {
            return null;
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { extractMessageId };
    }

    global.extractMessageId = extractMessageId;
})(typeof window !== 'undefined' ? window : globalThis);
