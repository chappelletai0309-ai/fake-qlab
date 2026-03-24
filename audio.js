class AudioEngine {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination);
    }

    async unlock() {
        if (this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }
        // Play silent buffer for iOS to fully unlock
        const buffer = this.ctx.createBuffer(1, 1, 22050);
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(this.ctx.destination);
        source.start(0);
    }

    async decodeAudio(file) {
        const arrayBuffer = await file.arrayBuffer();
        return await this.ctx.decodeAudioData(arrayBuffer);
    }

    createPlayer(buffer, volumeDb = 0, pan = 0) {
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        
        const panNode = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
        if (panNode) panNode.pan.value = pan;

        const gainNode = this.ctx.createGain();
        gainNode.gain.value = this.dbToGain(volumeDb);

        // Routing
        if (panNode) {
            source.connect(panNode).connect(gainNode).connect(this.masterGain);
        } else {
            source.connect(gainNode).connect(this.masterGain);
        }

        return { source, gainNode, panNode };
    }

    dbToGain(db) {
        return Math.pow(10, db / 20);
    }

    stopAll() {
        // Disconnect master securely prevents all sound immediately
        this.masterGain.disconnect();
        // Recreate master gain for future cues
        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination);
    }
}
