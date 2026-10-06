"""PRD §7 structured application data — apply_for_role now requires every common
field plus a role-specific `role_details` payload, validated server-side (not just
in the frontend wizard) before a PartnerRole/PartnerRoleApplication row is created.
End-to-end against a real Postgres; see test_referral_network.py's docstring for
how these run."""
from tests.db_helpers import _common_application_fields, _role_details, apply, auth, db_tests, register


@db_tests
async def test_apply_without_common_fields_is_rejected(api):
    token, _ = await register(api, "Partner Missing Fields")
    payload = {"role_type": "local_expert", "role_details": _role_details("local_expert")}
    r = await api.post("/api/v1/partners/roles", json=payload, headers=auth(token))
    assert r.status_code == 422, r.text


@db_tests
async def test_apply_with_invalid_role_details_is_rejected(api):
    token, _ = await register(api, "Partner Bad Details")
    payload = {"role_type": "local_expert", **_common_application_fields(), "role_details": {}}
    r = await api.post("/api/v1/partners/roles", json=payload, headers=auth(token))
    assert r.status_code == 422, r.text
    assert "primary_destination" in r.text or "languages" in r.text


@db_tests
async def test_apply_for_each_role_persists_prd_7_fields(api):
    for role_type in ("local_expert", "guide", "host", "hotel", "rent_a_car"):
        token, _ = await register(api, f"Partner {role_type}")
        r = await apply(api, token, role_type)
        assert r.status_code == 201, r.text
        body = r.json()
        application = body["applications"][0]
        assert application["full_legal_name"] == "Test Partner"
        expected_details = _role_details(role_type)
        for key, value in expected_details.items():
            assert application["role_details"][key] == value


@db_tests
async def test_reapply_after_rejection_gets_fresh_application_data(api):
    from tests.db_helpers import admin_token, auth as _auth, upload_required_documents

    admin = await admin_token(api)
    token, _ = await register(api, "Partner Reapply")
    r = await apply(api, token, "host")
    role_id = r.json()["id"]
    await upload_required_documents(api, token, role_id, "host")
    reject = await api.post(
        f"/api/v1/admin/partners/roles/{role_id}/reject", json={"reason": "test"}, headers=_auth(admin)
    )
    assert reject.status_code == 200, reject.text

    r2 = await apply(api, token, "host", full_legal_name="Updated Legal Name")
    assert r2.status_code == 201, r2.text
    applications = r2.json()["applications"]
    assert applications[0]["full_legal_name"] == "Updated Legal Name"
