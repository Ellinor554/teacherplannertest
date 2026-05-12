import { SUBJECT_COLORS } from './config.js';
import {
    plannerData, currentYear, currentWeek, activeDayIndex, activeLessonId
} from './state.js';
import { openTool } from './tools.js';

const ACADEMIC_STORAGE_KEY = 'teacherplanner_academic_year_planning';

const SUBJECT_DEFINITIONS = [
    { key: 'matte', label: 'Matte', icon: 'M', aliases: ['matte', 'matematik'], color: SUBJECT_COLORS.matte },
    { key: 'svenska', label: 'Svenska', icon: 'Sv', aliases: ['svenska'], color: SUBJECT_COLORS.svenska },
    { key: 'engelska', label: 'Engelska', icon: 'En', aliases: ['engelska'], color: SUBJECT_COLORS.engelska },
    { key: 'biologi', label: 'Biologi', icon: 'Bi', aliases: ['biologi'], color: SUBJECT_COLORS.biologi },
    { key: 'kemi', label: 'Kemi', icon: 'Ke', aliases: ['kemi'], color: SUBJECT_COLORS.kemi },
    { key: 'fysik', label: 'Fysik', icon: 'Fy', aliases: ['fysik'], color: SUBJECT_COLORS.fysik },
    { key: 'teknik', label: 'Teknik', icon: 'Te', aliases: ['teknik'], color: SUBJECT_COLORS.teknik },
];

let academicData = loadAcademicData();
let selectedSubjectKey = SUBJECT_DEFINITIONS[0].key;
let selectedAreaId = null;
let curriculumMapMode = null; // 'view' | 'select' | null
let curriculumMapEscapeHandler = null;
let curriculumEditEscapeHandler = null;

const SUBJECT_SECTION_TITLES = {
    matte: ['Taluppfattning och algebra', 'Geometri', 'Sannolikhet och statistik'],
    svenska: ['Läsa och analysera', 'Skriva och skapa texter', 'Tala, lyssna och samtala'],
    engelska: ['Reception', 'Produktion och interaktion', 'Strategier och kultur'],
    biologi: ['Natur och samhälle', 'Kropp och hälsa', 'Fältstudier och undersökningar'],
    kemi: ['Kemin i naturen', 'Systematiska undersökningar', 'Materia och kemiska reaktioner'],
    fysik: ['Fysiken i naturen', 'Kraft, rörelse och energi', 'Systematiska undersökningar'],
    teknik: ['Tekniska lösningar', 'Arbetssätt för utveckling', 'Teknik, människa och samhälle'],
};
const DEFAULT_SECTION_KEY = 'section-1';

function getDefaultSectionKey() {
    return getMasterSectionDefinitions(selectedSubjectKey)[0]?.key || DEFAULT_SECTION_KEY;
}

function getMasterSectionDefinitions(subjectKey) {
    const titles = SUBJECT_SECTION_TITLES[subjectKey] || ['Del 1', 'Del 2', 'Del 3'];
    return titles.slice(0, 3).map((title, index) => ({
        key: `section-${index + 1}`,
        title,
    }));
}

function createDefaultMasterSections(subjectKey) {
    const definitions = getMasterSectionDefinitions(subjectKey);
    if (!definitions.length) {
        return [{ key: DEFAULT_SECTION_KEY, title: 'Del 1', items: [] }];
    }
    return definitions.map((def) => ({ key: def.key, title: def.title, items: [] }));
}

function createId(prefix) {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
        return `${prefix}-${hex}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sanitizeWeek(value, fallback = 1) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(1, Math.min(52, parsed));
}

function normalizeCoreContentText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function ensureUniqueIds(ids) {
    return [...new Set((ids || []).filter((id) => typeof id === 'string' && id))];
}

function getAllMasterItems(subject) {
    if (!subject || !Array.isArray(subject.masterSections)) return [];
    return subject.masterSections.flatMap((section) => section.items || []);
}

function getSectionByKey(subject, sectionKey) {
    if (!subject || !Array.isArray(subject.masterSections)) return null;
    return subject.masterSections.find((section) => section.key === sectionKey) || null;
}

function upsertMasterListItem(subject, text, done = false, preferredSectionKey = getDefaultSectionKey()) {
    const normalizedText = normalizeCoreContentText(text);
    if (!normalizedText) return null;

    if (!Array.isArray(subject.masterSections) || !subject.masterSections.length) subject.masterSections = createDefaultMasterSections();
    const existing = getAllMasterItems(subject).find((item) => normalizeCoreContentText(item.text).toLowerCase() === normalizedText.toLowerCase());
    if (existing) {
        existing.done = Boolean(existing.done || done);
        existing.text = normalizedText;
        return existing;
    }

    const item = { id: createId('core'), text: normalizedText, done: Boolean(done) };
    const targetSection = getSectionByKey(subject, preferredSectionKey) || subject.masterSections[0];
    if (!targetSection) return null;
    targetSection.items.push(item);
    return item;
}

function ensureSubjectDefaults(subject, subjectKey) {
    if (!subject || typeof subject !== 'object') return { areas: [], masterSections: [] };
    if (!Array.isArray(subject.areas)) subject.areas = [];
    const legacyItems = (Array.isArray(subject.masterList) ? subject.masterList : []).reduce((items, entry) => {
        const text = normalizeCoreContentText(entry?.text);
        if (!text) return items;
        const existing = items.find((item) => item.text.toLowerCase() === text.toLowerCase());
        if (existing) {
            existing.done = Boolean(existing.done || entry?.done);
            return items;
        }
        items.push({
            id: typeof entry?.id === 'string' && entry.id ? entry.id : createId('core'),
            text,
            done: Boolean(entry?.done),
        });
        return items;
    }, []);
    subject.masterList = [];

    const existingSections = Array.isArray(subject.masterSections)
        ? subject.masterSections
        : (subject.masterSections && typeof subject.masterSections === 'object'
            ? Object.values(subject.masterSections)
            : []);
    const baselineSections = getMasterSectionDefinitions(subjectKey);

    const normalizedSections = baselineSections.map((def) => {
        // Fallback by section order only for legacy data where keys differ from current section-N keys.
        const sectionKeyMatch = /^section-(\d+)$/.exec(def.key);
        const fallbackIndex = sectionKeyMatch ? Number.parseInt(sectionKeyMatch[1], 10) - 1 : -1;
        const existingSection = existingSections.find((entry) => entry?.key === def.key)
            || (fallbackIndex >= 0 ? existingSections[fallbackIndex] : null)
            || null;
        const items = [];
        (Array.isArray(existingSection?.items) ? existingSection.items : []).forEach((entry) => {
            const text = normalizeCoreContentText(entry?.text);
            if (!text) return;
            const duplicate = items.find((item) => item.text.toLowerCase() === text.toLowerCase());
            if (duplicate) {
                duplicate.done = Boolean(duplicate.done || entry?.done);
                return;
            }
            items.push({
                id: typeof entry?.id === 'string' && entry.id ? entry.id : createId('core'),
                text,
                done: Boolean(entry?.done),
            });
        });
        return {
            key: def.key,
            title: typeof existingSection?.title === 'string' && existingSection.title.trim() ? existingSection.title.trim() : def.title,
            items,
        };
    });
    subject.masterSections = normalizedSections;

    legacyItems.forEach((item) => {
        const existing = getAllMasterItems(subject).find((entry) => entry.id === item.id || entry.text.toLowerCase() === item.text.toLowerCase());
        if (existing) {
            existing.done = Boolean(existing.done || item.done);
            return;
        }
        const firstSection = subject.masterSections[0];
        if (firstSection) firstSection.items.push(item);
    });

    subject.areas.forEach((area) => {
        ensureAreaDefaults(area);

        (area.coreContent || []).forEach((entry) => {
            const text = normalizeCoreContentText(typeof entry === 'string' ? entry : entry?.text);
            if (!text) return;
            const masterItem = upsertMasterListItem(subject, text, Boolean(entry?.done));
            if (masterItem) area.coreContentIds.push(masterItem.id);
        });

        const validIds = new Set(getAllMasterItems(subject).map((item) => item.id));
        area.coreContentIds = ensureUniqueIds(area.coreContentIds).filter((id) => validIds.has(id));
        area.coreContent = [];
    });

    return subject;
}

function parseMasterListText(value) {
    const seen = new Set();
    return String(value || '')
        .split(/\r?\n/)
        .map((line) => normalizeCoreContentText(line))
        .filter((line) => {
            if (!line) return false;
            const key = line.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

function loadAcademicData() {
    try {
        const parsed = JSON.parse(localStorage.getItem(ACADEMIC_STORAGE_KEY) || '{}');
        const subjects = parsed?.subjects && typeof parsed.subjects === 'object' ? parsed.subjects : {};
        SUBJECT_DEFINITIONS.forEach((subject) => {
            subjects[subject.key] = ensureSubjectDefaults(subjects[subject.key] || { areas: [], masterSections: [] }, subject.key);
        });
        return { subjects };
    } catch {
        const subjects = {};
        SUBJECT_DEFINITIONS.forEach((subject) => {
            subjects[subject.key] = { areas: [], masterSections: [] };
        });
        return { subjects };
    }
}

function saveAcademicData() {
    localStorage.setItem(ACADEMIC_STORAGE_KEY, JSON.stringify(academicData));
}

function getSubject(subjectKey) {
    if (!academicData.subjects[subjectKey]) {
        academicData.subjects[subjectKey] = { areas: [], masterSections: [] };
    }
    return ensureSubjectDefaults(academicData.subjects[subjectKey], subjectKey);
}

function getAreaById(subjectKey, areaId) {
    const subject = getSubject(subjectKey);
    return subject.areas.find((area) => area.id === areaId) || null;
}

function getSortedAreas(subjectKey) {
    const subject = getSubject(subjectKey);
    return [...subject.areas].sort((a, b) => {
        const aw = sanitizeWeek(a.startWeek, 1);
        const bw = sanitizeWeek(b.startWeek, 1);
        if (aw !== bw) return aw - bw;
        return sanitizeWeek(a.endWeek, aw) - sanitizeWeek(b.endWeek, bw);
    });
}

function normalizeSubjectToKey(subjectName) {
    const value = String(subjectName || '').trim().toLowerCase();
    if (!value) return null;
    const direct = SUBJECT_DEFINITIONS.find((subject) => subject.aliases.some(alias => value.startsWith(alias)));
    return direct ? direct.key : null;
}

function ensureSelection() {
    const subject = getSubject(selectedSubjectKey);
    if (!subject.areas.length) {
        selectedAreaId = null;
        return;
    }
    if (!selectedAreaId || !subject.areas.some((area) => area.id === selectedAreaId)) {
        const first = getSortedAreas(selectedSubjectKey)[0];
        selectedAreaId = first ? first.id : null;
    }
}

function ensureAreaDefaults(area) {
    if (!Array.isArray(area.presentations)) area.presentations = [];
    if (!Array.isArray(area.videos)) area.videos = [];
    if (!Array.isArray(area.coreContent)) area.coreContent = [];
    if (!Array.isArray(area.coreContentIds)) area.coreContentIds = [];
    if (typeof area.plan !== 'string') area.plan = '';
}

function addArea(subjectKey) {
    const subject = getSubject(subjectKey);
    const newArea = {
        id: createId('area'),
        title: 'Nytt område',
        startWeek: 1,
        endWeek: 1,
        plan: '',
        presentations: [],
        videos: [],
        coreContent: [],
        coreContentIds: [],
    };
    subject.areas.push(newArea);
    selectedAreaId = newArea.id;
    saveAcademicData();
    renderAcademicPlanningView();
}

function deleteArea(subjectKey, areaId) {
    if (!confirm('Är du säker?')) return;
    const subject = getSubject(subjectKey);
    subject.areas = subject.areas.filter((area) => area.id !== areaId);
    if (selectedAreaId === areaId) selectedAreaId = null;
    saveAcademicData();
    renderAcademicPlanningView();
}

function setAreaField(subjectKey, areaId, field, value, rerender = false) {
    const area = getAreaById(subjectKey, areaId);
    if (!area) return;
    if (field === 'startWeek' || field === 'endWeek') {
        area[field] = sanitizeWeek(value, field === 'endWeek' ? sanitizeWeek(area.startWeek, 1) : 1);
    } else {
        area[field] = value;
    }
    saveAcademicData();
    if (rerender) renderAcademicPlanningView();
}

function addLink(subjectKey, areaId, kind, title, url) {
    const area = getAreaById(subjectKey, areaId);
    if (!area) return;
    ensureAreaDefaults(area);
    area[kind].push({
        id: createId('link'),
        title: (title || '').trim() || 'Namnlös',
        url: (url || '').trim(),
    });
    saveAcademicData();
    renderAcademicPlanningView();
}

function deleteLink(subjectKey, areaId, kind, linkId) {
    if (!confirm('Är du säker?')) return;
    const area = getAreaById(subjectKey, areaId);
    if (!area) return;
    ensureAreaDefaults(area);
    area[kind] = area[kind].filter((item) => item.id !== linkId);
    saveAcademicData();
    renderAcademicPlanningView();
}

function setLinkField(subjectKey, areaId, kind, linkId, field, value) {
    const area = getAreaById(subjectKey, areaId);
    if (!area) return;
    ensureAreaDefaults(area);
    const link = area[kind].find((item) => item.id === linkId);
    if (!link) return;
    link[field] = value;
    saveAcademicData();
}

function addCoreContentSelection(subjectKey, areaId, itemId) {
    const area = getAreaById(subjectKey, areaId);
    if (!area) return;
    ensureAreaDefaults(area);
    if (!area.coreContentIds.includes(itemId)) area.coreContentIds.push(itemId);
    saveAcademicData();
    renderAcademicPlanningView();
}

function removeCoreContentSelection(subjectKey, areaId, itemId) {
    const area = getAreaById(subjectKey, areaId);
    if (!area) return;
    ensureAreaDefaults(area);
    const item = getAllMasterItems(getSubject(subjectKey)).find((entry) => entry.id === itemId);
    if (!item) return;
    if (!confirm(`Är du säker på att du vill ta bort "${item.text}" från området?`)) return;
    area.coreContentIds = area.coreContentIds.filter((id) => id !== itemId);
    saveAcademicData();
    renderAcademicPlanningView();
}

function toggleCoreContentDone(subjectKey, itemId) {
    const subject = getSubject(subjectKey);
    const item = getAllMasterItems(subject).find((entry) => entry.id === itemId);
    if (!item) return;
    item.done = !item.done;
    saveAcademicData();
    if (curriculumMapMode) {
        renderCurriculumMap();
    } else {
        renderAcademicPlanningView();
    }
}

function countCoreContentUsage(subjectKey, itemId) {
    const subject = getSubject(subjectKey);
    return subject.areas.reduce((count, area) => {
        ensureAreaDefaults(area);
        return count + (area.coreContentIds.includes(itemId) ? 1 : 0);
    }, 0);
}

function getAreaCoreContentItems(subjectKey, area) {
    ensureAreaDefaults(area);
    const subject = getSubject(subjectKey);
    const selectedIds = new Set(area.coreContentIds);
    return getAllMasterItems(subject).filter((item) => selectedIds.has(item.id));
}

function closeCurriculumMap() {
    const overlay = document.getElementById('curriculum-map-overlay');
    if (overlay) {
        overlay.classList.add('cm-closing');
        setTimeout(() => {
            overlay.classList.add('hidden');
            overlay.classList.remove('cm-closing');
        }, 220);
    }
    if (curriculumMapEscapeHandler) {
        document.removeEventListener('keydown', curriculumMapEscapeHandler);
        curriculumMapEscapeHandler = null;
    }
    curriculumMapMode = null;
    renderAcademicPlanningView();
}

function closeCurriculumEditModal() {
    const modal = document.getElementById('curriculum-map-edit-modal');
    if (modal) modal.classList.add('hidden');
    if (curriculumEditEscapeHandler) {
        document.removeEventListener('keydown', curriculumEditEscapeHandler);
        curriculumEditEscapeHandler = null;
    }
}

function saveCurriculumEditor(subjectKey, drafts) {
    const subject = getSubject(subjectKey);
    const previousSections = Array.isArray(subject.masterSections) ? subject.masterSections : [];
    const nextSections = drafts.map((draft, index) => {
        const currentSection = previousSections[index] || { key: draft.key, title: draft.title, items: [] };
        const currentItems = Array.isArray(currentSection.items) ? [...currentSection.items] : [];
        const usedIds = new Set();
        const lines = parseMasterListText(draft.rawText);
        const items = lines.map((line, lineIndex) => {
            const exactMatch = currentItems.find((item) => !usedIds.has(item.id) && item.text.toLowerCase() === line.toLowerCase());
            if (exactMatch) {
                usedIds.add(exactMatch.id);
                return { ...exactMatch, text: line };
            }
            const sameIndex = currentItems[lineIndex];
            if (sameIndex && !usedIds.has(sameIndex.id)) {
                usedIds.add(sameIndex.id);
                return { ...sameIndex, text: line };
            }
            const item = { id: createId('core'), text: line, done: false };
            usedIds.add(item.id);
            return item;
        });
        return {
            key: draft.key,
            title: draft.title.trim() || `Del ${index + 1}`,
            items,
        };
    });

    const previousIds = new Set(previousSections.flatMap((section) => (section.items || []).map((item) => item.id)));
    const nextIds = new Set(nextSections.flatMap((section) => (section.items || []).map((item) => item.id)));
    const removedCount = [...previousIds].filter((id) => !nextIds.has(id)).length;
    if (removedCount > 0 && !confirm(`Detta tar bort ${removedCount} punkt${removedCount === 1 ? '' : 'er'} från kursplanen och från alla områden. Fortsätt?`)) {
        return;
    }

    subject.masterSections = nextSections;
    subject.areas.forEach((area) => {
        ensureAreaDefaults(area);
        area.coreContentIds = ensureUniqueIds(area.coreContentIds).filter((id) => nextIds.has(id));
    });
    saveAcademicData();
    closeCurriculumEditModal();
    renderCurriculumMap();
}

function openCurriculumEditor() {
    const subject = getSubject(selectedSubjectKey);
    const defs = getMasterSectionDefinitions(selectedSubjectKey);
    const sections = defs.map((def, index) => {
        const source = subject.masterSections[index] || { key: def.key, title: def.title, items: [] };
        return {
            key: def.key,
            title: source.title || def.title,
            rawText: (source.items || []).map((item) => item.text).join('\n'),
        };
    });

    let modal = document.getElementById('curriculum-map-edit-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'curriculum-map-edit-modal';
        document.body.appendChild(modal);
    }
    modal.className = 'curriculum-map-edit-modal';
    modal.classList.remove('hidden');
    modal.textContent = '';

    const panel = document.createElement('div');
    panel.className = 'curriculum-map-edit-panel';

    const header = document.createElement('div');
    header.className = 'curriculum-map-edit-header';

    const titleWrap = document.createElement('div');
    const title = document.createElement('h3');
    title.className = 'curriculum-map-edit-title serif-title';
    title.textContent = `Redigera Kursplan – ${SUBJECT_DEFINITIONS.find((s) => s.key === selectedSubjectKey)?.label || ''}`;
    const subtitle = document.createElement('p');
    subtitle.className = 'curriculum-map-edit-subtitle';
    subtitle.textContent = 'Ange rubriker och punkter (en punkt per rad).';
    titleWrap.appendChild(title);
    titleWrap.appendChild(subtitle);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'curriculum-map-close';
    closeBtn.textContent = 'Avbryt';
    closeBtn.addEventListener('click', closeCurriculumEditModal);

    header.appendChild(titleWrap);
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'curriculum-map-edit-body custom-scrollbar';

    const inputs = [];
    sections.forEach((section, index) => {
        const block = document.createElement('section');
        block.className = 'curriculum-map-edit-section';

        const headingInput = document.createElement('input');
        headingInput.type = 'text';
        headingInput.className = 'curriculum-map-edit-heading';
        headingInput.value = section.title;
        headingInput.placeholder = `Rubrik ${index + 1}`;

        const textarea = document.createElement('textarea');
        textarea.className = 'curriculum-map-editor-textarea custom-scrollbar';
        textarea.placeholder = 'En punkt per rad...';
        textarea.value = section.rawText;

        block.appendChild(headingInput);
        block.appendChild(textarea);
        body.appendChild(block);
        inputs.push({ key: section.key, headingInput, textarea });
    });

    const footer = document.createElement('div');
    footer.className = 'curriculum-map-edit-footer';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'academic-add-btn';
    saveBtn.textContent = 'Spara';
    saveBtn.addEventListener('click', () => {
        const drafts = inputs.map((entry, index) => ({
            key: entry.key,
            title: entry.headingInput.value.trim() || `Del ${index + 1}`,
            rawText: entry.textarea.value,
        }));
        saveCurriculumEditor(selectedSubjectKey, drafts);
    });

    footer.appendChild(saveBtn);

    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(footer);
    modal.appendChild(panel);

    if (!curriculumEditEscapeHandler) {
        curriculumEditEscapeHandler = (e) => {
            if (e.key === 'Escape') closeCurriculumEditModal();
        };
        document.addEventListener('keydown', curriculumEditEscapeHandler);
    }
}

function renderCurriculumMap() {
    const subjectDef = SUBJECT_DEFINITIONS.find((s) => s.key === selectedSubjectKey) || SUBJECT_DEFINITIONS[0];
    const subject = getSubject(selectedSubjectKey);
    const isSelectMode = curriculumMapMode === 'select';

    let overlay = document.getElementById('curriculum-map-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'curriculum-map-overlay';
        document.body.appendChild(overlay);
    }
    overlay.className = 'curriculum-map-overlay';
    overlay.classList.remove('hidden', 'cm-closing');
    overlay.textContent = '';

    // Header
    const header = document.createElement('div');
    header.className = 'curriculum-map-header';

    const titleArea = document.createElement('div');
    titleArea.className = 'curriculum-map-title-area';

    const subjectBadge = document.createElement('span');
    subjectBadge.className = 'curriculum-map-subject-badge';
    subjectBadge.style.setProperty('--subject-color', subjectDef.color?.bg || '#a6857e');
    subjectBadge.style.setProperty('--subject-light', subjectDef.color?.light || '#f5efe9');
    subjectBadge.textContent = subjectDef.label;

    const mapTitle = document.createElement('h2');
    mapTitle.className = 'curriculum-map-title serif-title';
    mapTitle.textContent = isSelectMode ? 'Anslut innehåll' : 'Helhetsöversikt';

    titleArea.appendChild(subjectBadge);
    titleArea.appendChild(mapTitle);

    if (isSelectMode) {
        const hint = document.createElement('p');
        hint.className = 'curriculum-map-hint';
        hint.textContent = 'Tryck på punkter för att koppla dem till detta område.';
        titleArea.appendChild(hint);
    }

    const headerActions = document.createElement('div');
    headerActions.className = 'curriculum-map-header-actions';

    if (!isSelectMode) {
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'curriculum-map-edit-btn';
        editBtn.textContent = 'Redigera Kursplan';
        editBtn.addEventListener('click', openCurriculumEditor);
        headerActions.appendChild(editBtn);
    }

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'curriculum-map-close';
    closeBtn.setAttribute('aria-label', 'Stäng');
    closeBtn.textContent = isSelectMode ? 'Klar ✓' : '×';
    closeBtn.addEventListener('click', closeCurriculumMap);
    headerActions.appendChild(closeBtn);

    header.appendChild(titleArea);
    header.appendChild(headerActions);
    overlay.appendChild(header);

    // Legend (view mode only)
    if (!isSelectMode) {
        const legend = document.createElement('div');
        legend.className = 'curriculum-map-legend';
        [
            { cls: 'done', label: 'Genomfört' },
            { cls: 'covered', label: 'Kopplat till område' },
            { cls: 'unused', label: 'Inte kopplat ännu' },
        ].forEach(({ cls, label }) => {
            const item = document.createElement('span');
            item.className = `curriculum-map-legend-item ${cls}`;
            item.style.setProperty('--subject-color', subjectDef.color?.bg || '#a6857e');
            item.style.setProperty('--subject-light', subjectDef.color?.light || '#f5efe9');
            item.textContent = label;
            legend.appendChild(item);
        });
        overlay.appendChild(legend);
    }

    // Build area-name lookup (itemId → [area titles])
    const areasByItemId = {};
    subject.areas.forEach((area) => {
        ensureAreaDefaults(area);
        (area.coreContentIds || []).forEach((id) => {
            if (!areasByItemId[id]) areasByItemId[id] = [];
            areasByItemId[id].push(area.title || 'Namnlöst område');
        });
    });

    const currentArea = isSelectMode && selectedAreaId ? getAreaById(selectedSubjectKey, selectedAreaId) : null;
    const currentAreaIds = currentArea ? (currentArea.coreContentIds || []) : [];

    // Sections
    const sectionsWrap = document.createElement('div');
    sectionsWrap.className = 'curriculum-map-sections custom-scrollbar';

    subject.masterSections.forEach((section) => {
            const sectionCard = document.createElement('section');
            sectionCard.className = 'curriculum-map-section';

            const sectionHeader = document.createElement('div');
            sectionHeader.className = 'curriculum-map-section-header';

            const sectionTitle = document.createElement('h3');
            sectionTitle.className = 'curriculum-map-section-title serif-title';
            sectionTitle.textContent = section.title;
            sectionHeader.appendChild(sectionTitle);

            sectionCard.appendChild(sectionHeader);

            const grid = document.createElement('div');
            grid.className = 'curriculum-map-grid';

            (section.items || []).forEach((item) => {
                const areaNames = areasByItemId[item.id] || [];
                const isCovered = areaNames.length > 0;
                const isDone = item.done;
                const isSelectedForArea = isSelectMode && currentAreaIds.includes(item.id);

                const card = document.createElement(isSelectMode ? 'button' : 'div');
                card.className = 'curriculum-map-card';
                if (!isSelectMode) card.classList.add('readonly');
                card.style.setProperty('--subject-color', subjectDef.color?.bg || '#a6857e');
                card.style.setProperty('--subject-light', subjectDef.color?.light || '#f5efe9');

                if (isSelectMode) {
                    if (isSelectedForArea) card.classList.add('selected');
                } else {
                    if (isDone) card.classList.add('done');
                    else if (isCovered) card.classList.add('covered');
                    else card.classList.add('unused');
                }

                const text = document.createElement('span');
                text.className = 'curriculum-map-card-text';
                text.textContent = item.text;
                card.appendChild(text);

                if (isSelectMode) {
                    const check = document.createElement('span');
                    check.className = 'curriculum-map-card-check';
                    check.textContent = '✓';
                    card.appendChild(check);
                }

                if (isSelectMode) {
                    card.addEventListener('click', () => {
                        const area = getAreaById(selectedSubjectKey, selectedAreaId);
                        if (!area) return;
                        ensureAreaDefaults(area);
                        if (area.coreContentIds.includes(item.id)) {
                            area.coreContentIds = area.coreContentIds.filter((id) => id !== item.id);
                        } else {
                            area.coreContentIds.push(item.id);
                        }
                        saveAcademicData();
                        renderCurriculumMap();
                    });
                }

                grid.appendChild(card);
            });

            if (!(section.items || []).length) {
                const emptySection = document.createElement('p');
                emptySection.className = 'academic-empty';
                emptySection.textContent = isSelectMode ? 'Inga punkter i denna del än.' : 'Lägg till punkter ovan.';
                grid.appendChild(emptySection);
            }

            sectionCard.appendChild(grid);
            sectionsWrap.appendChild(sectionCard);
        });
    overlay.appendChild(sectionsWrap);
}

function openCurriculumMap(mode = 'view') {
    curriculumMapMode = mode;
    renderCurriculumMap();
    if (!curriculumMapEscapeHandler) {
        curriculumMapEscapeHandler = (e) => {
            if (e.key === 'Escape') closeCurriculumMap();
        };
        document.addEventListener('keydown', curriculumMapEscapeHandler);
    }
}

function buildSubjectSidebar(container) {
    const sidebar = document.createElement('div');
    sidebar.className = 'academic-subject-sidebar custom-scrollbar';

    SUBJECT_DEFINITIONS.forEach((subject) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'academic-subject-btn';
        btn.classList.toggle('active', subject.key === selectedSubjectKey);
        btn.style.setProperty('--subject-color', subject.color?.bg || '#a6857e');

        const icon = document.createElement('span');
        icon.className = 'academic-subject-icon';
        icon.textContent = subject.icon;

        const label = document.createElement('span');
        label.className = 'academic-subject-label';
        label.textContent = subject.label;

        btn.appendChild(icon);
        btn.appendChild(label);
        btn.addEventListener('click', () => {
            selectedSubjectKey = subject.key;
            selectedAreaId = null;
            updateAcademicPlanningTitle(subject.label);
            renderAcademicPlanningView();
        });
        sidebar.appendChild(btn);
    });

    container.appendChild(sidebar);
}

function buildAreaPanel(container) {
    const panel = document.createElement('div');
    panel.className = 'academic-area-panel custom-scrollbar';

    const header = document.createElement('div');
    header.className = 'academic-panel-header';

    const title = document.createElement('h2');
    title.className = 'serif-title text-3xl';
    title.textContent = 'Områden';

    header.appendChild(title);

    const headerRight = document.createElement('div');
    headerRight.className = 'academic-panel-header-right';

    const curriculumBtn = document.createElement('button');
    curriculumBtn.type = 'button';
    curriculumBtn.className = 'academic-overview-btn';
    curriculumBtn.textContent = 'Kursplan';
    curriculumBtn.addEventListener('click', () => openCurriculumMap('view'));
    headerRight.appendChild(curriculumBtn);

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'academic-add-btn';
    addBtn.textContent = '+ Lägg till område';
    addBtn.addEventListener('click', () => addArea(selectedSubjectKey));
    headerRight.appendChild(addBtn);
    header.appendChild(headerRight);
    panel.appendChild(header);

    const list = document.createElement('div');
    list.className = 'academic-area-list';

    const areas = getSortedAreas(selectedSubjectKey);
    areas.forEach((area) => {
        ensureAreaDefaults(area);
        const item = document.createElement('div');
        item.className = 'academic-area-item';
        if (area.id === selectedAreaId) item.classList.add('active');
        item.addEventListener('click', () => {
            selectedAreaId = area.id;
            renderAcademicPlanningView();
        });

        const topRow = document.createElement('div');
        topRow.className = 'academic-area-top';

        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.className = 'academic-area-title';
        titleInput.value = area.title || '';
        titleInput.placeholder = 'Titel';
        titleInput.addEventListener('click', (e) => e.stopPropagation());
        titleInput.addEventListener('input', () => setAreaField(selectedSubjectKey, area.id, 'title', titleInput.value));

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'academic-delete-btn';
        deleteBtn.textContent = '×';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteArea(selectedSubjectKey, area.id);
        });

        topRow.appendChild(titleInput);
        topRow.appendChild(deleteBtn);

        const weekRow = document.createElement('div');
        weekRow.className = 'academic-week-row';

        const startInput = document.createElement('input');
        startInput.type = 'number';
        startInput.min = '1';
        startInput.max = '52';
        startInput.value = sanitizeWeek(area.startWeek, 1);
        startInput.className = 'academic-week-input';
        startInput.addEventListener('click', (e) => e.stopPropagation());
        startInput.addEventListener('change', () => setAreaField(selectedSubjectKey, area.id, 'startWeek', startInput.value, true));

        const endInput = document.createElement('input');
        endInput.type = 'number';
        endInput.min = '1';
        endInput.max = '52';
        endInput.value = sanitizeWeek(area.endWeek, sanitizeWeek(area.startWeek, 1));
        endInput.className = 'academic-week-input';
        endInput.addEventListener('click', (e) => e.stopPropagation());
        endInput.addEventListener('change', () => setAreaField(selectedSubjectKey, area.id, 'endWeek', endInput.value, true));

        const label = document.createElement('span');
        label.className = 'academic-week-label';
        label.textContent = `v. ${sanitizeWeek(area.startWeek, 1)}-${sanitizeWeek(area.endWeek, sanitizeWeek(area.startWeek, 1))}`;

        weekRow.appendChild(startInput);
        weekRow.appendChild(document.createTextNode('–'));
        weekRow.appendChild(endInput);
        weekRow.appendChild(label);

        item.appendChild(topRow);
        item.appendChild(weekRow);
        list.appendChild(item);
    });

    if (!areas.length) {
        const empty = document.createElement('p');
        empty.className = 'academic-empty';
        empty.textContent = 'Inga områden ännu';
        list.appendChild(empty);
    }

    panel.appendChild(list);
    container.appendChild(panel);
}

function buildLinkSection({ area, sectionTitle, kind, subjectKey }) {
    const section = document.createElement('section');
    section.className = 'academic-grid-card';

    const title = document.createElement('h3');
    title.className = 'academic-grid-title';
    title.textContent = sectionTitle;

    const form = document.createElement('form');
    form.className = 'academic-link-form';

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.placeholder = 'Titel';
    titleInput.className = 'academic-mini-input';

    const urlInput = document.createElement('input');
    urlInput.type = 'url';
    urlInput.placeholder = 'URL';
    urlInput.className = 'academic-mini-input';

    const addBtn = document.createElement('button');
    addBtn.type = 'submit';
    addBtn.className = 'academic-add-btn small';
    addBtn.textContent = 'Lägg till';

    form.appendChild(titleInput);
    form.appendChild(urlInput);
    form.appendChild(addBtn);

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!urlInput.value.trim()) return;
        addLink(subjectKey, area.id, kind, titleInput.value, urlInput.value);
    });

    const list = document.createElement('div');
    list.className = 'academic-link-list custom-scrollbar';

    (area[kind] || []).forEach((link) => {
        const row = document.createElement('div');
        row.className = 'academic-link-row';

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'academic-mini-input';
        nameInput.value = link.title || '';
        nameInput.addEventListener('input', () => setLinkField(subjectKey, area.id, kind, link.id, 'title', nameInput.value));

        const linkInput = document.createElement('input');
        linkInput.type = 'url';
        linkInput.className = 'academic-mini-input';
        linkInput.value = link.url || '';
        linkInput.addEventListener('input', () => setLinkField(subjectKey, area.id, kind, link.id, 'url', linkInput.value));

        const openLink = document.createElement('a');
        openLink.href = link.url || '#';
        openLink.target = '_blank';
        openLink.rel = 'noopener noreferrer';
        openLink.className = 'academic-link-open';
        openLink.textContent = '↗';

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'academic-delete-btn';
        del.textContent = '×';
        del.addEventListener('click', () => deleteLink(subjectKey, area.id, kind, link.id));

        row.appendChild(nameInput);
        row.appendChild(linkInput);
        row.appendChild(openLink);
        row.appendChild(del);
        list.appendChild(row);
    });

    section.appendChild(title);
    section.appendChild(form);
    section.appendChild(list);
    return section;
}

function buildCoreContentSection(area, subject) {
    const section = document.createElement('section');
    section.className = 'academic-grid-card';
    const subjectData = getSubject(selectedSubjectKey);

    const titleRow = document.createElement('div');
    titleRow.className = 'academic-grid-card-header';

    const title = document.createElement('h3');
    title.className = 'academic-grid-title';
    title.textContent = 'Centralt innehåll';

    const connectBtn = document.createElement('button');
    connectBtn.type = 'button';
    connectBtn.className = 'academic-connect-btn';
    connectBtn.textContent = 'Anslut innehåll';
    connectBtn.addEventListener('click', () => openCurriculumMap('select'));

    titleRow.appendChild(title);
    titleRow.appendChild(connectBtn);
    section.appendChild(titleRow);

    const selectedItems = getAreaCoreContentItems(selectedSubjectKey, area);

    const list = document.createElement('div');
    list.className = 'academic-checklist custom-scrollbar';

    if (!getAllMasterItems(subjectData).length) {
        const empty = document.createElement('p');
        empty.className = 'academic-empty';
        empty.textContent = 'Lägg först in ämnets kursplan via knappen Kursplan.';
        list.appendChild(empty);
    } else if (!selectedItems.length) {
        const empty = document.createElement('p');
        empty.className = 'academic-empty';
        empty.textContent = 'Tryck "Anslut innehåll" för att koppla kursplanspunkter.';
        list.appendChild(empty);
    } else {
        selectedItems.forEach((item) => {
            const row = document.createElement('div');
            row.className = 'academic-checklist-item';
            row.style.setProperty('--subject-color', subject.color?.bg || '#a6857e');
            row.style.setProperty('--subject-light', subject.color?.light || '#f5efe9');
            if (item.done) row.classList.add('done');
            row.addEventListener('click', () => toggleCoreContentDone(selectedSubjectKey, item.id));

            const checkbox = document.createElement('span');
            checkbox.className = 'academic-checklist-checkbox';

            const text = document.createElement('span');
            text.className = 'academic-checklist-text';
            text.textContent = item.text;

            row.appendChild(checkbox);
            row.appendChild(text);
            list.appendChild(row);
        });
    }

    section.appendChild(list);
    return section;
}

function buildDashboard(container, subject) {
    const dashboard = document.createElement('div');
    dashboard.className = 'academic-dashboard';

    const area = getAreaById(selectedSubjectKey, selectedAreaId);
    if (!area) {
        const empty = document.createElement('div');
        empty.className = 'academic-dashboard-empty';
        empty.textContent = 'Välj eller skapa ett område för att börja planera.';
        dashboard.appendChild(empty);
        container.appendChild(dashboard);
        return;
    }

    ensureAreaDefaults(area);

    const planCard = document.createElement('section');
    planCard.className = 'academic-grid-card';

    const planTitle = document.createElement('h3');
    planTitle.className = 'academic-grid-title';
    planTitle.textContent = 'Planering';

    const textarea = document.createElement('textarea');
    textarea.className = 'academic-plan-textarea custom-scrollbar';
    textarea.value = area.plan || '';
    textarea.placeholder = 'Skriv planering för området...';
    textarea.addEventListener('input', () => {
        area.plan = textarea.value;
        saveAcademicData();
    });

    planCard.appendChild(planTitle);
    planCard.appendChild(textarea);

    dashboard.appendChild(planCard);
    dashboard.appendChild(buildLinkSection({ area, sectionTitle: 'Presentationer', kind: 'presentations', subjectKey: selectedSubjectKey }));
    dashboard.appendChild(buildLinkSection({ area, sectionTitle: 'Filmer', kind: 'videos', subjectKey: selectedSubjectKey }));
    dashboard.appendChild(buildCoreContentSection(area, subject));

    container.appendChild(dashboard);
}

function updateAcademicPlanningTitle(subjectLabel) {
    const titleEl = document.getElementById('academic-planning-title');
    if (titleEl) titleEl.textContent = `Läsårsplanering - ${subjectLabel}`;
}

export function renderAcademicPlanningView() {
    const container = document.getElementById('view-lasarsplanering');
    if (!container) return;

    academicData = loadAcademicData();
    if (!SUBJECT_DEFINITIONS.some((subject) => subject.key === selectedSubjectKey)) {
        selectedSubjectKey = SUBJECT_DEFINITIONS[0].key;
    }
    ensureSelection();

    const subject = SUBJECT_DEFINITIONS.find((entry) => entry.key === selectedSubjectKey) || SUBJECT_DEFINITIONS[0];
    updateAcademicPlanningTitle(subject.label);

    container.textContent = '';

    const layout = document.createElement('div');
    layout.className = 'academic-layout';

    buildSubjectSidebar(layout);
    buildAreaPanel(layout);
    buildDashboard(layout, subject);

    container.appendChild(layout);
}

function getActiveLesson() {
    if (!activeLessonId) return null;
    const weekKey = `${currentYear}-W${currentWeek}`;
    const lessons = plannerData[weekKey]?.lessons?.[activeDayIndex] || [];
    return lessons.find((lesson) => lesson.id === activeLessonId) || null;
}

function getSubjectPresentationItems(subjectKey) {
    const subject = getSubject(subjectKey);
    return getSortedAreas(subjectKey).flatMap((area) => {
        ensureAreaDefaults(area);
        return area.presentations
            .filter((item) => item.url)
            .map((item) => ({
                title: item.title || 'Namnlös presentation',
                url: item.url,
                areaTitle: area.title || 'Område',
                weekLabel: `v. ${sanitizeWeek(area.startWeek, 1)}-${sanitizeWeek(area.endWeek, sanitizeWeek(area.startWeek, 1))}`,
            }));
    });
}

export function closePlanningPresentationPicker() {
    const modal = document.getElementById('planning-presentation-modal');
    if (modal) modal.classList.add('hidden');
}

export function openPlanningPresentationPicker() {
    const lesson = getActiveLesson();
    if (!lesson) {
        alert('Välj en lektion först.');
        return;
    }

    const subjectKey = normalizeSubjectToKey(lesson.subject);
    if (!subjectKey) {
        alert('Ämnet matchar inget ämne i läsårsplaneringen.');
        return;
    }

    academicData = loadAcademicData();
    const items = getSubjectPresentationItems(subjectKey);
    if (!items.length) {
        alert('Inga sparade presentationer för detta ämne.');
        return;
    }

    const subject = SUBJECT_DEFINITIONS.find((entry) => entry.key === subjectKey);
    const modal = document.getElementById('planning-presentation-modal');
    const subjectText = document.getElementById('planning-presentation-modal-subject');
    const list = document.getElementById('planning-presentation-modal-list');
    if (!modal || !subjectText || !list) return;

    subjectText.textContent = subject ? subject.label : lesson.subject;
    list.textContent = '';

    items.forEach((item) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'planning-picker-item';

        const title = document.createElement('span');
        title.className = 'planning-picker-title';
        title.textContent = item.title;

        const meta = document.createElement('span');
        meta.className = 'planning-picker-meta';
        meta.textContent = `${item.areaTitle} • ${item.weekLabel}`;

        btn.appendChild(title);
        btn.appendChild(meta);
        btn.addEventListener('click', () => {
            openTool('presentation', { launchUrl: item.url });
            closePlanningPresentationPicker();
        });
        list.appendChild(btn);
    });

    modal.classList.remove('hidden');
}

export function initAcademicPlanning() {
    academicData = loadAcademicData();
}
