/**
 * Makes a floating element draggable by its handle.
 * @param {HTMLElement} floatingEl - The element to move.
 * @param {HTMLElement} handle     - The drag handle (usually the header).
 */
export function makeDraggable(floatingEl, handle) {
    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const startX   = e.clientX;
        const startY   = e.clientY;
        const origLeft = floatingEl.offsetLeft;
        const origTop  = floatingEl.offsetTop;
        // Cache dimensions once at drag start to avoid repeated layout calculations
        const maxLeft  = window.innerWidth  - floatingEl.offsetWidth;
        const maxTop   = window.innerHeight - floatingEl.offsetHeight;

        const onMove = (e) => {
            floatingEl.style.left = Math.min(Math.max(0, origLeft + e.clientX - startX), maxLeft) + 'px';
            floatingEl.style.top  = Math.min(Math.max(0, origTop  + e.clientY - startY), maxTop)  + 'px';
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup',   onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp);
    });
}
