// Debug script to fix settings navigation issue
console.log('Debug script loaded');

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, checking navigation...');
    
    // Check if pages exist
    const pages = document.querySelectorAll('.page');
    console.log('Found pages:', pages.length);
    pages.forEach(page => {
        console.log('Page ID:', page.id);
    });
    
    // Check if settings page exists
    const settingsPage = document.getElementById('settings');
    console.log('Settings page found:', settingsPage ? 'Yes' : 'No');
    
    // Check navigation links
    const navLinks = document.querySelectorAll('.nav-link');
    console.log('Found nav links:', navLinks.length);
    
    // Add click handlers to debug navigation
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetPage = this.dataset.page;
            console.log('Clicked navigation for:', targetPage);
            
            // Hide all pages
            pages.forEach(page => {
                page.classList.remove('active');
                console.log('Removed active from:', page.id);
            });
            
            // Show target page
            const targetElement = document.getElementById(targetPage);
            if (targetElement) {
                targetElement.classList.add('active');
                console.log('Added active to:', targetPage);
            } else {
                console.error('Target page not found:', targetPage);
            }
            
            // Update nav active state
            navLinks.forEach(l => l.classList.remove('active'));
            this.classList.add('active');
            console.log('Updated navigation active state');
        });
    });
    
    console.log('Navigation debug setup complete');
});