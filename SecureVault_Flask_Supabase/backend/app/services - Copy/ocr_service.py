"""OCR integration point.

Install pytesseract and the Tesseract binary when ready.
Never treat OCR output as verified bank data: a human verifier must confirm it.
"""

def extract_fdr_fields(file_path: str) -> dict:
    # TODO: integrate pytesseract + PDF/image preprocessing.
    return {
        "fdr_number": None,
        "bank_name": None,
        "amount": None,
        "issue_date": None,
        "maturity_date": None,
        "confidence": "not_configured"
    }
