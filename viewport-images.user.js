// ==UserScript==
// @name         [Gmail] Viewport-Fit Fluid Images
// @namespace    https://github.com/myouisaur/Gmail
// @icon         https://mail.google.com/favicon.ico
// @version      2.4
// @description  Dynamically resizes large email images to fit screen space while respecting intended layout bounds and edge cases.
// @author       Xiv
// @match        *://mail.google.com/*
// @noframes
// @updateURL    https://myouisaur.github.io/Gmail/viewport-images.user.js
// @downloadURL  https://myouisaur.github.io/Gmail/viewport-images.user.js
// ==/UserScript==

(function () {
    'use strict';

    // ─── Duplicate-Init Guard ────────────────────────────────────────────────────
    if (window.__scriptAlreadyRunning_Gmail_VF) return;
    window.__scriptAlreadyRunning_Gmail_VF = true;

    // ─── Configuration ───────────────────────────────────────────────────────────
    const CONFIG = {
        DEBUG: false,
        MANAGED_CLASS: 'xiv-vf-managed',
        IGNORED_CLASS: 'xiv-vf-ignored',
        CONTAINER_SELECTOR: '.a3s', // Main email body wrapper
        BOTTOM_PADDING: 20,
        MIN_HEIGHT: 100, // Images rendering smaller than this are permanently ignored
        SETTLE_THRESHOLD: 0.5,
        LERP_FACTOR: 0.15, // Speed of the fluid adjustment
    };

    // ─── State ───────────────────────────────────────────────────────────────────
    const State = {
        rafHandle: null,
        dirty: false,
        displayedHeights: new WeakMap(),
        intendedHeights: new WeakMap(),
        visibleImages: new Set(),
        mutationObserver: null,
        intersectionObserver: null,
        resizeObserver: null,
    };

    // ─── Scoped CSS ──────────────────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById('xiv-vf-styles')) return;
        const style = document.createElement('style');
        style.id = 'xiv-vf-styles';
        style.textContent = `
            img.${CONFIG.MANAGED_CLASS} {
                width: auto !important;
                max-width: 100% !important;
                max-height: none !important;
                object-fit: contain !important;
                transition: none !important;
            }

            /* Ensure screen-specific constraints do not ruin physical printouts or PDFs */
            @media print {
                img.${CONFIG.MANAGED_CLASS} {
                    height: auto !important;
                    max-height: none !important;
                    width: auto !important;
                    max-width: 100% !important;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // ─── Core Logic ──────────────────────────────────────────────────────────────
    const Core = {
        lerp: (current, target, factor) => current + (target - current) * factor,

        getTopOffset: () => {
            try {
                const banner = document.querySelector('[role="banner"]') || document.querySelector('.aeF');
                if (banner) return banner.getBoundingClientRect().bottom;

                // If no banner exists and this is a pop-out window, offset is zero
                if (window.opener) return 0;

                return 110; // Safe fallback for standard views
            } catch {
                return 0;
            }
        },

        computeTargetHeight: (img, currentTopOffset) => {
            const intendedCeiling = State.intendedHeights.get(img) || img.naturalHeight || Infinity;

            const rect = img.getBoundingClientRect();
            const effectiveTop = Math.max(rect.top, currentTopOffset);
            const available = window.innerHeight - effectiveTop - CONFIG.BOTTOM_PADDING;

            return Math.max(CONFIG.MIN_HEIGHT, Math.min(available, intendedCeiling));
        },

        animationStep: () => {
            State.rafHandle = null;
            let anyUnsettled = false;
            const updates = [];

            // Cache the offset once per frame to prevent DOM thrashing
            const currentTopOffset = Core.getTopOffset();

            // Phase 1: Read bounds
            for (const el of State.visibleImages) {
                try {
                    // Garbage collection: SPA deleted the node while it was in our Set
                    if (!el.isConnected) {
                        State.visibleImages.delete(el);
                        State.displayedHeights.delete(el);
                        State.intendedHeights.delete(el);
                        continue;
                    }

                    if (!el.style.height) {
                        State.displayedHeights.delete(el);
                    }

                    const target = Core.computeTargetHeight(el, currentTopOffset);
                    const current = State.displayedHeights.get(el) ?? (el.getBoundingClientRect().height || target);

                    const next = Core.lerp(current, target, CONFIG.LERP_FACTOR);
                    const settled = Math.abs(next - target) < CONFIG.SETTLE_THRESHOLD;
                    const rendered = settled ? target : next;

                    updates.push({ el, rendered, settled });
                    if (!settled) anyUnsettled = true;
                } catch (err) {
                    if (CONFIG.DEBUG) console.error('[Gmail VF] Error animating', err);
                }
            }

            // Phase 2: Apply styles
            for (const update of updates) {
                State.displayedHeights.set(update.el, update.rendered);
                update.el.style.height = `${update.rendered}px`;
            }

            if (anyUnsettled || State.dirty) {
                State.dirty = false;
                State.rafHandle = requestAnimationFrame(Core.animationStep);
            }
        },

        wakeLoop: () => {
            if (document.hidden) return;
            State.dirty = true;
            if (!State.rafHandle) {
                State.rafHandle = requestAnimationFrame(Core.animationStep);
            }
        },

        registerElement: (img) => {
            if (img.classList.contains(CONFIG.MANAGED_CLASS) || img.classList.contains(CONFIG.IGNORED_CLASS)) return;

            const onReady = () => {
                if (img.naturalWidth === 1 && img.naturalHeight === 1) return;
                if (State.intersectionObserver) State.intersectionObserver.observe(img);
            };

            if (!img.complete || img.naturalHeight === 0) {
                img.addEventListener('load', onReady, { once: true });
            } else {
                onReady();
            }
        },

        scan: () => {
            try {
                document.querySelectorAll(`${CONFIG.CONTAINER_SELECTOR} img`).forEach(Core.registerElement);
            } catch (err) {
                if (CONFIG.DEBUG) console.error('[Gmail VF] Error scanning', err);
            }
        }
    };

    // ─── Observers & Listeners ───────────────────────────────────────────────────
    const Events = {
        startObservers: () => {
            if (State.mutationObserver) return;

            try {
                // ResizeObserver replaces window.resize for precise layout awareness
                const mainContainer = document.querySelector('[role="main"]') || document.body;
                State.resizeObserver = new ResizeObserver(() => Core.wakeLoop());
                State.resizeObserver.observe(mainContainer);

                State.intersectionObserver = new IntersectionObserver((entries) => {
                    let shouldWake = false;
                    for (const entry of entries) {
                        const img = entry.target;

                        if (entry.isIntersecting) {
                            if (!img.classList.contains(CONFIG.MANAGED_CLASS) && !img.classList.contains(CONFIG.IGNORED_CLASS)) {
                                const intendedHeight = img.getBoundingClientRect().height;

                                if (intendedHeight > 0 && intendedHeight <= CONFIG.MIN_HEIGHT) {
                                    img.classList.add(CONFIG.IGNORED_CLASS);
                                    State.intersectionObserver.unobserve(img);
                                    continue;
                                } else {
                                    State.intendedHeights.set(img, intendedHeight);
                                    img.classList.add(CONFIG.MANAGED_CLASS);
                                }
                            }

                            if (img.classList.contains(CONFIG.MANAGED_CLASS)) {
                                State.visibleImages.add(img);
                                State.displayedHeights.delete(img);
                                shouldWake = true;
                            }
                        } else {
                            State.visibleImages.delete(img);
                        }
                    }
                    if (shouldWake) Core.wakeLoop();
                }, { rootMargin: '500px' });

                State.mutationObserver = new MutationObserver((mutations) => {
                    let shouldWake = false;
                    for (const mutation of mutations) {
                        if (mutation.type === 'childList') {
                            for (const node of mutation.addedNodes) {
                                if (!(node instanceof Element)) continue;
                                if (node.tagName === 'IMG' && node.closest(CONFIG.CONTAINER_SELECTOR)) {
                                    Core.registerElement(node);
                                    shouldWake = true;
                                } else if (node.querySelector) {
                                    const imgs = node.querySelectorAll(`${CONFIG.CONTAINER_SELECTOR} img`);
                                    if (imgs.length > 0) {
                                        imgs.forEach(Core.registerElement);
                                        shouldWake = true;
                                    }
                                }
                            }
                        } else if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
                            if (mutation.target.classList.contains(CONFIG.MANAGED_CLASS)) {
                                State.displayedHeights.delete(mutation.target);
                                shouldWake = true;
                            }
                        }
                    }
                    if (shouldWake) Core.wakeLoop();
                });

                State.mutationObserver.observe(mainContainer, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['src']
                });
            } catch (err) {
                if (CONFIG.DEBUG) console.error('[Gmail VF] Observer failed to start:', err);
            }
        },

        onInteraction: () => Core.wakeLoop(),

        attachListeners: () => {
            window.addEventListener('scroll', Events.onInteraction, { passive: true, capture: true });
        },

        onVisibilityChange: () => {
            if (document.hidden) {
                if (State.rafHandle) {
                    cancelAnimationFrame(State.rafHandle);
                    State.rafHandle = null;
                }
            } else {
                Core.wakeLoop();
            }
        }
    };

    // ─── Initialization ──────────────────────────────────────────────────────────
    function init() {
        try {
            injectStyles();
            document.addEventListener('visibilitychange', Events.onVisibilityChange);

            Events.startObservers();
            Events.attachListeners();
            Core.scan();

            setTimeout(() => {
                Core.scan();
                Core.wakeLoop();
            }, 1000);

        } catch (err) {
            console.error('[Gmail VF] Fatal error during initialization:', err);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

})();
