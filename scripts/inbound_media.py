#!/usr/bin/env python3
"""Local ASR and video evidence extraction for QQ inbound media."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path


TOOLS_DIR = Path(os.environ.get("UTA_TOOLS_DIR") or Path(__file__).resolve().parents[2])
TORCH_LIB = TOOLS_DIR / "GPT-SoVITS" / ".venv" / "Lib" / "site-packages" / "torch" / "lib"
DEFAULT_MODEL = TOOLS_DIR / "models" / "Systran" / "faster-whisper-small"


def emit(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False))


def probe_duration(ffmpeg: str, source: Path) -> float:
    proc = subprocess.run(
        [ffmpeg, "-hide_banner", "-i", str(source)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        timeout=30,
        check=False,
    )
    text = proc.stderr.decode("utf-8", errors="replace")
    match = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", text)
    if not match:
        return 0.0
    return int(match.group(1)) * 3600 + int(match.group(2)) * 60 + float(match.group(3))


def load_model(model_path: str):
    # ctranslate2 在 Windows 上需要 torch/lib 里的 CUDA 12 DLL；缺 PATH 时会在
    # GPU 初始化阶段报 cublas 找不到，而不是模型损坏。
    if TORCH_LIB.exists():
        os.environ["PATH"] = str(TORCH_LIB) + os.pathsep + os.environ.get("PATH", "")
    from faster_whisper import WhisperModel

    path = model_path or str(DEFAULT_MODEL)
    try:
        return WhisperModel(path, device="cuda", compute_type="float16")
    except Exception:
        return WhisperModel(path, device="cpu", compute_type="int8")


def transcribe(source: Path, model_path: str, max_seconds: int) -> dict:
    model = load_model(model_path)
    segments, info = model.transcribe(
        str(source),
        language="zh",
        vad_filter=True,
        beam_size=3,
        condition_on_previous_text=False,
        clip_timestamps=f"0,{max_seconds}",
    )
    text = "".join(segment.text for segment in segments).strip()
    return {
        "ok": True,
        "text": text,
        "language": getattr(info, "language", "zh"),
        "duration": getattr(info, "duration", None),
    }


def extract_video(source: Path, ffmpeg: str, out_dir: Path, max_seconds: int, max_frames: int, model_path: str) -> dict:
    duration = probe_duration(ffmpeg, source)
    usable = min(duration or float(max_seconds), float(max_seconds))
    frames: list[str] = []
    transcript = ""
    if usable > 0:
        interval = max(0.25, usable / max(1, max_frames))
        pattern = out_dir / "frame-%02d.jpg"
        proc = subprocess.run(
            [
                ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
                "-i", str(source), "-t", f"{usable:.3f}",
                "-vf", f"fps=1/{interval:.6f},scale='min(960,iw)':-2",
                "-frames:v", str(max_frames), "-q:v", "3", str(pattern),
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            timeout=120,
            check=False,
        )
        if proc.returncode != 0:
            raise RuntimeError(proc.stderr.decode("utf-8", errors="replace")[-1200:])
        frames = [p.name for p in sorted(out_dir.glob("frame-*.jpg"))]

        with tempfile.TemporaryDirectory(prefix="qq-video-audio-") as temp_dir:
            wav = Path(temp_dir) / "audio.wav"
            audio = subprocess.run(
                [
                    ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
                    "-i", str(source), "-t", f"{usable:.3f}", "-vn",
                    "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(wav),
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                timeout=120,
                check=False,
            )
            if audio.returncode == 0 and wav.exists() and wav.stat().st_size > 44:
                transcript = transcribe(wav, model_path, max_seconds).get("text", "")
    return {
        "ok": True,
        "duration": duration,
        "processed_seconds": usable,
        "frames": frames,
        "transcript": transcript,
    }


def extract_frames(source: Path, ffmpeg: str, out_dir: Path, max_frames: int) -> dict:
    """Extract a small, evenly spread set of frames from an animated image."""
    duration = probe_duration(ffmpeg, source)
    pattern = out_dir / "frame-%02d.jpg"
    vf = f"fps={max(1.0, max_frames / duration):.6f},scale='min(640,iw)':-2" if duration > 0 else "scale='min(640,iw)':-2"
    proc = subprocess.run(
        [
            ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
            "-i", str(source), "-vf", vf, "-frames:v", str(max_frames),
            "-q:v", "3", str(pattern),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        timeout=60,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode("utf-8", errors="replace")[-1200:])
    return {"ok": True, "duration": duration, "frames": [p.name for p in sorted(out_dir.glob("frame-*.jpg"))]}


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    transcribe_parser = sub.add_parser("transcribe")
    transcribe_parser.add_argument("--input", required=True)
    transcribe_parser.add_argument("--model", default="")
    transcribe_parser.add_argument("--max-seconds", type=int, default=300)

    video_parser = sub.add_parser("video")
    video_parser.add_argument("--input", required=True)
    video_parser.add_argument("--model", default="")
    video_parser.add_argument("--ffmpeg", required=True)
    video_parser.add_argument("--out-dir", required=True)
    video_parser.add_argument("--max-seconds", type=int, default=300)
    video_parser.add_argument("--max-frames", type=int, default=16)

    frames_parser = sub.add_parser("frames")
    frames_parser.add_argument("--input", required=True)
    frames_parser.add_argument("--ffmpeg", required=True)
    frames_parser.add_argument("--out-dir", required=True)
    frames_parser.add_argument("--max-frames", type=int, default=4)

    args = parser.parse_args()
    try:
        source = Path(args.input).resolve()
        if not source.is_file():
            raise FileNotFoundError(str(source))
        if args.command == "transcribe":
            result = transcribe(source, args.model, max(1, min(900, args.max_seconds)))
        elif args.command == "video":
            out_dir = Path(args.out_dir).resolve()
            out_dir.mkdir(parents=True, exist_ok=True)
            result = extract_video(
                source,
                args.ffmpeg,
                out_dir,
                max(1, min(900, args.max_seconds)),
                max(1, min(16, args.max_frames)),
                args.model,
            )
        else:
            out_dir = Path(args.out_dir).resolve()
            out_dir.mkdir(parents=True, exist_ok=True)
            result = extract_frames(
                source,
                args.ffmpeg,
                out_dir,
                max(1, min(8, args.max_frames)),
            )
        emit(result)
        return 0
    except Exception as exc:
        emit({"ok": False, "error": f"{type(exc).__name__}: {exc}"})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
