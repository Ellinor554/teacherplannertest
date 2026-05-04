export function makeDraggable(wrapper, resizeHandle, onSave) {
    wrapper.addEventListener('mousedown', function (e) {
        if (e.target === resizeHandle) return;
        e.preventDefault();
        const startX = e.clientX - wrapper.offsetLeft;
        const startY = e.clientY - wrapper.offsetTop;
        function onMove(e) {
            wrapper.style.left = (e.clientX - startX) + 'px';
            wrapper.style.top  = (e.clientY - startY) + 'px';
        }
        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            onSave();
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
    resizeHandle.addEventListener('mousedown', function (e) {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startW = wrapper.offsetWidth;
        function onMove(e) {
            wrapper.style.width = Math.max(80, startW + (e.clientX - startX)) + 'px';
        }
        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            onSave();
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
}

export function insertImageBlobInto(blob, container, onSave) {
    const reader = new FileReader();
    reader.onload = function (event) {
        const wrapper = document.createElement('div');
        wrapper.className = 'img-wrapper';
        wrapper.style.left  = '20px';
        wrapper.style.top   = '20px';
        wrapper.style.width = '300px';

        const img = document.createElement('img');
        img.src = event.target.result;
        img.style.width = '100%';

        const controls = document.createElement('div');
        controls.className = 'img-controls';

        const delBtn = document.createElement('button');
        delBtn.className = 'img-ctrl-btn img-delete-btn';
        delBtn.innerHTML = '×';
        delBtn.title = 'Ta bort';
        delBtn.onmousedown = (e) => { e.stopPropagation(); wrapper.remove(); onSave(); };
        controls.appendChild(delBtn);

        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'img-resize-handle';

        wrapper.appendChild(img);
        wrapper.appendChild(controls);
        wrapper.appendChild(resizeHandle);
        wrapper.contentEditable = false;
        container.appendChild(wrapper);
        makeDraggable(wrapper, resizeHandle, onSave);
        onSave();
    };
    reader.readAsDataURL(blob);
}

export function insertImageFromFile(input, onSave, onSaveRight) {
    if (!input.files || !input.files[0]) return;
    const isRight = document.activeElement && document.activeElement.id === 'sb-plan-right';
    const target = isRight
        ? document.getElementById('sb-plan-right')
        : document.getElementById('sb-plan');
    const cb = isRight ? onSaveRight : onSave;
    insertImageBlobInto(input.files[0], target, cb);
    input.value = '';
}
