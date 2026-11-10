from io import BytesIO

from pptx import Presentation

from app import services

PPTX_MEDIA = "application/vnd.openxmlformats-officedocument.presentationml.presentation"


def _pptx_bytes() -> bytes:
    buffer = BytesIO()
    Presentation().save(buffer)
    return buffer.getvalue()


def _create_template(client):
    response = client.post(
        "/templates",
        data={"name": "Корпоративный"},
        files={"file": ("brand.pptx", _pptx_bytes(), PPTX_MEDIA)},
    )
    assert response.status_code == 201
    return response.json()


def test_version_preview_returns_pdf(client, monkeypatch):
    monkeypatch.setattr(services, "pptx_to_pdf", lambda data: b"%PDF-1.4 preview")
    template = _create_template(client)
    version_id = template["versions"][0]["id"]

    response = client.get(f"/templates/{template['id']}/versions/{version_id}/preview")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content == b"%PDF-1.4 preview"


def test_preview_reports_unavailable_converter(client, monkeypatch):
    from app.pdf import PdfConversionError

    def fail(data):
        raise PdfConversionError("LibreOffice не установлен на сервере")

    monkeypatch.setattr(services, "pptx_to_pdf", fail)
    template = _create_template(client)
    version_id = template["versions"][0]["id"]

    response = client.get(f"/templates/{template['id']}/versions/{version_id}/preview")

    assert response.status_code == 503
    assert "LibreOffice" in response.json()["detail"]


def test_preview_unknown_version_is_404(client, monkeypatch):
    monkeypatch.setattr(services, "pptx_to_pdf", lambda data: b"%PDF")
    template = _create_template(client)

    response = client.get(f"/templates/{template['id']}/versions/999999/preview")

    assert response.status_code == 404
