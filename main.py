import os
import re
import json
import shutil
import subprocess
import sys
from datetime import datetime
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from dotenv import load_dotenv
from google import genai
from moviepy import VideoFileClip, concatenate_videoclips

# 1. Load the environment variables from the .env file
load_dotenv()

# 2. Initialize the Gemini client using the NEW SDK
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
client = None
if not GEMINI_API_KEY:
    print("WARNING: GEMINI_API_KEY is not set in environment or .env file.")
else:
    client = genai.Client(api_key=GEMINI_API_KEY)

# 3. Setup FastAPI and Directories
app = FastAPI(title="AniMatrix Backend", version="1.0.0")

# Enable CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OUTPUT_DIR = "output"
STATIC_DIR = "static"
RENDERS_DIR = os.path.join(STATIC_DIR, "renders")
HISTORY_FILE = os.path.join(OUTPUT_DIR, "scenes.json")

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(STATIC_DIR, exist_ok=True)
os.makedirs(RENDERS_DIR, exist_ok=True)

# 4. JSON Database Helpers
def load_history():
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, "r") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading history file: {e}")
            return {}
    return {}

def save_history(history):
    try:
        with open(HISTORY_FILE, "w") as f:
            json.dump(history, f, indent=2)
    except Exception as e:
        print(f"Error saving history file: {e}")

# 5. Model schemas
class GenerateRequest(BaseModel):
    prompt: str

class RenderRequest(BaseModel):
    code: str
    prompt: Optional[str] = "Manual Edit"
    scene_id: Optional[str] = None

class FixRequest(BaseModel):
    prompt: str
    code: str
    error: str

class StitchRequest(BaseModel):
    scene_ids: List[str]

# Helper to extract python code block from raw LLM output
def extract_python_code(raw_text):
    backticks = chr(96) * 3
    pattern = rf"{backticks}(?:python)?\n(.*?)\n{backticks}"
    match = re.search(pattern, raw_text, re.DOTALL)
    if match:
        return match.group(1).strip()
    return raw_text.strip()

# 6. API Endpoints

@app.post("/api/generate")
async def generate_code(req: GenerateRequest):
    if not client:
        raise HTTPException(status_code=500, detail="Gemini API Key is not configured on the server.")
    
    system_instruction = (
        "You are an expert in Python and the Manim animation library. "
        "When given a request, generate ONLY valid Python code using Manim. "
        "CRITICAL FONT RULES: You must NEVER use Tex() or MathTex(). "
        "You must ONLY use the standard Text() class for all text and equations. "
        "If you need to animate parts of an equation separately, you must create separate Text() "
        "objects and group them using VGroup (e.g., VGroup(Text('a^2'), Text('+'), Text('b^2'))). "
        "Never pass multiple comma-separated strings to a single Text() object. "
        "Do not include any explanations, greetings, or additional text. "
        "Just output the raw code block."
    )
    
    full_prompt = f"{system_instruction}\n\nUser Request: {req.prompt}"
    
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=full_prompt,
        )
        raw_code = response.text
        cleaned_code = extract_python_code(raw_code)
        return {"code": cleaned_code}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM Generation failed: {str(e)}")


@app.post("/api/render")
async def render_scene(req: RenderRequest):
    # Determine scene_id
    if req.scene_id:
        scene_id = req.scene_id
    else:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        scene_id = f"scene_{timestamp}"

    py_filepath = os.path.join(OUTPUT_DIR, f"{scene_id}.py")
    
    # Save the Python code
    try:
        with open(py_filepath, "w") as f:
            f.write(req.code)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to write script: {str(e)}")

    # Run Manim in a subprocess
    # Command: python -m manim -qm -v WARNING output/scene_xxx.py
    print(f"Rendering Manim script {py_filepath}...")
    result = subprocess.run(
        [sys.executable, "-m", "manim", "-qm", "-v", "WARNING", py_filepath],
        capture_output=True,
        text=True
    )
    
    log_output = f"STDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
    
    if result.returncode == 0:
        # Success! Now locate the rendered video file
        # Manim puts it in media/videos/scene_xxx/720p30/<ClassName>.mp4
        # We recursively look for .mp4 under media/videos/scene_xxx/
        search_dir = os.path.join("media", "videos", scene_id)
        video_file = None
        
        if os.path.exists(search_dir):
            for root, dirs, files in os.walk(search_dir):
                for file in files:
                    if file.lower().endswith(".mp4"):
                        video_file = os.path.join(root, file)
                        break
                if video_file:
                    break
        
        if video_file and os.path.exists(video_file):
            # Copy to static/renders/scene_xxx.mp4
            dest_filename = f"{scene_id}.mp4"
            dest_path = os.path.join(RENDERS_DIR, dest_filename)
            shutil.copy2(video_file, dest_path)
            
            video_url = f"/renders/{dest_filename}"
            
            # Save to JSON database
            history = load_history()
            history[scene_id] = {
                "scene_id": scene_id,
                "prompt": req.prompt,
                "code": req.code,
                "video_url": video_url,
                "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }
            save_history(history)
            
            return {
                "success": True,
                "scene_id": scene_id,
                "video_url": video_url,
                "log": log_output
            }
        else:
            return {
                "success": False,
                "scene_id": scene_id,
                "error": "Render succeeded but video file could not be located in media output folder.",
                "log": log_output
            }
    else:
        # Failure! Return details
        return {
            "success": False,
            "scene_id": scene_id,
            "error": "Manim compilation failed.",
            "log": log_output
        }


@app.post("/api/fix")
async def fix_code(req: FixRequest):
    if not client:
        raise HTTPException(status_code=500, detail="Gemini API Key is not configured on the server.")

    fix_prompt = f"""Original User Request: {req.prompt}
Generated Manim Code:
```python
{req.code}
```

Error Message:
{req.error}

The above Manim code failed to render. Please fix all syntax, logic, and Manim-related errors.

Requirements:
1. Return ONLY valid Python code using Manim.
2. CRITICAL FONT RULES: You must NEVER use Tex() or MathTex(). You must ONLY use the standard Text() class for all text and equations. If you need to animate parts of an equation separately, you must create separate Text() objects and group them using VGroup (e.g., VGroup(Text('a^2'), Text('+'), Text('b^2'))). Never pass multiple comma-separated strings to a single Text() object.
3. Do NOT include explanations, greetings, or comments outside the code block.
4. Wrap the code inside triple backticks.

Corrected Code:
"""
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=fix_prompt,
        )
        raw_code = response.text
        cleaned_code = extract_python_code(raw_code)
        return {"code": cleaned_code}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM Repair failed: {str(e)}")


@app.post("/api/stitch")
async def stitch_videos(req: StitchRequest):
    if len(req.scene_ids) < 2:
        raise HTTPException(status_code=400, detail="At least two scenes are required for stitching.")

    history = load_history()
    video_paths = []
    
    for sid in req.scene_ids:
        if sid not in history:
            raise HTTPException(status_code=404, detail=f"Scene {sid} not found in history.")
        
        # Resolve local video path
        video_filename = f"{sid}.mp4"
        local_path = os.path.join(RENDERS_DIR, video_filename)
        
        if not os.path.exists(local_path):
            raise HTTPException(status_code=404, detail=f"Video file for scene {sid} is missing on the server.")
        
        video_paths.append(local_path)
    
    # Perform MoviePy stitching
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    stitched_id = f"stitched_{timestamp}"
    output_filename = f"{stitched_id}.mp4"
    output_path = os.path.join(RENDERS_DIR, output_filename)
    
    clips = []
    final_clip = None
    try:
        for path in video_paths:
            clips.append(VideoFileClip(path))
            
        final_clip = concatenate_videoclips(clips, method="compose")
        final_clip.write_videofile(
            output_path, 
            codec="libx264", 
            audio_codec="aac",
            temp_audiofile=os.path.join(OUTPUT_DIR, f"temp_{stitched_id}.mp3"),
            remove_temp=True
        )
        
        # Close all clips to release file locks on Windows
        for clip in clips:
            clip.close()
        final_clip.close()
        
        video_url = f"/renders/{output_filename}"
        
        # Save stitch metadata to history
        history[stitched_id] = {
            "scene_id": stitched_id,
            "prompt": f"Stitched Video ({len(req.scene_ids)} clips)",
            "code": "# Stitched video from " + ", ".join(req.scene_ids),
            "video_url": video_url,
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "is_stitched": True,
            "parent_scenes": req.scene_ids
        }
        save_history(history)
        
        return {
            "success": True,
            "scene_id": stitched_id,
            "video_url": video_url
        }
    except Exception as e:
        # Make sure clips and final_clip are closed in case of exception to avoid Windows file locks
        if final_clip:
            try:
                final_clip.close()
            except:
                pass
        for clip in clips:
            try:
                clip.close()
            except:
                pass
        raise HTTPException(status_code=500, detail=f"Stitching failed: {str(e)}")


@app.get("/api/history")
async def get_history():
    history = load_history()
    # Sort history by timestamp descending
    sorted_history = sorted(
        history.values(), 
        key=lambda x: x.get("timestamp", ""), 
        reverse=True
    )
    return sorted_history

# Mount the media directories and serve frontend
app.mount("/renders", StaticFiles(directory=RENDERS_DIR), name="renders")
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
