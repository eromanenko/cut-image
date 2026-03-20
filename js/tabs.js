// Tab switching logic. Make it global so inline onclick handlers work.
window.switchTab = function(tabId) {
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            
            document.querySelector(`.tab-btn[onclick="switchTab('${tabId}')"]`).classList.add('active');
            document.getElementById(`tab-${tabId}`).classList.add('active');

            // Update URL without reloading
            try {
                window.history.replaceState({tab: tabId}, '', '?tab=' + tabId);
            } catch (e) {
                console.error("URL update failed", e);
            }
        }

        // Initialize tab from URL on page load
        document.addEventListener('DOMContentLoaded', () => {
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
                        if (scrollPos > 10) {
                            el.classList.add('stuck');
                        } else {
                            el.classList.remove('stuck');
                        }
                    });
                }, { passive: true });
            }
        });
