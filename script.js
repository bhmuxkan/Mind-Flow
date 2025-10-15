class StudyFlow {
    constructor() {
        // Load saved configuration or use defaults
        this.config = this.loadConfig();

        // Timer state
        this.isRunning = false;
        this.isPaused = false;
        this.isBreak = false;
        this.focusTime = Number(this.config.focusTime);
        this.breakTime = Number(this.config.breakTime);
        this.timeLeft = this.focusTime;
        // Removed lastTick; we tick at a fixed 1s cadence
        this.sessionsUntilLongBreak = Number(this.config.sessionsBeforeLongBreak);
        this.currentSessionType = 'focus';
        
        // Initialize data and resources
        this.data = this.loadData();
        this.timer = null;
        this.audioContext = null;

        // Bind methods to preserve context
        this.start = this.start.bind(this);
        this.pause = this.pause.bind(this);
        this.reset = this.reset.bind(this);
        
        // Initialize the app
        this.init();
    }

    loadConfig() {
        const defaultConfig = {
            focusTime: 25 * 60,  // 25 minutes
            breakTime: 5 * 60,   // 5 minutes
            longBreakTime: 15 * 60, // 15 minutes
            sessionsBeforeLongBreak: 4,
            theme: 'default'
        };

        try {
            const saved = localStorage.getItem('studyFlowConfig');
            if (!saved) return defaultConfig;

            const config = JSON.parse(saved);
            return {
                focusTime: Number(config.focusTime) || defaultConfig.focusTime,
                breakTime: Number(config.breakTime) || defaultConfig.breakTime,
                longBreakTime: Number(config.longBreakTime) || defaultConfig.longBreakTime,
                sessionsBeforeLongBreak: Number(config.sessionsBeforeLongBreak) || defaultConfig.sessionsBeforeLongBreak,
                theme: config.theme || defaultConfig.theme
            };
        } catch (error) {
            console.error('Error loading config:', error);
            return defaultConfig;
        }
    }

    init() {
        try {
            // Get DOM elements
            this.timerDisplay = document.getElementById('timerDisplay');
            this.sessionType = document.getElementById('sessionType');
            this.startBtn = document.getElementById('startBtn');
            this.pauseBtn = document.getElementById('pauseBtn');
            this.resetBtn = document.getElementById('resetBtn');
            this.settingsBtn = document.getElementById('settingsBtn');
            this.settingsModal = document.getElementById('settingsModal');
            this.saveSettingsBtn = document.getElementById('saveSettings');
            this.cancelSettingsBtn = document.getElementById('cancelSettings');
            this.themeSelect = document.getElementById('themeSelect');

            // Apply saved theme from config only (single source of truth)
            this.applyTheme(this.config.theme || 'default');
            this.themeSelect.value = this.config.theme || 'default';

            // Add theme change listener (persist in config)
            this.themeSelect.addEventListener('change', () => {
                this.config.theme = this.themeSelect.value;
                this.applyTheme(this.config.theme);
                localStorage.setItem('studyFlowConfig', JSON.stringify(this.config));
            });

            if (!this.timerDisplay || !this.sessionType || !this.startBtn || !this.pauseBtn || !this.resetBtn) {
                throw new Error('Required DOM elements not found');
            }

            // Add event listeners
            this.startBtn.addEventListener('click', this.start);
            this.pauseBtn.addEventListener('click', this.pause);
            this.resetBtn.addEventListener('click', this.reset);

            // Add settings event listeners
            this.settingsBtn.addEventListener('click', () => this.openSettings());
            this.saveSettingsBtn.addEventListener('click', () => this.saveSettings());
            this.cancelSettingsBtn.addEventListener('click', () => this.closeSettings());
            
            // Close settings when clicking outside
            this.settingsModal.addEventListener('click', (e) => {
                if (e.target === this.settingsModal) {
                    this.closeSettings();
                }
            });

            // Initialize display
            this.updateDisplay();
            
            // Check for audio support
            this.initAudio();
        } catch (error) {
            console.error('Initialization failed:', error);
            this.showError('Failed to initialize the timer. Please refresh the page.');
        }
    }

    async initAudio() {
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
                this.audioContext = new AudioContextClass();
                // Create and immediately suspend the context until needed
                await this.audioContext.suspend();
            }
        } catch (error) {
            console.warn('Audio not supported:', error);
        }
    }

    loadData() {
        try {
            const saved = localStorage.getItem('studyFlowData');
            const defaultData = {
                totalSessions: 0,
                todaySessions: 0,
                streak: 0,
                lastDate: null
            };

            if (!saved) return defaultData;

            const parsedData = JSON.parse(saved);
            // Validate data structure
            return {
                totalSessions: Number(parsedData.totalSessions) || 0,
                todaySessions: Number(parsedData.todaySessions) || 0,
                streak: Number(parsedData.streak) || 0,
                lastDate: parsedData.lastDate || null
            };
        } catch (error) {
            console.error('Error loading data:', error);
            return {
                totalSessions: 0,
                todaySessions: 0,
                streak: 0,
                lastDate: null
            };
        }
    }

    saveData() {
        try {
            localStorage.setItem('studyFlowData', JSON.stringify(this.data));
        } catch (error) {
            console.error('Error saving data:', error);
            this.showError('Failed to save progress');
        }
    }

    start() {
        if (!this.isRunning) {
            this.isRunning = true;
            this.startBtn.disabled = true;
            this.pauseBtn.disabled = false;
            this.sessionType.textContent = this.isBreak ? 'Break Time' : 'Focus Session';
        }

        this.isPaused = false;
        this.startBtn.textContent = 'WORKING...';
        // Clear any existing timer
        if (this.timer) {
            clearInterval(this.timer);
        }
        
        // Immediate first update
        this.updateDisplay();
        
        this.timer = setInterval(() => {
            this.timeLeft = Math.max(0, this.timeLeft - 1);
            this.updateDisplay();
            
            if (this.timeLeft <= 0) {
                clearInterval(this.timer);
                this.complete();
            }
        }, 1000); // Update every second exactly
    }

    pause() {
        if (!this.isRunning || this.isPaused) return;
        
        clearInterval(this.timer);
        this.timer = null;
        this.isPaused = true;
        this.startBtn.disabled = false;
        this.pauseBtn.disabled = true;
        this.startBtn.textContent = 'CONTINUE';
        // Play sound for feedback
        this.playChime();
    }

    reset() {
        clearInterval(this.timer);
        this.timer = null;
        this.isRunning = false;
        this.isPaused = false;
        // Reset to the start of the currently selected session type
        switch (this.currentSessionType) {
            case 'longBreak':
                this.isBreak = true;
                this.timeLeft = this.config.longBreakTime;
                this.sessionType.textContent = 'Long Break';
                break;
            case 'shortBreak':
                this.isBreak = true;
                this.timeLeft = this.config.breakTime;
                this.sessionType.textContent = 'Break Time';
                break;
            default:
                this.isBreak = false;
                this.timeLeft = this.config.focusTime;
                this.sessionType.textContent = 'Focus Session';
        }

        this.startBtn.disabled = false;
        this.pauseBtn.disabled = true;
        this.startBtn.textContent = 'BEGIN';
        
        // Immediate display update
        this.updateDisplay();
    }

    celebrateCompletion() {
        const duration = 2000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

        const randomInRange = (min, max) => Math.random() * (max - min) + min;

        const interval = setInterval(() => {
            const timeLeft = animationEnd - Date.now();

            if (timeLeft <= 0) {
                return clearInterval(interval);
            }

            const particleCount = 50 * (timeLeft / duration);
            
            confetti({
                ...defaults,
                particleCount,
                origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }
            });
            confetti({
                ...defaults,
                particleCount,
                origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }
            });
        }, 250);
    }

    complete() {
        // Immediate state update
        if (!this.isBreak) {
            this.data.totalSessions++;
            this.data.todaySessions++;
            this.updateStreak();
            this.saveData();
            this.sessionsUntilLongBreak--;

            this.isBreak = true;
            
            if (this.sessionsUntilLongBreak === 0) {
                this.timeLeft = this.config.longBreakTime;
                this.currentSessionType = 'longBreak';
                this.sessionType.textContent = 'Long Break';
                this.startBtn.textContent = 'START LONG BREAK';
                this.celebrateCompletion(); // Immediate celebration
                this.showNotification('Great job! Time for a longer break.', 'success');
                this.sessionsUntilLongBreak = this.config.sessionsBeforeLongBreak;
            } else {
                this.timeLeft = this.breakTime;
                this.currentSessionType = 'shortBreak';
                this.sessionType.textContent = 'Break Time';
                this.startBtn.textContent = 'START BREAK';
                this.celebrateCompletion(); // Immediate celebration
                this.showNotification('Focus session complete! Take a short break.', 'success');
            }
        } else {
            this.isBreak = false;
            this.timeLeft = this.focusTime;
            this.currentSessionType = 'focus';
            this.sessionType.textContent = 'Focus Session';
            this.startBtn.textContent = 'BEGIN';
        }        this.isRunning = false;
        this.startBtn.disabled = false;
        this.pauseBtn.disabled = true;
        this.updateDisplay();
    }

    updateStreak() {
        const today = new Date().toDateString();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        
        if (this.data.lastDate === today) {
            return;
        } else if (this.data.lastDate === yesterday.toDateString()) {
            this.data.streak++;
        } else {
            this.data.streak = 1;
        }
        
        this.data.lastDate = today;
    }

    updateDisplay() {
        if (!this.timerDisplay) return;
        
        const minutes = Math.floor(this.timeLeft / 60);
        const seconds = this.timeLeft % 60;
        this.timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        // Update page title for better UX
        document.title = `${this.timerDisplay.textContent} - Mind • Flow`;

        // Progress dots removed (no matching UI)
    }


    async playChime() {
        try {
            if (!this.audioContext) {
                await this.initAudio();
                if (!this.audioContext) return; // Audio not supported
            }

            await this.audioContext.resume();

            const gainNode = this.audioContext.createGain();
            const oscillator = this.audioContext.createOscillator();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + 0.5);

            // Clean up after sound plays
            setTimeout(() => {
                oscillator.disconnect();
                gainNode.disconnect();
                this.audioContext.suspend();
            }, 1000);
        } catch (error) {
            console.error('Error playing chime:', error);
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        if (!notification) return;

        // Clear any existing timeouts
        if (this.notificationTimeout) {
            clearTimeout(this.notificationTimeout);
        }

        // Update notification with current theme colors
        notification.style.setProperty('--notification-accent', getComputedStyle(document.body).getPropertyValue('--accent-color').trim());
        
        // Reset classes
        notification.className = 'notification';
        notification.classList.add(type);
        notification.textContent = message;

        // Trigger reflow
        notification.offsetHeight;

        // Show notification
        notification.classList.add('show');

        // Hide after 3 seconds
        this.notificationTimeout = setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }

    openSettings() {
        if (!this.isRunning) {
            // Populate current settings
            document.getElementById('focusLength').value = Math.floor(this.config.focusTime / 60);
            document.getElementById('breakLength').value = Math.floor(this.config.breakTime / 60);
            document.getElementById('longBreakLength').value = Math.floor(this.config.longBreakTime / 60);
            
            // Set current session type
            const sessionSelect = document.getElementById('sessionSelect');
            sessionSelect.value = this.currentSessionType;
            
            this.settingsModal.classList.add('show');
        } else {
            this.showNotification('Please pause the timer before changing settings', 'info');
        }
    }

    closeSettings() {
        this.settingsModal.classList.remove('show');
    }

    saveSettings() {
        const focusLength = Number(document.getElementById('focusLength').value);
        const breakLength = Number(document.getElementById('breakLength').value);
        const longBreakLength = Number(document.getElementById('longBreakLength').value);
        const theme = this.themeSelect.value;
        const sessionType = document.getElementById('sessionSelect').value;

        // Validate inputs
        if (!this.validateSettings(focusLength, breakLength, longBreakLength)) {
            return;
        }

        // Update config
        this.config = {
            ...this.config,
            focusTime: focusLength * 60,
            breakTime: breakLength * 60,
            longBreakTime: longBreakLength * 60,
            theme: theme
        };
        
        // Apply new theme
        this.applyTheme(theme);

        // Update session type
        this.changeSessionType(sessionType);

        // Save to localStorage
        localStorage.setItem('studyFlowConfig', JSON.stringify(this.config));

        // changeSessionType + reset already applied the correct time; just refresh display if needed
        if (!this.isRunning) this.updateDisplay();

        this.showNotification('Settings saved successfully', 'success');
        this.closeSettings();
    }

    changeSessionType(type) {
        switch(type) {
            case 'focus':
                this.isBreak = false;
                this.timeLeft = this.config.focusTime;
                this.currentSessionType = 'focus';
                this.sessionType.textContent = 'Focus Session';
                break;
            case 'shortBreak':
                this.isBreak = true;
                this.timeLeft = this.config.breakTime;
                this.currentSessionType = 'shortBreak';
                this.sessionType.textContent = 'Short Break';
                break;
            case 'longBreak':
                this.isBreak = true;
                this.timeLeft = this.config.longBreakTime;
                this.currentSessionType = 'longBreak';
                this.sessionType.textContent = 'Long Break';
                break;
        }
        this.reset();
    }

    validateSettings(focus, shortBreak, longBreak) {
        if (focus < 1 || focus > 60) {
            this.showNotification('Focus length must be between 1 and 60 minutes', 'error');
            return false;
        }
        if (shortBreak < 1 || shortBreak > 30) {
            this.showNotification('Short break must be between 1 and 30 minutes', 'error');
            return false;
        }
        if (longBreak < 5 || longBreak > 45) {
            this.showNotification('Long break must be between 5 and 45 minutes', 'error');
            return false;
        }
        return true;
    }

    applyTheme(theme) {
        document.body.className = `theme-${theme}`;
        document.documentElement.className = `theme-${theme}`;
        
        // Update meta theme-color
        const metaTheme = document.querySelector('meta[name="theme-color"]');
        if (metaTheme) {
            const themeColors = {
                default: '#fdfbfb',
                blue: '#f5f9ff',
                green: '#f5fff7',
                purple: '#f9f5ff'
            };
            metaTheme.content = themeColors[theme] || themeColors.default;
        }
    }

    destroy() {
        if (this.timer) {
            clearInterval(this.timer);
        }
        if (this.audioContext) {
            this.audioContext.close();
        }
        this.startBtn?.removeEventListener('click', this.start);
        this.pauseBtn?.removeEventListener('click', this.pause);
        this.resetBtn?.removeEventListener('click', this.reset);
        this.settingsBtn?.removeEventListener('click', this.openSettings);
        this.saveSettingsBtn?.removeEventListener('click', this.saveSettings);
        this.cancelSettingsBtn?.removeEventListener('click', this.closeSettings);
    }
}

// Initialize the app
let studyFlow = null;
document.addEventListener('DOMContentLoaded', () => {
    // Clean up existing instance if it exists
    if (studyFlow) {
        studyFlow.destroy();
    }
    studyFlow = new StudyFlow();
});