import { plannerData, currentYear, currentWeek, activeDayIndex, activeLessonId } from './state.js';
import { saveData } from './persistence.js';

const PRIVATE_NOTE_URL_RE = /((?:https?:\/\/|www\.)[^\s<]+)/gi;

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function renderPlainSegment(segment) {
    return escapeHtml(segment).replaceAll('\n', '<br>');
}

function linkifyPrivateNotes(text) {
    if (!text) return '';
    let html = '';
    let cursor = 0;
    for (const match of text.matchAll(PRIVATE_NOTE_URL_RE)) {
        const rawUrl = match[0];
        const index = match.index ?? 0;
        const coreUrl = rawUrl.replace(/[),.!?;:]+$/g, '');
        const trailing = rawUrl.slice(coreUrl.length);
        html += renderPlainSegment(text.slice(cursor, index));
        const href = /^https?:\/\//i.test(coreUrl) ? coreUrl : `https://${coreUrl}`;
        let validUrl = true;
        try {
            new URL(href);
        } catch {
            validUrl = false;
        }
        if (validUrl) {
            html += `<a class="private-notes-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(coreUrl)}</a>`;
        } else {
            html += renderPlainSegment(coreUrl);
        }
        html += renderPlainSegment(trailing);
        cursor = index + rawUrl.length;
    }
    html += renderPlainSegment(text.slice(cursor));
    return html;
}

function renderPrivateNotesPreview(text) {
    const preview = document.getElementById('private-notes-preview');
    if (!preview) return;
    if (!text?.trim()) {
        preview.innerHTML = '<span class="private-notes-preview-empty">Ingen anteckning ännu.</span>';
        return;
    }
    preview.innerHTML = linkifyPrivateNotes(text);
}

function bindPrivateNotesInput() {
    const textarea = document.getElementById('private-notes-textarea');
    if (!textarea || textarea.dataset.previewBound === 'true') return;
    textarea.addEventListener('input', () => renderPrivateNotesPreview(textarea.value));
    textarea.dataset.previewBound = 'true';
}

export function updateNotesButtonState(lesson) {
    const notesBtn = document.getElementById('notes-btn');
    if (!notesBtn) return;
    if (lesson?.privateNotes?.trim()) {
        notesBtn.classList.add('active');
    } else {
        notesBtn.classList.remove('active');
    }
}

export function toggleNotesModal() {
    const modal = document.getElementById('lesson-notes-modal');
    if (modal.classList.contains('hidden')) {
        openNotesModal();
    } else {
        closeNotesModal();
    }
}

export function openNotesModal() {
    if (!activeLessonId) return;
    const weekKey = `${currentYear}-W${currentWeek}`;
    const lesson = (plannerData[weekKey] && plannerData[weekKey].lessons[activeDayIndex] || [])
        .find(l => l.id === activeLessonId);
    if (!lesson) return;
    document.getElementById('notes-modal-lesson-name').innerText = lesson.subject + ' – ' + lesson.time;
    bindPrivateNotesInput();
    const notesTextarea = document.getElementById('private-notes-textarea');
    notesTextarea.value = lesson.privateNotes || '';
    renderPrivateNotesPreview(notesTextarea.value);
    document.getElementById('lesson-notes-modal').classList.remove('hidden');
    notesTextarea.focus();
}

export function closeNotesModal() {
    savePrivateNotes();
    document.getElementById('lesson-notes-modal').classList.add('hidden');
}

export function handleNotesModalBackdrop(event) {
    if (event.target === document.getElementById('lesson-notes-modal')) {
        closeNotesModal();
    }
}

export function savePrivateNotes() {
    if (!activeLessonId) return;
    const weekKey = `${currentYear}-W${currentWeek}`;
    const lesson = (plannerData[weekKey] && plannerData[weekKey].lessons[activeDayIndex] || [])
        .find(l => l.id === activeLessonId);
    if (lesson) {
        lesson.privateNotes = document.getElementById('private-notes-textarea').value;
        saveData();
        updateNotesButtonState(lesson);
    }
}
