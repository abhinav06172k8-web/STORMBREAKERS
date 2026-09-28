"""Document validation and PDF/image page conversion for vision extraction."""

from io import BytesIO

import fitz
from fastapi import HTTPException, UploadFile

from app.core.config import settings
from app.utils.image_processing import prepare_page

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_TYPES = ALLOWED_IMAGE_TYPES | {"application/pdf"}


async def document_pages(file: UploadFile) -> list[bytes]:
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(415, "Upload a PDF, JPEG, PNG, or WebP answer sheet.")
    content = await file.read(settings.max_upload_mb * 1024 * 1024 + 1)
    if len(content) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"File exceeds the {settings.max_upload_mb} MB upload limit.")
    try:
        if file.content_type == "application/pdf":
            document = fitz.open(stream=content, filetype="pdf")
            if len(document) > 50:
                raise HTTPException(413, "Answer sheets are limited to 50 pages.")
            return [page.get_pixmap(matrix=fitz.Matrix(1.6, 1.6), alpha=False).tobytes("png") for page in document]
        return [prepare_page(content, settings.ai_vision_max_dimension)]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(400, "The uploaded document could not be read as a valid page.") from exc
