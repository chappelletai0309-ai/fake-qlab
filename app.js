document.addEventListener('DOMContentLoaded', () => {
    const unlockOverlay = document.getElementById('unlock-overlay');
    const unlockBtn = document.getElementById('unlock-btn');
    const fileInput = document.getElementById('file-input');
    const addCueBtn = document.getElementById('add-cue-btn');
    const cueListEl = document.getElementById('cue-list');
    const btnGo = document.getElementById('btn-go');
    const btnPanic = document.getElementById('btn-panic');
    const inspector = document.getElementById('inspector');
    const closeInspector = document.getElementById('close-inspector-btn');
    
    // Inspector inputs
    const nameIn = document.getElementById('cue-name-input');
    const volIn = document.getElementById('cue-vol-input');
    const volVal = document.getElementById('vol-val');
    const panIn = document.getElementById('cue-pan-input');
    const panVal = document.getElementById('pan-val');
    const delBtn = document.getElementById('delete-cue-btn');

    let audio;
    let cues = [];
    let selectedCueId = null;
    let playingCues = new Map();
    
    // Prevent default scroll bounce on mobile, except in scrollable areas
    document.addEventListener('touchmove', function(e) {
        if (!e.target.closest('.cue-list-container') && !e.target.closest('.inspector-body')) {
            e.preventDefault();
        }
    }, { passive: false });

    // 1. Init Audio
    unlockBtn.addEventListener('click', async () => {
        try {
            audio = new AudioEngine();
            await audio.unlock();
            unlockOverlay.classList.add('hidden');
            requestWakeLock();
        } catch (e) {
            alert('Failed to initialize audio: ' + e.message);
        }
    });

    let wakeLock = null;
    async function requestWakeLock() {
        if ('wakeLock' in navigator) {
            try {
                wakeLock = await navigator.wakeLock.request('screen');
            } catch (err) {
                console.log('Wake Lock request failed', err);
            }
        }
    }

    // 2. Add Cues
    addCueBtn.addEventListener('click', () => fileInput.click());
    
    fileInput.addEventListener('change', async (e) => {
        addCueBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 讀取中';
        const files = Array.from(e.target.files);
        for (const file of files) {
            try {
                const buffer = await audio.decodeAudio(file);
                const cue = {
                    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                    name: file.name.replace(/\.[^/.]+$/, ""),
                    buffer,
                    duration: buffer.duration,
                    volume: 0,
                    pan: 0,
                    isPlaying: false
                };
                cues.push(cue);
                if (!selectedCueId) selectCue(cue.id);
            } catch (err) {
                console.error('Decode error', err);
                alert(`Cannot decode file: ${file.name}`);
            }
        }
        addCueBtn.innerHTML = '<i class="fas fa-plus"></i> 新增音檔';
        fileInput.value = ''; // clear
        renderCues();
    });

    // 3. Render list
    function renderCues() {
        cueListEl.innerHTML = '';
        if (cues.length === 0) {
            cueListEl.innerHTML = '<li style="text-align:center;color:#666;padding:20px;">載入音檔以開始</li>';
            return;
        }

        cues.forEach((cue) => {
            const li = document.createElement('li');
            li.className = `cue-item ${selectedCueId === cue.id ? 'selected' : ''} ${cue.isPlaying ? 'playing' : ''}`;
            li.innerHTML = `
                <div class="cue-info">
                    <span class="cue-name">${cue.name}</span>
                    <span class="cue-meta">${formatTime(cue.duration)} | Vol: ${cue.volume}dB</span>
                </div>
                <div class="cue-status">
                    ${cue.isPlaying ? '<i class="fas fa-volume-up"></i>' : '<i class="fas fa-ellipsis-v"></i>'}
                </div>
            `;
            li.addEventListener('click', () => {
                const wasSelected = selectedCueId === cue.id;
                selectCue(cue.id);
                if (wasSelected) {
                    openInspector(); // Open only on double tap or if already selected
                } else {
                    // Just select first
                }
            });
            // Long press for inspector
            let pressTimer;
            li.addEventListener('touchstart', () => {
                pressTimer = setTimeout(() => {
                    selectCue(cue.id);
                    openInspector();
                }, 500);
            });
            li.addEventListener('touchend', () => clearTimeout(pressTimer));
            li.addEventListener('touchmove', () => clearTimeout(pressTimer));

            cueListEl.appendChild(li);
        });
    }

    function formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    // 4. Transport
    btnGo.addEventListener('click', () => {
        if (!selectedCueId) return;
        const index = cues.findIndex(c => c.id === selectedCueId);
        if (index === -1) return;
        
        // Find cue and play
        const currentCue = cues[index];
        playCue(currentCue);
        
        // Auto select next if not playing (only shift selection on fresh GO trigger)
        if (currentCue.isPlaying && index < cues.length - 1) {
            selectCue(cues[index + 1].id);
        }
    });

    btnPanic.addEventListener('click', () => {
        playingCues.forEach(p => p.source.stop());
        playingCues.clear();
        cues.forEach(c => c.isPlaying = false);
        audio.stopAll();
        renderCues();
    });

    function playCue(cue) {
        if (cue.isPlaying) {
            // Stop if already playing
            if (playingCues.has(cue.id)) {
                playingCues.get(cue.id).source.stop();
                playingCues.delete(cue.id);
            }
            cue.isPlaying = false;
            renderCues();
            return;
        }

        const player = audio.createPlayer(cue.buffer, cue.volume, cue.pan);
        player.source.start(0);
        
        cue.isPlaying = true;
        playingCues.set(cue.id, { source: player.source, gainNode: player.gainNode, panNode: player.panNode });
        
        player.source.onended = () => {
            cue.isPlaying = false;
            playingCues.delete(cue.id);
            renderCues();
        };
        renderCues();
    }

    // 5. Inspector & Selection
    function selectCue(id) {
        selectedCueId = id;
        renderCues();
        updateInspector();
    }

    function updateInspector() {
        if (!selectedCueId) {
            inspector.classList.add('slide-down');
            return;
        }
        const cue = cues.find(c => c.id === selectedCueId);
        if (!cue) return;
        nameIn.value = cue.name;
        volIn.value = cue.volume;
        volVal.textContent = cue.volume;
        panIn.value = cue.pan;
        panVal.textContent = cue.pan === 0 ? 'C' : (cue.pan > 0 ? \`R\${cue.pan}\` : \`L\${Math.abs(cue.pan)}\`);
    }

    function openInspector() {
        if (!selectedCueId) return;
        inspector.classList.remove('slide-down');
    }

    closeInspector.addEventListener('click', () => {
        inspector.classList.add('slide-down');
    });

    // Inspector Events
    nameIn.addEventListener('input', (e) => {
        const cue = cues.find(c => c.id === selectedCueId);
        if (cue) {
            cue.name = e.target.value;
            renderCues(); // Re-render to show new name
        }
    });

    volIn.addEventListener('input', (e) => {
        const val = e.target.value;
        volVal.textContent = val;
        const cue = cues.find(c => c.id === selectedCueId);
        if (cue) {
            cue.volume = parseFloat(val);
            if (playingCues.has(cue.id)) {
                playingCues.get(cue.id).gainNode.gain.value = audio.dbToGain(cue.volume);
            }
            renderCues();
        }
    });

    panIn.addEventListener('input', (e) => {
        const val = e.target.value;
        panVal.textContent = val == 0 ? 'C' : (val > 0 ? \`R\${val}\` : \`L\${Math.abs(val)}\`);
        const cue = cues.find(c => c.id === selectedCueId);
        if (cue) {
            cue.pan = parseFloat(val);
            if (playingCues.has(cue.id) && playingCues.get(cue.id).panNode) {
                playingCues.get(cue.id).panNode.pan.value = cue.pan;
            }
        }
    });

    delBtn.addEventListener('click', () => {
        if (!selectedCueId) return;
        
        if (playingCues.has(selectedCueId)) {
            playingCues.get(selectedCueId).source.stop();
            playingCues.delete(selectedCueId);
        }

        cues = cues.filter(c => c.id !== selectedCueId);
        selectedCueId = cues.length > 0 ? cues[0].id : null;
        
        inspector.classList.add('slide-down');
        renderCues();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') return;
        if (e.code === 'Space') {
            e.preventDefault();
            btnGo.click();
        } else if (e.code === 'Escape') {
            btnPanic.click();
        }
    });
    
    // Initial Render
    renderCues();
});
