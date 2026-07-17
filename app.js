/**
 * BubbleCrop - Core Application (Cropper & Generator)
 */

// --- Constants ---
const HANDLE_SIZE = 8;
const MIN_BOX_SIZE = 15;
const PAD = 4; // Cropper padding in pixels

// --- State Variables ---
let activeTab = 'tab-generator';
let sourceImg = null;
let boxes = []; // Array of crop boxes: { id, x, y, w, h } in NATURAL image pixels
let nextBoxId = 1;
let scale = 1.0; // Display scale: canvas_pixels / natural_pixels

// Interactive editor state (Cropper)
let selectedBoxId = null;
let hoveredBoxId = null;
let hoveredHandle = null; 
let isDragging = false;
let isResizing = false;
let isDrawing = false;
let dragStartX = 0;
let dragStartY = 0;
let dragBoxInit = {};
let drawStartX = 0;
let drawStartY = 0;
let tempDrawBox = null;

// Fake Chat Generator State
let generatorMessages = [
    { id: 1, text: "Salut ! Ça va ? T'es qui déjà ?", isMe: true },
    { id: 2, text: "Je suis désolé... en fait je suis en couple, j'aurais pas dû te répondre 😔", isMe: false },
    { id: 3, text: "Ah merde... ok pas de souci ! Tu me préviens la prochaine fois 😜", isMe: true },
    { id: 4, text: "Promis... c'est juste qu'on s'est engueulés hier, je suis un peu perdue 😢", isMe: false },
    { id: 5, text: "Attends... tu me dis que t'es en couple mais tu parles à des inconnus sur ton tel ? 😳", isMe: true },
    { id: 6, text: "Non mais attends, c'est pas ce que tu crois... il me comprend pas en ce moment... 🙄", isMe: false },
    { id: 7, text: "Ah bon ? Parce que c'est MOK qui te comprend pas en ce moment ? 😉", isMe: true }
];
let nextGenMsgId = 8;

// --- DOM Cache ---
// Tabs
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-content');

// Cropper DOM Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const controlsPanel = document.getElementById('controls-panel');
const workspaceActions = document.getElementById('workspace-actions');
const emptyState = document.getElementById('empty-state');
const editorWrapper = document.getElementById('editor-wrapper');
const imgElement = document.getElementById('source-image');
const canvas = document.getElementById('editor-canvas');
const ctx = canvas.getContext('2d');
const btnSelectDummy = document.getElementById('btn-select-dummy');
const btnDetect = document.getElementById('btn-detect');
const btnAddBox = document.getElementById('btn-add-box');
const btnClearBoxes = document.getElementById('btn-clear-boxes');
const btnDownloadAll = document.getElementById('btn-download-all');
const resultsPanel = document.getElementById('results-panel');
const resultsGrid = document.getElementById('results-grid');
const resultsCount = document.getElementById('results-count');
const editorHelp = document.getElementById('editor-help');
const toast = document.getElementById('toast');

// Cropper parameter inputs
const paramSensitivity = document.getElementById('param-sensitivity');
const paramMinHeight = document.getElementById('param-min-height');
const paramMarginTop = document.getElementById('param-margin-top');
const paramMarginBottom = document.getElementById('param-margin-bottom');

// Cropper displays
const valSensitivity = document.getElementById('val-sensitivity');
const valMinHeight = document.getElementById('val-min-height');
const valMarginTop = document.getElementById('val-margin-top');
const valMarginBottom = document.getElementById('val-margin-bottom');

// Generator DOM Elements
const genContactName = document.getElementById('gen-contact-name');
const genTime = document.getElementById('gen-time');
const genMessagesList = document.getElementById('gen-messages-list');
const btnGenAdd = document.getElementById('btn-gen-add');
const btnGenDownload = document.getElementById('btn-gen-download');
const btnGenSendToCropper = document.getElementById('btn-gen-send-to-cropper');
const genMsgCount = document.getElementById('gen-msg-count');

// Mockup elements
const mockStatusTime = document.getElementById('mock-status-time');
const mockContactName = document.getElementById('mock-contact-name');
const mockAvatar = document.getElementById('mock-avatar');
const mockChatFeed = document.getElementById('mock-chat-feed');

// --- Initialization & Event Listeners ---

document.addEventListener('DOMContentLoaded', () => {
    // Setup Tab Navigation
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn.dataset.tab);
        });
    });

    // Setup Cropper range slider displays
    paramSensitivity.addEventListener('input', (e) => valSensitivity.textContent = `${e.target.value}%`);
    paramMinHeight.addEventListener('input', (e) => valMinHeight.textContent = `${e.target.value} px`);
    paramMarginTop.addEventListener('input', (e) => valMarginTop.textContent = `${e.target.value}%`);
    paramMarginBottom.addEventListener('input', (e) => valMarginBottom.textContent = `${e.target.value}%`);

    // Setup Cropper triggers
    dropZone.addEventListener('click', () => fileInput.click());
    btnSelectDummy.addEventListener('click', () => fileInput.click());
    
    // Stop event bubbling recursion
    fileInput.addEventListener('click', (e) => e.stopPropagation());
    fileInput.addEventListener('change', handleFileSelect);

    // Setup Drag-and-drop
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            processFile(e.dataTransfer.files[0]);
        }
    });

    btnDetect.addEventListener('click', () => {
        if (sourceImg) {
            showToast("Analyse de l'image...");
            detectBubbles();
            draw();
            updateCropsGrid();
        }
    });

    btnAddBox.addEventListener('click', addNewBoxInCenter);
    btnClearBoxes.addEventListener('click', () => {
        boxes = [];
        selectedBoxId = null;
        draw();
        updateCropsGrid();
        showToast("Tous les cadres ont été supprimés.");
    });

    btnDownloadAll.addEventListener('click', downloadAllAsZip);

    // Canvas Events
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseUp);

    // Mobile touch support
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd);

    // Generator Event Listeners
    genContactName.addEventListener('input', syncContactNameFromSidebar);
    genTime.addEventListener('input', syncTimeFromSidebar);
    mockContactName.addEventListener('input', syncContactNameFromMockup);

    btnGenAdd.addEventListener('click', addNewGeneratorMessage);
    btnGenDownload.addEventListener('click', downloadGeneratedChat);
    btnGenSendToCropper.addEventListener('click', sendGeneratedToCropper);

    // Window resize
    window.addEventListener('resize', () => {
        if (sourceImg && activeTab === 'tab-cropper') {
            resizeCanvas();
            draw();
        }
    });

    // Keyboard events
    window.addEventListener('keydown', (e) => {
        if (activeTab === 'tab-cropper' && (e.key === 'Delete' || e.key === 'Backspace') && selectedBoxId !== null) {
            boxes = boxes.filter(b => b.id !== selectedBoxId);
            selectedBoxId = null;
            draw();
            updateCropsGrid();
            showToast("Cadre supprimé.");
        }
    });

    // Initialize Generator Preview
    renderGeneratorList();
    renderMockupChat();
});

// --- Tab Switching Logic ---

function switchTab(tabId) {
    activeTab = tabId;
    
    // Toggle buttons
    tabButtons.forEach(btn => {
        if (btn.dataset.tab === tabId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Toggle panels
    tabPanels.forEach(panel => {
        if (panel.id === tabId) {
            panel.classList.add('active-content');
        } else {
            panel.classList.remove('hidden');
            panel.classList.remove('active-content');
            panel.classList.add('hidden');
        }
    });

    // Adjust canvas scaling if returning to cropper tab
    if (tabId === 'tab-cropper' && sourceImg) {
        setTimeout(() => {
            resizeCanvas();
            draw();
        }, 50);
    }
}

// --- Cross-Browser Safe Canvas roundRect Helper ---
/**
 * Safely draws a rounded rectangle path on canvas (alternative to ctx.roundRect)
 */
function drawRoundRect(ctx, x, y, w, h, r) {
    if (typeof r === 'number') {
        r = [r, r, r, r];
    } else if (Array.isArray(r)) {
        if (r.length === 1) r = [r[0], r[0], r[0], r[0]];
        else if (r.length === 2) r = [r[0], r[1], r[0], r[1]];
        else if (r.length === 3) r = [r[0], r[1], r[2], r[1]];
    } else {
        r = [0, 0, 0, 0];
    }

    ctx.beginPath();
    ctx.moveTo(x + r[0], y);
    ctx.lineTo(x + w - r[1], y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r[1]);
    ctx.lineTo(x + w, y + h - r[2]);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r[2], y + h);
    ctx.lineTo(x + r[3], y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r[3]);
    ctx.lineTo(x, y + r[0]);
    ctx.quadraticCurveTo(x, y, x + r[0], y);
    ctx.closePath();
}

// --- Generator Sync & Render Functions ---

function updateAvatarInitials(name) {
    const trimmed = name.trim();
    if (trimmed.length > 0) {
        mockAvatar.textContent = trimmed.charAt(0).toUpperCase();
    } else {
        mockAvatar.textContent = "?";
    }
}

function syncContactNameFromSidebar() {
    const val = genContactName.value;
    mockContactName.textContent = val;
    updateAvatarInitials(val);
}

function syncContactNameFromMockup() {
    const val = mockContactName.textContent;
    genContactName.value = val;
    updateAvatarInitials(val);
}

function syncTimeFromSidebar() {
    const val = genTime.value;
    mockStatusTime.textContent = val;
}

function renderGeneratorList() {
    genMessagesList.innerHTML = '';
    genMsgCount.textContent = generatorMessages.length;

    generatorMessages.forEach((msg, idx) => {
        const item = document.createElement('div');
        item.className = 'gen-msg-item';
        item.dataset.id = msg.id;

        item.innerHTML = `
            <div class="gen-msg-controls">
                <button class="gen-btn-type ${msg.isMe ? 'blue' : 'grey'}" onclick="toggleMsgSender(${msg.id})">
                    ${msg.isMe ? 'Moi (Bleu)' : 'Autre (Gris)'}
                </button>
                <div class="msg-item-actions">
                    <button class="icon-btn" onclick="moveMsg(${msg.id}, -1)" title="Monter"><i class="fa-solid fa-chevron-up"></i></button>
                    <button class="icon-btn" onclick="moveMsg(${msg.id}, 1)" title="Descendre"><i class="fa-solid fa-chevron-down"></i></button>
                    <button class="icon-btn delete" onclick="deleteMsg(${msg.id})" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
            <textarea class="text-input" style="height:48px; margin-top:0.25rem; font-size:0.82rem;" oninput="updateMsgText(${msg.id}, this.value)">${msg.text}</textarea>
        `;

        genMessagesList.appendChild(item);
    });
}

function renderMockupChat() {
    const dateEl = mockChatFeed.querySelector('.chat-date');
    mockChatFeed.innerHTML = '';
    if (dateEl) mockChatFeed.appendChild(dateEl);

    generatorMessages.forEach((msg, idx) => {
        const row = document.createElement('div');
        
        const isLastOfBlock = (idx === generatorMessages.length - 1) || 
                              (generatorMessages[idx].isMe !== generatorMessages[idx + 1].isMe);
        
        row.className = `msg-row ${msg.isMe ? 'sent' : 'received'} ${isLastOfBlock ? 'last-of-block' : 'same-sender'}`;
        
        const bubble = document.createElement('div');
        bubble.className = 'msg-bubble';
        bubble.textContent = msg.text;
        bubble.contentEditable = "true";
        
        bubble.addEventListener('input', () => {
            msg.text = bubble.textContent;
            const item = genMessagesList.querySelector(`.gen-msg-item[data-id="${msg.id}"] textarea`);
            if (item) item.value = bubble.textContent;
        });

        row.appendChild(bubble);
        mockChatFeed.appendChild(row);
    });

    mockChatFeed.scrollTop = mockChatFeed.scrollHeight;
}

// --- Generator Message Actions (Exposed to window for inline calls) ---

window.toggleMsgSender = function(id) {
    const msg = generatorMessages.find(m => m.id === id);
    if (msg) {
        msg.isMe = !msg.isMe;
        renderGeneratorList();
        renderMockupChat();
    }
};

window.updateMsgText = function(id, text) {
    const msg = generatorMessages.find(m => m.id === id);
    if (msg) {
        msg.text = text;
        const index = generatorMessages.indexOf(msg);
        const bubbles = mockChatFeed.querySelectorAll('.msg-bubble');
        const matchingBubble = bubbles[index];
        if (matchingBubble && matchingBubble.textContent !== text) {
            matchingBubble.textContent = text;
        }
    }
};

window.deleteMsg = function(id) {
    generatorMessages = generatorMessages.filter(m => m.id !== id);
    renderGeneratorList();
    renderMockupChat();
};

window.moveMsg = function(id, direction) {
    const index = generatorMessages.findIndex(m => m.id === id);
    if (index === -1) return;

    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= generatorMessages.length) return;

    const temp = generatorMessages[index];
    generatorMessages[index] = generatorMessages[newIndex];
    generatorMessages[newIndex] = temp;

    renderGeneratorList();
    renderMockupChat();
};

function addNewGeneratorMessage() {
    generatorMessages.push({
        id: nextGenMsgId++,
        text: "Nouveau message...",
        isMe: true
    });
    renderGeneratorList();
    renderMockupChat();
    genMessagesList.scrollTop = genMessagesList.scrollHeight;
}

// --- Canvas Screenshot Generator (PNG Exporter) ---

function renderMockupToCanvas(callback) {
    // Wait for fonts to finish preloading to guarantee perfect layouts
    document.fonts.ready.then(() => {
        const w = 750; // 2x Retina
        const tempCanvas = document.createElement('canvas');
        const tctx = tempCanvas.getContext('2d');

        // Layout variables
        const statusBarH = 88;
        const headerH = 172;
        const dateH = 72;
        const paddingX = 30;
        const bubbleSpacingSame = 6;
        const bubbleSpacingDiff = 28;
        const bubbleRadius = 36;
        
        const bubbleFont = 'normal 30px "SF Pro Text", -apple-system, BlinkMacSystemFont, "SF Pro", "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
        const bottomBarH = 120;
        
        tctx.font = bubbleFont;
        
        // Pre-calculate heights
        const bubbleLayouts = [];
        let currentY = statusBarH + headerH + dateH + 16;
        const maxBubbleW = 525;

        generatorMessages.forEach((msg, idx) => {
            const lines = wrapCanvasText(tctx, msg.text, maxBubbleW - 56);
            
            const lineHeight = 42;
            const textH = lines.length * lineHeight;
            const bH = textH + 32;

            let maxLineW = 0;
            lines.forEach(line => {
                const m = tctx.measureText(line);
                if (m.width > maxLineW) maxLineW = m.width;
            });
            const bW = maxLineW + 56;

            const isLast = (idx === generatorMessages.length - 1) || 
                           (generatorMessages[idx].isMe !== generatorMessages[idx + 1].isMe);

            bubbleLayouts.push({
                text: msg.text,
                isMe: msg.isMe,
                isLast: isLast,
                lines: lines,
                w: Math.max(80, bW),
                h: bH,
                y: currentY
            });

            currentY += bH + (isLast ? bubbleSpacingDiff : bubbleSpacingSame);
        });

        const totalHeight = currentY + bottomBarH;
        tempCanvas.width = w;
        tempCanvas.height = totalHeight;

        // --- DRAWING STAGE ---
        tctx.fillStyle = '#ffffff';
        tctx.fillRect(0, 0, w, totalHeight);

        // Draw Status Bar
        tctx.fillStyle = '#000000';
        tctx.font = '600 30px "SF Pro Text", -apple-system, BlinkMacSystemFont, sans-serif';
        tctx.fillText(genTime.value, 66, 56);

        // Status Bar Notch
        tctx.fillStyle = '#000000';
        drawRoundRect(tctx, (w - 260)/2, 0, 260, 48, 16);
        tctx.fill();

        // 2.1 Cellular wedges
        tctx.fillStyle = '#000000';
        const cellX = 586;
        const cellY = 56;
        const cellWidth = 5;
        const cellGap = 3;
        const barHeights = [8, 13, 18, 22];
        for (let i = 0; i < 4; i++) {
            drawRoundRect(tctx, cellX + i * (cellWidth + cellGap), cellY - barHeights[i], cellWidth, barHeights[i], 1.5);
            tctx.fill();
        }

        // 2.2 Wifi arcs
        const wifiX = 636;
        const wifiY = 48;
        tctx.strokeStyle = '#000000';
        tctx.lineWidth = 3;
        tctx.lineCap = 'round';
        
        tctx.beginPath();
        tctx.arc(wifiX, wifiY, 15, -Math.PI*0.72, -Math.PI*0.28);
        tctx.stroke();
        
        tctx.beginPath();
        tctx.arc(wifiX, wifiY, 9, -Math.PI*0.72, -Math.PI*0.28);
        tctx.stroke();
        
        tctx.fillStyle = '#000000';
        tctx.beginPath();
        tctx.arc(wifiX, wifiY + 2, 2.5, 0, Math.PI * 2);
        tctx.fill();

        // 2.3 Battery Outer Shell
        const batX = 678;
        const batY = 32;
        tctx.lineWidth = 2;
        tctx.strokeStyle = '#000000';
        drawRoundRect(tctx, batX, batY, 44, 22, 6);
        tctx.stroke();

        // Battery inside filled block
        tctx.fillStyle = '#000000';
        drawRoundRect(tctx, batX + 3, batY + 3, 34, 16, 4);
        tctx.fill();

        // Battery Tip Cap
        drawRoundRect(tctx, batX + 44, batY + 7, 3, 8, [0, 3, 3, 0]);
        tctx.fill();

        // 3. Draw Header Bar
        const headerY = statusBarH;
        tctx.strokeStyle = '#e5e5e5';
        tctx.lineWidth = 1;
        tctx.beginPath();
        tctx.moveTo(0, headerY + headerH);
        tctx.lineTo(w, headerY + headerH);
        tctx.stroke();

        // Back Chevron Vector
        tctx.strokeStyle = '#007aff';
        tctx.lineWidth = 4.5;
        tctx.lineCap = 'round';
        tctx.lineJoin = 'round';
        tctx.beginPath();
        tctx.moveTo(54, headerY + 68);
        tctx.lineTo(34, headerY + 84);
        tctx.lineTo(54, headerY + 100);
        tctx.stroke();

        // Profile Avatar
        const avatarCenterX = w / 2;
        const avatarCenterY = headerY + 54;
        const avatarRadius = 32;
        tctx.fillStyle = '#a2a8b5';
        tctx.beginPath();
        tctx.arc(avatarCenterX, avatarCenterY, avatarRadius, 0, Math.PI * 2);
        tctx.fill();

        tctx.fillStyle = '#ffffff';
        tctx.font = 'bold 28px "SF Pro Display", sans-serif';
        tctx.textAlign = 'center';
        tctx.fillText(mockAvatar.textContent, avatarCenterX, avatarCenterY + 10);

        // Contact Name
        tctx.fillStyle = '#3c3c43';
        tctx.font = '500 22px "SF Pro Text", sans-serif';
        tctx.textAlign = 'center';
        tctx.fillText(genContactName.value, avatarCenterX, headerY + 134);

        // Camera Icon
        tctx.fillStyle = '#007aff';
        drawRoundRect(tctx, 668, headerY + 74, 30, 20, 5);
        tctx.fill();
        tctx.beginPath();
        tctx.moveTo(698, headerY + 84);
        tctx.lineTo(710, headerY + 76);
        tctx.lineTo(710, headerY + 92);
        tctx.closePath();
        tctx.fill();

        // Small chevron next to name
        tctx.strokeStyle = '#a2a8b5';
        tctx.lineWidth = 2.5;
        tctx.lineCap = 'round';
        const nameWidth = tctx.measureText(genContactName.value).width;
        const chevronX = avatarCenterX + nameWidth / 2 + 10;
        tctx.beginPath();
        tctx.moveTo(chevronX, headerY + 124);
        tctx.lineTo(chevronX + 5, headerY + 129);
        tctx.lineTo(chevronX, headerY + 134);
        tctx.stroke();

        // 4. Date divider
        const dateY = statusBarH + headerH;
        tctx.fillStyle = '#8e8e93';
        tctx.font = '500 22px "SF Pro Text", sans-serif';
        tctx.textAlign = 'center';
        tctx.fillText("Today 12:59 PM", w / 2, dateY + 44);

        // 5. Message Bubbles
        bubbleLayouts.forEach(lay => {
            const bx = lay.isMe ? (w - lay.w - paddingX) : paddingX;
            const by = lay.y;
            
            tctx.fillStyle = lay.isMe ? '#007aff' : '#e9e9eb';
            
            if (lay.isLast) {
                const radii = lay.isMe 
                    ? [bubbleRadius, bubbleRadius, 8, bubbleRadius] 
                    : [bubbleRadius, bubbleRadius, bubbleRadius, 8];
                drawRoundRect(tctx, bx, by, lay.w, lay.h, radii);
                tctx.fill();

                // Curved tail vectors
                tctx.beginPath();
                if (lay.isMe) {
                    tctx.moveTo(bx + lay.w - 24, by + lay.h);
                    tctx.lineTo(bx + lay.w, by + lay.h);
                    tctx.quadraticCurveTo(bx + lay.w + 12, by + lay.h, bx + lay.w + 12, by + lay.h - 16);
                    tctx.quadraticCurveTo(bx + lay.w + 6, by + lay.h - 28, bx + lay.w - 6, by + lay.h - 28);
                    tctx.quadraticCurveTo(bx + lay.w - 4, by + lay.h - 12, bx + lay.w - 24, by + lay.h);
                } else {
                    tctx.moveTo(bx + 24, by + lay.h);
                    tctx.lineTo(bx, by + lay.h);
                    tctx.quadraticCurveTo(bx - 12, by + lay.h, bx - 12, by + lay.h - 16);
                    tctx.quadraticCurveTo(bx - 6, by + lay.h - 28, bx + 6, by + lay.h - 28);
                    tctx.quadraticCurveTo(bx + 4, by + lay.h - 12, bx + 24, by + lay.h);
                }
                tctx.closePath();
                tctx.fill();
            } else {
                drawRoundRect(tctx, bx, by, lay.w, lay.h, bubbleRadius);
                tctx.fill();
            }

            // Draw text
            tctx.fillStyle = lay.isMe ? '#ffffff' : '#000000';
            tctx.font = bubbleFont;
            tctx.textAlign = 'left';
            
            const textStartX = bx + 28;
            let lineY = by + 22 + 25;
            
            lay.lines.forEach(line => {
                tctx.fillText(line, textStartX, lineY);
                lineY += 42;
            });
        });

        // 6. Bottom Send Bar
        const footerY = totalHeight - bottomBarH;
        tctx.fillStyle = '#ffffff';
        tctx.fillRect(0, footerY, w, bottomBarH);
        
        tctx.strokeStyle = '#e5e5e5';
        tctx.lineWidth = 1;
        tctx.beginPath();
        tctx.moveTo(0, footerY);
        tctx.lineTo(w, footerY);
        tctx.stroke();

        // Plus icon
        tctx.fillStyle = '#e9e9eb';
        tctx.beginPath();
        tctx.arc(30 + 26, footerY + 46, 26, 0, Math.PI * 2);
        tctx.fill();
        tctx.fillStyle = '#8e8e93';
        tctx.font = '900 24px "Font Awesome 6 Free"';
        tctx.textAlign = 'center';
        tctx.fillText('', 30 + 26, footerY + 54);

        // Input bar outline
        const inputX = 100;
        const inputY = footerY + 20;
        const inputW = w - inputX - 30;
        const inputH = 56;
        tctx.strokeStyle = '#d1d1d6';
        tctx.lineWidth = 1;
        drawRoundRect(tctx, inputX, inputY, inputW, inputH, 28);
        tctx.stroke();

        // Placeholder text
        tctx.fillStyle = '#c7c7cc';
        tctx.font = 'normal 25px "SF Pro Text", sans-serif';
        tctx.textAlign = 'left';
        tctx.fillText("Made with Postfully", inputX + 24, inputY + 36);

        // Mic icon
        tctx.fillStyle = '#8e8e93';
        tctx.font = '900 24px "Font Awesome 6 Free"';
        tctx.textAlign = 'center';
        tctx.fillText('', inputX + inputW - 32, inputY + 36);

        // Home Indicator Pill
        tctx.fillStyle = '#000000';
        drawRoundRect(tctx, (w - 220)/2, totalHeight - 14, 220, 8, 4);
        tctx.fill();

        callback(tempCanvas);
    });
}

/**
 * Splits text into lines fitted to a maximum width
 */
function wrapCanvasText(tctx, text, maxWidth) {
    const words = text.split(' ');
    let line = '';
    const lines = [];

    for (let n = 0; n < words.length; n++) {
        let testLine = line + words[n] + ' ';
        let metrics = tctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
            lines.push(line.trim());
            line = words[n] + ' ';
        } else {
            line = testLine;
        }
    }
    lines.push(line.trim());
    return lines;
}

function downloadGeneratedChat() {
    showToast("Génération de l'image de chat...");
    renderMockupToCanvas((tempCanvas) => {
        const link = document.createElement('a');
        link.download = `conversation_fictive.png`;
        link.href = tempCanvas.toDataURL('image/png');
        link.click();
        showToast("Capture d'écran téléchargée !", false, true);
    });
}

// --- Seamless "Send to Cropper" Integration Flow ---

function sendGeneratedToCropper() {
    showToast("Génération et transfert en cours...");
    
    renderMockupToCanvas((tempCanvas) => {
        const dataUrl = tempCanvas.toDataURL('image/png');
        
        sourceImg = new Image();
        sourceImg.onload = () => {
            controlsPanel.classList.remove('disabled');
            workspaceActions.classList.remove('disabled');
            emptyState.classList.add('hidden');
            editorWrapper.classList.remove('hidden');
            editorHelp.classList.remove('hidden');
            resultsPanel.classList.remove('hidden');
            
            imgElement.src = sourceImg.src;
            
            // Switch tabs
            switchTab('tab-cropper');
            
            // Trigger automatic bubble detection and previews
            resizeCanvas();
            detectBubbles();
            draw();
            updateCropsGrid();
            
            showToast("Conversation chargée dans le Découpeur !", false, true);
        };
        sourceImg.src = dataUrl;
    });
}

// --- Cropper File Processing Helpers ---

function handleFileSelect(e) {
    if (e.target.files.length > 0) {
        processFile(e.target.files[0]);
    }
}

function processFile(file) {
    if (!file.type.startsWith('image/')) {
        showToast("Erreur: Le fichier doit être une image.", true);
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        sourceImg = new Image();
        sourceImg.onload = () => {
            controlsPanel.classList.remove('disabled');
            workspaceActions.classList.remove('disabled');
            emptyState.classList.add('hidden');
            editorWrapper.classList.remove('hidden');
            editorHelp.classList.remove('hidden');
            resultsPanel.classList.remove('hidden');
            
            imgElement.src = sourceImg.src;
            
            resizeCanvas();
            detectBubbles();
            draw();
            updateCropsGrid();
            
            showToast("Image chargée avec succès !");
        };
        sourceImg.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function resizeCanvas() {
    if (!sourceImg) return;
    
    const container = document.getElementById('canvas-container');
    const maxWidth = container.clientWidth - 40;
    const maxHeight = 650;
    
    let w = sourceImg.naturalWidth;
    let h = sourceImg.naturalHeight;
    
    const ratio = Math.min(maxWidth / w, maxHeight / h, 1.0);
    
    canvas.width = w * ratio;
    canvas.height = h * ratio;
    scale = ratio;
}

// --- Cropper Automatic Bubble Detection Algorithm ---

function detectBubbles() {
    if (!sourceImg) return;

    const w = sourceImg.naturalWidth;
    const h = sourceImg.naturalHeight;

    const offscreen = document.createElement('canvas');
    offscreen.width = w;
    offscreen.height = h;
    const octx = offscreen.getContext('2d');
    octx.drawImage(sourceImg, 0, 0);

    const imgData = octx.getImageData(0, 0, w, h);
    const pixels = imgData.data;

    const sensitivity = parseInt(paramSensitivity.value) / 100;
    const minHeight = parseInt(paramMinHeight.value);
    const marginTopPct = parseInt(paramMarginTop.value) / 100;
    const marginBottomPct = parseInt(paramMarginBottom.value) / 100;

    const startY = Math.floor(h * marginTopPct);
    const endY = Math.floor(h * (1 - marginBottomPct));

    const bg = getBackgroundColor(pixels, w, h);

    const isDifferentColor = (r, g, b) => {
        const dr = (r - bg.r) / 255;
        const dg = (g - bg.g) / 255;
        const db = (b - bg.b) / 255;
        const dist = Math.sqrt(dr*dr + dg*dg + db*db);
        return dist > sensitivity;
    };

    const activeRows = new Array(h).fill(false);
    const horizontalMargin = Math.max(10, Math.floor(w * 0.02));

    for (let y = startY; y < endY; y++) {
        let activePixelCount = 0;
        const rowOffset = y * w * 4;
        
        for (let x = horizontalMargin; x < w - horizontalMargin; x++) {
            const idx = rowOffset + x * 4;
            if (isDifferentColor(pixels[idx], pixels[idx+1], pixels[idx+2])) {
                activePixelCount++;
            }
        }
        
        if (activePixelCount > (w - 2 * horizontalMargin) * 0.012) {
            activeRows[y] = true;
        }
    }

    const segments = [];
    let inSegment = false;
    let segStart = 0;

    for (let y = startY; y < endY; y++) {
        if (activeRows[y] && !inSegment) {
            inSegment = true;
            segStart = y;
        } else if (!activeRows[y] && inSegment) {
            inSegment = false;
            const segHeight = y - segStart;
            if (segHeight >= minHeight) {
                segments.push({ start: segStart, end: y });
            }
        }
    }
    if (inSegment) {
        const segHeight = endY - segStart;
        if (segHeight >= minHeight) {
            segments.push({ start: segStart, end: endY });
        }
    }

    const newBoxes = [];
    
    segments.forEach(seg => {
        const activeCols = new Array(w).fill(0);
        
        for (let x = horizontalMargin; x < w - horizontalMargin; x++) {
            let activeCount = 0;
            for (let y = seg.start; y < seg.end; y++) {
                const idx = (y * w + x) * 4;
                if (isDifferentColor(pixels[idx], pixels[idx+1], pixels[idx+2])) {
                    activeCount++;
                }
            }
            if (activeCount > 1) {
                activeCols[x] = activeCount;
            }
        }

        let ranges = [];
        let inRange = false;
        let rangeStart = 0;

        for (let x = horizontalMargin; x < w - horizontalMargin; x++) {
            const isActive = activeCols[x] > 0;
            if (isActive && !inRange) {
                inRange = true;
                rangeStart = x;
            } else if (!isActive && inRange) {
                inRange = false;
                const rangeWidth = x - rangeStart;
                if (rangeWidth > 15) {
                    ranges.push({ start: rangeStart, end: x });
                }
            }
        }
        if (inRange) {
            const rangeWidth = (w - horizontalMargin) - rangeStart;
            if (rangeWidth > 15) {
                ranges.push({ start: rangeStart, end: w - horizontalMargin });
            }
        }

        if (ranges.length === 0) return;

        let widestRange = ranges[0];
        ranges.forEach(r => {
            if ((r.end - r.start) > (widestRange.end - widestRange.start)) {
                widestRange = r;
            }
        });

        let x = Math.max(0, widestRange.start - PAD);
        let y = Math.max(0, seg.start - PAD);
        let width = Math.min(w - x, (widestRange.end - widestRange.start) + 2 * PAD);
        let height = Math.min(h - y, (seg.end - seg.start) + 2 * PAD);

        if (width < w * 0.98 && width > 20) {
            newBoxes.push({
                id: nextBoxId++,
                x: x,
                y: y,
                w: width,
                h: height
            });
        }
    });

    boxes = newBoxes;
}

function getBackgroundColor(pixels, w, h) {
    const samples = [
        { x: 10, y: Math.floor(h * 0.2) },
        { x: w - 10, y: Math.floor(h * 0.2) },
        { x: 10, y: Math.floor(h * 0.5) },
        { x: w - 10, y: Math.floor(h * 0.5) },
        { x: 10, y: Math.floor(h * 0.8) },
        { x: w - 10, y: Math.floor(h * 0.8) }
    ];

    const colorCounts = {};

    samples.forEach(pos => {
        const idx = (pos.y * w + pos.x) * 4;
        const r = pixels[idx];
        const g = pixels[idx+1];
        const b = pixels[idx+2];
        const br = Math.round(r / 8) * 8;
        const bg = Math.round(g / 8) * 8;
        const bb = Math.round(b / 8) * 8;
        const key = `${br},${bg},${bb}`;
        colorCounts[key] = (colorCounts[key] || 0) + 1;
    });

    let max = 0;
    let dominantKey = "255,255,255";
    for (const key in colorCounts) {
        if (colorCounts[key] > max) {
            max = colorCounts[key];
            dominantKey = key;
        }
    }

    const [r, g, b] = dominantKey.split(',').map(Number);
    return { r, g, b };
}

// --- Cropper Drawing Core ---

function draw() {
    if (!sourceImg) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(sourceImg, 0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(11, 15, 25, 0.65)';
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, canvas.height);
    boxes.forEach(box => {
        ctx.rect(box.x * scale, (box.y + box.h) * scale, box.w * scale, -box.h * scale);
    });
    ctx.fill();

    boxes.forEach(box => {
        const bx = box.x * scale;
        const by = box.y * scale;
        const bw = box.w * scale;
        const bh = box.h * scale;
        const isSelected = box.id === selectedBoxId;
        const isHovered = box.id === hoveredBoxId;

        if (isSelected) {
            ctx.strokeStyle = '#8b5cf6';
            ctx.lineWidth = 3;
            ctx.shadowColor = 'rgba(139, 92, 246, 0.4)';
            ctx.shadowBlur = 8;
        } else if (isHovered) {
            ctx.strokeStyle = '#a78bfa';
            ctx.lineWidth = 2;
            ctx.shadowColor = 'rgba(139, 92, 246, 0.2)';
            ctx.shadowBlur = 4;
        } else {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.lineWidth = 1.5;
            ctx.shadowBlur = 0;
        }
        
        ctx.strokeRect(bx, by, bw, bh);
        ctx.shadowBlur = 0;

        if (isSelected) {
            ctx.fillStyle = 'rgba(139, 92, 246, 0.05)';
            ctx.fillRect(bx, by, bw, bh);
        }

        if (isSelected) {
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#8b5cf6';
            ctx.lineWidth = 2;

            const corners = [
                { x: bx, y: by },
                { x: bx + bw, y: by },
                { x: bx, y: by + bh },
                { x: bx + bw, y: by + bh }
            ];
            corners.forEach(c => {
                ctx.beginPath();
                ctx.arc(c.x, c.y, HANDLE_SIZE / 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            });

            const edges = [
                { x: bx + bw / 2, y: by },
                { x: bx + bw / 2, y: by + bh },
                { x: bx, y: by + bh / 2 },
                { x: bx + bw, y: by + bh / 2 }
            ];
            edges.forEach(e => {
                ctx.beginPath();
                ctx.rect(e.x - 3, e.y - 3, 6, 6);
                ctx.fill();
                ctx.stroke();
            });
        }

        ctx.fillStyle = isSelected ? '#8b5cf6' : 'rgba(0, 0, 0, 0.75)';
        ctx.font = 'bold 11px Inter, sans-serif';
        const index = getBoxIndex(box.id) + 1;
        const text = `#${index}`;
        const textWidth = ctx.measureText(text).width;
        
        // Use custom cross-browser rounded rect helper
        const badgeH = 18;
        const badgeW = textWidth + 10;
        drawRoundRect(ctx, bx, by - badgeH - 3, badgeW, badgeH, 4);
        ctx.fill();
        
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, bx + 5, by - badgeH/2 + 2);
    });

    if (isDrawing && tempDrawBox) {
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(
            tempDrawBox.x * scale,
            tempDrawBox.y * scale,
            tempDrawBox.w * scale,
            tempDrawBox.h * scale
        );
        ctx.setLineDash([]);
    }
}

function getBoxIndex(id) {
    const sorted = [...boxes].sort((a, b) => a.y - b.y);
    return sorted.findIndex(b => b.id === id);
}

// --- Cropper Interaction Handlers ---

function handleMouseDown(e) {
    if (!sourceImg) return;
    
    const mousePos = getCanvasMousePosition(e);
    const mx = mousePos.x;
    const my = mousePos.y;

    if (selectedBoxId !== null) {
        const box = boxes.find(b => b.id === selectedBoxId);
        if (box) {
            const handle = getHandleAtPosition(box, mx, my);
            if (handle) {
                isResizing = true;
                hoveredHandle = handle;
                dragStartX = mx;
                dragStartY = my;
                dragBoxInit = { x: box.x, y: box.y, w: box.w, h: box.h };
                return;
            }
        }
    }

    let clickedBox = null;
    for (let i = boxes.length - 1; i >= 0; i--) {
        const box = boxes[i];
        const bx = box.x * scale;
        const by = box.y * scale;
        const bw = box.w * scale;
        const bh = box.h * scale;

        if (mx >= bx && mx <= bx + bw && my >= by && my <= by + bh) {
            clickedBox = box;
            break;
        }
    }

    if (clickedBox) {
        selectedBoxId = clickedBox.id;
        isDragging = true;
        dragStartX = mx;
        dragStartY = my;
        dragBoxInit = { x: clickedBox.x, y: clickedBox.y, w: clickedBox.w, h: clickedBox.h };
        draw();
        return;
    }

    selectedBoxId = null;
    isDrawing = true;
    drawStartX = mx / scale;
    drawStartY = my / scale;
    tempDrawBox = { x: drawStartX, y: drawStartY, w: 0, h: 0 };
    draw();
}

function handleMouseMove(e) {
    if (!sourceImg) return;

    const mousePos = getCanvasMousePosition(e);
    const mx = mousePos.x;
    const my = mousePos.y;

    if (isDragging && selectedBoxId !== null) {
        const box = boxes.find(b => b.id === selectedBoxId);
        if (box) {
            const dx = (mx - dragStartX) / scale;
            const dy = (my - dragStartY) / scale;
            
            box.x = Math.max(0, Math.min(sourceImg.naturalWidth - dragBoxInit.w, dragBoxInit.x + dx));
            box.y = Math.max(0, Math.min(sourceImg.naturalHeight - dragBoxInit.h, dragBoxInit.y + dy));
            
            draw();
        }
    } else if (isResizing && selectedBoxId !== null) {
        const box = boxes.find(b => b.id === selectedBoxId);
        if (box) {
            const dx = (mx - dragStartX) / scale;
            const dy = (my - dragStartY) / scale;
            
            let newX = dragBoxInit.x;
            let newY = dragBoxInit.y;
            let newW = dragBoxInit.w;
            let newH = dragBoxInit.h;

            const handle = hoveredHandle;

            if (handle.includes('l')) {
                const maxX = dragBoxInit.x + dragBoxInit.w - MIN_BOX_SIZE;
                newX = Math.max(0, Math.min(maxX, dragBoxInit.x + dx));
                newW = dragBoxInit.w + (dragBoxInit.x - newX);
            } else if (handle.includes('r')) {
                newW = Math.max(MIN_BOX_SIZE, Math.min(sourceImg.naturalWidth - dragBoxInit.x, dragBoxInit.w + dx));
            }

            if (handle.includes('t')) {
                const maxY = dragBoxInit.y + dragBoxInit.h - MIN_BOX_SIZE;
                newY = Math.max(0, Math.min(maxY, dragBoxInit.y + dy));
                newH = dragBoxInit.h + (dragBoxInit.y - newY);
            } else if (handle.includes('b')) {
                newH = Math.max(MIN_BOX_SIZE, Math.min(sourceImg.naturalHeight - dragBoxInit.y, dragBoxInit.h + dy));
            }

            box.x = Math.floor(newX);
            box.y = Math.floor(newY);
            box.w = Math.floor(newW);
            box.h = Math.floor(newH);

            draw();
        }
    } else if (isDrawing) {
        const curX = mx / scale;
        const curY = my / scale;
        
        tempDrawBox.x = Math.max(0, Math.min(drawStartX, curX));
        tempDrawBox.y = Math.max(0, Math.min(drawStartY, curY));
        tempDrawBox.w = Math.min(sourceImg.naturalWidth - tempDrawBox.x, Math.abs(curX - drawStartX));
        tempDrawBox.h = Math.min(sourceImg.naturalHeight - tempDrawBox.y, Math.abs(curY - drawStartY));
        
        draw();
    } else {
        updateHoverState(mx, my);
    }
}

function handleMouseUp(e) {
    if (isDragging || isResizing) {
        isDragging = false;
        isResizing = false;
        updateCropsGrid();
    } else if (isDrawing) {
        isDrawing = false;
        if (tempDrawBox && tempDrawBox.w >= MIN_BOX_SIZE && tempDrawBox.h >= MIN_BOX_SIZE) {
            const newBox = {
                id: nextBoxId++,
                x: Math.floor(tempDrawBox.x),
                y: Math.floor(tempDrawBox.y),
                w: Math.floor(tempDrawBox.w),
                h: Math.floor(tempDrawBox.h)
            };
            boxes.push(newBox);
            selectedBoxId = newBox.id;
            sortBoxesByY();
            updateCropsGrid();
            showToast("Nouveau cadre de découpe ajouté.");
        }
        tempDrawBox = null;
        draw();
    }
}

function handleTouchStart(e) {
    if (e.touches.length === 1) {
        e.preventDefault();
        const touch = e.touches[0];
        const dummyEvent = {
            clientX: touch.clientX,
            clientY: touch.clientY,
            preventDefault: () => {}
        };
        handleMouseDown(dummyEvent);
    }
}

function handleTouchMove(e) {
    if (e.touches.length === 1) {
        e.preventDefault();
        const touch = e.touches[0];
        const dummyEvent = {
            clientX: touch.clientX,
            clientY: touch.clientY,
            preventDefault: () => {}
        };
        handleMouseMove(dummyEvent);
    }
}

function handleTouchEnd(e) {
    handleMouseUp(e);
}

function getCanvasMousePosition(e) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
}

function getHandleAtPosition(box, mx, my) {
    const bx = box.x * scale;
    const by = box.y * scale;
    const bw = box.w * scale;
    const bh = box.h * scale;

    const r = HANDLE_SIZE + 4;

    if (Math.abs(mx - bx) <= r && Math.abs(my - by) <= r) return 'tl';
    if (Math.abs(mx - (bx + bw)) <= r && Math.abs(my - by) <= r) return 'tr';
    if (Math.abs(mx - bx) <= r && Math.abs(my - (by + bh)) <= r) return 'bl';
    if (Math.abs(mx - (bx + bw)) <= r && Math.abs(my - (by + bh)) <= r) return 'br';

    if (Math.abs(mx - (bx + bw / 2)) <= r && Math.abs(my - by) <= r) return 't';
    if (Math.abs(mx - (bx + bw / 2)) <= r && Math.abs(my - (by + bh)) <= r) return 'b';
    if (Math.abs(mx - bx) <= r && Math.abs(my - (by + bh / 2)) <= r) return 'l';
    if (Math.abs(mx - (bx + bw)) <= r && Math.abs(my - (by + bh / 2)) <= r) return 'r';

    return null;
}

function updateHoverState(mx, my) {
    let cursorStyle = 'crosshair';
    hoveredBoxId = null;
    hoveredHandle = null;

    if (selectedBoxId !== null) {
        const box = boxes.find(b => b.id === selectedBoxId);
        if (box) {
            const handle = getHandleAtPosition(box, mx, my);
            if (handle) {
                hoveredHandle = handle;
                hoveredBoxId = box.id;
                
                if (handle === 'tl' || handle === 'br') cursorStyle = 'nwse-resize';
                else if (handle === 'tr' || handle === 'bl') cursorStyle = 'nesw-resize';
                else if (handle === 't' || handle === 'b') cursorStyle = 'ns-resize';
                else if (handle === 'l' || handle === 'r') cursorStyle = 'ew-resize';
                
                canvas.style.cursor = cursorStyle;
                return;
            }
        }
    }

    for (let i = boxes.length - 1; i >= 0; i--) {
        const box = boxes[i];
        const bx = box.x * scale;
        const by = box.y * scale;
        const bw = box.w * scale;
        const bh = box.h * scale;

        if (mx >= bx && mx <= bx + bw && my >= by && my <= by + bh) {
            hoveredBoxId = box.id;
            cursorStyle = 'move';
            break;
        }
    }

    canvas.style.cursor = cursorStyle;
    draw();
}

function addNewBoxInCenter() {
    if (!sourceImg) return;

    const w = sourceImg.naturalWidth;
    const h = sourceImg.naturalHeight;
    
    const boxW = Math.min(w * 0.6, 250);
    const boxH = Math.min(h * 0.1, 80);
    
    const newBox = {
        id: nextBoxId++,
        x: Math.floor((w - boxW) / 2),
        y: Math.floor((h - boxH) / 2),
        w: Math.floor(boxW),
        h: Math.floor(boxH)
    };
    
    boxes.push(newBox);
    selectedBoxId = newBox.id;
    sortBoxesByY();
    draw();
    updateCropsGrid();
    showToast("Nouveau cadre centré.");
}

function sortBoxesByY() {
    boxes.sort((a, b) => a.y - b.y);
}

// --- Preview Generation & Exporter ---

function updateCropsGrid() {
    resultsGrid.innerHTML = '';
    sortBoxesByY();
    
    resultsCount.textContent = boxes.length;

    if (boxes.length === 0) {
        resultsGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1; margin: 2rem auto;">
                <p style="color: var(--text-muted);">Aucun message extrait. Ajustez ou redessinez des cadres.</p>
            </div>
        `;
        return;
    }

    boxes.forEach((box, index) => {
        const card = document.createElement('div');
        card.className = 'message-card';
        card.dataset.id = box.id;

        card.addEventListener('mouseenter', () => {
            hoveredBoxId = box.id;
            draw();
        });
        card.addEventListener('mouseleave', () => {
            hoveredBoxId = null;
            draw();
        });
        card.addEventListener('click', () => {
            selectedBoxId = box.id;
            draw();
        });

        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = box.w;
        cropCanvas.height = box.h;
        const cctx = cropCanvas.getContext('2d');
        cctx.drawImage(sourceImg, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);

        const img = document.createElement('img');
        img.src = cropCanvas.toDataURL('image/png');
        img.alt = `Message #${index + 1}`;

        const previewContainer = document.createElement('div');
        previewContainer.className = 'card-preview';
        previewContainer.appendChild(img);

        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'card-actions';

        const btnDownload = document.createElement('button');
        btnDownload.className = 'card-btn card-btn-download';
        btnDownload.innerHTML = `<i class="fa-solid fa-download"></i> Enregistrer`;
        btnDownload.addEventListener('click', (e) => {
            e.stopPropagation();
            downloadSingleCrop(cropCanvas, index + 1);
        });

        const btnDelete = document.createElement('button');
        btnDelete.className = 'card-btn card-btn-delete';
        btnDelete.innerHTML = `<i class="fa-solid fa-trash"></i>`;
        btnDelete.title = "Supprimer ce message";
        btnDelete.addEventListener('click', (e) => {
            e.stopPropagation();
            boxes = boxes.filter(b => b.id !== box.id);
            if (selectedBoxId === box.id) selectedBoxId = null;
            draw();
            updateCropsGrid();
            showToast("Message retiré.");
        });

        actionsContainer.appendChild(btnDownload);
        actionsContainer.appendChild(btnDelete);

        card.appendChild(previewContainer);
        card.appendChild(actionsContainer);

        resultsGrid.appendChild(card);
    });
}

function downloadSingleCrop(cropCanvas, index) {
    const link = document.createElement('a');
    link.download = `message_${index}.png`;
    link.href = cropCanvas.toDataURL('image/png');
    link.click();
}

function downloadAllAsZip() {
    if (!sourceImg || boxes.length === 0) return;

    showToast("Génération du fichier ZIP...");
    const zip = new JSZip();

    const sorted = [...boxes].sort((a, b) => a.y - b.y);
    let processed = 0;
    
    sorted.forEach((box, index) => {
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = box.w;
        cropCanvas.height = box.h;
        const cctx = cropCanvas.getContext('2d');
        cctx.drawImage(sourceImg, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);

        cropCanvas.toBlob((blob) => {
            const padIndex = String(index + 1).padStart(2, '0');
            zip.file(`message_${padIndex}.png`, blob);
            processed++;

            if (processed === sorted.length) {
                zip.generateAsync({ type: 'blob' }).then((content) => {
                    const link = document.createElement('a');
                    link.download = `messages_decoupes.zip`;
                    link.href = URL.createObjectURL(content);
                    link.click();
                    showToast("Archive ZIP téléchargée !", false, true);
                });
            }
        }, 'image/png');
    });
}

// --- Toast and Notification Helpers ---

function showToast(message, isError = false, isSuccess = false) {
    toast.textContent = '';
    toast.className = 'toast';
    
    const icon = document.createElement('i');
    if (isError) {
        toast.classList.add('toast-error');
        icon.className = 'fa-solid fa-triangle-exclamation';
    } else if (isSuccess) {
        toast.classList.add('toast-success');
        icon.className = 'fa-solid fa-circle-check';
    } else {
        icon.className = 'fa-solid fa-circle-info';
    }
    
    toast.appendChild(icon);
    const span = document.createElement('span');
    span.textContent = message;
    toast.appendChild(span);
    
    toast.classList.remove('hidden');

    if (window.toastTimeout) clearTimeout(window.toastTimeout);
    window.toastTimeout = setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

