"""Required-document gating on partner role approval (PRD §7).

Pure-rule tests — no DB required.
"""
from unittest.mock import MagicMock
import pytest


def test_required_document_types_cover_every_role():
    from app.modules.partners.models import REQUIRED_DOCUMENT_TYPES

    for role_type in ("local_expert", "host", "guide", "hotel", "rent_a_car"):
        assert role_type in REQUIRED_DOCUMENT_TYPES
        assert len(REQUIRED_DOCUMENT_TYPES[role_type]) >= 1, f"{role_type} must require at least one document"


def test_id_card_required_for_every_role():
    from app.modules.partners.models import REQUIRED_DOCUMENT_TYPES, DocumentType

    for role_type, required in REQUIRED_DOCUMENT_TYPES.items():
        assert DocumentType.ID_CARD in required, f"{role_type} must require ID_CARD per PRD §7.1"


def test_host_and_hotel_require_property_deed():
    from app.modules.partners.models import REQUIRED_DOCUMENT_TYPES, DocumentType

    assert DocumentType.PROPERTY_DEED in REQUIRED_DOCUMENT_TYPES["host"]
    assert DocumentType.PROPERTY_DEED in REQUIRED_DOCUMENT_TYPES["hotel"]


def test_rent_a_car_requires_vehicle_registration_and_trade_license():
    from app.modules.partners.models import REQUIRED_DOCUMENT_TYPES, DocumentType

    required = REQUIRED_DOCUMENT_TYPES["rent_a_car"]
    assert DocumentType.VEHICLE_REGISTRATION in required
    assert DocumentType.TRADE_LICENSE in required


def _doc(document_type):
    d = MagicMock()
    d.document_type = document_type
    return d


def test_missing_required_documents_empty_when_none_uploaded():
    from app.modules.partners.models import missing_required_documents, DocumentType

    missing = missing_required_documents("local_expert", [])
    assert missing == [DocumentType.ID_CARD]


def test_missing_required_documents_empty_when_all_present():
    from app.modules.partners.models import missing_required_documents, DocumentType

    docs = [_doc(DocumentType.ID_CARD)]
    assert missing_required_documents("local_expert", docs) == []


def test_missing_required_documents_partial():
    from app.modules.partners.models import missing_required_documents, DocumentType

    docs = [_doc(DocumentType.ID_CARD)]
    missing = missing_required_documents("rent_a_car", docs)
    assert DocumentType.ID_CARD not in missing
    assert DocumentType.TRADE_LICENSE in missing
    assert DocumentType.VEHICLE_REGISTRATION in missing


def test_missing_required_documents_unknown_role_type_requires_nothing():
    from app.modules.partners.models import missing_required_documents

    assert missing_required_documents("not_a_real_role", []) == []


def test_extra_uploaded_document_types_dont_affect_gate():
    from app.modules.partners.models import missing_required_documents, DocumentType

    docs = [_doc(DocumentType.ID_CARD), _doc(DocumentType.OTHER)]
    assert missing_required_documents("local_expert", docs) == []


# ── approve_role gate logic (mirrors admin/service.py::approve_role) ─────────


def _should_block_role_approval(role_type: str, uploaded_types: list) -> bool:
    from app.modules.partners.models import missing_required_documents

    docs = [_doc(t) for t in uploaded_types]
    return len(missing_required_documents(role_type, docs)) > 0


@pytest.mark.parametrize("role_type,uploaded,should_block", [
    ("local_expert", [], True),
    ("local_expert", ["id_card"], False),
    ("rent_a_car", ["id_card"], True),
    ("rent_a_car", ["id_card", "trade_license", "vehicle_registration", "fitness_certificate", "insurance", "driver_license"], False),
    ("host", ["id_card"], True),
    ("host", ["id_card", "property_deed", "utility_bill"], False),
])
def test_role_approval_gate_matrix(role_type, uploaded, should_block):
    from app.modules.partners.models import DocumentType

    uploaded_types = [DocumentType(t) for t in uploaded]
    assert _should_block_role_approval(role_type, uploaded_types) == should_block
