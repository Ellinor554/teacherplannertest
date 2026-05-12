import { DEFAULT_SUBJECTS } from './config.js';

const SUBJECT_STORAGE_KEY = 'teacher_planner_subjects';
const SUBJECT_FALLBACK_COLOR = '#a6857e';
const SUBJECT_COLOR_SEQUENCE = DEFAULT_SUBJECTS.map((subject) => subject.color?.bg).filter(Boolean);

const listeners = new Set();

let subjectCache = loadSubjects();
let subjectManagerModal = null;
let subjectPendingDeleteKey = null;
let subjectManagerAddMode = false;
let subjectManagerDraftName = '';
let subjectManagerFormError = '';

function cloneSubject(subject) {
    return {
        ...subject,
        aliases: Array.isArray(subject.aliases) ? [...subject.aliases] : [],
        color: subject.color ? { ...subject.color } : null,
    };
}

function normalizeLookupValue(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

export function normalizeSubjectKey(value) {
    return normalizeLookupValue(value)
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function normalizeHexColor(value) {
    const trimmed = String(value || '').trim();
    if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toUpperCase();
    if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
        const [, r, g, b] = trimmed;
        return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
    }
    return null;
}

function hexToRgb(hex) {
    const normalized = normalizeHexColor(hex) || '#A6857E';
    return {
        r: Number.parseInt(normalized.slice(1, 3), 16),
        g: Number.parseInt(normalized.slice(3, 5), 16),
        b: Number.parseInt(normalized.slice(5, 7), 16),
    };
}

function rgbToHex({ r, g, b }) {
    return `#${[r, g, b].map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function mixColors(colorA, colorB, ratio) {
    const a = hexToRgb(colorA);
    const b = hexToRgb(colorB);
    const weight = Math.max(0, Math.min(1, ratio));
    return rgbToHex({
        r: a.r + (b.r - a.r) * weight,
        g: a.g + (b.g - a.g) * weight,
        b: a.b + (b.b - a.b) * weight,
    });
}

function buildColorPalette(value, fallbackColor = null) {
    const explicitBg = normalizeHexColor(value);
    const bg = explicitBg
        || normalizeHexColor(fallbackColor?.bg)
        || SUBJECT_FALLBACK_COLOR;
    return {
        bg,
        light: explicitBg ? mixColors(bg, '#FFFFFF', 0.88) : (normalizeHexColor(fallbackColor?.light) || mixColors(bg, '#FFFFFF', 0.88)),
        text: explicitBg ? mixColors(bg, '#000000', 0.58) : (normalizeHexColor(fallbackColor?.text) || mixColors(bg, '#000000', 0.58)),
    };
}

function createSubjectIcon(label) {
    const words = String(label || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
    return String(label || '').trim().slice(0, 2).replace(/\s+/g, '').padEnd(1, 'Ä').toUpperCase();
}

function sanitizeSubject(subject, index = 0) {
    const label = String(subject?.label || subject?.name || '').trim() || `Ämne ${index + 1}`;
    const key = normalizeSubjectKey(subject?.key || label) || `amne-${index + 1}`;
    const aliases = new Set(
        [...(Array.isArray(subject?.aliases) ? subject.aliases : []), label, key]
            .map((entry) => normalizeLookupValue(entry))
            .filter(Boolean)
    );

    return {
        key,
        label,
        icon: String(subject?.icon || '').trim() || createSubjectIcon(label),
        aliases: [...aliases],
        color: buildColorPalette(subject?.color?.bg || subject?.color, subject?.color),
        hidden: Boolean(subject?.hidden),
    };
}

function loadSubjects() {
    try {
        const parsed = JSON.parse(localStorage.getItem(SUBJECT_STORAGE_KEY) || 'null');
        const source = Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_SUBJECTS;
        return source.map((subject, index) => sanitizeSubject(subject, index));
    } catch {
        return DEFAULT_SUBJECTS.map((subject, index) => sanitizeSubject(subject, index));
    }
}

function saveSubjects() {
    localStorage.setItem(SUBJECT_STORAGE_KEY, JSON.stringify(subjectCache));
}

function notifyListeners() {
    const visibleSubjects = getSubjects();
    listeners.forEach((listener) => listener(visibleSubjects));
}

function getAllSubjects() {
    return subjectCache;
}

function findStoredSubjectByKey(key) {
    const normalizedKey = normalizeSubjectKey(key);
    return getAllSubjects().find((subject) => subject.key === normalizedKey) || null;
}

function getLookupTerms(subject) {
    return new Set(
        [subject.key, subject.label, ...(subject.aliases || [])]
            .map((entry) => normalizeLookupValue(entry))
            .filter(Boolean)
    );
}

function findSubjectByNameInternal(subjectName) {
    const normalized = normalizeLookupValue(subjectName);
    if (!normalized) return null;
    return getAllSubjects().find((subject) => {
        for (const alias of getLookupTerms(subject)) {
            if (normalized === alias || normalized.startsWith(alias)) {
                return true;
            }
        }
        return false;
    }) || null;
}

function getNextSubjectColor() {
    return SUBJECT_COLOR_SEQUENCE[getAllSubjects().filter((subject) => !subject.hidden).length % SUBJECT_COLOR_SEQUENCE.length] || SUBJECT_FALLBACK_COLOR;
}

function renderSubjectManager() {
    if (!subjectManagerModal) return;
    const list = subjectManagerModal.querySelector('[data-subject-manager-list]');
    if (!list) return;

    list.textContent = '';

    getSubjects().forEach((subject) => {
        const row = document.createElement('div');
        row.className = 'subject-manager-row';

        const info = document.createElement('div');
        info.className = 'subject-manager-info';

        const swatch = document.createElement('span');
        swatch.className = 'subject-manager-swatch';
        swatch.style.backgroundColor = subject.color?.bg || SUBJECT_FALLBACK_COLOR;

        const label = document.createElement('span');
        label.className = 'subject-manager-label';
        label.textContent = subject.label;

        info.appendChild(swatch);
        info.appendChild(label);

        const actions = document.createElement('div');
        actions.className = 'subject-manager-actions';

        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.className = 'subject-manager-color-input';
        colorInput.value = subject.color?.bg || SUBJECT_FALLBACK_COLOR;
        colorInput.setAttribute('aria-label', `Välj färg för ${subject.label}`);
        colorInput.addEventListener('input', (event) => {
            updateSubjectColor(subject.key, event.target.value);
        });

        const deleteBtn = document.createElement('button');
        if (subjectPendingDeleteKey === subject.key) {
            const confirmWrap = document.createElement('div');
            confirmWrap.className = 'subject-manager-confirm';

            const confirmText = document.createElement('span');
            confirmText.className = 'subject-manager-confirm-text';
            confirmText.textContent = 'Ta bort?';

            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'subject-manager-cancel';
            cancelBtn.textContent = 'Avbryt';
            cancelBtn.addEventListener('click', () => {
                subjectPendingDeleteKey = null;
                renderSubjectManager();
            });

            const confirmBtn = document.createElement('button');
            confirmBtn.type = 'button';
            confirmBtn.className = 'subject-manager-confirm-btn';
            confirmBtn.textContent = 'Ja';
            confirmBtn.addEventListener('click', () => {
                const result = deleteSubject(subject.key);
                if (!result.ok && result.message) {
                    subjectManagerFormError = result.message;
                } else {
                    subjectManagerFormError = '';
                }
            });

            confirmWrap.appendChild(confirmText);
            confirmWrap.appendChild(cancelBtn);
            confirmWrap.appendChild(confirmBtn);
            actions.appendChild(confirmWrap);
        } else {
            deleteBtn.type = 'button';
            deleteBtn.className = 'subject-manager-delete';
            deleteBtn.setAttribute('aria-label', `Ta bort ${subject.label}`);
            deleteBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14H6L5 6"/>
                    <path d="M10 11v6"/>
                    <path d="M14 11v6"/>
                    <path d="M9 6V4h6v2"/>
                </svg>
            `;
            deleteBtn.addEventListener('click', () => {
                subjectPendingDeleteKey = subject.key;
                subjectManagerFormError = '';
                renderSubjectManager();
            });
            actions.appendChild(colorInput);
            actions.appendChild(deleteBtn);
        }

        row.appendChild(info);
        row.appendChild(actions);
        list.appendChild(row);
    });

    const footer = subjectManagerModal.querySelector('[data-subject-manager-footer]');
    if (!footer) return;
    footer.textContent = '';

    if (!subjectManagerAddMode) {
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'subject-manager-add-btn';
        addBtn.textContent = '+ Lägg till nytt ämne';
        addBtn.addEventListener('click', () => {
            subjectManagerAddMode = true;
            subjectManagerDraftName = '';
            subjectManagerFormError = '';
            renderSubjectManager();
        });
        footer.appendChild(addBtn);
        return;
    }

    const form = document.createElement('form');
    form.className = 'subject-manager-form';
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        const result = addSubject(subjectManagerDraftName);
        if (!result.ok) {
            subjectManagerFormError = result.message || 'Det gick inte att lägga till ämnet.';
            renderSubjectManager();
            return;
        }
        subjectManagerAddMode = false;
        subjectManagerDraftName = '';
        subjectManagerFormError = '';
        renderSubjectManager();
    });

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'subject-manager-text-input';
    input.placeholder = 'Ämnesnamn';
    input.value = subjectManagerDraftName;
    input.setAttribute('aria-label', 'Namn på nytt ämne');
    input.addEventListener('input', (event) => {
        subjectManagerDraftName = event.target.value;
        if (subjectManagerFormError) subjectManagerFormError = '';
    });

    const formActions = document.createElement('div');
    formActions.className = 'subject-manager-form-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'subject-manager-cancel';
    cancelBtn.textContent = 'Avbryt';
    cancelBtn.addEventListener('click', () => {
        subjectManagerAddMode = false;
        subjectManagerDraftName = '';
        subjectManagerFormError = '';
        renderSubjectManager();
    });

    const saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.className = 'subject-manager-confirm-btn';
    saveBtn.textContent = 'Lägg till';

    formActions.appendChild(cancelBtn);
    formActions.appendChild(saveBtn);
    form.appendChild(input);
    form.appendChild(formActions);

    if (subjectManagerFormError) {
        const error = document.createElement('p');
        error.className = 'subject-manager-error';
        error.textContent = subjectManagerFormError;
        form.appendChild(error);
    }

    footer.appendChild(form);
    setTimeout(() => input.focus(), 0);
}

function ensureSubjectManagerModal() {
    if (subjectManagerModal) return subjectManagerModal;

    subjectManagerModal = document.createElement('div');
    subjectManagerModal.id = 'subject-manager-modal';
    subjectManagerModal.className = 'notes-modal hidden';
    subjectManagerModal.addEventListener('click', (event) => {
        if (event.target === subjectManagerModal) closeSubjectManager();
    });

    const panel = document.createElement('div');
    panel.className = 'notes-modal-content subject-manager-modal-content';
    panel.addEventListener('click', (event) => event.stopPropagation());

    panel.innerHTML = `
        <div class="subject-manager-header">
            <div>
                <h3 class="font-bold text-[#a6857e] uppercase text-xs tracking-widest">Hantera Ämnen</h3>
                <p class="subject-manager-subtitle">Anpassa färger och dolda ämnen utan att röra befintliga lektioner.</p>
            </div>
            <button type="button" class="text-gray-400 hover:text-black font-bold text-xl leading-none" aria-label="Stäng ämneshanteraren">×</button>
        </div>
        <div class="subject-manager-list custom-scrollbar" data-subject-manager-list></div>
        <div data-subject-manager-footer></div>
    `;

    panel.querySelector('button[aria-label="Stäng ämneshanteraren"]')?.addEventListener('click', closeSubjectManager);

    subjectManagerModal.appendChild(panel);
    document.body.appendChild(subjectManagerModal);
    return subjectManagerModal;
}

export function getSubjects() {
    return getAllSubjects()
        .filter((subject) => !subject.hidden)
        .map(cloneSubject);
}

export function getSubjectByKey(key) {
    const subject = findStoredSubjectByKey(key);
    return subject ? cloneSubject(subject) : null;
}

export function resolveSubjectKey(subjectName) {
    return findSubjectByNameInternal(subjectName)?.key || null;
}

export function getSubjectColorForName(subjectName) {
    const match = findSubjectByNameInternal(subjectName);
    return match?.color ? { ...match.color } : null;
}

export function subscribeSubjects(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function addSubject(label) {
    const trimmed = String(label || '').trim();
    if (!trimmed) return { ok: false, message: 'Ämnesnamn krävs.' };

    const key = normalizeSubjectKey(trimmed);
    if (!key) return { ok: false, message: 'Ogiltigt ämnesnamn.' };

    const existing = findStoredSubjectByKey(key);
    if (existing && !existing.hidden) {
        return { ok: false, message: 'Det ämnet finns redan.' };
    }

    if (existing && existing.hidden) {
        existing.hidden = false;
        existing.label = trimmed;
        existing.aliases = [...new Set([...(existing.aliases || []), normalizeLookupValue(trimmed)])];
        subjectPendingDeleteKey = null;
        saveSubjects();
        renderSubjectManager();
        notifyListeners();
        return { ok: true, subject: cloneSubject(existing) };
    }

    const subject = sanitizeSubject({
        key,
        label: trimmed,
        icon: createSubjectIcon(trimmed),
        aliases: [trimmed],
        color: { bg: getNextSubjectColor() },
        hidden: false,
    }, getAllSubjects().length);

    subjectCache = [...getAllSubjects(), subject];
    subjectPendingDeleteKey = null;
    saveSubjects();
    renderSubjectManager();
    notifyListeners();
    return { ok: true, subject: cloneSubject(subject) };
}

export function updateSubjectColor(key, color) {
    const subject = findStoredSubjectByKey(key);
    if (!subject) return false;
    subject.color = buildColorPalette(color, subject.color);
    saveSubjects();
    renderSubjectManager();
    notifyListeners();
    return true;
}

export function deleteSubject(key) {
    const visibleSubjects = getSubjects();
    if (visibleSubjects.length <= 1) {
        return { ok: false, message: 'Minst ett ämne måste finnas kvar.' };
    }

    const subject = findStoredSubjectByKey(key);
    if (!subject || subject.hidden) return { ok: false, message: 'Ämnet hittades inte.' };

    subject.hidden = true;
    subjectPendingDeleteKey = null;
    saveSubjects();
    renderSubjectManager();
    notifyListeners();
    return { ok: true };
}

export function openSubjectManager() {
    ensureSubjectManagerModal();
    renderSubjectManager();
    subjectManagerModal.classList.remove('hidden');
}

export function closeSubjectManager() {
    subjectPendingDeleteKey = null;
    subjectManagerAddMode = false;
    subjectManagerDraftName = '';
    subjectManagerFormError = '';
    if (subjectManagerModal) subjectManagerModal.classList.add('hidden');
}

export function initSubjectManager() {
    ensureSubjectManagerModal();
}
