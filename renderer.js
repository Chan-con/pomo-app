const { ipcRenderer } = require('electron');

class PomodoroTimer {
    constructor() {
        this.isRunning = false;
        this.isPaused = false;
        this.timeRemaining = 25 * 60;
        this.currentSession = 'work';
        this.completedPomodoros = 0;
        this.timer = null;
        this.realTimeTimer = null;
        this.sessionTransitionTimer = null;
        this.autoStartTimeout = null;
        this.isCompactMode = false;
        
        this.workTime = 25;
        this.breakTime = 5;
        this.syncTime = 0;
        this.enableSync = false;
        this.realTimeEndTime = null;
        this.isRealTimeSync = false;
        this.preparedForStart = false;
        
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
            handleArea: document.getElementById('handleArea')
        };
        
        this.initializeEventListeners();
        this.loadSettings();
        this.updateDisplay();
        this.updateStats();
        this.initializeProgressRing();
        
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
        let dragModeTimeout = null;
        
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
        
        // ホバーチェック削除（シンプル化）
        
        // ハンドル領域のホバー検知（ドラッグ機能のみ）
        this.elements.handleArea.addEventListener('mouseenter', () => {
            console.log('🟡 Handle area hovered');
            enableDragMode();
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
                            console.log('🔵 Compact mode enabled - simple design');
                        } else {
                            console.log('🔵 Normal mode enabled');
                            disableDragMode();
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
            console.log('🔵 Initial compact mode detected - simple design');
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
            
            // 通常のタイマー開始時はリアルタイム同期状態をリセット
            if (!this.enableSync || this.isPaused) {
                this.isRealTimeSync = false;
                this.realTimeEndTime = null;
            }
            
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
            
            // リアルタイム同期タイマーもクリア
            if (this.realTimeTimer) {
                clearTimeout(this.realTimeTimer);
                this.realTimeTimer = null;
            }
            
            // セッション切り替えタイマーもクリア
            if (this.sessionTransitionTimer) {
                clearTimeout(this.sessionTransitionTimer);
                this.sessionTransitionTimer = null;
            }
            
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
        
        // リアルタイム同期タイマーもクリア
        if (this.realTimeTimer) {
            clearTimeout(this.realTimeTimer);
            this.realTimeTimer = null;
        }
        
        // セッション切り替えタイマーもクリア
        if (this.sessionTransitionTimer) {
            clearTimeout(this.sessionTransitionTimer);
            this.sessionTransitionTimer = null;
        }
        
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
        
        // リアルタイム同期タイマーもクリア
        if (this.realTimeTimer) {
            clearTimeout(this.realTimeTimer);
            this.realTimeTimer = null;
        }
        
        // セッション切り替えタイマーもクリア
        if (this.sessionTransitionTimer) {
            clearTimeout(this.sessionTransitionTimer);
            this.sessionTransitionTimer = null;
        }
        
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
        
        // リアルタイム同期モードの場合、次のセッションの終了時刻を計算
        if (this.isRealTimeSync && this.realTimeEndTime) {
            const nextSessionDuration = (this.currentSession === 'work' ? this.workTime : this.breakTime) * 60 * 1000;
            
            // 現在のセッション終了時刻を基準にして次のセッション終了時刻を計算
            // 秒とミリ秒の調整は行わず、正確な時刻計算を維持
            this.realTimeEndTime = new Date(this.realTimeEndTime.getTime() + nextSessionDuration);
        }
        
        this.setSessionTime();
        this.updateDisplay();
        this.updateStats();
        
        // 次のセッション開始方法を分岐
        if (this.isRealTimeSync) {
            // リアルタイム同期モードでは分境界で開始
            this.waitForSessionTransition();
        } else {
            // 通常モードでは即座に開始
            this.start();
        }
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
        
        // 正確な分の0秒を計算
        const targetTime = new Date();
        targetTime.setMinutes(this.syncTime, 0, 0); // 秒とミリ秒を0に設定
        
        // 過去の時刻の場合は次の時間の同じ分に設定
        if (targetTime <= now) {
            targetTime.setHours(targetTime.getHours() + 1);
        }
        
        const millisecondsUntilTarget = targetTime.getTime() - now.getTime();
        
        // リアルタイム同期モードの場合、正確な分境界で終了時刻を計算
        this.isRealTimeSync = true;
        this.preparedForStart = false;
        const sessionDurationMs = this.timeRemaining * 1000;
        this.realTimeEndTime = new Date(targetTime.getTime() + sessionDurationMs);
        
        this.elements.startBtn.disabled = true;
        this.elements.timerLabel.textContent = `${this.syncTime}分まで待機中...`;
        
        // 待機カウントダウンもリアルタイム同期で更新
        const updateWaitingDisplay = () => {
            const now = Date.now();
            const remaining = targetTime.getTime() - now;
            
            if (remaining <= 0) {
                // 準備して開始
                this.setSessionTime();
                this.updateDisplay();
                this.targetEndTime = this.realTimeEndTime.getTime();
                this.startRealTimeTimer();
                return;
            }
            
            // Math.ceilで正確な秒表示
            const remainingSec = Math.ceil(remaining / 1000);
            const m = Math.floor(remainingSec / 60);
            const s = remainingSec % 60;
            this.elements.timeDisplay.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
            
            // 次の秒境界まで待機
            const delay = 1000 - (now % 1000);
            this.waitTimer = setTimeout(() => updateWaitingDisplay(), delay);
        };
        
        updateWaitingDisplay();
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
        
        // リアルタイム同期モードの場合は事前計算した終了時刻を使用
        if (this.isRealTimeSync && this.realTimeEndTime) {
            this.targetEndTime = this.realTimeEndTime.getTime();
        } else {
            this.startTime = Date.now();
            this.targetEndTime = this.startTime + (this.timeRemaining * 1000);
        }
        
        // リアルタイム同期モードとそうでないモードで分岐
        if (this.isRealTimeSync && this.realTimeEndTime) {
            // リアルタイム同期モードでは秒境界に同期したタイマーを使用
            this.startRealTimeTimer();
        } else {
            // 通常モードでは従来のsetIntervalを使用
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
    
    calculateRealTimeRemaining(targetEndTime, now) {
        const diffMs = targetEndTime - now;
        return Math.max(0, Math.ceil(diffMs / 1000));
    }
    
    startRealTimeTimer() {
        const updateTimer = () => {
            const now = Date.now();
            this.timeRemaining = this.calculateRealTimeRemaining(this.targetEndTime, now);
            
            this.updateDisplay();
            
            if (this.timeRemaining <= 0) {
                this.completeSessionAtExactTime();
                return;
            }
            
            // 次の更新はミリ秒単位で正確に次の秒境界まで
            const delay = 1000 - (now % 1000);
            this.realTimeTimer = setTimeout(() => updateTimer(), delay);
        };
        
        updateTimer();
    }
    
    completeSessionAtExactTime() {
        this.isRunning = false;
        clearTimeout(this.realTimeTimer);
        this.realTimeTimer = null;
        
        this.elements.startBtn.disabled = false;
        this.elements.pauseBtn.disabled = true;
        this.elements.timeCircle.classList.remove('active');
        
        // セッション切り替え
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
        
        // リアルタイム同期モードでは即座に次のセッションを開始
        if (this.isRealTimeSync) {
            this.startNextSessionAtCurrentTime();
        } else {
            this.start();
        }
    }
    
    startNextSessionAtCurrentTime() {
        // 現在時刻を基準に次のセッションの終了時刻を計算
        const now = Date.now();
        const sessionDuration = (this.currentSession === 'work' ? this.workTime : this.breakTime) * 60 * 1000;
        this.realTimeEndTime = new Date(now + sessionDuration);
        this.targetEndTime = this.realTimeEndTime.getTime();
        
        // 即座に次のセッションのタイマーを開始
        this.startRealTimeTimer();
    }
    
    waitForSessionTransition() {
        const now = new Date();
        const currentSeconds = now.getSeconds();
        
        if (currentSeconds === 0) {
            // すでに分の0秒なので即座に開始
            this.startSessionAtMinuteBoundary();
        } else {
            // 次の分の0秒まで待機
            const millisecondsToNextMinute = (60 - currentSeconds) * 1000 - now.getMilliseconds();
            
            this.sessionTransitionTimer = setTimeout(() => {
                this.startSessionAtMinuteBoundary();
            }, millisecondsToNextMinute);
        }
    }
    
    startSessionAtMinuteBoundary() {
        // 現在時刻を分の0秒に調整
        const now = new Date();
        now.setSeconds(0, 0);
        
        // 終了時刻を分境界基準で再計算
        const sessionDuration = (this.currentSession === 'work' ? this.workTime : this.breakTime) * 60 * 1000;
        this.realTimeEndTime = new Date(now.getTime() + sessionDuration);
        
        this.setSessionTime();
        this.updateDisplay();
        this.startTimer();
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
    
}

document.addEventListener('DOMContentLoaded', () => {
    const pomodoroTimer = new PomodoroTimer();
    pomodoroTimer.loadStats();
    pomodoroTimer.updateStats();
});