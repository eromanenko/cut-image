// Tab switching logic — driven by data-tab attributes on .tab-btn elements.
function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    if (btn) {
        btn.classList.add('active');
    } else {
        console.warn('Tab button not found for:', tabId);
    }

    const content = document.getElementById(`tab-${tabId}`);
    if (content) {
        content.classList.add('active');
    } else {
        console.error('Tab content not found for:', `tab-${tabId}`);
    }

    // Update URL without reloading
    try {
        window.history.replaceState({ tab: tabId }, '', '?tab=' + tabId);
    } catch (e) {
        console.error('URL update failed', e);
    }
}

// Initialize tab from URL on page load
document.addEventListener('DOMContentLoaded', () => {
    // Bind tab button clicks
    document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Restore tab from URL
    const params = new URLSearchParams(window.location.search);
    const tabId = params.get('tab');
    if (tabId && document.getElementById(`tab-${tabId}`)) {
        switchTab(tabId);
    }

    // Sticky shadow: add 'stuck' class when scrolled down
    const stickyEls = document.querySelectorAll('.sticky-controls');
    if (stickyEls.length > 0) {
        window.addEventListener('scroll', () => {
            const scrollPos = window.scrollY || window.pageYOffset;
            stickyEls.forEach(el => {
                el.classList.toggle('stuck', scrollPos > 10);
            });
        }, { passive: true });
    }

    // Handle global paste event
    document.addEventListener('paste', (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        
        let file = null;
        for (const item of items) {
            if (item.type.startsWith('image/') || item.type === 'application/pdf') {
                file = item.getAsFile();
                break;
            }
        }
        
        if (file) {
            const activeTab = document.querySelector('.tab-content.active');
            if (activeTab) {
                const fileInput = activeTab.querySelector('input[type="file"]');
                if (fileInput) {
                    const dt = new DataTransfer();
                    dt.items.add(file);
                    fileInput.files = dt.files;
                    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        }
    });
});
