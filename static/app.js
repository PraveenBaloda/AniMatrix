// State variables
let activeSceneId = null;
let activeScenePrompt = "Manual Edit";
let scenesHistory = [];
let stitchQueue = [];

// DOM Elements
const promptInput = document.getElementById('prompt-input');
const btnGenerate = document.getElementById('btn-generate');
const btnRefreshHistory = document.getElementById('btn-refresh-history');
const scenesList = document.getElementById('scenes-list');
const btnRender = document.getElementById('btn-render');
const btnDownloadCode = document.getElementById('btn-download-code');
const btnDownloadVideo = document.getElementById('btn-download-video');
const activeSceneName = document.getElementById('active-scene-name');
const videoPlayer = document.getElementById('video-player');
const videoSource = document.getElementById('video-source');
const videoPlaceholder = document.getElementById('video-placeholder');
const renderLoadingOverlay = document.getElementById('render-loading-overlay');
const terminalBody = document.getElementById('terminal-body');
const btnClearConsole = document.getElementById('btn-clear-console');
const terminalActionBar = document.getElementById('terminal-action-bar');
const btnAutoFix = document.getElementById('btn-auto-fix');
const timelineSlots = document.getElementById('timeline-slots');
const btnStitch = document.getElementById('btn-stitch');

// Console Terminal Log Helper
function appendLog(message, type = 'info') {
    const line = document.createElement('div');
    line.className = `terminal-line ${type}`;
    // Format timestamp
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    line.textContent = `[${timeStr}] ${message}`;
    terminalBody.appendChild(line);
    terminalBody.scrollTop = terminalBody.scrollHeight;
}

function clearLogs() {
    terminalBody.innerHTML = '';
    appendLog('Console cleared.', 'system');
    terminalActionBar.classList.add('hidden');
}

// Initialize Monaco Editor
appendLog('Loading Monaco editor...', 'system');
require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.39.0/min/vs' } });
require(['vs/editor/editor.main'], function () {
    window.editor = monaco.editor.create(document.getElementById('editor-container'), {
        value: `# Welcome to AniMatrix!
#
# Enter an animation prompt on the left to generate a scene,
# or write your own Manim python script here.
#
# Click "Render Code" to compile.

from manim import *

class Introduction(Scene):
    def construct(self):
        # Create a beautiful title
        title = Text("Welcome to AniMatrix", font_size=40)
        subtitle = Text("AI Animation System", font_size=24)
        subtitle.next_to(title, DOWN)
        
        # Position them
        group = VGroup(title, subtitle)
        group.center()
        
        # Animate
        self.play(Write(title))
        self.play(FadeIn(subtitle, shift=UP))
        self.wait(2)
`,
        language: 'python',
        theme: 'vs-dark',
        automaticLayout: true,
        fontSize: 14,
        minimap: { enabled: false }
    });
    
    btnRender.disabled = false;
    btnDownloadCode.disabled = false;
    appendLog('Monaco Editor loaded successfully.', 'success');
});

// Fetch History from API
async function fetchHistory() {
    try {
        const response = await fetch('/api/history');
        if (!response.ok) throw new Error('Failed to load history');
        scenesHistory = await response.json();
        renderHistoryList();
    } catch (error) {
        appendLog(`Error fetching repository history: ${error.message}`, 'error');
    }
}

// Render History Scenes list in UI
function renderHistoryList() {
    if (scenesHistory.length === 0) {
        scenesList.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-video-slash"></i>
                <p>No scenes generated yet.</p>
            </div>
        `;
        return;
    }

    scenesList.innerHTML = '';
    scenesHistory.forEach(scene => {
        const card = document.createElement('div');
        card.className = `scene-card ${scene.scene_id === activeSceneId ? 'active' : ''}`;
        
        const isChecked = stitchQueue.includes(scene.scene_id) ? 'checked' : '';
        const stitchCheckboxHTML = scene.is_stitched 
            ? '' 
            : `<input type="checkbox" class="scene-checkbox" data-id="${scene.scene_id}" ${isChecked} title="Select for stitching">`;
        
        card.innerHTML = `
            <div class="scene-card-header">
                <span class="scene-title" title="${scene.scene_id}">${scene.is_stitched ? '🎬 ' : '📹 '}${scene.scene_id}</span>
                ${stitchCheckboxHTML}
            </div>
            <p class="scene-prompt">${scene.prompt || 'No description'}</p>
            <div class="scene-card-footer">
                <span>${scene.timestamp}</span>
                <div class="scene-card-actions">
                    <button class="btn-card btn-load" data-id="${scene.scene_id}">
                        <i class="fa-solid fa-code"></i> Load
                    </button>
                </div>
            </div>
        `;
        
        // Add event listener to load
        card.querySelector('.btn-load').addEventListener('click', () => loadScene(scene.scene_id));
        
        // Add event listener to checkbox
        const checkbox = card.querySelector('.scene-checkbox');
        if (checkbox) {
            checkbox.addEventListener('change', (e) => {
                const id = e.target.getAttribute('data-id');
                if (e.target.checked) {
                    addToStitchQueue(id);
                } else {
                    removeFromStitchQueue(id);
                }
            });
        }
        
        scenesList.appendChild(card);
    });
}

// Load a specific scene into Editor and Video Player
function loadScene(sceneId) {
    const scene = scenesHistory.find(s => s.scene_id === sceneId);
    if (!scene) return;
    
    activeSceneId = scene.scene_id;
    activeScenePrompt = scene.prompt || "Manual Edit";
    
    activeSceneName.textContent = `${scene.scene_id}.py`;
    
    if (window.editor) {
        window.editor.setValue(scene.code);
    }
    
    // Highlight the card
    document.querySelectorAll('.scene-card').forEach(card => card.classList.remove('active'));
    renderHistoryList();
    
    // Load Video
    playVideo(scene.video_url);
    
    appendLog(`Loaded scene: ${scene.scene_id}`, 'info');
    terminalActionBar.classList.add('hidden');
}

// Play Video in Preview Player
function playVideo(url) {
    if (!url) return;
    
    videoPlaceholder.classList.add('hidden');
    videoPlayer.classList.remove('hidden');
    
    videoSource.src = url;
    videoPlayer.load();
    videoPlayer.play().catch(e => console.log("Video auto-play blocked or failed", e));
    
    // Enable Download video
    btnDownloadVideo.removeAttribute('disabled');
    btnDownloadVideo.href = url;
}

// Add scene to stitching queue
function addToStitchQueue(sceneId) {
    if (!stitchQueue.includes(sceneId)) {
        stitchQueue.push(sceneId);
        updateTimelineUI();
    }
}

// Remove scene from stitching queue
function removeFromStitchQueue(sceneId) {
    stitchQueue = stitchQueue.filter(id => id !== sceneId);
    updateTimelineUI();
    // Uncheck corresponding checkbox in UI
    const checkbox = document.querySelector(`.scene-checkbox[data-id="${sceneId}"]`);
    if (checkbox) checkbox.checked = false;
}

// Update Timeline layout
function updateTimelineUI() {
    if (stitchQueue.length === 0) {
        timelineSlots.innerHTML = '<div class="empty-timeline">Select clips below to queue...</div>';
        btnStitch.disabled = true;
        return;
    }
    
    timelineSlots.innerHTML = '';
    stitchQueue.forEach((sceneId, index) => {
        const item = document.createElement('div');
        item.className = 'timeline-item';
        item.innerHTML = `
            <span><strong>${index + 1}.</strong> ${sceneId}</span>
            <button data-id="${sceneId}"><i class="fa-solid fa-xmark"></i></button>
        `;
        item.querySelector('button').addEventListener('click', () => removeFromStitchQueue(sceneId));
        timelineSlots.appendChild(item);
    });
    
    btnStitch.disabled = stitchQueue.length < 2;
}

// Generate Manim Python code using LLM
async function generateScene() {
    const prompt = promptInput.value.trim();
    if (!prompt) {
        appendLog('Please write a prompt describing the animation.', 'warning');
        return;
    }
    
    setGeneratingState(true);
    clearLogs();
    appendLog(`Generating Manim script code for prompt: "${prompt}"...`, 'info');
    
    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: prompt })
        });
        
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.detail || 'Code generation failed');
        }
        
        const data = await response.json();
        const generatedCode = data.code;
        
        appendLog('Python code successfully generated. Loading into workspace...', 'success');
        
        if (window.editor) {
            window.editor.setValue(generatedCode);
        }
        
        activeSceneId = null; // Mark as fresh unsaved scene (will trigger new scene timestamp on render)
        activeScenePrompt = prompt;
        activeSceneName.textContent = 'unsaved_scene.py';
        
        // Auto compile the generated code
        await renderCode(generatedCode, prompt);
        
    } catch (error) {
        appendLog(`Generation failed: ${error.message}`, 'error');
        setGeneratingState(false);
    }
}

// Render Manim script into MP4
async function renderCode(code, promptText) {
    setLoadingOverlay(true, 'Rendering Manim Scene...');
    appendLog('Sending code to compiler. Running Manim backend engine...', 'info');
    
    try {
        const response = await fetch('/api/render', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code: code,
                prompt: promptText,
                scene_id: activeSceneId
            })
        });
        
        if (!response.ok) {
            throw new Error('API server returned a render error');
        }
        
        const result = await response.json();
        
        // Log compilation terminal outputs
        appendLog('Compilation Output received.', 'info');
        if (result.log) {
            // Trim logs to display nicely
            const lines = result.log.split('\n');
            lines.forEach(line => {
                if (line.includes('WARNING') || line.includes('warning')) {
                    appendLog(line, 'warning');
                } else if (line.includes('ERROR') || line.includes('traceback') || line.includes('Traceback')) {
                    appendLog(line, 'error');
                } else if (line.trim()) {
                    appendLog(line, 'system');
                }
            });
        }
        
        if (result.success) {
            appendLog(`Successfully rendered! Scene saved as ${result.scene_id}`, 'success');
            activeSceneId = result.scene_id;
            activeSceneName.textContent = `${result.scene_id}.py`;
            
            // Reload repository history list
            await fetchHistory();
            
            // Play resulting video
            playVideo(result.video_url);
            terminalActionBar.classList.add('hidden');
        } else {
            appendLog(`Rendering failed: ${result.error || 'Check compiler logs.'}`, 'error');
            // Show auto fix panel
            terminalActionBar.classList.remove('hidden');
        }
        
    } catch (error) {
        appendLog(`Compiler request error: ${error.message}`, 'error');
    } finally {
        setLoadingOverlay(false);
        setGeneratingState(false);
    }
}

// Auto Fix with LLM using compiler log/stderr
async function autoFixWithAI() {
    const code = window.editor ? window.editor.getValue() : '';
    const logs = terminalBody.innerText;
    
    if (!code) {
        appendLog('No code to fix in the workspace.', 'warning');
        return;
    }
    
    setLoadingOverlay(true, 'AI Repairing Code...');
    appendLog('Sending code and error logs to Gemini for healing...', 'info');
    terminalActionBar.classList.add('hidden');
    
    try {
        const response = await fetch('/api/fix', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: activeScenePrompt,
                code: code,
                error: logs
            })
        });
        
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.detail || 'Repair request failed');
        }
        
        const data = await response.json();
        const fixedCode = data.code;
        
        appendLog('AI successfully healed the code! Updating workspace...', 'success');
        if (window.editor) {
            window.editor.setValue(fixedCode);
        }
        
        // Retry rendering
        await renderCode(fixedCode, activeScenePrompt);
        
    } catch (error) {
        appendLog(`Healer failed: ${error.message}`, 'error');
        setLoadingOverlay(false);
        terminalActionBar.classList.remove('hidden');
    }
}

// Stitch scenes together
async function stitchScenes() {
    if (stitchQueue.length < 2) return;
    
    setLoadingOverlay(true, 'Stitching Videos with MoviePy...');
    appendLog(`Stitching ${stitchQueue.length} video clips together. Please wait...`, 'info');
    
    try {
        const response = await fetch('/api/stitch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scene_ids: stitchQueue })
        });
        
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.detail || 'Video stitching failed');
        }
        
        const result = await response.json();
        appendLog(`Successfully stitched final movie: ${result.scene_id}!`, 'success');
        
        // Reset queue
        stitchQueue = [];
        updateTimelineUI();
        
        // Fetch history
        await fetchHistory();
        
        // Load the new stitched clip
        loadScene(result.scene_id);
        
    } catch (error) {
        appendLog(`Stitching failed: ${error.message}`, 'error');
    } finally {
        setLoadingOverlay(false);
    }
}

// UI State utilities
function setGeneratingState(isGenerating) {
    if (isGenerating) {
        btnGenerate.disabled = true;
        btnGenerate.querySelector('span').textContent = 'Generating...';
        btnGenerate.querySelector('i').className = 'fa-solid fa-spinner fa-spin';
    } else {
        btnGenerate.disabled = false;
        btnGenerate.querySelector('span').textContent = 'Generate Scene';
        btnGenerate.querySelector('i').className = 'fa-solid fa-play';
    }
}

function setLoadingOverlay(show, message = 'Processing...') {
    if (show) {
        renderLoadingOverlay.querySelector('.loading-status').textContent = message;
        renderLoadingOverlay.classList.remove('hidden');
    } else {
        renderLoadingOverlay.classList.add('hidden');
    }
}

// Download code locally
function downloadCodeFile() {
    if (!window.editor) return;
    const code = window.editor.getValue();
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeSceneId ? `${activeSceneId}.py` : 'scene.py';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Event Bindings
btnGenerate.addEventListener('click', generateScene);
btnRefreshHistory.addEventListener('click', fetchHistory);
btnRender.addEventListener('click', () => {
    if (window.editor) {
        renderCode(window.editor.getValue(), activeScenePrompt);
    }
});
btnDownloadCode.addEventListener('click', downloadCodeFile);
btnClearConsole.addEventListener('click', clearLogs);
btnAutoFix.addEventListener('click', autoFixWithAI);
btnStitch.addEventListener('click', stitchScenes);

// Fetch history on startup
fetchHistory();
