import { SUBJECT_COLORS } from './config.js';

export function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

export function getSubjectColor(subject) {
    if (!subject) return null;
    const key = subject.toLowerCase().trim();
    for (const [name, colors] of Object.entries(SUBJECT_COLORS)) {
        if (key.startsWith(name)) return colors;
    }
    return null;
}

export function getMonday(y, w) {
    const d = new Date(y, 0, 1 + (w - 1) * 7);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

export function getSortableTime(timeStr) {
    if (!timeStr) return '00:00';
    const match = timeStr.match(/\d{1,2}:\d{2}/);
    if (!match) return '00:00';
    const [hours, minutes] = match[0].split(':');
    return hours.padStart(2, '0') + ':' + minutes.padStart(2, '0');
}

export function checkIsPlanned(planText) {
    if (!planText) return false;
    if (planText.includes('<img')) return true;
    // Use the DOM to extract plain text so we don't need regex-based tag stripping
    const tmp = document.createElement('div');
    tmp.innerHTML = planText;
    return tmp.textContent.trim().length > 0;
}
