// ==UserScript==
// @name         [Drive] Extract Folder Info
// @namespace    https://github.com/myouisaur/Google
// @icon         https://ssl.gstatic.com/images/branding/product/1x/drive_2020q4_32dp.png
// @version      2.9
// @description  Extracts the current folder ID and name to the clipboard, and provides quick workflow links.
// @author       Xiv
// @match        *://drive.google.com/*
// @noframes
// @run-at       document-start
// @updateURL    https://myouisaur.github.io/Google/DRIVE_extract-folder-info.user.js
// @downloadURL  https://myouisaur.github.io/Google/DRIVE_extract-folder-info.user.js
// ==/UserScript==

(function () {
    'use strict';

    if (window.__gdriveExtractorRunning) return;
    window.__gdriveExtractorRunning = true;

    const CONFIG = {
        ui: {
            groupId: 'tm-gdrive-split-group',
            groupClass: 'tm-gdrive-split-chip',
            mainBtnClass: 'tm-chip-main',
            toggleBtnClass: 'tm-chip-toggle',
            dropdownId: 'tm-gdrive-dropdown-menu',
            dropdownClass: 'tm-chip-dropdown',
            dropdownItemClass: 'tm-dropdown-item',
            openClass: 'tm-open',
            toastContainerId: 'tm-gdrive-extractor-toasts',
            toastClass: 'tm-gdrive-toast',
            visibleClass: 'tm-visible'
        },
        timeouts: {
            toastDuration: 3000,
            fadeDuration: 300
        },
        urls: {
            pnlGenerator: 'https://docs.google.com/spreadsheets/d/1FJWveIYeLX5F1tn0yxYa69AOkjYlPrfgYNkZiv88nYc'
        },
        svg: {
            copyPath: 'M13.5 0.75H3c-0.825 0-1.5 0.675-1.5 1.5v10.5h1.5V2.25h10.5V0.75zM15.75 3.75H6c-0.825 0-1.5 0.675-1.5 1.5v10.5c0 0.825 0.675 1.5 1.5 1.5h9.75c0.825 0 1.5-0.675 1.5-1.5V5.25c0-0.825-0.675-1.5-1.5-1.5zM15.75 15.75H6V5.25h9.75v10.5z',
            caretPath: 'M7 10l5 5 5-5H7z',
            sheetsPath: 'M19 3H5c-1.1 0-1.99.9-1.99 2L3 8v11c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 8h-8v8H9v-8H5V9h4V5h2v4h8v2z'
        }
    };

    let isProcessing = false;

    function injectStyles() {
        if (document.getElementById('tm-gdrive-styles')) return;

        const style = document.createElement('style');
        style.id = 'tm-gdrive-styles';
        style.textContent = `
            /* Split Button Group Container */
            .${CONFIG.ui.groupClass} {
                display: inline-flex;
                align-items: center;
                height: 32px;
                margin: 0;
                box-sizing: border-box;
                align-self: center;
                border: 1px solid rgb(116, 119, 117);
                border-radius: 8px;
                position: relative;
                flex-shrink: 0;
                color: #444746;
            }

            /* Shared Button Styles */
            .${CONFIG.ui.mainBtnClass}, .${CONFIG.ui.toggleBtnClass} {
                background-color: transparent;
                color: inherit;
                border: none;
                height: 100%;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: background-color 0.15s ease;
                fill: currentColor;
            }

            /* Main Copy Button */
            .${CONFIG.ui.mainBtnClass} {
                padding: 0 8px 0 12px;
                border-radius: 8px 0 0 8px;
                font-family: "Google Sans Text", Roboto, Arial, sans-serif;
                font-size: 14px;
                font-weight: 500;
            }

            /* Dropdown Arrow Toggle */
            .${CONFIG.ui.toggleBtnClass} {
                padding: 0 4px 0 2px;
                border-radius: 0 8px 8px 0;
            }

            .${CONFIG.ui.mainBtnClass}:hover, .${CONFIG.ui.toggleBtnClass}:hover {
                background-color: rgba(60, 64, 67, 0.08);
            }

            .${CONFIG.ui.mainBtnClass}:focus-visible, .${CONFIG.ui.toggleBtnClass}:focus-visible {
                outline: 2px solid #1a73e8;
                outline-offset: -1px;
            }

            /* Native Material 3 Dropdown Menu (Detached) */
            .${CONFIG.ui.dropdownClass} {
                position: fixed;
                background-color: #ffffff;
                border-radius: 8px;
                box-shadow: 0 4px 6px 0 rgba(60,64,67,.3), 0 1px 3px 1px rgba(60,64,67,.15);
                min-width: 260px;
                z-index: 10001;
                display: none;
                flex-direction: column;
                padding: 8px 0;
            }

            .${CONFIG.ui.dropdownClass}.${CONFIG.ui.openClass} {
                display: flex;
            }

            /* Native Material Dropdown Items */
            .${CONFIG.ui.dropdownItemClass} {
                display: flex;
                align-items: center;
                height: 32px;
                padding: 0 16px;
                color: #444746;
                font-family: Roboto, Arial, sans-serif;
                font-size: 14px;
                background: transparent;
                border: none;
                width: 100%;
                text-align: left;
                cursor: pointer;
                gap: 16px;
            }

            .${CONFIG.ui.dropdownItemClass}:hover {
                background-color: #f1f3f4;
            }

            /* Toast Notifications */
            #${CONFIG.ui.toastContainerId} {
                position: fixed;
                bottom: clamp(1.5rem, 3vw, 2.5rem);
                left: clamp(1.5rem, 3vw, 2.5rem);
                z-index: 10000;
                display: flex;
                flex-direction: column;
                gap: 0.5rem;
                pointer-events: none;
            }

            .${CONFIG.ui.toastClass} {
                background-color: #323232;
                color: #ffffff;
                padding: 0.75rem 1.5rem;
                border-radius: 4px;
                font-family: Roboto, Arial, sans-serif;
                font-size: 0.875rem;
                box-shadow: 0 3px 5px rgba(0, 0, 0, 0.2);
                opacity: 0;
                transform: translateY(10px);
                transition: opacity ${CONFIG.timeouts.fadeDuration}ms ease, transform ${CONFIG.timeouts.fadeDuration}ms ease;
                white-space: pre-wrap;
                text-align: left;
            }

            .${CONFIG.ui.visibleClass} {
                opacity: 1;
                transform: translateY(0);
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function playSuccessSound() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gainNode = ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.05);

            gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

            osc.connect(gainNode);
            gainNode.connect(ctx.destination);

            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.1);
        } catch (e) {
            console.warn('[Google Drive Extractor] Audio cue failed:', e);
        }
    }

    function showToast(message, isError = false) {
        let container = document.getElementById(CONFIG.ui.toastContainerId);

        if (!container) {
            container = document.createElement('div');
            container.id = CONFIG.ui.toastContainerId;
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = CONFIG.ui.toastClass;
        toast.textContent = message;

        if (isError) toast.style.borderLeft = '4px solid #ea4335';

        container.appendChild(toast);
        void toast.offsetWidth;
        toast.classList.add(CONFIG.ui.visibleClass);

        setTimeout(() => {
            toast.classList.remove(CONFIG.ui.visibleClass);
            setTimeout(() => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, CONFIG.timeouts.fadeDuration);
        }, CONFIG.timeouts.toastDuration);
    }

    function createIcon(pathData, size, viewBox = '0 0 18 18', fill = 'currentColor') {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', size);
        svg.setAttribute('height', size);
        svg.setAttribute('viewBox', viewBox);
        svg.setAttribute('fill', fill);
        svg.style.flexShrink = '0';

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);

        svg.appendChild(path);
        return svg;
    }

    function extractFolderData() {
        const urlPath = window.location.pathname;
        const idMatch = urlPath.match(/\/folders\/([a-zA-Z0-9_-]+)/);

        if (!idMatch) return null;

        const folderId = idMatch[1];
        const rawTitle = document.title || '';
        const titleSuffix = ' - Google Drive';

        const folderName = rawTitle.endsWith(titleSuffix)
            ? rawTitle.slice(0, -titleSuffix.length).trim()
            : rawTitle.trim();

        return { folderId, folderName };
    }

    async function forceCopyToClipboard(text) {
        try {
            if (navigator.clipboard) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch (e) {
            console.warn('[Google Drive Extractor] Modern clipboard failed, using fallback.');
        }

        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.top = "0";
        textArea.style.left = "0";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        let success = false;
        try { success = document.execCommand('copy'); }
        catch (err) { console.error('[Google Drive Extractor] Fallback clipboard failed.'); }

        document.body.removeChild(textArea);
        return success;
    }

    function blockEvent(e) {
        e.preventDefault();
        e.stopImmediatePropagation();
    }

    function closeAllDropdowns() {
        const dropdown = document.getElementById(CONFIG.ui.dropdownId);
        if (dropdown) dropdown.classList.remove(CONFIG.ui.openClass);
    }

    async function handleExtraction(event) {
        blockEvent(event);
        closeAllDropdowns();

        if (isProcessing) return;
        isProcessing = true;

        const data = extractFolderData();

        if (!data) {
            showToast('Navigation Error: Open a specific folder to extract data.', true);
            isProcessing = false;
            return;
        }

        const { folderId, folderName } = data;
        const copied = await forceCopyToClipboard(`${folderId}\t${folderName}`);

        if (copied) {
            playSuccessSound();
            showToast(`Copied to Clipboard:\n${folderName}`);
        } else {
            showToast('Error: Clipboard write failed. Please try again.', true);
        }

        setTimeout(() => { isProcessing = false; }, 300);
    }

    function ensureDropdownExists() {
        if (document.getElementById(CONFIG.ui.dropdownId)) return;

        const dropdown = document.createElement('div');
        dropdown.id = CONFIG.ui.dropdownId;
        dropdown.className = CONFIG.ui.dropdownClass;

        const pnlItem = document.createElement('button');
        pnlItem.className = CONFIG.ui.dropdownItemClass;

        const sheetsIcon = createIcon(CONFIG.svg.sheetsPath, '24', '0 0 24 24', '#0f9d58');
        const pnlText = document.createElement('div');
        pnlText.textContent = 'Open P&L Generator';

        pnlItem.appendChild(sheetsIcon);
        pnlItem.appendChild(pnlText);
        dropdown.appendChild(pnlItem);

        pnlItem.addEventListener('mousedown', (e) => {
            blockEvent(e);
            window.open(CONFIG.urls.pnlGenerator, '_blank');
            closeAllDropdowns();
        }, { capture: true });
        pnlItem.addEventListener('click', blockEvent, { capture: true });

        document.body.appendChild(dropdown);
    }

    function injectButtonGroup(container) {
        if (document.getElementById(CONFIG.ui.groupId)) return;

        const group = document.createElement('div');
        group.id = CONFIG.ui.groupId;
        group.className = CONFIG.ui.groupClass;

        // --- Main Copy Button ---
        const mainBtn = document.createElement('button');
        mainBtn.className = CONFIG.ui.mainBtnClass;
        mainBtn.title = 'Extract Folder ID & Name to Clipboard';

        const mainText = document.createElement('span');
        mainText.textContent = 'Copy ID';
        mainText.style.marginLeft = '8px';

        mainBtn.appendChild(createIcon(CONFIG.svg.copyPath, '18', '0 0 18 18'));
        mainBtn.appendChild(mainText);

        mainBtn.addEventListener('mousedown', handleExtraction, { capture: true });
        mainBtn.addEventListener('click', blockEvent, { capture: true });

        // --- Toggle Dropdown Button ---
        const toggleBtn = document.createElement('button');
        toggleBtn.className = CONFIG.ui.toggleBtnClass;

        // Scaled to 18px width/height while maintaining the 24x24 viewBox ratio
        toggleBtn.appendChild(createIcon(CONFIG.svg.caretPath, '18', '0 0 24 24'));

        toggleBtn.addEventListener('mousedown', (e) => {
            blockEvent(e);
            ensureDropdownExists();

            const dropdown = document.getElementById(CONFIG.ui.dropdownId);
            const isOpen = dropdown.classList.contains(CONFIG.ui.openClass);

            closeAllDropdowns();

            if (!isOpen) {
                const groupRect = group.getBoundingClientRect();
                dropdown.style.top = `${groupRect.bottom + 4}px`;
                dropdown.style.left = `${groupRect.left}px`;
                dropdown.classList.add(CONFIG.ui.openClass);
            }
        }, { capture: true });

        toggleBtn.addEventListener('click', blockEvent, { capture: true });

        group.appendChild(mainBtn);
        group.appendChild(toggleBtn);

        container.appendChild(group);
    }

    function startObserver() {
        injectStyles();

        document.addEventListener('mousedown', (e) => {
            const group = document.getElementById(CONFIG.ui.groupId);
            const dropdown = document.getElementById(CONFIG.ui.dropdownId);

            if (dropdown && dropdown.classList.contains(CONFIG.ui.openClass)) {
                if ((!group || !group.contains(e.target)) && !dropdown.contains(e.target)) {
                    closeAllDropdowns();
                }
            }
        }, { capture: true });

        const observer = new MutationObserver(() => {
            const filterContainer = document.querySelector('div[jsname="mSot5c"]') ||
                                    document.querySelector('div[aria-label="Filters"] > div:first-child');

            if (filterContainer && !document.getElementById(CONFIG.ui.groupId)) {
                injectButtonGroup(filterContainer);
            }
        });

        observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    startObserver();

})();
