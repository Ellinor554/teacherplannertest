import { getSubjectDefs, normalizeSubjectToKey, hexToColors } from './subjects.js';
import {
    plannerData, currentYear, currentWeek, activeDayIndex, activeLessonId
} from './state.js';
import { saveData } from './persistence.js';

const ACADEMIC_STORAGE_KEY = 'teacherplanner_academic_year_planning';

let academicData = loadAcademicData();
let selectedSubjectKey = null;
let selectedAreaId = null;
let curriculumMapMode = null; // 'view' | 'select' | null
let curriculumMapEscapeHandler = null;
let curriculumEditEscapeHandler = null;

const SUBJECT_SECTION_TITLES = Array(3).fill('Rubrik');
const DEFAULT_SECTION_KEY = 'section-1';

function getDefaultSectionKey(subjectKey = selectedSubjectKey) {
    return getMasterSectionDefinitions(subjectKey)[0]?.key || DEFAULT_SECTION_KEY;
}

function getMasterSectionDefinitions(subjectKey) {
    const titles = SUBJECT_SECTION_TITLES;
    return titles.slice(0, 3).map((title, index) => ({
        key: `section-${index + 1}`,
        title,
    }));
}

function createDefaultMasterSections(subjectKey) {
    const definitions = getMasterSectionDefinitions(subjectKey);
    if (!definitions.length) {
        return [{ key: DEFAULT_SECTION_KEY, title: 'Rubrik', items: [] }];
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

function upsertMasterListItem(subject, text, done = false, preferredSectionKey = getDefaultSectionKey(), subjectKey = selectedSubjectKey) {
    const normalizedText = normalizeCoreContentText(text);
    if (!normalizedText) return null;

    if (!Array.isArray(subject.masterSections) || !subject.masterSections.length) subject.masterSections = createDefaultMasterSections(subjectKey);
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
            const masterItem = upsertMasterListItem(subject, text, Boolean(entry?.done), getDefaultSectionKey(subjectKey), subjectKey);
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
        getSubjectDefs().forEach((subject) => {
            subjects[subject.key] = ensureSubjectDefaults(subjects[subject.key] || { areas: [], masterSections: [] }, subject.key);
        });
        return { subjects };
    } catch {
        return { subjects: {} };
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

function ensureSelection() {
    if (!selectedSubjectKey) {
        selectedAreaId = null;
        return;
    }
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
            title: draft.title.trim() || `Rubrik ${index + 1}`,
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
    title.className = 'curriculum-map-edit-title';
    title.textContent = `Redigera Kursplan – ${getSubjectDefs().find((s) => s.key === selectedSubjectKey)?.label || ''}`;
    const subtitle = document.createElement('p');
    subtitle.className = 'curriculum-map-edit-subtitle';
    subtitle.textContent = 'Ange rubriker och punkter (en punkt per rad).';
    titleWrap.appendChild(title);
    titleWrap.appendChild(subtitle);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'curriculum-map-close';
    closeBtn.textContent = 'Avbryt';
    closeBtn.setAttribute('aria-label', 'Avbryt redigering av kursplan');
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
    saveBtn.setAttribute('aria-label', 'Spara ändringar i kursplan');
    saveBtn.addEventListener('click', () => {
        const drafts = inputs.map((entry, index) => ({
            key: entry.key,
            title: entry.headingInput.value.trim() || `Rubrik ${index + 1}`,
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
    const DEFAULT_SUBJECT_DEF = { key: '', label: '', icon: '', color: { bg: '#a6857e', light: '#f5efe9', text: '#5c3d35' } };
    const subjectDefs = getSubjectDefs();
    const subjectDef = subjectDefs.find((s) => s.key === selectedSubjectKey) || subjectDefs[0] || DEFAULT_SUBJECT_DEF;
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
    mapTitle.className = 'curriculum-map-title';
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
        editBtn.setAttribute('aria-label', 'Redigera Kursplan');
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
            { cls: 'incomplete', label: 'Ej genomfört' },
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
            sectionTitle.className = 'curriculum-map-section-title';
            sectionTitle.textContent = section.title;
            sectionHeader.appendChild(sectionTitle);

            sectionCard.appendChild(sectionHeader);

            const grid = document.createElement('div');
            grid.className = 'curriculum-map-grid';
            grid.setAttribute('role', 'list');

            (section.items || []).forEach((item) => {
                const isDone = item.done;
                const isSelectedForArea = isSelectMode && currentAreaIds.includes(item.id);

                const card = document.createElement('button');
                card.type = 'button';
                card.className = 'curriculum-map-card';
                card.style.setProperty('--subject-color', subjectDef.color?.bg || '#a6857e');
                card.style.setProperty('--subject-light', subjectDef.color?.light || '#f5efe9');

                if (isSelectMode) {
                    if (isSelectedForArea) card.classList.add('selected');
                } else {
                    if (isDone) card.classList.add('done');
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
                } else {
                    card.addEventListener('click', () => toggleCoreContentDone(selectedSubjectKey, item.id));
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

export function openCurriculumMap(mode = 'view') {
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

    const subjectDefs = getSubjectDefs();

    if (!subjectDefs.length) {
        const empty = document.createElement('p');
        empty.className = 'academic-subject-empty';
        empty.textContent = 'Inga ämnen. Klicka ⚙ i sidopanelen.';
        sidebar.appendChild(empty);
        container.appendChild(sidebar);
        return;
    }

    subjectDefs.forEach((subject) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'academic-subject-btn';
        btn.classList.toggle('active', subject.key === selectedSubjectKey);
        btn.style.setProperty('--subject-color', subject.color?.bg || '#a6857e');

        const icon = document.createElement('span');
        icon.className = 'academic-subject-icon';
        icon.textContent = subject.icon;
        icon.style.background = subject.color?.bg || '#a6857e';

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
        const subjectDef = getSubjectDefs().find((s) => s.key === selectedSubjectKey);
        const subjectColor = subjectDef?.color?.bg || '#a6857e';

        const item = document.createElement('div');
        item.className = 'academic-area-item';
        if (area.id === selectedAreaId) item.classList.add('active');
        item.style.setProperty('--subject-color', subjectColor);
        item.addEventListener('click', () => {
            selectedAreaId = area.id;
            renderAcademicPlanningView();
        });

        // Title — contenteditable, looks static until clicked
        const titleDisplay = document.createElement('div');
        titleDisplay.className = 'academic-area-title-display';
        titleDisplay.setAttribute('contenteditable', 'true');
        titleDisplay.setAttribute('spellcheck', 'false');
        titleDisplay.setAttribute('data-placeholder', 'Titel');
        titleDisplay.textContent = area.title || '';
        titleDisplay.addEventListener('click', (e) => e.stopPropagation());
        titleDisplay.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); titleDisplay.blur(); }
        });
        titleDisplay.addEventListener('input', () => {
            setAreaField(selectedSubjectKey, area.id, 'title', titleDisplay.innerText.trim());
        });
        titleDisplay.addEventListener('blur', () => {
            setAreaField(selectedSubjectKey, area.id, 'title', titleDisplay.innerText.trim());
        });
        titleDisplay.addEventListener('paste', (e) => {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text/plain');
            const selection = window.getSelection();
            if (!selection.rangeCount) return;
            selection.deleteFromDocument();
            const range = selection.getRangeAt(0);
            range.insertNode(document.createTextNode(text));
            selection.collapseToEnd();
        });

        // Week badge — styled inputs for start/end week
        const weekBadge = document.createElement('div');
        weekBadge.className = 'academic-area-week-badge';

        const wLabel = document.createElement('span');
        wLabel.textContent = 'v.\u00a0';

        const startWeekInput = document.createElement('input');
        startWeekInput.type = 'number';
        startWeekInput.min = '1';
        startWeekInput.max = '52';
        startWeekInput.value = sanitizeWeek(area.startWeek, 1);
        startWeekInput.className = 'academic-week-num-input';
        startWeekInput.addEventListener('click', (e) => e.stopPropagation());
        startWeekInput.addEventListener('change', () => setAreaField(selectedSubjectKey, area.id, 'startWeek', startWeekInput.value, true));

        const separator = document.createElement('span');
        separator.textContent = '\u2013';

        const endWeekInput = document.createElement('input');
        endWeekInput.type = 'number';
        endWeekInput.min = '1';
        endWeekInput.max = '52';
        endWeekInput.value = sanitizeWeek(area.endWeek, sanitizeWeek(area.startWeek, 1));
        endWeekInput.className = 'academic-week-num-input';
        endWeekInput.addEventListener('click', (e) => e.stopPropagation());
        endWeekInput.addEventListener('change', () => setAreaField(selectedSubjectKey, area.id, 'endWeek', endWeekInput.value, true));

        weekBadge.appendChild(wLabel);
        weekBadge.appendChild(startWeekInput);
        weekBadge.appendChild(separator);
        weekBadge.appendChild(endWeekInput);

        // Card body row: title + week badge
        const cardContent = document.createElement('div');
        cardContent.className = 'academic-area-card-content';
        cardContent.appendChild(titleDisplay);
        cardContent.appendChild(weekBadge);

        // Delete button — visible only on hover via CSS
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'academic-area-delete-btn';
        deleteBtn.textContent = '×';
        deleteBtn.setAttribute('aria-label', 'Ta bort område');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteArea(selectedSubjectKey, area.id);
        });

        item.appendChild(cardContent);
        item.appendChild(deleteBtn);
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
    const subjectDefs = getSubjectDefs();
    if (!subjectDefs.some((s) => s.key === selectedSubjectKey)) {
        selectedSubjectKey = subjectDefs[0]?.key || null;
    }
    ensureSelection();

    const subject = subjectDefs.find((entry) => entry.key === selectedSubjectKey) || null;
    updateAcademicPlanningTitle(subject?.label || '');

    container.textContent = '';

    if (!subjectDefs.length) {
        const empty = document.createElement('div');
        empty.className = 'academic-no-subjects';
        empty.innerHTML = '<p>Inga ämnen tillagda.</p><p>Klicka på <strong>⚙</strong> i vänstra sidopanelen för att lägga till ämnen.</p>';
        container.appendChild(empty);
        return;
    }

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

function getActiveAreaForWeek(subjectKey, week = currentWeek) {
    const targetWeek = sanitizeWeek(week, currentWeek);
    return getSortedAreas(subjectKey).find((area) => {
        const start = sanitizeWeek(area.startWeek, 1);
        const end = sanitizeWeek(area.endWeek, start);
        return targetWeek >= start && targetWeek <= end;
    }) || null;
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeHref(url) {
    const trimmed = String(url || '').trim();
    if (!trimmed) return null;
    const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
        const parsed = new URL(candidate);
        if (!/^https?:$/i.test(parsed.protocol)) return null;
        return parsed.href;
    } catch {
        return null;
    }
}

function getAreaResourceLinks(items) {
    return (Array.isArray(items) ? items : []).map((item) => {
        const href = normalizeHref(item?.url);
        if (!href) return null;
        return {
            title: String(item?.title || '').trim() || href,
            url: href,
        };
    }).filter(Boolean);
}

function buildPlanningPickerResourceSection({ sectionTitle, links }) {
    const section = document.createElement('section');
    section.className = 'planning-picker-section';

    const heading = document.createElement('h4');
    heading.className = 'planning-picker-section-title';
    heading.textContent = sectionTitle;
    section.appendChild(heading);

    if (!links.length) {
        const empty = document.createElement('p');
        empty.className = 'planning-picker-empty';
        empty.textContent = 'Inga länkar i aktivt område.';
        section.appendChild(empty);
        return section;
    }

    links.forEach((resource) => {
        const row = document.createElement('div');
        row.className = 'planning-picker-item';

        const link = document.createElement('a');
        link.className = 'planning-picker-link';
        link.href = resource.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = resource.title;

        row.appendChild(link);
        section.appendChild(row);
    });

    return section;
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
    const activeArea = getActiveAreaForWeek(subjectKey, currentWeek);
    if (!activeArea) {
        alert('Inget aktivt område hittades för denna vecka.');
        return;
    }
    ensureAreaDefaults(activeArea);

    const subject = getSubjectDefs().find((entry) => entry.key === subjectKey);
    const modal = document.getElementById('planning-presentation-modal');
    const subjectText = document.getElementById('planning-presentation-modal-subject');
    const list = document.getElementById('planning-presentation-modal-list');
    if (!modal || !subjectText || !list) return;

    subjectText.textContent = `${subject ? subject.label : lesson.subject} • ${activeArea.title || 'Område'} • v. ${sanitizeWeek(activeArea.startWeek, 1)}-${sanitizeWeek(activeArea.endWeek, sanitizeWeek(activeArea.startWeek, 1))}`;
    list.textContent = '';
    const presentations = getAreaResourceLinks(activeArea.presentations);
    const videos = getAreaResourceLinks(activeArea.videos);

    list.appendChild(buildPlanningPickerResourceSection({
        sectionTitle: 'Presentationer',
        links: presentations,
    }));
    list.appendChild(buildPlanningPickerResourceSection({
        sectionTitle: 'Filmer',
        links: videos,
    }));

    modal.classList.remove('hidden');
}

export function initAcademicPlanning() {
    academicData = loadAcademicData();
}

/** Set the active subject in the academic planning view and re-render. */
export function selectAcademicSubject(key) {
    selectedSubjectKey = key;
    selectedAreaId = null;
}

/** Remove all academic planning data for a subject (called when a subject is deleted). */
export function deleteAcademicSubjectData(key) {
    academicData = loadAcademicData();
    delete academicData.subjects[key];
    saveAcademicData();
    if (selectedSubjectKey === key) {
        selectedSubjectKey = getSubjectDefs()[0]?.key || null;
        selectedAreaId = null;
    }
}

// ── Academic Year Archive ──────────────────────────────────────────────────

const ARCHIVE_STORAGE_KEY = 'teacherplanner_academic_archive';

function loadArchiveData() {
    try {
        const parsed = JSON.parse(localStorage.getItem(ARCHIVE_STORAGE_KEY) || '{"years":[]}');
        if (!parsed || !Array.isArray(parsed.years)) return { years: [] };
        return parsed;
    } catch {
        return { years: [] };
    }
}

function saveArchiveDataToStorage(data) {
    localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(data));
}

export function archiveCurrentYear() {
    const label = prompt('Ange ett namn för läsåret (t.ex. "2024/2025"):', `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`);
    if (label === null) return; // cancelled
    const yearLabel = label.trim() || `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`;

    const subjectDefs = getSubjectDefs();

    // Check if any subject has areas to archive
    const hasAreas = subjectDefs.some((def) => getSubject(def.key).areas.length > 0);
    if (!hasAreas) {
        if (!confirm('Inga aktiva områden finns att arkivera. Vill du ändå skapa ett tomt arkiv och nollställa Kursplan-markeringar?')) return;
    }

    const archiveData = loadArchiveData();
    const snapshot = {
        id: createId('archive'),
        label: yearLabel,
        archivedAt: new Date().toISOString(),
        subjects: {},
    };

    subjectDefs.forEach((subjectDef) => {
        const subject = getSubject(subjectDef.key);
        const areas = getSortedAreas(subjectDef.key);

        snapshot.subjects[subjectDef.key] = {
            // Store subject metadata so archived data remains readable even if subject is deleted
            _meta: { name: subjectDef.label, icon: subjectDef.icon, color: subjectDef.color?.bg || '#a6857e' },
            areas: areas.map((area) => {
                ensureAreaDefaults(area);
                const coreContentTexts = getAreaCoreContentItems(subjectDef.key, area).map((item) => item.text);
                return {
                    id: area.id,
                    title: area.title,
                    startWeek: area.startWeek,
                    endWeek: area.endWeek,
                    plan: area.plan || '',
                    presentations: area.presentations.map((p) => ({ ...p })),
                    videos: area.videos.map((v) => ({ ...v })),
                    coreContentTexts,
                };
            }),
        };

        // Clear active areas (Kursplan masterSections remain untouched)
        subject.areas = [];
        // Reset all KLART (done) marks in Kursplan
        getAllMasterItems(subject).forEach((item) => { item.done = false; });
    });

    archiveData.years.unshift(snapshot); // most recent first
    saveArchiveDataToStorage(archiveData);
    saveAcademicData();
    renderAcademicPlanningView();
    alert(`Läsåret "${yearLabel}" har arkiverats. Alla områden är nu rensade för ett nytt läsår.`);
}

// ── Archive Overlay ────────────────────────────────────────────────────────

let archiveOverlayEscapeHandler = null;
let archiveSelectedYearId = null;

function closeArchiveOverlay() {
    const overlay = document.getElementById('archive-overlay');
    if (overlay) {
        overlay.classList.add('arch-closing');
        setTimeout(() => {
            overlay.classList.add('hidden');
            overlay.classList.remove('arch-closing');
        }, 220);
    }
    if (archiveOverlayEscapeHandler) {
        document.removeEventListener('keydown', archiveOverlayEscapeHandler);
        archiveOverlayEscapeHandler = null;
    }
}

function renderArchiveYearDetail(container, yearSnapshot) {
    container.textContent = '';
    if (!yearSnapshot) {
        const ph = document.createElement('p');
        ph.className = 'archive-detail-placeholder';
        ph.textContent = 'Välj ett läsår från listan till vänster.';
        container.appendChild(ph);
        return;
    }

    // Build a list of subject entries to display from the snapshot itself.
    // For each key in the snapshot, use stored _meta (name/icon/color) if available,
    // otherwise fall back to the current dynamic subject list.
    const snapshotKeys = Object.keys(yearSnapshot.subjects || {});
    let hasAny = false;
    snapshotKeys.forEach((key) => {
        const subjectArchive = yearSnapshot.subjects[key];
        const areas = subjectArchive?.areas || [];
        if (!areas.length) return;
        hasAny = true;

        // Resolve display info: prefer stored _meta, else current dynamic subject, else generic
        const meta = subjectArchive._meta;
        const currentDef = getSubjectDefs().find((s) => s.key === key);
        const subjectLabel = meta?.name || currentDef?.label || key;
        const subjectIcon  = meta?.icon  || currentDef?.icon  || key.slice(0, 2).toUpperCase();
        const subjectColor = meta?.color || currentDef?.color?.bg || '#a6857e';
        const subjectColors = hexToColors(subjectColor);

        const section = document.createElement('div');
        section.className = 'archive-subject-section';

        const heading = document.createElement('h3');
        heading.className = 'archive-subject-heading';

        const badge = document.createElement('span');
        badge.className = 'archive-subject-badge';
        badge.style.setProperty('--subject-color', subjectColor);
        badge.textContent = subjectIcon;

        heading.appendChild(badge);
        heading.appendChild(document.createTextNode(subjectLabel));
        section.appendChild(heading);

        const cards = document.createElement('div');
        cards.className = 'archive-area-cards';

        areas.forEach((area) => {
            const card = document.createElement('div');
            card.className = 'archive-area-card';
            card.style.setProperty('--subject-color', subjectColor);
            card.style.setProperty('--subject-light', subjectColors.light);

            const titleEl = document.createElement('div');
            titleEl.className = 'archive-area-card-title';
            titleEl.textContent = area.title || 'Namnlöst område';
            card.appendChild(titleEl);

            const weeks = document.createElement('div');
            weeks.className = 'archive-area-card-weeks';
            weeks.textContent = `v. ${sanitizeWeek(area.startWeek, 1)}–${sanitizeWeek(area.endWeek, sanitizeWeek(area.startWeek, 1))}`;
            card.appendChild(weeks);

            if (area.plan && area.plan.trim()) {
                const plan = document.createElement('div');
                plan.className = 'archive-area-card-plan';
                plan.textContent = area.plan.trim();
                card.appendChild(plan);
            }

            if (area.coreContentTexts && area.coreContentTexts.length) {
                const chips = document.createElement('div');
                chips.className = 'archive-area-card-curriculum';
                area.coreContentTexts.slice(0, 4).forEach((text) => {
                    const chip = document.createElement('span');
                    chip.className = 'archive-area-chip';
                    chip.style.setProperty('--subject-color', subjectColor);
                    chip.style.setProperty('--subject-light', subjectColors.light);
                    chip.textContent = text;
                    chip.title = text;
                    chips.appendChild(chip);
                });
                if (area.coreContentTexts.length > 4) {
                    const more = document.createElement('span');
                    more.className = 'archive-area-chip';
                    more.style.setProperty('--subject-color', subjectColor);
                    more.style.setProperty('--subject-light', subjectColors.light);
                    more.textContent = `+${area.coreContentTexts.length - 4} till`;
                    chips.appendChild(more);
                }
                card.appendChild(chips);
            }

            const reuseBtn = document.createElement('button');
            reuseBtn.type = 'button';
            reuseBtn.className = 'archive-reuse-btn';
            reuseBtn.textContent = 'Kopiera till aktuellt år';
            reuseBtn.addEventListener('click', () => openReuseWeekModal(key, area));
            card.appendChild(reuseBtn);

            cards.appendChild(card);
        });

        section.appendChild(cards);
        container.appendChild(section);
    });

    if (!hasAny) {
        const ph = document.createElement('p');
        ph.className = 'archive-detail-placeholder';
        ph.textContent = 'Detta läsår innehåller inga arkiverade områden.';
        container.appendChild(ph);
    }
}

function renderArchiveOverlay() {
    let overlay = document.getElementById('archive-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'archive-overlay';
        document.body.appendChild(overlay);
    }
    overlay.className = 'archive-overlay';
    overlay.classList.remove('hidden', 'arch-closing');
    overlay.textContent = '';

    // Header
    const header = document.createElement('div');
    header.className = 'archive-header';

    const titleWrap = document.createElement('div');
    const title = document.createElement('h2');
    title.className = 'archive-header-title';
    title.textContent = 'Läsårsarkiv';
    const sub = document.createElement('p');
    sub.className = 'archive-header-sub';
    sub.textContent = 'Bläddra bland arkiverade läsår och återanvänd planeringsområden.';
    titleWrap.appendChild(title);
    titleWrap.appendChild(sub);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'archive-close-btn';
    closeBtn.textContent = '× Stäng';
    closeBtn.addEventListener('click', closeArchiveOverlay);

    header.appendChild(titleWrap);
    header.appendChild(closeBtn);
    overlay.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'archive-body';

    // Year list sidebar
    const yearList = document.createElement('div');
    yearList.className = 'archive-year-list custom-scrollbar';

    const archiveData = loadArchiveData();
    const detail = document.createElement('div');
    detail.className = 'archive-detail custom-scrollbar';

    if (!archiveData.years.length) {
        const empty = document.createElement('p');
        empty.className = 'archive-year-empty';
        empty.textContent = 'Inga arkiverade läsår ännu.';
        yearList.appendChild(empty);

        const ph = document.createElement('p');
        ph.className = 'archive-detail-placeholder';
        ph.textContent = 'Klicka på "Arkivera Läsår" i toppmenyn för att arkivera nuvarande läsår.';
        detail.appendChild(ph);
    } else {
        // Select the most recent year (or previously selected)
        const targetId = archiveSelectedYearId && archiveData.years.some((y) => y.id === archiveSelectedYearId)
            ? archiveSelectedYearId
            : archiveData.years[0].id;
        archiveSelectedYearId = targetId;

        archiveData.years.forEach((year) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'archive-year-btn';
            if (year.id === archiveSelectedYearId) btn.classList.add('active');

            const labelEl = document.createElement('div');
            labelEl.textContent = year.label;

            const metaEl = document.createElement('div');
            metaEl.className = 'archive-year-meta';
            metaEl.textContent = new Date(year.archivedAt).toLocaleDateString('sv-SE', { year: 'numeric', month: 'short', day: 'numeric' });

            btn.appendChild(labelEl);
            btn.appendChild(metaEl);
            btn.addEventListener('click', () => {
                archiveSelectedYearId = year.id;
                yearList.querySelectorAll('.archive-year-btn').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                renderArchiveYearDetail(detail, year);
            });
            yearList.appendChild(btn);
        });

        const selectedYear = archiveData.years.find((y) => y.id === archiveSelectedYearId);
        renderArchiveYearDetail(detail, selectedYear || null);
    }

    body.appendChild(yearList);
    body.appendChild(detail);
    overlay.appendChild(body);

    if (!archiveOverlayEscapeHandler) {
        archiveOverlayEscapeHandler = (e) => {
            if (e.key === 'Escape') closeArchiveOverlay();
        };
        document.addEventListener('keydown', archiveOverlayEscapeHandler);
    }
}

export function openArchiveOverlay() {
    archiveSelectedYearId = null;
    renderArchiveOverlay();
}

// ── Re-use (Återanvänd) ────────────────────────────────────────────────────

function openReuseWeekModal(subjectKey, archivedArea) {
    let modal = document.getElementById('archive-week-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'archive-week-modal';
        document.body.appendChild(modal);
    }
    modal.className = 'archive-week-modal';
    modal.classList.remove('hidden');
    modal.textContent = '';

    const panel = document.createElement('div');
    panel.className = 'archive-week-panel';

    const h3 = document.createElement('h3');
    h3.textContent = `Kopiera "${archivedArea.title || 'Namnlöst område'}"`;
    panel.appendChild(h3);

    const p = document.createElement('p');
    p.textContent = 'Ange veckointervall för det återanvända området:';
    panel.appendChild(p);

    const row = document.createElement('div');
    row.className = 'archive-week-row';

    const label = document.createElement('label');
    label.textContent = 'v.';

    const startInput = document.createElement('input');
    startInput.type = 'number';
    startInput.min = '1';
    startInput.max = '52';
    startInput.value = sanitizeWeek(archivedArea.startWeek, 1);
    startInput.className = 'archive-week-input';

    const dash = document.createElement('span');
    dash.textContent = '–';

    const endInput = document.createElement('input');
    endInput.type = 'number';
    endInput.min = '1';
    endInput.max = '52';
    endInput.value = sanitizeWeek(archivedArea.endWeek, sanitizeWeek(archivedArea.startWeek, 1));
    endInput.className = 'archive-week-input';

    row.appendChild(label);
    row.appendChild(startInput);
    row.appendChild(dash);
    row.appendChild(endInput);
    panel.appendChild(row);

    const actions = document.createElement('div');
    actions.className = 'archive-week-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'archive-week-cancel';
    cancelBtn.textContent = 'Avbryt';
    cancelBtn.addEventListener('click', () => modal.classList.add('hidden'));

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'archive-week-confirm';
    confirmBtn.textContent = 'Kopiera till aktuellt år';
    confirmBtn.addEventListener('click', () => {
        const newStart = sanitizeWeek(startInput.value, 1);
        const newEnd = sanitizeWeek(endInput.value, newStart);
        modal.classList.add('hidden');
        reuseArchivedArea(subjectKey, archivedArea, newStart, newEnd);
        closeArchiveOverlay();
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
    panel.appendChild(actions);

    modal.appendChild(panel);

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
    });
}

function reuseArchivedArea(subjectKey, archivedArea, newStartWeek, newEndWeek) {
    academicData = loadAcademicData();
    const subject = getSubject(subjectKey);
    ensureSubjectDefaults(subject, subjectKey);

    // Match archived coreContent texts to current masterSection items
    const allMasterItems = getAllMasterItems(subject);
    const coreContentIds = (archivedArea.coreContentTexts || []).reduce((ids, text) => {
        const normalized = normalizeCoreContentText(text).toLowerCase();
        const match = allMasterItems.find((item) =>
            normalizeCoreContentText(item.text).toLowerCase() === normalized
        );
        if (match && !ids.includes(match.id)) ids.push(match.id);
        return ids;
    }, []);

    const newArea = {
        id: createId('area'),
        title: archivedArea.title || 'Namnlöst område',
        startWeek: newStartWeek,
        endWeek: newEndWeek,
        plan: archivedArea.plan || '',
        presentations: (archivedArea.presentations || []).map((p) => ({ ...p, id: createId('link') })),
        videos: (archivedArea.videos || []).map((v) => ({ ...v, id: createId('link') })),
        coreContent: [],
        coreContentIds,
    };

    subject.areas.push(newArea);
    selectedSubjectKey = subjectKey;
    selectedAreaId = newArea.id;
    saveAcademicData();

    // Switch to the lasarsplanering view if not already there
    const lasarView = document.getElementById('view-lasarsplanering');
    if (lasarView && lasarView.classList.contains('hidden')) {
        // Trigger the view change without importing navigation to avoid circular deps
        if (typeof window.changeView === 'function') window.changeView('lasarsplanering');
    } else {
        renderAcademicPlanningView();
    }
}
