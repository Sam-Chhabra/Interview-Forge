from pypdf import PdfReader

_MIN_TEXT_CHARS = 50

def extract_text_from_pdf(path: str) -> str:
    reader = PdfReader(path)
    pages = [page.extract_text() or "" for page in reader.pages]
    text = "\n\n".join(pages)

    if len(text.strip()) < _MIN_TEXT_CHARS:
        raise ValueError("PDF appears to have no extractable text")

    return text
