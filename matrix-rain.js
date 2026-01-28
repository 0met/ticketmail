// Matrix Rain Effect
function initMatrixRain() {
    const canvas = document.getElementById('matrixCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // Set canvas size
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Matrix characters - Katakana, Latin, and numbers
    const matrixChars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*()';
    const chars = matrixChars.split('');

    const fontSize = 14;
    const columns = canvas.width / fontSize;

    // Array to track y position of each column
    const drops = [];
    for (let i = 0; i < columns; i++) {
        drops[i] = Math.random() * -100; // Start at random positions
    }

    function draw() {
        // Black background with slight transparency for trail effect
        ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#00ff41'; // Matrix green
        ctx.font = fontSize + 'px monospace';

        for (let i = 0; i < drops.length; i++) {
            // Random character
            const text = chars[Math.floor(Math.random() * chars.length)];
            const x = i * fontSize;
            const y = drops[i] * fontSize;

            // Draw the character
            ctx.fillText(text, x, y);

            // Reset drop to top randomly after it falls off screen
            if (y > canvas.height && Math.random() > 0.975) {
                drops[i] = 0;
            }

            // Move drop down
            drops[i]++;
        }
    }

    // Draw every 50ms
    setInterval(draw, 50);

    // Resize canvas on window resize
    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });
}

// Initialize Matrix effect when page loads
if (document.getElementById('loginOverlay')) {
    initMatrixRain();
}
