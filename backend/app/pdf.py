import subprocess
import tempfile
from pathlib import Path

from app.config import settings


class PdfConversionError(Exception):
    pass


def pptx_to_pdf(pptx: bytes) -> bytes:
    with tempfile.TemporaryDirectory() as workdir:
        source = Path(workdir) / "presentation.pptx"
        source.write_bytes(pptx)
        command = [
            settings.libreoffice_bin,
            "--headless",
            f"-env:UserInstallation=file://{workdir}/profile",
            "--convert-to",
            "pdf",
            "--outdir",
            workdir,
            str(source),
        ]
        try:
            result = subprocess.run(
                command, capture_output=True, timeout=240, check=False
            )
        except FileNotFoundError as exc:
            raise PdfConversionError("LibreOffice не установлен на сервере") from exc
        except subprocess.TimeoutExpired as exc:
            raise PdfConversionError(
                "Конвертация в PDF заняла слишком много времени"
            ) from exc

        output = source.with_suffix(".pdf")
        if result.returncode != 0 or not output.exists():
            details = result.stderr.decode(errors="replace").strip()[:300]
            raise PdfConversionError(
                f"LibreOffice не смог сконвертировать презентацию: {details}"
            )
        return output.read_bytes()
