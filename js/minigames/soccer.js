// soccer.js - Core Rendering Logic for the Soccer Minigame

window.soccerMinigame = {
    ball: {
        x: 0,
        y: 0,
        score1: 0,
        score2: 0,
        active: false,
        lastUpdateTime: 0
    },
    ballImage: new Image(),

    init: function () {
        // You can replace this with an actual ball sprite URL in the future
        // For now, we will draw a white circle if the image fails to load
        this.ballImage.src = 'ball.png';
    },

    updateBall: function (bx, by, s1, s2) {
        this.ball.x = bx;
        this.ball.y = by;

        // Update scoreboard if the score changed
        if (this.ball.score1 !== s1 || this.ball.score2 !== s2) {
            this.ball.score1 = s1;
            this.ball.score2 = s2;
            const uiScore = document.getElementById('soccer-score-text');
            if (uiScore) {
                uiScore.innerText = `🔵 ${s1} - ${s2} 🔴`;
            }
        }

        this.ball.lastUpdateTime = Date.now();
        this.ball.active = true;
    },

    draw: function (ctx, cameraOffsetX, cameraOffsetY, zoomLevel) {
        if (!this.ball.active) return;

        if (Date.now() - this.ball.lastUpdateTime > 1000) {
            this.ball.active = false;
            const sb = document.getElementById('soccer-scoreboard');
            if (sb) sb.style.display = 'none';
            return;
        }

        const drawX = cameraOffsetX + (this.ball.x * zoomLevel);
        const drawY = cameraOffsetY + (this.ball.y * zoomLevel);
        const radius = 8 * zoomLevel; // Standard ball size

        if (this.ballImage.complete && this.ballImage.naturalWidth !== 0) {
            // Draw actual sprite
            ctx.drawImage(this.ballImage, drawX - radius, drawY - radius, radius * 2, radius * 2);
        } else {
            // Fallback: draw a white circle
            ctx.beginPath();
            ctx.arc(drawX, drawY, radius, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.lineWidth = 2 * zoomLevel;
            ctx.strokeStyle = '#000000';
            ctx.stroke();

            // Draw pentagon lines to make it look like a soccer ball
            ctx.beginPath();
            ctx.arc(drawX, drawY, radius * 0.4, 0, Math.PI * 2);
            ctx.fillStyle = '#000000';
            ctx.fill();
        }
    }
};

window.soccerMinigame.init();
