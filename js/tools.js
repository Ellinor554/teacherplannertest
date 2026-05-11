import {
    timerInterval, timerSeconds, timerMaxSeconds,
    stopwatchInterval, stopwatchSeconds, stopwatchRunning,
    setTimerInterval, setTimerSeconds, setTimerMaxSeconds,
    setStopwatchInterval, setStopwatchSeconds, setStopwatchRunning
} from './state.js';
import { makeDraggable } from './draggable.js';

// Diagonal grip-pattern lines (long diagonal + short corner diagonal) for resize cue icon.
const RESIZE_ICON_LINES = [[9,1,1,9], [9,5,5,9]];

// Counter used to cascade new tool windows so they don't overlap exactly.
let _toolOffset = 0;

const PRESENTATION_STORAGE_KEY = 'teacherplanner_presentation_links';
const MAX_RECENT_PRESENTATIONS = 3;
const PRESENTATION_RATIO = 16 / 9;
const PRESENTATION_MIN_WIDTH = 480;
const PRESENTATION_MIN_HEIGHT = Math.ceil(PRESENTATION_MIN_WIDTH / PRESENTATION_RATIO);
const PRESENTATION_REFLOW_TRANSFORM = 'translateZ(0)';
const PRESENTATION_SIZE_PRESETS = {
    S: { width: 480 },
    M: { width: 720 },
    L: { width: 960 },
};
const PRESENTATION_DEFAULT_PRESET = 'M';

let presentationLibrary = [];
let presentationRecent = [];

loadPresentationData();

// SVG icon used as a visual resize-handle cue in every tool's bottom-right corner.
function createResizeHintIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 10 10');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.5');
    svg.setAttribute('stroke-linecap', 'round');
    RESIZE_ICON_LINES.forEach(([x1,y1,x2,y2]) => {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1); line.setAttribute('y1', y1);
        line.setAttribute('x2', x2); line.setAttribute('y2', y2);
        svg.appendChild(line);
    });
    return svg;
}

const MIN_TOOL_WIDTH   = 320; // px – minimum assumed tool width for positioning
const MIN_TOOL_HEIGHT  = 200; // px – minimum assumed tool height for positioning
const MAX_CASCADE_STEPS = 8;  // number of cascade steps before cycling back

// ── Tool menu structure ──────────────────────────────────────────────────────
// To add a new tool: add one entry to the `tools` array in the right category.
// The tool rendering logic still needs a matching branch in openTool() below.
export const TOOL_MENU = [
    {
        category: 'Allmänt',
        icon: '⚙️',
        tools: [
            { type: 'timer',     icon: '⏱️', label: 'Time Timer' },
            { type: 'stopwatch', icon: '🕐', label: 'Stoppur' },
            { type: 'textbox',   icon: '📝', label: 'Textruta' },
            { type: 'presentation', icon: '📽️', label: 'Presentation' },
        ]
    },
    {
        category: 'Matematik',
        icon: '🔢',
        tools: [
            { type: 'multiplication', icon: '×',  label: 'Multiplikation' },
            { type: 'fractions',      icon: '📏', label: 'Bråkplank' },
        ]
    },
    {
        category: 'Svenska',
        icon: '📖',
        tools: [
            // Add Swedish-language tools here
        ]
    },
];

// Derive a flat label map from TOOL_MENU for quick lookup inside openTool()
function _getLabel(type) {
    for (const cat of TOOL_MENU) {
        const tool = cat.tools.find(t => t.type === type);
        if (tool) return tool.label;
    }
    return type;
}

// ── Tool Launcher UI ─────────────────────────────────────────────────────────

let _launcherListenerAdded = false;

/** Build category buttons + pop-up panels inside `container`. */
export function buildToolLauncher(container) {
    if (!container) return;
    container.innerHTML = '';

    TOOL_MENU.forEach(({ category, icon, tools }) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'tool-cat-wrapper';

        // Category button
        const btn = document.createElement('button');
        btn.className = 'tool-cat-btn';
        btn.setAttribute('aria-haspopup', 'true');
        btn.setAttribute('aria-expanded', 'false');

        const labelSpan = document.createElement('span');
        labelSpan.className = 'tool-cat-label';
        labelSpan.textContent = category;

        btn.appendChild(labelSpan);

        // Pop-up panel
        const popup = document.createElement('div');
        popup.className = 'tool-launcher-popup';
        popup.setAttribute('role', 'menu');
        popup.hidden = true;

        if (tools.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'tool-launcher-empty';
            empty.textContent = 'Inga verktyg ännu';
            popup.appendChild(empty);
        } else {
            tools.forEach(({ type, icon: tIcon, label }) => {
                const item = document.createElement('button');
                item.className = 'tool-launcher-item';
                item.setAttribute('role', 'menuitem');

                const itemIcon = document.createElement('span');
                itemIcon.className = 'tool-launcher-item-icon';
                itemIcon.textContent = tIcon;

                const itemLabel = document.createElement('span');
                itemLabel.textContent = label;

                item.appendChild(itemIcon);
                item.appendChild(itemLabel);
                item.addEventListener('click', () => {
                    _closeAllPopups();
                    openTool(type);
                });
                popup.appendChild(item);
            });
        }

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = !popup.hidden;
            _closeAllPopups();
            if (!isOpen) {
                popup.hidden = false;
                btn.setAttribute('aria-expanded', 'true');
                btn.classList.add('active');
            }
        });

        wrapper.appendChild(btn);
        wrapper.appendChild(popup);
        container.appendChild(wrapper);
    });

    // Global click closes all open popups (added only once)
    if (!_launcherListenerAdded) {
        document.addEventListener('click', _closeAllPopups);
        _launcherListenerAdded = true;
    }
}

function _closeAllPopups() {
    document.querySelectorAll('.tool-launcher-popup').forEach(p => { p.hidden = true; });
    document.querySelectorAll('.tool-cat-btn').forEach(b => {
        b.setAttribute('aria-expanded', 'false');
        b.classList.remove('active');
    });
}

// ── openTool ─────────────────────────────────────────────────────────────────

export function openTool(type, options = {}) {
    const label = _getLabel(type);

    // Build the floating container
    const tool = document.createElement('div');
    tool.className = 'floating-tool';
    tool.dataset.toolType = type;

    // Position with a cascade offset
    const offset = (_toolOffset % MAX_CASCADE_STEPS) * 30;
    tool.style.left = Math.min(100 + offset, window.innerWidth  - MIN_TOOL_WIDTH)  + 'px';
    tool.style.top  = Math.min(100 + offset, window.innerHeight - MIN_TOOL_HEIGHT) + 'px';
    _toolOffset++;

    // Header (drag handle + title + close button) – built via DOM to avoid XSS
    const header = document.createElement('div');
    header.className = 'floating-tool-header';

    const titleSpan = document.createElement('span');
    titleSpan.className = type === 'presentation'
        ? 'floating-tool-title presentation-window-title'
        : 'floating-tool-title';
    titleSpan.textContent = label;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'text-gray-400 hover:text-black font-bold text-xl leading-none ml-4';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => closeFloatingTool(closeBtn));

    header.appendChild(titleSpan);
    if (type === 'presentation') {
        const headerActions = document.createElement('div');
        headerActions.className = 'presentation-header-actions';

        const presetWrap = document.createElement('div');
        presetWrap.className = 'presentation-size-presets';

        ['S', 'M', 'L'].forEach((presetKey) => {
            const presetBtn = document.createElement('button');
            presetBtn.type = 'button';
            presetBtn.className = 'presentation-size-btn';
            presetBtn.dataset.preset = presetKey;
            presetBtn.textContent = presetKey;
            presetBtn.setAttribute('aria-label', `Storlek ${presetKey}`);
            presetBtn.addEventListener('mousedown', (e) => e.stopPropagation());
            presetBtn.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
            presetBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                applyPresentationPresetSize(tool, presetKey);
            });
            presetWrap.appendChild(presetBtn);
        });

        headerActions.appendChild(presetWrap);
        headerActions.appendChild(closeBtn);
        header.appendChild(headerActions);
    } else {
        header.appendChild(closeBtn);
    }

    // Body
    const body = document.createElement('div');
    body.className = 'floating-tool-body';

    if (type === 'multiplication') {
        body.innerHTML = generateMultiTable();
    } else if (type === 'fractions') {
        body.innerHTML = generateFractionBoard();
        body.classList.add('fraction-wall-body');
    } else if (type === 'timer') {
        body.innerHTML = generateTimerUI();
        tool._cleanup = () => {
            clearInterval(timerInterval);
            setTimerInterval(null);
            if (tool._resizeObserver) {
                tool._resizeObserver.disconnect();
                tool._resizeObserver = null;
            }
        };
    } else if (type === 'stopwatch') {
        body.innerHTML = generateStopwatchUI();
        tool._cleanup = () => {
            clearInterval(stopwatchInterval);
            setStopwatchInterval(null);
            setStopwatchRunning(false);
            if (tool._resizeObserver) {
                tool._resizeObserver.disconnect();
                tool._resizeObserver = null;
            }
        };
    } else if (type === 'textbox') {
        body.classList.add('textbox-body');

        const textarea = document.createElement('textarea');
        textarea.className = 'textbox-textarea';
        textarea.placeholder = 'Skriv något här...';

        body.appendChild(textarea);

        tool._cleanup = () => {
            if (tool._resizeObserver) {
                tool._resizeObserver.disconnect();
                tool._resizeObserver = null;
            }
        };
    } else if (type === 'presentation') {
        body.classList.add('presentation-body');
        tool.classList.add('presentation-tool');
        initPresentationTool(tool, body, options.launchUrl || null);
        tool._cleanup = () => {
            if (tool._resizeObserver) {
                tool._resizeObserver.disconnect();
                tool._resizeObserver = null;
            }
            if (tool._presentationResizeDebounce) {
                clearTimeout(tool._presentationResizeDebounce);
                tool._presentationResizeDebounce = null;
            }
            if (tool._presentationWindowResizeListener) {
                window.removeEventListener('resize', tool._presentationWindowResizeListener);
                tool._presentationWindowResizeListener = null;
            }
            if (tool._presentationMouseupListener) {
                window.removeEventListener('mouseup', tool._presentationMouseupListener);
                tool._presentationMouseupListener = null;
            }
            if (tool._presentationTouchendListener) {
                window.removeEventListener('touchend', tool._presentationTouchendListener);
                tool._presentationTouchendListener = null;
            }
        };
    }

    // Resize hint icon (visual cue for the native resize handle)
    const resizeHint = document.createElement('div');
    resizeHint.className = 'floating-tool-resize-hint';
    resizeHint.setAttribute('aria-hidden', 'true');
    resizeHint.appendChild(createResizeHintIcon());

    tool.appendChild(header);
    tool.appendChild(body);
    tool.appendChild(resizeHint);
    document.body.appendChild(tool);

    makeDraggable(tool, header);

    // Initialise timer-specific UI after DOM insertion
    if (type === 'timer') {
        setTimeout(() => {
            initTimerFace();
            resetTimer();
            // ResizeObserver keeps tick-mark transform-origins and display font in sync with tool size
            const face = tool.querySelector('.timer-face');
            const display = tool.querySelector('#timer-display');
            if (face && typeof ResizeObserver !== 'undefined') {
                // Cache marks once (they are created by initTimerFace above and never replaced).
                const marks = Array.from(face.querySelectorAll('.timer-mark'));
                let rafId = null;
                const ro = new ResizeObserver(() => {
                    if (rafId) cancelAnimationFrame(rafId);
                    rafId = requestAnimationFrame(() => {
                        const half = face.offsetHeight / 2;
                        marks.forEach(m => { m.style.transformOrigin = `50% ${half}px`; });
                        if (display) {
                            display.style.fontSize = Math.max(14, body.offsetWidth * 0.1) + 'px';
                        }
                    });
                });
                ro.observe(body);
                tool._resizeObserver = ro;
            }
        }, 10);
    } else if (type === 'stopwatch') {
        resetStopwatch();
        setTimeout(() => {
            const display = tool.querySelector('#sw-display');
            if (display && typeof ResizeObserver !== 'undefined') {
                const updateFont = () => {
                    display.style.fontSize = Math.max(16, body.offsetWidth * 0.15) + 'px';
                };
                let rafId = null;
                const ro = new ResizeObserver(() => {
                    if (rafId) cancelAnimationFrame(rafId);
                    rafId = requestAnimationFrame(updateFont);
                });
                ro.observe(body);
                tool._resizeObserver = ro;
                updateFont();
            }
        }, 10);
    } else if (type === 'textbox') {
        const textarea = tool.querySelector('.textbox-textarea');
        if (textarea && typeof ResizeObserver !== 'undefined') {
            let rafId = null;
            const updateFont = () => {
                const w = body.offsetWidth;
                const h = body.offsetHeight;
                const base = Math.min(w / 10, h / 5);
                // 4px tolerance to avoid triggering on sub-pixel rounding differences
                const overflowing = textarea.scrollHeight > textarea.clientHeight + 4;
                // Minimum 12px; shrink 15% when text overflows to keep more visible
                textarea.style.fontSize = Math.max(12, overflowing ? base * 0.85 : base) + 'px';
            };
            const ro = new ResizeObserver(() => {
                if (rafId) cancelAnimationFrame(rafId);
                rafId = requestAnimationFrame(updateFont);
            });
            ro.observe(body);
            tool._resizeObserver = ro;
            updateFont();
            // Re-evaluate when text changes
            textarea.addEventListener('input', updateFont);
        }
    } else if (type === 'presentation') {
        setTimeout(() => {
            applyPresentationPresetSize(tool, PRESENTATION_DEFAULT_PRESET);
            tool._resizeObserver = enforcePresentationAspectRatio(tool);
        }, 0);
    }
}

function applyPresentationPresetSize(tool, presetKey) {
    const preset = PRESENTATION_SIZE_PRESETS[presetKey] || PRESENTATION_SIZE_PRESETS[PRESENTATION_DEFAULT_PRESET];
    if (!preset) return;
    const header = tool.querySelector('.floating-tool-header');
    const headerHeight = header ? header.offsetHeight : 0;
    const { w, h } = clampPresentationSize(preset.width, headerHeight, 'width');
    tool.style.width = `${w}px`;
    tool.style.height = `${h}px`;
    const left = Math.max(0, Math.min(tool.offsetLeft, window.innerWidth - w));
    const top = Math.max(0, Math.min(tool.offsetTop, window.innerHeight - h));
    tool.style.left = `${left}px`;
    tool.style.top = `${top}px`;
    tool.querySelectorAll('.presentation-size-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.preset === presetKey);
    });
    refreshPresentationLayout(tool);
}

function normalizePresentationUrl(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    let parsed;
    try {
        parsed = new URL(candidate);
    } catch {
        return null;
    }
    const match = parsed.pathname.match(/\/presentation\/d\/([a-zA-Z0-9_-]+)/);
    if (!match) return null;
    const id = match[1];
    return {
        id,
        editUrl: `https://docs.google.com/presentation/d/${id}/edit`,
        embedUrl: `https://docs.google.com/presentation/d/${id}/embed?rm=minimal`,
    };
}

function loadPresentationData() {
    try {
        const raw = localStorage.getItem(PRESENTATION_STORAGE_KEY);
        if (!raw) {
            presentationLibrary = [];
            presentationRecent = [];
            return;
        }
        const parsed = JSON.parse(raw);
        const saved = Array.isArray(parsed?.saved) ? parsed.saved : [];
        const recent = Array.isArray(parsed?.recent) ? parsed.recent : [];
        presentationLibrary = saved
            .map((item) => {
                const normalized = normalizePresentationUrl(item?.url || item?.editUrl || '');
                if (!normalized) return null;
                return {
                    id: (typeof item?.id === 'string' ? item.id : '') || createPresentationId(),
                    name: (item?.name || '').trim() || 'Namnlös presentation',
                    url: normalized.editUrl,
                };
            })
            .filter(Boolean);
        presentationRecent = recent
            .map(url => normalizePresentationUrl(url)?.editUrl || null)
            .filter(Boolean)
            .slice(0, MAX_RECENT_PRESENTATIONS);
    } catch {
        presentationLibrary = [];
        presentationRecent = [];
    }
}

function savePresentationData() {
    localStorage.setItem(PRESENTATION_STORAGE_KEY, JSON.stringify({
        saved: presentationLibrary,
        recent: presentationRecent.slice(0, MAX_RECENT_PRESENTATIONS),
    }));
}

function createPresentationId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function addPresentationToRecent(url) {
    const normalized = normalizePresentationUrl(url);
    if (!normalized) return;
    presentationRecent = [normalized.editUrl, ...presentationRecent.filter(item => item !== normalized.editUrl)]
        .slice(0, MAX_RECENT_PRESENTATIONS);
    savePresentationData();
    renderPresentationSettingsList();
}

function addSavedPresentation(name, url) {
    const normalized = normalizePresentationUrl(url);
    if (!normalized) return false;
    const existing = presentationLibrary.find(item => item.url === normalized.editUrl);
    if (existing) {
        existing.name = name?.trim() || existing.name || 'Namnlös presentation';
    } else {
        presentationLibrary.unshift({
            id: createPresentationId(),
            name: name?.trim() || getNextDefaultPresentationName(),
            url: normalized.editUrl,
        });
    }
    savePresentationData();
    renderPresentationSettingsList();
    return true;
}

function removeSavedPresentation(id) {
    presentationLibrary = presentationLibrary.filter(item => item.id !== id);
    savePresentationData();
    renderPresentationSettingsList();
}

function updateSavedPresentationName(id, name) {
    const item = presentationLibrary.find(entry => entry.id === id);
    if (!item) return;
    item.name = name?.trim() || 'Namnlös presentation';
    savePresentationData();
}

function initPresentationTool(tool, body, launchUrl) {
    const state = { activeUrl: null };

    const openPresentation = (url) => {
        const normalized = normalizePresentationUrl(url);
        if (!normalized) {
            alert('Ogiltig Google Slides-länk.');
            return;
        }
        state.activeUrl = normalized.editUrl;
        addPresentationToRecent(normalized.editUrl);
        renderActiveView(normalized);
    };

    const renderLibraryView = () => {
        state.activeUrl = null;
        body.textContent = '';

        const wrapper = document.createElement('div');
        wrapper.className = 'presentation-library';

        const title = document.createElement('h4');
        title.className = 'presentation-section-title';
        title.textContent = 'Bibliotek';

        const form = document.createElement('form');
        form.className = 'presentation-url-form';

        const input = document.createElement('input');
        input.type = 'url';
        input.placeholder = 'Klistra in Google Slides-länk...';
        input.className = 'presentation-input';
        input.required = true;

        const submit = document.createElement('button');
        submit.type = 'submit';
        submit.className = 'presentation-primary-btn';
        submit.textContent = 'Öppna';

        form.appendChild(input);
        form.appendChild(submit);
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            openPresentation(input.value);
        });

        const savedSection = document.createElement('div');
        savedSection.className = 'presentation-list-section';
        const savedTitle = document.createElement('h5');
        savedTitle.className = 'presentation-list-title';
        savedTitle.textContent = 'Sparade presentationer';
        savedSection.appendChild(savedTitle);
        savedSection.appendChild(buildPresentationLaunchList(presentationLibrary.map(item => ({
            key: item.id,
            label: item.name,
            subtitle: item.url,
            url: item.url,
        })), openPresentation, 'Inga sparade presentationer'));

        const recentSection = document.createElement('div');
        recentSection.className = 'presentation-list-section';
        const recentTitle = document.createElement('h5');
        recentTitle.className = 'presentation-list-title';
        recentTitle.textContent = 'Senaste';
        recentSection.appendChild(recentTitle);
        recentSection.appendChild(buildPresentationLaunchList(
            presentationRecent.map((url, idx) => ({
                key: `${url}-${idx}`,
                label: url,
                subtitle: '',
                url,
            })),
            openPresentation,
            'Inga senaste länkar'
        ));

        wrapper.appendChild(title);
        wrapper.appendChild(form);
        wrapper.appendChild(savedSection);
        wrapper.appendChild(recentSection);
        body.appendChild(wrapper);
    };

    const renderActiveView = (normalized) => {
        body.textContent = '';
        const frameWrap = document.createElement('div');
        frameWrap.className = 'presentation-frame-wrap';

        const controls = document.createElement('div');
        controls.className = 'presentation-controls';

        const backBtn = document.createElement('button');
        backBtn.className = 'presentation-overlay-btn';
        backBtn.textContent = 'Bibliotek';
        backBtn.addEventListener('click', renderLibraryView);

        const saveBtn = document.createElement('button');
        saveBtn.className = 'presentation-overlay-btn';
        saveBtn.textContent = 'Spara';
        saveBtn.addEventListener('click', () => {
            const defaultName = getNextDefaultPresentationName();
            const name = prompt('Namn på presentationen:', defaultName);
            if (name === null) return;
            if (!addSavedPresentation(name, normalized.editUrl)) {
                alert('Kunde inte spara länken.');
            }
        });

        controls.appendChild(backBtn);
        controls.appendChild(saveBtn);

        const iframe = document.createElement('iframe');
        iframe.src = normalized.embedUrl;
        iframe.className = 'presentation-iframe';
        iframe.allowFullscreen = true;
        iframe.loading = 'lazy';
        iframe.referrerPolicy = 'strict-origin-when-cross-origin';
        iframe.title = 'Google Slides Presentation';

        frameWrap.appendChild(controls);
        frameWrap.appendChild(iframe);
        body.appendChild(frameWrap);
    };

    if (launchUrl) {
        openPresentation(launchUrl);
    } else {
        renderLibraryView();
    }
}

function buildPresentationLaunchList(items, onOpen, emptyText) {
    const list = document.createElement('div');
    list.className = 'presentation-launch-list';
    if (!items.length) {
        const empty = document.createElement('p');
        empty.className = 'presentation-empty';
        empty.textContent = emptyText;
        list.appendChild(empty);
        return list;
    }
    items.forEach(item => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'presentation-launch-item';
        btn.addEventListener('click', () => onOpen(item.url));

        const label = document.createElement('span');
        label.className = 'presentation-launch-label';
        label.textContent = item.label;
        btn.appendChild(label);

        if (item.subtitle) {
            const sub = document.createElement('span');
            sub.className = 'presentation-launch-subtitle';
            sub.textContent = item.subtitle;
            btn.appendChild(sub);
        }
        list.appendChild(btn);
    });
    return list;
}

function enforcePresentationAspectRatio(tool) {
    if (typeof ResizeObserver === 'undefined') return null;
    let adjusting = false;
    const header = tool.querySelector('.floating-tool-header');
    const headerHeight = header ? header.offsetHeight : 0;
    const minToolHeight = PRESENTATION_MIN_HEIGHT + headerHeight;
    let lastWidth = tool.offsetWidth || PRESENTATION_MIN_WIDTH;
    let lastHeight = tool.offsetHeight || Math.round(lastWidth / PRESENTATION_RATIO) + headerHeight;
    let pendingResizeFinishRefresh = false;

    const queueRefresh = () => {
        if (tool._presentationResizeDebounce) clearTimeout(tool._presentationResizeDebounce);
        tool._presentationResizeDebounce = setTimeout(() => {
            tool._presentationResizeDebounce = null;
            refreshPresentationLayout(tool);
        }, 120);
    };

    const clampToViewport = (size, lockBy = 'width') => {
        return clampPresentationSize(size, headerHeight, lockBy, minToolHeight);
    };

    const enforceSize = (requestedWidth, requestedHeight) => {
        const widthDelta = Math.abs((requestedWidth || 0) - lastWidth);
        const heightDelta = Math.abs((requestedHeight || 0) - lastHeight);
        const lockBy = heightDelta > widthDelta ? 'height' : 'width';
        const requestedPrimarySize = lockBy === 'height' ? requestedHeight : requestedWidth;
        const { w, h } = clampToViewport(requestedPrimarySize, lockBy);
        if (w === tool.offsetWidth && h === tool.offsetHeight) {
            lastWidth = w;
            lastHeight = h;
            return;
        }

        adjusting = true;
        tool.style.width = `${w}px`;
        tool.style.height = `${h}px`;
        pendingResizeFinishRefresh = true;

        const left = Math.max(0, Math.min(tool.offsetLeft, window.innerWidth - w));
        const top = Math.max(0, Math.min(tool.offsetTop, window.innerHeight - h));
        tool.style.left = `${left}px`;
        tool.style.top = `${top}px`;
        lastWidth = w;
        lastHeight = h;

        requestAnimationFrame(() => {
            adjusting = false;
        });
    };

    const ro = new ResizeObserver(() => {
        if (adjusting) return;
        const width = tool.offsetWidth;
        const height = tool.offsetHeight;
        if (!width || !height) return;
        enforceSize(width, height);
        queueRefresh();
    });
    ro.observe(tool);
    const handleWindowResize = () => {
        if (adjusting) return;
        enforceSize(tool.offsetWidth || PRESENTATION_MIN_WIDTH, tool.offsetHeight || PRESENTATION_MIN_HEIGHT);
        queueRefresh();
    };
    const handleMouseup = () => {
        if (!pendingResizeFinishRefresh) return;
        pendingResizeFinishRefresh = false;
        refreshPresentationLayout(tool, true);
    };
    const handleTouchend = () => {
        if (!pendingResizeFinishRefresh) return;
        pendingResizeFinishRefresh = false;
        refreshPresentationLayout(tool, true);
    };
    window.addEventListener('resize', handleWindowResize, { passive: true });
    window.addEventListener('mouseup', handleMouseup);
    window.addEventListener('touchend', handleTouchend, { passive: true });
    tool._presentationWindowResizeListener = handleWindowResize;
    tool._presentationMouseupListener = handleMouseup;
    tool._presentationTouchendListener = handleTouchend;
    return ro;
}

function clampPresentationSize(size, headerHeight, lockBy = 'width', explicitMinToolHeight = null) {
    const maxWidth = Math.floor(window.innerWidth * 0.95);
    const maxHeight = Math.floor(window.innerHeight * 0.95);
    const minWidth = Math.min(PRESENTATION_MIN_WIDTH, maxWidth);
    const minToolHeight = Math.min(
        explicitMinToolHeight ?? (PRESENTATION_MIN_HEIGHT + headerHeight),
        maxHeight
    );

    let w;
    let h;
    if (lockBy === 'height') {
        h = Math.max(minToolHeight, Math.min(size, maxHeight));
        w = Math.round((h - headerHeight) * PRESENTATION_RATIO);
    } else {
        w = Math.max(minWidth, Math.min(size, maxWidth));
        h = Math.round(w / PRESENTATION_RATIO) + headerHeight;
    }

    if (h > maxHeight) {
        h = maxHeight;
        w = Math.round((h - headerHeight) * PRESENTATION_RATIO);
    }
    if (w > maxWidth) {
        w = maxWidth;
        h = Math.round(w / PRESENTATION_RATIO) + headerHeight;
    }
    if (h < minToolHeight) {
        h = minToolHeight;
        w = Math.round((h - headerHeight) * PRESENTATION_RATIO);
    }
    if (w < minWidth) {
        w = minWidth;
        h = Math.round(w / PRESENTATION_RATIO) + headerHeight;
    }

    return { w, h };
}

function refreshPresentationLayout(tool, refreshSource = false) {
    const frameWrap = tool.querySelector('.presentation-frame-wrap');
    if (!frameWrap) return;
    if (refreshSource) {
        const iframe = tool.querySelector('.presentation-iframe');
        if (iframe?.src) {
            const srcToReload = iframe.src;
            iframe.src = srcToReload;
        }
    }
    const prevTransform = frameWrap.style.transform;
    frameWrap.style.transform = PRESENTATION_REFLOW_TRANSFORM;
    // Workaround: Google Slides embed can stay visually "frozen" after drag-resize;
    // a one-time reflow at drag end nudges the container and iframe to recompute layout.
    void frameWrap.offsetWidth;
    frameWrap.style.transform = prevTransform;
}

function getNextDefaultPresentationName() {
    let max = 0;
    presentationLibrary.forEach((item) => {
        const match = String(item?.name || '').match(/^Presentation\s+(\d+)$/);
        if (match) max = Math.max(max, Number(match[1]));
    });
    return `Presentation ${max + 1}`;
}

export function addSavedPresentationFromSettings() {
    const nameInput = document.getElementById('settings-presentation-name');
    const urlInput = document.getElementById('settings-presentation-url');
    if (!urlInput) return;
    const ok = addSavedPresentation(nameInput?.value || '', urlInput.value || '');
    if (!ok) {
        alert('Ogiltig Google Slides-länk.');
        return;
    }
    if (nameInput) nameInput.value = '';
    urlInput.value = '';
}

export function renderPresentationSettingsList() {
    const list = document.getElementById('settings-presentation-list');
    if (!list) return;
    list.textContent = '';
    if (!presentationLibrary.length) {
        const empty = document.createElement('p');
        empty.className = 'presentation-settings-empty';
        empty.textContent = 'Inga sparade presentationer';
        list.appendChild(empty);
        return;
    }

    presentationLibrary.forEach(item => {
        const row = document.createElement('div');
        row.className = 'presentation-settings-row';

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'presentation-settings-name';
        nameInput.value = item.name ?? 'Namnlös presentation';
        nameInput.addEventListener('change', () => updateSavedPresentationName(item.id, nameInput.value));

        const openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'presentation-settings-btn icon-btn';
        openBtn.title = 'Öppna presentation';
        openBtn.setAttribute('aria-label', 'Öppna presentation');
        openBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="currentColor">
                <title>Öppna</title>
                <path d="M8 5v14l11-7z"></path>
            </svg>
        `;
        openBtn.addEventListener('click', () => openTool('presentation', { launchUrl: item.url }));

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'presentation-settings-btn danger icon-btn';
        removeBtn.title = 'Ta bort presentation';
        removeBtn.setAttribute('aria-label', 'Ta bort presentation');
        removeBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <title>Ta bort</title>
                <path d="M3 6h18"></path>
                <path d="M8 6V4h8v2"></path>
                <path d="M7 6l1 14h8l1-14"></path>
            </svg>
        `;
        removeBtn.addEventListener('click', () => removeSavedPresentation(item.id));

        row.appendChild(nameInput);
        row.appendChild(openBtn);
        row.appendChild(removeBtn);
        list.appendChild(row);
    });
}

export function initPresentationSettings() {
    loadPresentationData();
    renderPresentationSettingsList();
}

/** Close a specific floating tool, cleaning up any running intervals. */
export function closeFloatingTool(el) {
    const tool = el.closest('.floating-tool');
    if (!tool) return;
    if (typeof tool._cleanup === 'function') tool._cleanup();
    tool.remove();
}

/** Legacy close – clears shared timer/stopwatch state (kept for compatibility). */
export function closeTool() {
    clearInterval(timerInterval);
    setTimerInterval(null);
    clearInterval(stopwatchInterval);
    setStopwatchInterval(null);
    setStopwatchRunning(false);
}

function generateMultiTable() {
    let html = '<table class="w-full text-center border-collapse text-[10px]"><tr class="bg-gray-100"><td class="p-2 border font-bold">×</td>';
    for (let i = 1; i <= 10; i++) html += `<td class="p-2 border font-bold bg-gray-50">${i}</td>`;
    html += '</tr>';
    for (let i = 1; i <= 10; i++) {
        html += `<tr><td class="bg-gray-50 p-2 border font-bold">${i}</td>`;
        for (let j = 1; j <= 10; j++) html += `<td class="p-2 border hover:bg-[#a6857e]/10 cursor-default">${i * j}</td>`;
        html += '</tr>';
    }
    return html + '</table>';
}

function generateFractionBoard() {
    const colors = ['bg-blue-400', 'bg-red-400', 'bg-green-400', 'bg-yellow-400', 'bg-purple-400', 'bg-orange-400', 'bg-teal-400', 'bg-pink-400'];
    let html = '<div class="fraction-wall">';
    for (let i = 1; i <= 8; i++) {
        html += `<div class="fraction-wall-row">`;
        for (let j = 0; j < i; j++) {
            html += `<div class="fraction-wall-cell ${colors[i - 1]}">1/${i}</div>`;
        }
        html += '</div>';
    }
    return html + '</div>';
}

function generateTimerUI() {
    return `<div class="text-center p-2"><div class="timer-container mb-4"><div class="timer-face" id="timer-face"><div id="timer-marks-container"></div><svg class="timer-svg" viewBox="0 0 100 100"><circle class="timer-circle-bg" cx="50" cy="50" r="45" /><path id="timer-path" class="timer-path" d="" /></svg><div class="timer-center-dot"></div></div></div><div id="timer-display" class="text-3xl font-bold mb-4 font-mono text-gray-700">10:00</div><div class="flex flex-col gap-3"><div class="flex items-center justify-center gap-2"><input type="number" id="timer-input" value="10" min="1" max="60" class="w-16 border p-1 rounded text-center font-bold" oninput="window.resetTimer()"><span class="text-xs font-bold text-gray-400 uppercase">Min</span></div><div class="flex gap-2 justify-center"><button onclick="window.startTimer()" id="timer-start-btn" class="bg-[#9eb19a] text-white px-4 py-2 rounded-lg text-xs font-bold shadow hover:bg-[#8da089]">Start</button><button onclick="window.pauseTimer()" class="bg-gray-400 text-white px-4 py-2 rounded-lg text-xs font-bold shadow hover:bg-gray-500">Paus</button><button onclick="window.resetTimer()" class="bg-[#a6857e] text-white px-4 py-2 rounded-lg text-xs font-bold shadow hover:bg-[#92756e]">Nollställ</button></div></div></div>`;
}

function initTimerFace() {
    const face = document.querySelector('.timer-face');
    const container = document.getElementById('timer-marks-container');
    if (!container || !face) return;
    container.innerHTML = '';
    const half = face.offsetHeight / 2 || 85;
    for (let i = 0; i < 60; i++) {
        const mark = document.createElement('div');
        mark.className = 'timer-mark' + (i % 5 === 0 ? ' major' : '');
        mark.style.transformOrigin = `50% ${half}px`;
        mark.style.transform = `translateX(-50%) rotate(${i * 6}deg)`;
        container.appendChild(mark);
    }
}

export function startTimer() {
    if (timerInterval) return;
    const btn = document.getElementById('timer-start-btn');
    if (btn) btn.innerText = 'Tickar...';
    setTimerInterval(setInterval(() => {
        if (timerSeconds > 0) {
            setTimerSeconds(timerSeconds - 1);
            updateTimerDisplay();
        } else {
            clearInterval(timerInterval);
            setTimerInterval(null);
            if (btn) btn.innerText = 'Klar!';
        }
    }, 1000));
}

export function pauseTimer() {
    clearInterval(timerInterval);
    setTimerInterval(null);
    const btn = document.getElementById('timer-start-btn');
    if (btn) btn.innerText = 'Start';
}

export function resetTimer() {
    pauseTimer();
    const mins = parseInt(document.getElementById('timer-input')?.value) || 10;
    setTimerMaxSeconds(mins * 60);
    setTimerSeconds(timerMaxSeconds);
    updateTimerDisplay();
}

function updateTimerDisplay() {
    const mins = Math.floor(timerSeconds / 60);
    const secs = timerSeconds % 60;
    const display = document.getElementById('timer-display');
    const path    = document.getElementById('timer-path');
    if (display) display.innerText = `${mins}:${secs.toString().padStart(2, '0')}`;
    if (path) {
        const angle = (timerSeconds / 3600) * 360;
        if (angle >= 359.99) {
            // Full circle – a single SVG arc whose start === end is degenerate (renders nothing),
            // so we use two half-arcs (top → bottom → top) to paint the complete disc.
            const top    = polarToCartesian(50, 50, 45,   0);
            const bottom = polarToCartesian(50, 50, 45, 180);
            path.setAttribute('d', `M ${top.x} ${top.y} A 45 45 0 0 0 ${bottom.x} ${bottom.y} A 45 45 0 0 0 ${top.x} ${top.y} Z`);
        } else {
            const start = polarToCartesian(50, 50, 45, angle);
            const end   = polarToCartesian(50, 50, 45, 0);
            const largeArcFlag = angle <= 180 ? '0' : '1';
            path.setAttribute('d', ['M', 50, 50, 'L', start.x, start.y, 'A', 45, 45, 0, largeArcFlag, 0, end.x, end.y, 'Z'].join(' '));
        }
    }
}

function polarToCartesian(cx, cy, r, angleDeg) {
    const rad = (angleDeg - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function generateStopwatchUI() {
    return `<div class="text-center p-2">
        <div id="sw-display" style="font-family:'Courier New',Courier,monospace;font-weight:bold;letter-spacing:0.08em;color:#374151;background:#f9fafb;border:2px solid #e5e7eb;border-radius:12px;padding:0.3em 0.5em;margin-bottom:18px;display:block;">00:00</div>
        <div class="flex gap-2 justify-center">
            <button id="sw-start-btn" onclick="window.startStopwatch()" style="background:#16a34a;color:white;padding:8px 20px;border-radius:8px;font-size:0.75rem;font-weight:700;border:none;cursor:pointer;box-shadow:0 2px 4px rgba(0,0,0,0.15);transition:opacity 0.15s">Start</button>
            <button onclick="window.pauseStopwatch()" style="background:#dc2626;color:white;padding:8px 20px;border-radius:8px;font-size:0.75rem;font-weight:700;border:none;cursor:pointer;box-shadow:0 2px 4px rgba(0,0,0,0.15)">Paus</button>
            <button onclick="window.resetStopwatch()" style="background:#a6857e;color:white;padding:8px 20px;border-radius:8px;font-size:0.75rem;font-weight:700;border:none;cursor:pointer;box-shadow:0 2px 4px rgba(0,0,0,0.15)">Nollställ</button>
        </div>
    </div>`;
}

export function startStopwatch() {
    if (stopwatchRunning) return;
    setStopwatchRunning(true);
    const btn = document.getElementById('sw-start-btn');
    if (btn) { btn.style.opacity = '0.6'; btn.style.cursor = 'default'; }
    const startTime = Date.now() - stopwatchSeconds * 1000;
    setStopwatchInterval(setInterval(() => {
        setStopwatchSeconds(Math.floor((Date.now() - startTime) / 1000));
        updateStopwatchDisplay();
    }, 1000));
}

export function pauseStopwatch() {
    if (!stopwatchRunning) return;
    setStopwatchRunning(false);
    clearInterval(stopwatchInterval);
    setStopwatchInterval(null);
    const btn = document.getElementById('sw-start-btn');
    if (btn) { btn.style.opacity = '1'; btn.style.cursor = 'pointer'; }
}

export function resetStopwatch() {
    pauseStopwatch();
    setStopwatchSeconds(0);
    updateStopwatchDisplay();
}

function updateStopwatchDisplay() {
    const display = document.getElementById('sw-display');
    if (!display) return;
    const mins = Math.floor(stopwatchSeconds / 60);
    const secs = stopwatchSeconds % 60;
    display.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
