// ── Dynamic Subject Store ───────────────────────────────────────────────────
// Subjects are stored in localStorage under SUBJECTS_STORAGE_KEY.
// Each subject: { key, name, icon, color }
// color is a hex string like '#D4AF37'.

const SUBJECTS_STORAGE_KEY = 'teacherplanner_subjects';

let _subjects = _loadFromStorage();

function _loadFromStorage() {
    try {
        const parsed = JSON.parse(localStorage.getItem(SUBJECTS_STORAGE_KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function _save() {
    localStorage.setItem(SUBJECTS_STORAGE_KEY, JSON.stringify(_subjects));
}

// ── Color helpers ───────────────────────────────────────────────────────────

export function hexToColors(hex) {
    const safe = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#a6857e';
    const r = parseInt(safe.slice(1, 3), 16);
    const g = parseInt(safe.slice(3, 5), 16);
    const b = parseInt(safe.slice(5, 7), 16);
    // light tint: 85% white blend
    const lr = Math.round(r * 0.15 + 255 * 0.85);
    const lg = Math.round(g * 0.15 + 255 * 0.85);
    const lb = Math.round(b * 0.15 + 255 * 0.85);
    // text: dark version of the color
    const tr = Math.round(r * 0.38);
    const tg = Math.round(g * 0.38);
    const tb = Math.round(b * 0.38);
    return {
        bg: safe,
        light: `rgb(${lr},${lg},${lb})`,
        text: `rgb(${tr},${tg},${tb})`,
    };
}

// ── Public API ──────────────────────────────────────────────────────────────

export function getSubjects() {
    return _subjects;
}

/** Returns subjects in the same shape as the old SUBJECT_DEFINITIONS array. */
export function getSubjectDefs() {
    return _subjects.map((s) => ({
        key: s.key,
        label: s.name,
        icon: s.icon,
        color: hexToColors(s.color),
    }));
}

export function getSubjectByKey(key) {
    return _subjects.find((s) => s.key === key) || null;
}

/**
 * Maps a lesson subject name to a subject key by prefix matching.
 * Returns null if no subject matches.
 */
export function normalizeSubjectToKey(subjectName) {
    if (!subjectName) return null;
    const val = String(subjectName).toLowerCase().trim();
    const found = _subjects.find(
        (s) => val.startsWith(s.key) || val.startsWith(s.name.toLowerCase())
    );
    return found ? found.key : null;
}

/** Returns a { bg, light, text } color object for the given lesson subject name, or null. */
export function getSubjectColor(subjectName) {
    if (!subjectName) return null;
    const key = normalizeSubjectToKey(subjectName);
    if (!key) return null;
    const s = _subjects.find((sub) => sub.key === key);
    return s ? hexToColors(s.color) : null;
}

/**
 * Add a new subject. Returns the created subject or null on failure (duplicate/invalid).
 */
export function addSubject({ name, icon, color }) {
    const trimmedName = String(name || '').trim();
    if (!trimmedName) return null;
    // Build a stable key: lowercase, spaces → underscore, keep letters/digits/åäö/_
    const key = trimmedName
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_åäö]/g, '')
        || 'subject_' + Date.now();
    // Reject duplicates
    if (_subjects.find((s) => s.key === key || s.name.toLowerCase() === trimmedName.toLowerCase())) {
        return null;
    }
    const subject = {
        key,
        name: trimmedName,
        icon: String(icon || trimmedName).slice(0, 2).toUpperCase(),
        color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#a6857e',
    };
    _subjects.push(subject);
    _save();
    return subject;
}

/**
 * Delete a subject by key. Returns true if the subject was found and removed.
 */
export function deleteSubject(key) {
    const before = _subjects.length;
    _subjects = _subjects.filter((s) => s.key !== key);
    if (_subjects.length !== before) {
        _save();
        return true;
    }
    return false;
}

/** Reload from localStorage (useful after an external write). */
export function reloadSubjects() {
    _subjects = _loadFromStorage();
}
