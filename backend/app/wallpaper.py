"""Encodes a sequence of JPEG/PNG frames captured by the app into a looping H.264 MP4."""

from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path


class EncodeError(RuntimeError):
    pass


def encode_mp4(frames: list[bytes], fps: int, repeat: int = 1) -> bytes:
    if not frames:
        raise EncodeError("No frames supplied")

    import imageio_ffmpeg

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    ext = "png" if frames[0][:8] == b"\x89PNG\r\n\x1a\n" else "jpg"
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        index = 0
        for _ in range(max(1, repeat)):
            for data in frames:
                (tmp_path / f"f{index:05d}.{ext}").write_bytes(data)
                index += 1
        out = tmp_path / "out.mp4"
        cmd = [
            ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
            "-framerate", str(fps),
            "-i", str(tmp_path / f"f%05d.{ext}"),
            # H.264 needs even dimensions; yuv420p + faststart keeps iOS Photos and Android happy.
            "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
            "-r", str(fps), "-movflags", "+faststart", "-an",
            str(out),
        ]
        proc = subprocess.run(cmd, capture_output=True, timeout=120)
        if proc.returncode != 0 or not out.exists():
            raise EncodeError(proc.stderr.decode(errors="replace")[-500:] or "ffmpeg failed")
        return out.read_bytes()
