const { ipcRenderer } = require('electron');

class PomodoroTimer {
    constructor() {
        this.isRunning = false;
        this.isPaused = false;
        this.timeRemaining = 25 * 60;
        this.currentSession = 'work';
        this.completedPomodoros = 0;
        this.totalWorkTime = 0;
        this.timer = null;
        this.isCompactMode = false;
        
        this.workTime = 25;
        this.breakTime = 5;
        
        this.elements = {
            timeDisplay: document.getElementById('timeDisplay'),
            timerLabel: document.getElementById('timerLabel'),
            startBtn: document.getElementById('startBtn'),
            pauseBtn: document.getElementById('pauseBtn'),
            resetBtn: document.getElementById('resetBtn'),
            workTimeInput: document.getElementById('workTime'),
            breakTimeInput: document.getElementById('breakTime'),
            completedPomodorosSpan: document.getElementById('completedPomodoros'),
            totalTimeSpan: document.getElementById('totalTime'),
            minimizeBtn: document.getElementById('minimizeBtn'),
            closeBtn: document.getElementById('closeBtn'),
            timeCircle: document.querySelector('.time-circle'),
            container: document.querySelector('.container')
        };
        
        this.initializeEventListeners();
        this.loadSettings();
        this.updateDisplay();
        this.updateStats();
    }
    
    initializeEventListeners() {
        this.elements.startBtn.addEventListener('click', () => this.start());
        this.elements.pauseBtn.addEventListener('click', () => this.pause());
        this.elements.resetBtn.addEventListener('click', () => this.reset());
        
        this.elements.workTimeInput.addEventListener('change', () => this.updateSettings());
        this.elements.breakTimeInput.addEventListener('change', () => this.updateSettings());
        
        this.elements.minimizeBtn.addEventListener('click', () => {
            ipcRenderer.send('minimize-to-tray');
        });
        
        this.elements.closeBtn.addEventListener('click', () => {
            ipcRenderer.send('close-app');
        });
        
        this.elements.timeCircle.addEventListener('dblclick', (e) => {
            const isCurrentlyCompact = document.querySelector('.container').classList.contains('compact-mode');
            this.toggleCompactMode();
        });
        
        
        // コンパクトモードでのドラッグ機能
        let isDragging = false;
        let startMouseX, startMouseY;
        let startWindowX, startWindowY;
        let lastClickTime = 0;
        let mouseMoved = false;
        
        this.elements.timeCircle.addEventListener('mousedown', (e) => {
            const isCompactDirect = document.querySelector('.container').classList.contains('compact-mode');
            
            if (isCompactDirect) {
                // コンパクトモード時は常にマウスイベントを有効にする
                ipcRenderer.send('enable-mouse-events');
                
                const currentTime = Date.now();
                const timeDiff = currentTime - lastClickTime;
                
                // ダブルクリック検出（400ms以内の2回目のクリック、最小50ms間隔）
                if (timeDiff < 400 && timeDiff > 50) {
                    // ダブルクリック検出時
                    this.toggleCompactMode();
                    lastClickTime = 0;
                    isDragging = false;
                    mouseMoved = false;
                    e.preventDefault();
                    return;
                }
                
                // ドラッグ準備
                lastClickTime = currentTime;
                isDragging = true;
                mouseMoved = false;
                
                // 開始位置を記録
                startMouseX = e.screenX;
                startMouseY = e.screenY;
                
                // ウィンドウの開始位置を取得
                ipcRenderer.invoke('get-window-position').then(([windowX, windowY]) => {
                    startWindowX = windowX;
                    startWindowY = windowY;
                });
                
                e.preventDefault();
            }
        });
        
        document.addEventListener('mousemove', (e) => {
            const isCompactDirect = document.querySelector('.container').classList.contains('compact-mode');
            
            if (isCompactDirect) {
                // ドラッグ処理
                if (isDragging && startWindowX !== undefined) {
                    // マウスの移動量を計算
                    const deltaX = e.screenX - startMouseX;
                    const deltaY = e.screenY - startMouseY;
                    
                    // マウスが一定以上動いたことを記録（ダブルクリック検出をキャンセル）
                    if (!mouseMoved && (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5)) {
                        mouseMoved = true;
                        // ドラッグが開始された場合、ダブルクリック検出をリセット
                        lastClickTime = 0;
                    }
                    
                    // マウスが動いた場合のみウィンドウを移動
                    if (mouseMoved) {
                        const newX = startWindowX + deltaX;
                        const newY = startWindowY + deltaY;
                        ipcRenderer.send('set-window-position', newX, newY);
                    }
                } else {
                    // クリックスルー制御（ドラッグ中でない時のみ）
                    const rect = this.elements.timeCircle.getBoundingClientRect();
                    const centerX = rect.left + rect.width / 2;
                    const centerY = rect.top + rect.height / 2;
                    const radius = rect.width / 2;
                    const distance = Math.sqrt(Math.pow(e.clientX - centerX, 2) + Math.pow(e.clientY - centerY, 2));
                    
                    if (distance > radius) {
                        ipcRenderer.send('disable-mouse-events');
                    } else {
                        ipcRenderer.send('enable-mouse-events');
                    }
                }
            }
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            mouseMoved = false;
            startMouseX = undefined;
            startMouseY = undefined;
            startWindowX = undefined;
            startWindowY = undefined;
        });
    }
    
    start() {
        if (!this.isRunning) {
            this.isRunning = true;
            this.isPaused = false;
            
            this.elements.startBtn.disabled = true;
            this.elements.pauseBtn.disabled = false;
            this.elements.timeCircle.classList.add('active');
            
            if (this.currentSession === 'work') {
                this.elements.timeCircle.classList.remove('break');
            } else if (this.currentSession === 'break') {
                this.elements.timeCircle.classList.add('break');
            }
            
            this.timer = setInterval(() => {
                this.timeRemaining--;
                this.updateDisplay();
                
                if (this.timeRemaining <= 0) {
                    this.completeSession();
                }
            }, 1000);
        }
    }
    
    pause() {
        if (this.isRunning && !this.isPaused) {
            this.isPaused = true;
            clearInterval(this.timer);
            
            this.elements.startBtn.disabled = false;
            this.elements.pauseBtn.disabled = true;
            this.elements.timeCircle.classList.remove('active');
        }
    }
    
    reset() {
        this.isRunning = false;
        this.isPaused = false;
        clearInterval(this.timer);
        
        this.setSessionTime();
        this.updateDisplay();
        
        this.elements.startBtn.disabled = false;
        this.elements.pauseBtn.disabled = true;
        this.elements.timeCircle.classList.remove('active', 'break');
    }
    
    completeSession() {
        this.isRunning = false;
        clearInterval(this.timer);
        
        this.elements.startBtn.disabled = false;
        this.elements.pauseBtn.disabled = true;
        this.elements.timeCircle.classList.remove('active');
        
        if (this.currentSession === 'work') {
            this.completedPomodoros++;
            this.totalWorkTime += this.workTime;
            this.saveStats();
            
            this.currentSession = 'break';
            
            ipcRenderer.send('show-notification', 
                'ポモドーロ完了！', 
                '作業時間が終了しました。休憩を取りましょう。'
            );
        } else {
            this.currentSession = 'work';
            
            ipcRenderer.send('show-notification', 
                '休憩終了！', 
                '休憩時間が終了しました。作業を再開しましょう。'
            );
        }
        
        this.setSessionTime();
        this.updateDisplay();
        this.updateStats();
    }
    
    setSessionTime() {
        switch (this.currentSession) {
            case 'work':
                this.timeRemaining = this.workTime * 60;
                break;
            case 'break':
                this.timeRemaining = this.breakTime * 60;
                break;
        }
    }
    
    updateDisplay() {
        const minutes = Math.floor(this.timeRemaining / 60);
        const seconds = this.timeRemaining % 60;
        
        this.elements.timeDisplay.textContent = 
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        switch (this.currentSession) {
            case 'work':
                this.elements.timerLabel.textContent = '作業時間';
                break;
            case 'break':
                this.elements.timerLabel.textContent = '休憩時間';
                break;
        }
    }
    
    updateSettings() {
        this.workTime = parseInt(this.elements.workTimeInput.value) || 25;
        this.breakTime = parseInt(this.elements.breakTimeInput.value) || 5;
        
        if (!this.isRunning) {
            this.setSessionTime();
            this.updateDisplay();
        }
        
        this.saveSettings();
    }
    
    updateStats() {
        this.elements.completedPomodorosSpan.textContent = this.completedPomodoros;
        this.elements.totalTimeSpan.textContent = `${this.totalWorkTime}分`;
    }
    
    saveSettings() {
        const settings = {
            workTime: this.workTime,
            breakTime: this.breakTime
        };
        localStorage.setItem('pomodoroSettings', JSON.stringify(settings));
    }
    
    loadSettings() {
        const savedSettings = localStorage.getItem('pomodoroSettings');
        if (savedSettings) {
            const settings = JSON.parse(savedSettings);
            this.workTime = settings.workTime || 25;
            this.breakTime = settings.breakTime || 5;
            
            this.elements.workTimeInput.value = this.workTime;
            this.elements.breakTimeInput.value = this.breakTime;
        }
        
        this.setSessionTime();
    }
    
    saveStats() {
        const today = new Date().toDateString();
        const stats = JSON.parse(localStorage.getItem('pomodoroStats') || '{}');
        
        if (!stats[today]) {
            stats[today] = {
                completedPomodoros: 0,
                totalWorkTime: 0
            };
        }
        
        stats[today].completedPomodoros = this.completedPomodoros;
        stats[today].totalWorkTime = this.totalWorkTime;
        
        localStorage.setItem('pomodoroStats', JSON.stringify(stats));
    }
    
    toggleCompactMode() {
        const currentlyCompact = this.elements.container.classList.contains('compact-mode');
        
        // 非表示にする要素を取得
        const header = document.querySelector('.header');
        const controls = document.querySelector('.controls');
        const settings = document.querySelector('.settings');
        const stats = document.querySelector('.stats');
        const footer = document.querySelector('.footer');
        
        if (currentlyCompact) {
            // ノーマルモードに戻す - マウスイベントを最初に有効化
            ipcRenderer.send('enable-mouse-events');
            
            // ウィンドウサイズを変更
            ipcRenderer.send('set-compact-mode', false);
            
            // CSSクラスを削除
            this.elements.container.classList.remove('compact-mode');
            document.body.classList.remove('compact-mode');
            document.documentElement.classList.remove('compact-mode');
            this.isCompactMode = false;
            
            // 要素を表示
            if (header) header.style.display = '';
            if (controls) controls.style.display = '';
            if (settings) settings.style.display = '';
            if (stats) stats.style.display = '';
            if (footer) footer.style.display = '';
        } else {
            // 要素を先に非表示
            if (header) header.style.display = 'none';
            if (controls) controls.style.display = 'none';
            if (settings) settings.style.display = 'none';
            if (stats) stats.style.display = 'none';
            if (footer) footer.style.display = 'none';
            
            // コンパクトモードに切り替え
            this.elements.container.classList.add('compact-mode');
            document.body.classList.add('compact-mode');
            document.documentElement.classList.add('compact-mode');
            this.isCompactMode = true;
            
            // ウィンドウサイズを200x200に変更してクリックスルーを有効化
            ipcRenderer.send('set-compact-mode', true);
        }
    }
    
    loadStats() {
        const today = new Date().toDateString();
        const stats = JSON.parse(localStorage.getItem('pomodoroStats') || '{}');
        
        if (stats[today]) {
            this.completedPomodoros = stats[today].completedPomodoros || 0;
            this.totalWorkTime = stats[today].totalWorkTime || 0;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const pomodoroTimer = new PomodoroTimer();
    pomodoroTimer.loadStats();
    pomodoroTimer.updateStats();
});