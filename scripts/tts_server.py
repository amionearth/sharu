"""Optional CPU-local Indic Tiny TTS service, started automatically by Vite."""
import json
import os
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / "models"
loaded = {}
locks = {"ml": threading.Lock(), "en": threading.Lock()}


def get_model(language):
    if language not in ("ml", "en"):
        language = "ml" if language != "en" else "en"
    if language not in loaded:
        model_dir = MODELS / ("indic-tiny-tts-malayalam" if language == "ml" else "indic-tiny-tts-english")
        if not (model_dir / "model.safetensors").exists():
            raise FileNotFoundError(f"Install the Indic Tiny {language} voice with npm run voice:models.")
        sys.path.insert(0, str(model_dir))
        from indic_tiny_tts import TinyTTS
        loaded[language] = TinyTTS.from_pretrained(str(model_dir), device="cpu")
    return loaded[language]


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print("[tts] " + fmt % args)

    def respond_json(self, status, payload):
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_POST(self):
        if self.path != "/speak":
            return self.send_error(404)
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 4096:
                return self.respond_json(413, {"error": "Text is too long for a single voice line."})
            data = json.loads(self.rfile.read(length))
            text = str(data.get("text", "")).strip()[:380]
            if not text:
                return self.respond_json(400, {"error": "No dialogue to speak."})
            language = data.get("language", "ml")
            if language not in ("ml", "en"):
                language = "ml" if any("\u0d00" <= ch <= "\u0d7f" for ch in text) else "en"
            if language == "ml" and not any("\u0d00" <= ch <= "\u0d7f" for ch in text):
                return self.respond_json(422, {"error": "Indic Tiny Malayalam voice needs Malayalam script. Use the English voice for Manglish typed in Latin letters."})
            with locks[language]:
                model = get_model(language)
                voice = data.get("voice", "male" if language == "ml" else "female")
                audio = model.synthesize(text, voice=voice)
                with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                    temp_path = tmp.name
                try:
                    model.save_wav(audio, temp_path)
                    raw = Path(temp_path).read_bytes()
                finally:
                    Path(temp_path).unlink(missing_ok=True)
            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(raw)
        except Exception as e:
            self.respond_json(500, {"error": str(e)})


if __name__ == "__main__":
    print("Indic Tiny TTS listening on http://127.0.0.1:8766")
    ThreadingHTTPServer(("127.0.0.1", 8766), Handler).serve_forever()
