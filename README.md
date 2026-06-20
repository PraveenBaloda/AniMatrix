# AniMatrix — AI-Powered Manim Animation System

AniMatrix is a premium, web-based tool and pipeline automation utility that uses the Gemini API to generate, compile, and refine Python code using the Manim Community Edition library. It features a complete web UI for editing and previewing animation code, auto-correcting errors with Gemini, and stitching multiple scenes into a unified video.

---

## What It Has

1. **FastAPI Backend (`main.py`):**
   - `/api/generate`: Generates Manim code for a given text prompt using the Gemini API.
   - `/api/render`: Submits code to a sub-process compilation engine utilizing Manim.
   - `/api/fix`: Accepts error logs and code, asking Gemini to self-heal/repair syntax and Manim errors.
   - `/api/stitch`: Concatenates multiple rendering video segments together using MoviePy.
   - `/api/history`: Provides access to a JSON-based history file recording previous renders, prompts, code, and paths.

2. **Web Frontend (`static/`):**
   - **Monaco Editor Integrations:** Write, modify, and render custom Manim Python scripts directly in a browser-based IDE.
   - **Live Preview Panel:** Instantly play rendered MP4 files.
   - **Gemini Auto-Fix Panel:** If rendering fails, a single click will send compiler errors to Gemini to automatically heal your code and re-render.
   - **Timeline Stitching Queue:** Queue up scenes by checking them off and stich them into a single movie using MoviePy.
   - **Download Center:** Instantly download Python files or the rendered MP4 animations.

3. **Standalone Automation Pipeline (`pipeline_automation.py`):**
   - An interactive command-line interface (CLI) script that accepts prompts, writes code, tries to compile, and loops up to 3 times to automatically auto-correct compile issues using Gemini.

---

## Prerequisites

To run Manim and MoviePy animations, your machine requires:
1. **Python 3.12+**
2. **FFmpeg:** Manim and MoviePy depend on FFmpeg for video rendering.
   - *Windows:* Install via `winget install Gyan.FFmpeg` or download from [ffmpeg.org](https://ffmpeg.org).
   - *macOS:* Install via `brew install ffmpeg`.
   - *Linux:* Install via `sudo apt install ffmpeg`.
3. **Pango/Cairo (Required by Manim):**
   - Normally handled by package managers or the python packages built during setup.

---

## Setup & Configuration

1. **Clone the Repository** and navigate to the project directory.
2. **Set up Environment Variables:**
   Create a `.env` file at the root of the project:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

3. **Sync Dependencies:**
   This project uses `uv` to manage the virtual environment. Install `uv` if not already present, then sync dependencies:
   ```bash
   uv sync
   ```

---

## How to Run

### 1. Launch the Backend Server & Web UI
Start the FastAPI server:
```bash
uv run python main.py
```
- The server will start on [http://127.0.0.1:8000](http://127.0.0.1:8000).
- Open this URL in your web browser to access the Monaco editor workspace, prompt generator, live video preview, and timeline stitching interface.

### 2. Run the Interactive Command Line Pipeline
Alternatively, if you want to use the CLI automation script to generate animations:
```bash
uv run python pipeline_automation.py
```
- Follow the prompt prompts to input animation ideas.
- The script will interactively generate Python files, attempt rendering, and invoke Gemini auto-fixes upon failure.