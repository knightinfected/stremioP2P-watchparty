/**
 * @name WatchParty v1.0.2 (Stable)
 * @description P2P Progress-Based Sync + Player API + Auto-Load WatchParty
 * @version 1.0.2
 * @author knightinfected
 */

console.log("[WatchParty] v1.0.2 Loaded!");

(function () {
    const BUTTON_ID = "watch-party-btn";
    const MODAL_ID = "watch-party-modal";
    const SYNC_INTERVAL = 2000; // 2s periodic sync
    const SEEK_DEBOUNCE = 1500; // Min gap between seeks
    const AUTOLOAD_TIMEOUT = 10000; // Max wait for video load (10s)

    let peer, connections = [], role = null, currentPartyId = null;
    let syncInterval;
    let syncEnabled = true;
    let strictMode = false;
    let lastSeekTime = 0;
    let pendingVideoLoad = false;
    let debugMode = false; // Set true for console logs

    /** Custom Player API */
    const CustomPlayerAPI = {
        get video() {
            return document.querySelector("video");
        },
        get ready() {
            return !!this.video && this.video.readyState >= 2;
        },
        get time() {
            return this.video ? this.video.currentTime : 0;
        },
        set time(value) {
            if (this.video) this.video.currentTime = value;
        },
        get duration() {
            return this.video ? this.video.duration : 0;
        },
        get paused() {
            return this.video ? this.video.paused : true;
        },
        set paused(value) {
            if (this.video) {
                if (value) this.video.pause();
                else this.video.play().catch(() => console.warn("Autoplay blocked"));
            }
        },
        get playbackSpeed() {
            return this.video ? this.video.playbackRate : 1.0;
        },
        set playbackSpeed(value) {
            if (this.video) this.video.playbackRate = value;
        }
    };

    /**  WatchParty API */
    window.WatchPartyAPI = {
        state: { progress: 0, paused: true, url: "", duration: 0 },
        listeners: {},

        init() {
            this.observeVideo();
        },

        observeVideo() {
            const video = CustomPlayerAPI.video;
            if (!video) return;
            ["play", "pause", "seeked", "timeupdate"].forEach(ev =>
                video.addEventListener(ev, throttle(() => this.updateState(video), 2000))
            );
            this.updateState(video);
        },

        updateState(video) {
            this.state = {
                progress: video.duration ? video.currentTime / video.duration : 0,
                paused: video.paused,
                url: window.location.href,
                duration: video.duration || 0
            };
            this.emit("stateChange", this.state);
            if (role === "host") sendSync(); // Debounced
        },

        setState(newState) {
            if (!syncEnabled) return;
            applyProgressSync(newState);
        },

        on(event, cb) {
            if (!this.listeners[event]) this.listeners[event] = [];
            this.listeners[event].push(cb);
        },

        emit(event, data) {
            (this.listeners[event] || []).forEach(cb => cb(data));
        },

        getState() {
            return this.state;
        },

        createParty() {
            role = "host";
            peer = new Peer();
            peer.on("open", (id) => {
                currentPartyId = id;
                updateModalUI("Waiting for guests...");
            });
            peer.on("connection", (conn) => {
                setupConnection(conn);
                updateModalUI(`Peers: ${connections.length}`);
            });

            if (syncInterval) clearInterval(syncInterval);
            syncInterval = setInterval(() => sendSync(), SYNC_INTERVAL);
        },

        joinParty(id) {
            role = "guest";
            peer = new Peer();
            peer.on("open", () => {
                const conn = peer.connect(id);
                conn.on("open", () => {
                    currentPartyId = id;
                    connections.push(conn);
                    updateModalUI("Connected to host");
                });
                setupConnection(conn);
            });
        },

        disconnect() {
            clearInterval(syncInterval);
            connections.forEach(c => c.close());
            connections = [];
            if (peer) peer.destroy();
            currentPartyId = null;
            updateModalUI("Disconnected");
        }
    };

    WatchPartyAPI.init();

    /**  Setup PeerJS Connection */
    function setupConnection(conn) {
        connections.push(conn);
        conn.on("data", (data) => handleIncoming(data));
        conn.on("close", () => {
            connections = connections.filter(c => c !== conn);
            updateModalUI("Peer disconnected");
        });
    }

    /**  Handle Incoming Sync Data */
    function handleIncoming(data) {
        if (data.type === "SYNC") {
            handleSync(data);
        }
    }

    /**  Auto-Load + Sync Handler */
    function handleSync(data) {
        if (window.location.href !== data.url) {
            showStatus("Loading host's video...");
            window.location.href = data.url; // Full navigation for reliability
            pendingVideoLoad = true;

            waitForPlayer(() => {
                pendingVideoLoad = false;
                applyProgressSync(data, true);
            }, AUTOLOAD_TIMEOUT);
            return;
        }
        if (!pendingVideoLoad) applyProgressSync(data);
    }

    /**  Progress-Based Sync Logic */
    function applyProgressSync(data, force = false) {
        if (!CustomPlayerAPI.ready || !data.duration) return;

        const hostProgress = data.progress;
        const guestProgress = CustomPlayerAPI.time / CustomPlayerAPI.duration;
        const drift = guestProgress - hostProgress;
        const absDrift = Math.abs(drift);

        if (debugMode) console.log(`[WatchParty] Host: ${(hostProgress * 100).toFixed(2)}% | Guest: ${(guestProgress * 100).toFixed(2)}% | Drift: ${(drift * 100).toFixed(2)}%`);

        const targetTime = hostProgress * CustomPlayerAPI.duration;
        const now = Date.now();

        if (force || absDrift > 0.05) { // >5% → Hard Seek
            if (now - lastSeekTime > SEEK_DEBOUNCE) {
                if (debugMode) console.log(`[WatchParty] Hard Seek → ${formatTime(targetTime)}`);
                CustomPlayerAPI.time = targetTime;
                lastSeekTime = now;
            }
            CustomPlayerAPI.playbackSpeed = 1.0;
        } else if (absDrift > 0.005) { // 0.5% → Speed Adjust
            const rate = drift < 0 ? 1.05 : 0.95;
            if (debugMode) console.log(`[WatchParty] Adjust Speed → ${rate}`);
            CustomPlayerAPI.playbackSpeed = rate;
            setTimeout(() => {
                if (CustomPlayerAPI.playbackSpeed !== 1.0) {
                    CustomPlayerAPI.playbackSpeed = 1.0;
                    if (debugMode) console.log("[WatchParty] Reset Speed");
                }
            }, 4000);
        }

        // Play/Pause Sync
        if (data.paused !== CustomPlayerAPI.paused) {
            CustomPlayerAPI.paused = data.paused;
        }
    }

    /**  Send Sync */
    function sendSync(force = false) {
        if (role !== "host" || !CustomPlayerAPI.ready) return;
        const payload = {
            type: "SYNC",
            progress: CustomPlayerAPI.duration ? CustomPlayerAPI.time / CustomPlayerAPI.duration : 0,
            paused: CustomPlayerAPI.paused,
            url: window.location.href,
            duration: CustomPlayerAPI.duration || 0,
            force
        };
        connections.forEach(c => c.open && c.send(payload));
    }

    /**  Utility */
    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    function showStatus(msg) {
        const el = document.getElementById("status-msg");
        if (el) el.textContent = msg;
    }

    function waitForPlayer(callback, timeout = 10000) {
        const start = Date.now();
        const check = setInterval(() => {
            if (CustomPlayerAPI.ready) {
                clearInterval(check);
                callback();
            } else if (Date.now() - start > timeout) {
                clearInterval(check);
                showStatus("Failed to load video. Please try again.");
            }
        }, 400);
    }

    /**  UI Button Injection */
    function injectButton() {
        if (document.getElementById(BUTTON_ID)) return;

        const navBar = document.querySelector('nav[class*="horizontal-nav-bar"]');
        if (!navBar) return;

        const buttonContainer = navBar.querySelector('div[class*="buttons-container"]');
        if (!buttonContainer) return;

        const btn = document.createElement("div");
        btn.id = BUTTON_ID;
        btn.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 36px;
            cursor: pointer;
            border-radius: 50%;
            transition: background 0.2s ease;
        `;
        btn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="white" viewBox="0 0 24 24">
                <path d="M12 5v14l9-7-9-7z"/>
            </svg>
        `;

        btn.addEventListener('click', openModal);
        btn.addEventListener('mouseenter', () => btn.style.background = "rgba(255,255,255,0.15)");
        btn.addEventListener('mouseleave', () => btn.style.background = "transparent");

        buttonContainer.appendChild(btn);
    }
    setInterval(injectButton, 1500);

    /**  Modal UI */
    function openModal() {
        let modal = document.getElementById(MODAL_ID);
        if (!modal) {
            modal = document.createElement("div");
            modal.id = MODAL_ID;
            modal.style.cssText = `
                position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
                background:#1e1e2f;color:white;padding:20px;border-radius:10px;
                width:360px;z-index:9999;text-align:center;box-shadow:0 0 15px rgba(0,0,0,0.5);
            `;
            modal.innerHTML = `
                <h3>🎉 Watch Party</h3>
                <div id="party-controls">
                    <button id="create-party" style="width:100%;margin-bottom:10px;padding:10px;background:#6c5ce7;border:none;color:#fff;border-radius:6px;">Create Party</button>
                    <input id="join-code" type="text" placeholder="Enter Party ID" style="width:100%;padding:10px;margin-bottom:10px;border-radius:6px;border:none;background:#2d2d3d;color:#fff;">
                    <button id="join-party" style="width:100%;padding:10px;background:#00b894;border:none;color:#fff;border-radius:6px;">Join Party</button>
                    <label style="display:block;margin-top:10px;">
                        <input type="checkbox" id="sync-toggle" checked> Sync Enabled
                    </label>
                    <label style="display:block;margin-top:5px;">
                        <input type="checkbox" id="strict-toggle"> Strict Host Control
                    </label>
                </div>
                <div id="session-info" style="margin-top:15px;font-size:13px;color:#ccc;">No active session.</div>
                <div id="extra-controls" style="margin-top:10px;"></div>
                <div id="status-msg" style="margin-top:10px;color:#f1c40f;font-size:12px;"></div>
                <button id="close-modal" style="width:100%;margin-top:10px;padding:10px;background:#636e72;border:none;color:#fff;border-radius:6px;">Close</button>
            `;
            document.body.appendChild(modal);

            document.getElementById("close-modal").onclick = () => modal.style.display = "none";
            document.getElementById("create-party").onclick = () => ensurePeerJS(() => WatchPartyAPI.createParty());
            document.getElementById("join-party").onclick = () => {
                const id = document.getElementById("join-code").value.trim();
                if (id) ensurePeerJS(() => WatchPartyAPI.joinParty(id));
            };
            document.getElementById("sync-toggle").onchange = (e) => syncEnabled = e.target.checked;
            document.getElementById("strict-toggle").onchange = (e) => strictMode = e.target.checked;

            const joinBox = document.getElementById("join-code");
            joinBox.addEventListener("contextmenu", (e) => {
                e.preventDefault();
                navigator.clipboard.readText().then(text => {
                    joinBox.value = text;
                });
            });
        } else {
            modal.style.display = "block";
        }
        updateModalUI();
    }

    function updateModalUI(status = null) {
        const sessionInfo = document.getElementById("session-info");
        const extraControls = document.getElementById("extra-controls");
        if (!sessionInfo || !extraControls) return;

        if (currentPartyId) {
            sessionInfo.innerHTML = `
                <div>Party ID: <b>${currentPartyId}</b></div>
                Role: <b style="color:${role === "host" ? "#6c5ce7" : "#00b894"};">${role}</b>
                <br>Status: ${status || "Connected"}
            `;

            let controlsHTML = `
                <button id="disconnect-party" style="width:100%;margin-bottom:10px;padding:10px;background:#d63031;border:none;color:#fff;border-radius:6px;">Disconnect</button>
            `;

            if (role === "host") {
                controlsHTML += `
                    <button id="force-sync" style="width:100%;margin-bottom:10px;padding:10px;background:#0984e3;border:none;color:#fff;border-radius:6px;">Force Sync</button>
                    <button id="copy-party-id" style="width:100%;padding:10px;background:#6c5ce7;border:none;color:#fff;border-radius:6px;">Copy Party ID</button>
                    <div id="copy-status" style="margin-top:5px;color:#00b894;font-size:11px;display:none;">Copied!</div>
                `;
            }

            extraControls.innerHTML = controlsHTML;

            document.getElementById("disconnect-party").onclick = () => WatchPartyAPI.disconnect();
            if (role === "host") {
                document.getElementById("force-sync").onclick = () => sendSync(true);
                document.getElementById("copy-party-id").onclick = () => {
                    navigator.clipboard.writeText(currentPartyId).then(() => {
                        document.getElementById("copy-status").style.display = "block";
                        setTimeout(() => document.getElementById("copy-status").style.display = "none", 1500);
                    });
                };
            }
        } else {
            sessionInfo.textContent = "No active session.";
            extraControls.innerHTML = "";
        }
    }

    function ensurePeerJS(callback) {
        if (window.Peer) callback();
        else {
            const script = document.createElement("script");
            script.src = "https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js";
            script.onload = callback;
            document.head.appendChild(script);
        }
    }

    /**  Helper: Throttle */
    function throttle(fn, limit) {
        let inThrottle;
        return function () {
            if (!inThrottle) {
                fn.apply(this, arguments);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
})();
