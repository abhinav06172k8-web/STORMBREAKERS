"""Orientation normalization, conservative page resizing and targeted crop helpers."""

from io import BytesIO

from PIL import Image, ImageOps


def prepare_page(image_bytes: bytes, max_dimension: int = 2200) -> bytes:
    image = ImageOps.exif_transpose(Image.open(BytesIO(image_bytes))).convert("RGB")
    if max(image.size) > max_dimension:
        scale = max_dimension / max(image.size)
        image = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
    output = BytesIO()
    image.save(output, format="JPEG", quality=90, optimize=True)
    return output.getvalue()


def crop_region(image_bytes: bytes, box: list[float]) -> bytes:
    image = Image.open(BytesIO(image_bytes)).convert("RGB")
    width, height = image.size
    x1, y1, x2, y2 = box
    padding_x, padding_y = (x2 - x1) * 0.04, (y2 - y1) * 0.04
    bounds = (max(0, int((x1 - padding_x) * width)), max(0, int((y1 - padding_y) * height)),
              min(width, int((x2 + padding_x) * width)), min(height, int((y2 + padding_y) * height)))
    output = BytesIO()
    image.crop(bounds).save(output, format="JPEG", quality=94)
    return output.getvalue()
