import os
import re
import sys
import subprocess
from datetime import datetime
from dotenv import load_dotenv
from google import genai

# 1. Load the environment variables from the .env file
load_dotenv()

# 2. Initialize the Gemini client using the NEW SDK
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    print("Error: GEMINI_API_KEY is not set in environment or .env file.")
    sys.exit(1)
client = genai.Client(api_key=GEMINI_API_KEY)

def ask_ai_for_manim_code(user_prompt):
    # --- PROMPT ENGINEERING: THE RULES ---
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

    full_prompt = f"{system_instruction}\n\nUser Request: {user_prompt}"
    
    print(f"Sending prompt to Gemini, please wait...")
    
    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=full_prompt,
    )
    
    return response.text

def extract_python_code(raw_text):
    # Using chr(96) to generate backticks safely without breaking the chat UI
    backticks = chr(96) * 3
    pattern = rf"{backticks}(?:python)?\n(.*?)\n{backticks}"
    match = re.search(pattern, raw_text, re.DOTALL)
    
    if match:
        return match.group(1).strip()
    return raw_text.strip()

# --- Interactive Terminal Block ---
if __name__ == "__main__":
    print("\n" + "="*50)
    print("Welcome to the Bulletproof AI Animation Generator!")
    print("Type your idea, or type 'quit' to exit.")
    print("="*50)
    
    while True:
        user_request = input("\nEnter your animation idea: ")
        
        if user_request.lower() in ['quit', 'exit']:
            print("Shutting down. Goodbye!")
            break
            
        if user_request.strip() == "":
            continue
        
        result = ask_ai_for_manim_code(user_request)
        cleaned_code = extract_python_code(result)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_filename = f"animation_{timestamp}.py"
        
        with open(output_filename, "w") as f:
            f.write(cleaned_code)  
        
        print(f"Success! Saved as -> {output_filename}")
        print(f"Run it using: python3 -m manim -pql {output_filename} [ClassName]")


        #-----------------TODAY-------------------------------

        import sys

        max_retries = 3
        current_try = 0
        success = False
        filename = output_filename

        while current_try < max_retries and not success:
            print(f"\n--- Attempt {current_try + 1} ---")

            # Render using Manim
            result = subprocess.run(    
                [sys.executable, "-m", "manim", "-qm", "-v", "WARNING", filename],
                capture_output=True,
                text=True
            )

            if result.returncode == 0:
                print("Successfully rendered!")
                success = True

            else:
                print("Error detected in AI output. Asking Gemini to fix it...")

                fix_prompt = f"""Original User Request: {user_request} Generated Manim Code: {cleaned_code}
                                Error Message:{result.stderr}
                            The above Manim code failed to render.
                            fix all syntax, logic, and Manim-related errors.

                            Requirements:
                            1. Return ONLY valid Python code.
                            2. Use Manim Community Edition.
                            3. Do NOT include explanations.
                            4. Wrap the code inside triple backticks.

                            Corrected Code:
                            """

                try:
                    # Ask Gemini for corrected code
                    fixed_response = ask_ai_for_manim_code(fix_prompt)

                    # Extract code
                    cleaned_code = extract_python_code(fixed_response)

                    # Overwrite the file with corrected code
                    with open(filename, "w") as f:
                        f.write(cleaned_code)

                    print("Corrected code saved. Retrying render...")

                except Exception as e:
                    print(f"Failed to get corrected code: {e}")
                    break

                current_try += 1

        if not success:
            print("\nReached maximum retries.")
            print(f"Check the generated file: {filename}")