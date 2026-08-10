import io
import logging
from typing import List, Dict, Any
from pypdf import PdfReader

logger = logging.getLogger(__name__)


def extract_pdf_pages_and_text(file_bytes: bytes, filename: str) -> List[Dict[str, Any]]:
    """
    Parses a binary PDF byte stream using pypdf, extracting text content page by page
    and generating precise source citations (e.g., 'Filename.pdf, Page 2').
    """
    extracted_pages = []
    try:
        pdf_stream = io.BytesIO(file_bytes)
        reader = PdfReader(pdf_stream)
        
        for idx, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            text = text.strip()
            if text:
                extracted_pages.append({
                    "doc_id": f"{filename}-page-{idx + 1}",
                    "filename": filename,
                    "page_number": idx + 1,
                    "content": text,
                    "source_citation": f"{filename}, Page {idx + 1}"
                })
        logger.info(f"Successfully extracted {len(extracted_pages)} page(s) from PDF '{filename}'.")
    except Exception as e:
        logger.error(f"Error parsing PDF file '{filename}': {e}")
        # Fallback for plain text or damaged PDF stream
        extracted_pages.append({
            "doc_id": f"{filename}-raw",
            "filename": filename,
            "page_number": 1,
            "content": file_bytes.decode("utf-8", errors="ignore"),
            "source_citation": f"{filename}, Page 1"
        })
        
    return extracted_pages
