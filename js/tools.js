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

export function openTool(type) {
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
    titleSpan.className = 'font-bold text-[#a6857e] uppercase text-xs tracking-widest';
    titleSpan.textContent = label;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'text-gray-400 hover:text-black font-bold text-xl leading-none ml-4';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => closeFloatingTool(closeBtn));

    header.appendChild(titleSpan);
    header.appendChild(closeBtn);

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

        const sliderRow = document.createElement('div');
        sliderRow.className = 'textbox-slider-row';

        const sliderLabel = document.createElement('label');
        sliderLabel.className = 'textbox-slider-label';
        sliderLabel.textContent = 'Textstorlek:';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '16';
        slider.max = '120';
        slider.value = '20';
        slider.className = 'textbox-font-slider';

        sliderRow.appendChild(sliderLabel);
        sliderRow.appendChild(slider);

        const textarea = document.createElement('textarea');
        textarea.className = 'textbox-textarea';
        textarea.placeholder = 'Skriv något här...';
        textarea.style.fontSize = slider.value + 'px';

        slider.addEventListener('input', () => {
            textarea.style.fontSize = slider.value + 'px';
        });

        body.appendChild(sliderRow);
        body.appendChild(textarea);
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
    }
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
