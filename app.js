document.addEventListener('DOMContentLoaded', () => {
    const unlockOverlay = document.getElementById('unlock-overlay');
    const unlockBtn = document.getElementById('unlock-btn');
    const fileInput = document.getElementById('file-input');
    const cueListEl = document.getElementById('cue-list');
    const btnGo = document.getElementById('btn-go');
    const btnPause = document.getElementById('btn-pause');
    const btnPanic = document.getElementById('btn-panic');
    
    const inspector = document.getElementById('inspector');
    const closeInspector = document.getElementById('close-inspector-btn');
    
    // Inspector inputs
    const nameIn = document.getElementById('cue-name-input');
    const volIn = document.getElementById('cue-vol-input');
    const volVal = document.getElementById('vol-val');
    const panIn = document.getElementById('cue-pan-input');
    const panVal = document.getElementById('pan-val');
    const fadeInIn = document.getElementById('cue-fadein-input');
    const fadeOutIn = document.getElementById('cue-fadeout-input');
    const loopIn = document.getElementById('cue-loop-input');
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

    // 1. Init Audio & Sortable
    unlockBtn.addEventListener('click', async () => {
        try {
            audio = new AudioEngine();
            await audio.unlock();
            unlockOverlay.classList.add('hidden');
            requestWakeLock();

            // Initialize Sortable setup for touch dragging
            new Sortable(cueListEl, {
                animation: 150,
                handle: '.drag-handle',
                ghostClass: 'sortable-ghost',
                onEnd: function (evt) {
                    const item = cues.splice(evt.oldIndex, 1)[0];
                    cues.splice(evt.newIndex, 0, item);
                    // No need to re-render, DOM is automatically updated by Sortable
                }
            });

        } catch (e) {
            alert('Failed to initialize audio: ' + e.message);
        }
    });

    let wakeLock = null;
    async function requestWakeLock() {
        if ('wakeLock' in navigator) {
            try {
                wakeLock = await navigator.wakeLock.request('screen');
            } catch (err) {}
        }
    }

    // 2. Add Cues (Input click triggered by label tag in HTML)
    const addSpan = document.querySelector('#add-cue-btn');
    fileInput.addEventListener('change', async (e) => {
        const originalText = addSpan.innerHTML;
        addSpan.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 讀取中';
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
                    fade_in: 0,
                    fade_out: 0,
                    loop: false,
                    isPlaying: false
                };
                cues.push(cue);
                if (!selectedCueId) selectCue(cue.id);
            } catch (err) {
                console.error('Decode error', err);
                alert(`無法解碼音檔: ${file.name}`);
            }
        }
        addSpan.innerHTML = originalText;
        fileInput.value = ''; 
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
            
            let badges = '';
            if (cue.loop) badges += ' | Loop';
            if (cue.fade_in > 0 || cue.fade_out > 0) badges += ' | Fade';

            li.innerHTML = `
                <div class="drag-handle"><i class="fas fa-bars"></i></div>
                <div class="cue-item-content">
                    <div class="cue-info">
                        <span class="cue-name">${cue.name}</span>
                        <span class="cue-meta">${formatTime(cue.duration)} | Vol: ${cue.volume}dB ${badges}</span>
                    </div>
                    <div class="cue-status">
                        ${cue.isPlaying ? '<i class="fas fa-volume-up"></i>' : '<i class="fas fa-ellipsis-v"></i>'}
                    </div>
                </div>
            `;
            
            // Allow clicking item content to select
            li.querySelector('.cue-item-content').addEventListener('click', () => {
                const wasSelected = selectedCueId === cue.id;
                selectCue(cue.id);
                if (wasSelected) {
                    openInspector();
                }
            });
            
            cueListEl.appendChild(li);
        });
    }

    function formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    // 4. Transport Global
    btnGo.addEventListener('click', () => {
        if (!selectedCueId) return;
        const index = cues.findIndex(c => c.id === selectedCueId);
        if (index === -1) return;
        
        const currentCue = cues[index];
        playCue(currentCue);
        
        if (currentCue.isPlaying && index < cues.length - 1) {
            selectCue(cues[index + 1].id);
        }
    });

    // Global Pause toggles AudioContext suspension via Web Audio API 
    let isPaused = false;
    btnPause.addEventListener('click', async () => {
        if (!audio) return;
        if (audio.ctx.state === 'running') {
            await audio.ctx.suspend();
            btnPause.style.backgroundColor = '#4CAF50';
            btnPause.innerHTML = 'RESUME <i class="fas fa-play"></i>';
            isPaused = true;
        } else if (audio.ctx.state === 'suspended') {
            await audio.ctx.resume();
            btnPause.style.backgroundColor = '#ff9800';
            btnPause.innerHTML = 'PAUSE <i class="fas fa-pause"></i>';
            isPaused = false;
        }
    });

    btnPanic.addEventListener('click', () => {
        playingCues.forEach(p => p.source.stop());
        playingCues.clear();
        cues.forEach(c => c.isPlaying = false);
        audio.stopAll();
        
        // ensure we exit pause state if panicked
        if (isPaused) {
            audio.ctx.resume();
            btnPause.style.backgroundColor = '#ff9800';
            btnPause.innerHTML = 'PAUSE <i class="fas fa-pause"></i>';
            isPaused = false;
        }
        
        renderCues();
    });

    function playCue(cue) {
        if (cue.isPlaying) {
            if (playingCues.has(cue.id)) {
                // If fading out, prevent abrupt stop unless they want it. We will just stop abruptly.
                playingCues.get(cue.id).source.stop();
                playingCues.delete(cue.id);
            }
            cue.isPlaying = false;
            renderCues();
            return;
        }

        const player = audio.createPlayer(cue.buffer, cue.volume, cue.pan);
        player.source.loop = cue.loop;
        
        const targetGain = audio.dbToGain(cue.volume);
        
        // Handle Fade In
        if (cue.fade_in > 0) {
            player.gainNode.gain.setValueAtTime(0, audio.ctx.currentTime);
            player.gainNode.gain.linearRampToValueAtTime(targetGain, audio.ctx.currentTime + cue.fade_in);
        } else {
            player.gainNode.gain.value = targetGain;
        }

        // Handle Fade Out
        if (cue.fade_out > 0 && !cue.loop) {
            const fadeOutStart = audio.ctx.currentTime + cue.duration - cue.fade_out;
            if (fadeOutStart > audio.ctx.currentTime) {
                // Keep target gain until the fade out starts
                player.gainNode.gain.setValueAtTime(targetGain, fadeOutStart);
                player.gainNode.gain.linearRampToValueAtTime(0, audio.ctx.currentTime + cue.duration);
            }
        }
        
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
        panVal.textContent = cue.pan === 0 ? 'C' : (cue.pan > 0 ? `R${cue.pan}` : `L${Math.abs(cue.pan)}`);
        
        fadeInIn.value = cue.fade_in || 0;
        fadeOutIn.value = cue.fade_out || 0;
        loopIn.checked = cue.loop || false;
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
        if (cue) { cue.name = e.target.value; renderCues(); }
    });

    volIn.addEventListener('input', (e) => {
        const val = e.target.value;
        volVal.textContent = val;
        const cue = cues.find(c => c.id === selectedCueId);
        if (cue) {
            cue.volume = parseFloat(val);
            if (playingCues.has(cue.id)) {
                // adjust dynamically, avoid resetting scheduled ramps if possible but simple app setting value directly
                playingCues.get(cue.id).gainNode.gain.setValueAtTime(audio.dbToGain(cue.volume), audio.ctx.currentTime);
            }
            renderCues();
        }
    });

    panIn.addEventListener('input', (e) => {
        const val = e.target.value;
        panVal.textContent = val == 0 ? 'C' : (val > 0 ? `R${val}` : `L${Math.abs(val)}`);
        const cue = cues.find(c => c.id === selectedCueId);
        if (cue) {
            cue.pan = parseFloat(val);
            if (playingCues.has(cue.id) && playingCues.get(cue.id).panNode) {
                playingCues.get(cue.id).panNode.pan.value = cue.pan;
            }
        }
    });

    fadeInIn.addEventListener('input', (e) => {
        const cue = cues.find(c => c.id === selectedCueId);
        if (cue) {
            cue.fade_in = parseFloat(e.target.value) || 0;
            renderCues();
        }
    });

    fadeOutIn.addEventListener('input', (e) => {
        const cue = cues.find(c => c.id === selectedCueId);
        if (cue) {
            cue.fade_out = parseFloat(e.target.value) || 0;
            renderCues();
        }
    });

    loopIn.addEventListener('change', (e) => {
        const cue = cues.find(c => c.id === selectedCueId);
        if (cue) {
            cue.loop = e.target.checked;
            if (playingCues.has(cue.id)) {
                playingCues.get(cue.id).source.loop = cue.loop;
            }
            renderCues();
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

    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') return;
        if (e.code === 'Space') {
            e.preventDefault();
            btnGo.click();
        } else if (e.code === 'Escape') {
            btnPanic.click();
        }
    });
    
    renderCues();
});
