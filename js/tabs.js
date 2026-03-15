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

            // Sticky shadow: add 'stuck' class when controls are pinned
            document.querySelectorAll('.sticky-controls').forEach(el => {
                const sentinel = document.createElement('div');
                sentinel.style.height = '1px';
                sentinel.style.visibility = 'hidden';
                sentinel.style.pointerEvents = 'none';
                el.parentNode.insertBefore(sentinel, el);

                const observer = new IntersectionObserver(
                    ([entry]) => {
                        el.classList.toggle('stuck', !entry.isIntersecting);
                    },
                    { threshold: 0 }
                );
                observer.observe(sentinel);
            });
        });
