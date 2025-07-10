const { ipcRenderer } = require('electron');

class PomodoroTimer {
    constructor() {
        this.isRunning = false;
        this.isPaused = false;
        this.timeRemaining = 25 * 60;
        this.currentSession = 'work';
        this.completedPomodoros = 0;
        this.timer = null;
        this.autoStartTimeout = null;
        this.isCompactMode = false;
        
        this.workTime = 25;
        this.breakTime = 5;
        this.syncTime = 0;
        this.enableSync = false;
        
        this.elements = {
            timeDisplay: document.getElementById('timeDisplay'),
            timerLabel: document.getElementById('timerLabel'),
            startBtn: document.getElementById('startBtn'),
            pauseBtn: document.getElementById('pauseBtn'),
            resetBtn: document.getElementById('resetBtn'),
            workTimeInput: document.getElementById('workTime'),
            breakTimeInput: document.getElementById('breakTime'),
            syncTimeInput: document.getElementById('syncTime'),
            enableSyncCheckbox: document.getElementById('enableSync'),
            completedPomodorosSpan: document.getElementById('completedPomodoros'),
            closeBtn: document.getElementById('closeBtn'),
            timeCircle: document.querySelector('.time-circle'),
            progressRing: document.querySelector('.progress-ring-progress'),
            container: document.querySelector('.container'),
            currentTime: document.getElementById('currentTime'),
            handleArea: document.getElementById('handleArea')
        };
        
        this.initializeEventListeners();
        this.loadSettings();
        this.updateDisplay();
        this.updateStats();
        this.initializeProgressRing();
        this.startCurrentTimeUpdate();
        
        // ハンドル領域の監視
        this.initializeHandleArea();
    }
    
    
    initializeHandleArea() {
        console.log('🔵 Initializing handle area...');
        console.log('🔵 Handle area element:', this.elements.handleArea);
        
        if (!this.elements.handleArea) {
            console.error('❌ Handle area element not found!');
            return;
        }
        
        let isDragging = false;
        let startMouseX, startMouseY;
        let startWindowX, startWindowY;
        let dragModeEnabled = false;
        let hoverCheckInterval = null;
        let dragModeTimeout = null;
        let transparencyCheckInterval = null;
        let isMouseInside = false;
        let windowMouseEnterHandler = null;
        let windowMouseLeaveHandler = null;
        
        // 透明度制御関数
        const updateTransparency = (state) => {
            // state: 'default' | 'transparent' | 'opaque'
            const container = document.querySelector('.container');
            
            // コンパクトモードでない場合は何もしない
            if (!container.classList.contains('compact-mode')) {
                return;
            }
            
            container.classList.remove('mouse-outside', 'mouse-inside');
            
            if (state === 'transparent') {
                console.log('🔷 Making transparent (mouse on window but not handle)');
                container.classList.add('mouse-outside');
            } else if (state === 'opaque') {
                console.log('🔶 Making opaque (mouse on handle or dragging)');
                container.classList.add('mouse-inside');
            } else {
                console.log('🔹 Default state (mouse outside window)');
                // デフォルトは不透明（CSSクラスなし）
            }
        };
        
        // 透明度チェック制御
        const startTransparencyCheck = () => {
            console.log('🔶 Starting transparency check (mouseenter/leave based)');
            
            // イベントリスナーを作成
            windowMouseEnterHandler = () => {
                console.log('🔶 Window mouseenter');
                updateTransparency('transparent');
            };
            
            windowMouseLeaveHandler = () => {
                console.log('🔷 Window mouseleave');
                updateTransparency('default');
            };
            
            // イベントリスナーを追加
            document.addEventListener('mouseenter', windowMouseEnterHandler);
            document.addEventListener('mouseleave', windowMouseLeaveHandler);
        };
        
        const stopTransparencyCheck = () => {
            console.log('🔷 Stopping transparency check');
            
            // イベントリスナーを削除
            if (windowMouseEnterHandler) {
                document.removeEventListener('mouseenter', windowMouseEnterHandler);
                windowMouseEnterHandler = null;
            }
            if (windowMouseLeaveHandler) {
                document.removeEventListener('mouseleave', windowMouseLeaveHandler);
                windowMouseLeaveHandler = null;
            }
            
            // 透明度クラスをクリア
            const container = document.querySelector('.container');
            container.classList.remove('mouse-outside', 'mouse-inside');
        };
        
        // ドラッグモード制御関数
        const enableDragMode = () => {
            if (!dragModeEnabled) {
                console.log('🟢 Enabling drag mode');
                dragModeEnabled = true;
                ipcRenderer.send('enable-drag-mode');
                
                // 3秒後に自動的にドラッグモードを無効化
                if (dragModeTimeout) clearTimeout(dragModeTimeout);
                dragModeTimeout = setTimeout(() => {
                    if (!isDragging) {
                        disableDragMode();
                    }
                }, 3000);
            }
        };
        
        const disableDragMode = () => {
            if (dragModeEnabled && !isDragging) {
                console.log('🔴 Disabling drag mode');
                dragModeEnabled = false;
                ipcRenderer.send('disable-drag-mode');
                if (dragModeTimeout) {
                    clearTimeout(dragModeTimeout);
                    dragModeTimeout = null;
                }
            }
        };
        
        // ホバーチェック制御
        const startHoverCheck = () => {
            if (hoverCheckInterval) return;
            
            console.log('🔵 Starting hover check');
            hoverCheckInterval = setInterval(() => {
                // 500ms間隔でドラッグモードを一瞬有効化してホバーチェック
                if (!dragModeEnabled && !isDragging) {
                    ipcRenderer.send('enable-drag-mode');
                    
                    // 50ms後にクリックスルーに戻す（ホバー中でない場合）
                    setTimeout(() => {
                        if (!dragModeEnabled && !isDragging) {
                            ipcRenderer.send('disable-drag-mode');
                        }
                    }, 50);
                }
            }, 500);
        };
        
        const stopHoverCheck = () => {
            if (hoverCheckInterval) {
                console.log('🔵 Stopping hover check');
                clearInterval(hoverCheckInterval);
                hoverCheckInterval = null;
            }
        };
        
        // ハンドル領域のホバー検知
        this.elements.handleArea.addEventListener('mouseenter', () => {
            console.log('🟡 Handle area hovered');
            enableDragMode();
            updateTransparency('opaque'); // ハンドル領域では常に不透明
        });
        
        this.elements.handleArea.addEventListener('mouseleave', () => {
            console.log('🟡 Handle area left');
            // ドラッグ中でなければドラッグモードを無効化
            if (!isDragging) {
                setTimeout(disableDragMode, 100);
            }
        });
        
        // ハンドル領域のドラッグ処理
        this.elements.handleArea.addEventListener('mousedown', (e) => {
            console.log('🔴 Handle area mousedown event fired!', e.button, e.clientX, e.clientY);
            console.log('🔴 Handle area element:', this.elements.handleArea);
            console.log('🔴 Event target:', e.target);
            
            if (e.button === 0) { // 左クリック
                isDragging = true;
                console.log('🔴 Starting drag operation');
                
                // ドラッグ中は不透明を維持
                updateTransparency('opaque');
                
                // 開始位置を記録
                startMouseX = e.screenX;
                startMouseY = e.screenY;
                console.log('🔴 Start mouse position:', startMouseX, startMouseY);
                
                // ウィンドウの開始位置を取得
                ipcRenderer.invoke('get-window-position').then(([windowX, windowY]) => {
                    startWindowX = windowX;
                    startWindowY = windowY;
                    console.log('🔴 Window start position:', windowX, windowY);
                });
                
                e.preventDefault();
                e.stopPropagation();
            }
        });
        
        // グローバルマウス移動イベント
        document.addEventListener('mousemove', (e) => {
            if (isDragging && startWindowX !== undefined) {
                const deltaX = e.screenX - startMouseX;
                const deltaY = e.screenY - startMouseY;
                
                const newX = startWindowX + deltaX;
                const newY = startWindowY + deltaY;
                
                console.log('🟡 Dragging window to:', newX, newY, 'delta:', deltaX, deltaY);
                ipcRenderer.send('set-window-position', newX, newY);
            }
        });
        
        // グローバルマウスアップイベント
        document.addEventListener('mouseup', (e) => {
            if (e.button === 0 && isDragging) {
                console.log('🟢 Drag ended');
                isDragging = false;
                startMouseX = undefined;
                startMouseY = undefined;
                startWindowX = undefined;
                startWindowY = undefined;
                
                // ドラッグ終了後、1秒後にドラッグモードを無効化
                setTimeout(() => {
                    disableDragMode();
                }, 1000);
            }
        });
        
        // ハンドル領域のダブルクリック処理
        this.elements.handleArea.addEventListener('dblclick', (e) => {
            console.log('🟣 Handle area double clicked - switching to normal mode');
            console.log('🟣 Event target:', e.target);
            this.toggleCompactMode();
            e.preventDefault();
            e.stopPropagation();
        });
        
        // タイマー円のダブルクリック処理（ノーマル→コンパクト）
        this.elements.timeCircle.addEventListener('dblclick', (e) => {
            const isCurrentlyCompact = document.querySelector('.container').classList.contains('compact-mode');
            
            if (!isCurrentlyCompact) {
                console.log('Timer circle double clicked - switching to compact mode');
                this.toggleCompactMode();
            }
            // コンパクトモード時はハンドル領域でのみ処理
        });
        
        // デバッグ：ハンドル領域の状態をチェック
        console.log('🔵 Handle area setup completed');
        console.log('🔵 Handle area computed style:', window.getComputedStyle(this.elements.handleArea));
        
        // コンパクトモード切り替え時の制御
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    // 非同期で処理して無限ループを防ぐ
                    setTimeout(() => {
                        const isCompact = document.querySelector('.container').classList.contains('compact-mode');
                        console.log('🔵 Mode changed - Compact:', isCompact);
                        
                        if (isCompact) {
                            console.log('🔵 Starting hover check for compact mode');
                            startHoverCheck();
                            startTransparencyCheck();
                            // 初期状態は不透明（マウスが外にあるため）
                            updateTransparency('default');
                        } else {
                            console.log('🔵 Stopping hover check for normal mode');
                            stopHoverCheck();
                            stopTransparencyCheck();
                            disableDragMode();
                            // ノーマルモードでは不透明（透明度クラスは既にクリア済み）
                        }
                    }, 0);
                }
            });
        });
        
        observer.observe(document.querySelector('.container'), {
            attributes: true,
            attributeFilter: ['class']
        });
        
        // 初期状態チェック
        const isInitiallyCompact = document.querySelector('.container').classList.contains('compact-mode');
        if (isInitiallyCompact) {
            console.log('🔵 Initial compact mode detected - starting systems');
            startHoverCheck();
            startTransparencyCheck();
            updateTransparency('default');
        } else {
            updateTransparency('opaque');
        }
    }
    
    
    initializeEventListeners() {
        this.elements.startBtn.addEventListener('click', () => this.startWithSync());
        this.elements.pauseBtn.addEventListener('click', () => this.pause());
        this.elements.resetBtn.addEventListener('click', () => this.reset());
        
        this.elements.workTimeInput.addEventListener('change', () => this.updateSettings());
        this.elements.breakTimeInput.addEventListener('change', () => this.updateSettings());
        this.elements.syncTimeInput.addEventListener('change', () => this.updateSettings());
        this.elements.enableSyncCheckbox.addEventListener('change', () => this.updateSettings());
        
        
        this.elements.closeBtn.addEventListener('click', () => {
            ipcRenderer.send('minimize-to-tray');
        });
        
    }
    
    startWithSync() {
        if (!this.isRunning || this.isPaused) {
            this.lockSettings();
            
            if (this.enableSync && !this.isPaused) {
                this.waitForSyncTime();
                return;
            }
        }
        this.start();
    }
    
    start() {
        if (!this.isRunning || this.isPaused) {
            this.lockSettings();
            
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
            
            this.startTime = Date.now();
            this.targetEndTime = this.startTime + (this.timeRemaining * 1000);
            
            this.timer = setInterval(() => {
                const now = Date.now();
                const elapsed = Math.floor((now - this.startTime) / 1000);
                this.timeRemaining = Math.max(0, Math.floor((this.targetEndTime - now) / 1000));
                
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
            
            // 自動開始タイマーもクリア
            if (this.autoStartTimeout) {
                clearTimeout(this.autoStartTimeout);
                this.autoStartTimeout = null;
            }
            
            this.elements.startBtn.disabled = false;
            this.elements.pauseBtn.disabled = true;
            this.elements.timeCircle.classList.remove('active');
        }
    }
    
    reset() {
        this.isRunning = false;
        this.isPaused = false;
        clearInterval(this.timer);
        
        // 同期待機タイマーもクリア
        if (this.waitTimer) {
            clearInterval(this.waitTimer);
            this.waitTimer = null;
        }
        
        // 自動開始タイマーもクリア
        if (this.autoStartTimeout) {
            clearTimeout(this.autoStartTimeout);
            this.autoStartTimeout = null;
        }
        
        // 常に作業セッションに戻す
        this.currentSession = 'work';
        this.setSessionTime();
        this.updateDisplay();
        
        // 統計をリセット
        this.completedPomodoros = 0;
        this.saveStats();
        this.updateStats();
        
        this.elements.startBtn.disabled = false;
        this.elements.pauseBtn.disabled = true;
        this.elements.timeCircle.classList.remove('active', 'break');
        
        this.unlockSettings();
    }
    
    completeSession() {
        this.isRunning = false;
        clearInterval(this.timer);
        
        this.elements.startBtn.disabled = false;
        this.elements.pauseBtn.disabled = true;
        this.elements.timeCircle.classList.remove('active');
        
        if (this.currentSession === 'work') {
            this.completedPomodoros++;
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
        
        // 次のセッションをすぐに開始
        this.start();
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
                this.elements.timerLabel.textContent = this.enableSync && !this.isRunning ? `作業時間 (${this.syncTime}分開始)` : '作業時間';
                break;
            case 'break':
                this.elements.timerLabel.textContent = this.enableSync && !this.isRunning ? `休憩時間 (${this.syncTime}分開始)` : '休憩時間';
                break;
        }
        
        this.updateProgressRing();
    }
    
    updateSettings() {
        this.workTime = parseInt(this.elements.workTimeInput.value) || 25;
        this.breakTime = parseInt(this.elements.breakTimeInput.value) || 5;
        this.syncTime = parseInt(this.elements.syncTimeInput.value) || 0;
        this.enableSync = this.elements.enableSyncCheckbox.checked;
        
        // リアルタイム同期が有効な場合は一時停止ボタンを無効化
        if (this.enableSync && this.isRunning) {
            this.elements.pauseBtn.disabled = true;
        } else if (!this.enableSync && this.isRunning) {
            this.elements.pauseBtn.disabled = false;
        }
        
        if (!this.isRunning) {
            this.setSessionTime();
            this.updateDisplay();
        }
        
        this.saveSettings();
    }
    
    updateStats() {
        this.elements.completedPomodorosSpan.textContent = this.completedPomodoros;
    }
    
    saveSettings() {
        const settings = {
            workTime: this.workTime,
            breakTime: this.breakTime,
            syncTime: this.syncTime,
            enableSync: this.enableSync
        };
        localStorage.setItem('pomodoroSettings', JSON.stringify(settings));
    }
    
    loadSettings() {
        const savedSettings = localStorage.getItem('pomodoroSettings');
        if (savedSettings) {
            const settings = JSON.parse(savedSettings);
            this.workTime = settings.workTime || 25;
            this.breakTime = settings.breakTime || 5;
            this.syncTime = settings.syncTime || 0;
            this.enableSync = settings.enableSync || false;
            
            this.elements.workTimeInput.value = this.workTime;
            this.elements.breakTimeInput.value = this.breakTime;
            this.elements.syncTimeInput.value = this.syncTime;
            this.elements.enableSyncCheckbox.checked = this.enableSync;
        }
        
        this.setSessionTime();
    }
    
    saveStats() {
        const today = new Date().toDateString();
        const stats = JSON.parse(localStorage.getItem('pomodoroStats') || '{}');
        
        if (!stats[today]) {
            stats[today] = {
                completedPomodoros: 0
            };
        }
        
        stats[today].completedPomodoros = this.completedPomodoros;
        
        localStorage.setItem('pomodoroStats', JSON.stringify(stats));
    }
    
    toggleCompactMode() {
        const currentlyCompact = this.elements.container.classList.contains('compact-mode');
        
        console.log('🔄 Toggling compact mode - currently compact:', currentlyCompact);
        
        // 非表示にする要素を取得
        const header = document.querySelector('.header');
        const controls = document.querySelector('.controls');
        const settings = document.querySelector('.settings');
        const stats = document.querySelector('.stats');
        const footer = document.querySelector('.footer');
        
        if (currentlyCompact) {
            console.log('🔄 Switching to normal mode');
            
            // 要素を表示
            if (header) header.style.display = '';
            if (controls) controls.style.display = '';
            if (settings) settings.style.display = '';
            if (stats) stats.style.display = '';
            if (footer) footer.style.display = '';
            
            // CSSクラスを削除
            this.elements.container.classList.remove('compact-mode');
            document.body.classList.remove('compact-mode');
            document.documentElement.classList.remove('compact-mode');
            this.isCompactMode = false;
            
            // ウィンドウサイズ変更とマウスイベント有効化
            ipcRenderer.send('set-compact-mode', false);
        } else {
            console.log('🔄 Switching to compact mode');
            
            // 要素を先に非表示
            if (header) header.style.display = 'none';
            if (controls) controls.style.display = 'none';
            if (settings) settings.style.display = 'none';
            if (stats) stats.style.display = 'none';
            if (footer) footer.style.display = 'none';
            
            // CSSクラスを追加
            this.elements.container.classList.add('compact-mode');
            document.body.classList.add('compact-mode');
            document.documentElement.classList.add('compact-mode');
            this.isCompactMode = true;
            
            // ウィンドウサイズを170x170に変更してクリックスルーを有効化
            ipcRenderer.send('set-compact-mode', true);
        }
        
        console.log('🔄 Toggle complete');
    }
    
    initializeProgressRing() {
        const radius = 54;
        const circumference = 2 * Math.PI * radius;
        this.elements.progressRing.style.strokeDasharray = circumference;
        this.elements.progressRing.style.strokeDashoffset = circumference;
    }
    
    updateProgressRing() {
        const radius = 54;
        const circumference = 2 * Math.PI * radius;
        
        let totalTime;
        switch (this.currentSession) {
            case 'work':
                totalTime = this.workTime * 60;
                break;
            case 'break':
                totalTime = this.breakTime * 60;
                break;
            default:
                totalTime = this.workTime * 60;
        }
        
        const progress = (totalTime - this.timeRemaining) / totalTime;
        const offset = circumference - (progress * circumference);
        
        this.elements.progressRing.style.strokeDashoffset = offset;
    }
    
    loadStats() {
        const today = new Date().toDateString();
        const stats = JSON.parse(localStorage.getItem('pomodoroStats') || '{}');
        
        if (stats[today]) {
            this.completedPomodoros = stats[today].completedPomodoros || 0;
        }
    }
    
    waitForSyncTime() {
        const now = new Date();
        const currentMinute = now.getMinutes();
        const currentSecond = now.getSeconds();
        
        let targetMinute = this.syncTime;
        let minutesUntilTarget;
        
        if (currentMinute < targetMinute) {
            minutesUntilTarget = targetMinute - currentMinute;
        } else {
            minutesUntilTarget = 60 - currentMinute + targetMinute;
        }
        
        const millisecondsUntilTarget = (minutesUntilTarget * 60 - currentSecond) * 1000 - now.getMilliseconds();
        
        this.elements.startBtn.disabled = true;
        this.elements.timerLabel.textContent = `${targetMinute}分まで待機中...`;
        this.elements.timeDisplay.textContent = `${Math.floor(millisecondsUntilTarget / 1000 / 60).toString().padStart(2, '0')}:${Math.floor((millisecondsUntilTarget / 1000) % 60).toString().padStart(2, '0')}`;
        
        this.waitTimer = setInterval(() => {
            const remaining = millisecondsUntilTarget - (Date.now() - now.getTime());
            if (remaining <= 0) {
                clearInterval(this.waitTimer);
                this.waitTimer = null;
                this.setSessionTime();
                this.updateDisplay();
                this.startTimer();
            } else {
                this.elements.timeDisplay.textContent = `${Math.floor(remaining / 1000 / 60).toString().padStart(2, '0')}:${Math.floor((remaining / 1000) % 60).toString().padStart(2, '0')}`;
            }
        }, 100);
    }
    
    startTimer() {
        this.isRunning = true;
        this.isPaused = false;
        
        this.elements.startBtn.disabled = true;
        this.elements.pauseBtn.disabled = this.enableSync;
        this.elements.timeCircle.classList.add('active');
        
        if (this.currentSession === 'work') {
            this.elements.timeCircle.classList.remove('break');
        } else if (this.currentSession === 'break') {
            this.elements.timeCircle.classList.add('break');
        }
        
        this.startTime = Date.now();
        this.targetEndTime = this.startTime + (this.timeRemaining * 1000);
        
        this.timer = setInterval(() => {
            const now = Date.now();
            const elapsed = Math.floor((now - this.startTime) / 1000);
            this.timeRemaining = Math.max(0, Math.floor((this.targetEndTime - now) / 1000));
            
            this.updateDisplay();
            
            if (this.timeRemaining <= 0) {
                this.completeSession();
            }
        }, 1000);
    }
    
    lockSettings() {
        this.elements.workTimeInput.disabled = true;
        this.elements.breakTimeInput.disabled = true;
        this.elements.syncTimeInput.disabled = true;
        this.elements.enableSyncCheckbox.disabled = true;
    }
    
    unlockSettings() {
        this.elements.workTimeInput.disabled = false;
        this.elements.breakTimeInput.disabled = false;
        this.elements.syncTimeInput.disabled = false;
        this.elements.enableSyncCheckbox.disabled = false;
    }
    
    startCurrentTimeUpdate() {
        this.updateCurrentTime();
        setInterval(() => {
            this.updateCurrentTime();
        }, 1000);
    }
    
    updateCurrentTime() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('ja-JP', { 
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        this.elements.currentTime.textContent = timeString;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const pomodoroTimer = new PomodoroTimer();
    pomodoroTimer.loadStats();
    pomodoroTimer.updateStats();
});