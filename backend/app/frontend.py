"""Serve only the compiled React build; never expose the repository or dummy DB."""

from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles


def mount_frontend(app: FastAPI, directory: Path) -> None:
    if not (directory / "index.html").is_file():
        raise RuntimeError("React build missing. Run npm run build from the repository root first.")
    app.mount("/", StaticFiles(directory=directory, html=True), name="frontend")
