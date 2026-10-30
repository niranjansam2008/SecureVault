import os, csv, io
from datetime import date
from flask import Blueprint, jsonify, request, g, Response
from .auth import require_auth, roles_required
from .supabase_client import SupabaseREST

api = Blueprint("api", __name__)

def db():
    return SupabaseREST(g.access_token)

@api.get("/health")
def health():
    return jsonify({"ok": True, "service": "SecureVault API"})

@api.get("/me")
@require_auth
def me():
    return jsonify({"user_id": g.user_id, "email": g.user_email, "profile": g.profile})

@api.get("/deposits")
@require_auth
def list_deposits():
    params = {"select": "*", "order": "created_at.desc", "limit": "200"}
    # RLS enforces vendor ownership and staff access.
    if request.args.get("status"):
        params["status"] = f"eq.{request.args['status']}"
    if request.args.get("q"):
        q = request.args["q"].replace(",", " ")
        params["or"] = f"(fdr_number.ilike.%{q}%,vendor_name.ilike.%{q}%)"
    return jsonify(db().select("deposits", params))

@api.post("/deposits")
@roles_required("vendor", "requester", "admin")
def create_deposit():
    data = request.get_json(silent=True) or {}
    required = ["vendor_name", "fdr_number", "bank_name", "amount", "issue_date", "maturity_date"]
    missing = [k for k in required if not data.get(k)]
    if missing:
        return jsonify({"error": "Missing required fields", "fields": missing}), 400
    try:
        amount = float(data["amount"])
        if amount <= 0:
            raise ValueError()
        if date.fromisoformat(data["maturity_date"]) < date.fromisoformat(data["issue_date"]):
            return jsonify({"error": "Maturity date cannot be before issue date"}), 400
    except (ValueError, TypeError):
        return jsonify({"error": "Enter a valid positive amount and ISO dates (YYYY-MM-DD)"}), 400

    payload = {
        "owner_id": g.user_id, "vendor_name": data["vendor_name"].strip(),
        "fdr_number": data["fdr_number"].strip(), "bank_name": data["bank_name"].strip(),
        "amount": amount, "issue_date": data["issue_date"], "maturity_date": data["maturity_date"],
        "department": data.get("department"), "beneficiary": data.get("beneficiary"),
        "status": "submitted"
    }
    try:
        created = db().insert("deposits", payload)
        db().insert("audit_logs", {"actor_id": g.user_id, "deposit_id": created["id"], "action": "DEPOSIT_SUBMITTED", "details": {"fdr_number": payload["fdr_number"]}})
        return jsonify(created), 201
    except Exception as e:
        return jsonify({"error": "Could not create deposit", "detail": str(e)}), 400

@api.get("/deposits/<deposit_id>")
@require_auth
def get_deposit(deposit_id):
    rows = db().select("deposits", {"id": f"eq.{deposit_id}", "select": "*"})
    if not rows:
        return jsonify({"error": "Deposit not found"}), 404
    return jsonify(rows[0])

@api.patch("/deposits/<deposit_id>/verify")
@roles_required("verifier", "admin")
def verify_deposit(deposit_id):
    data = request.get_json(silent=True) or {}
    status = "verified" if data.get("decision") == "verify" else "rejected"
    row = db().update("deposits", {"id": f"eq.{deposit_id}"}, {"status": status, "verification_notes": data.get("notes", ""), "verified_by": g.user_id})
    if row:
        db().insert("audit_logs", {"actor_id": g.user_id, "deposit_id": deposit_id, "action": f"DEPOSIT_{status.upper()}", "details": {"notes": data.get("notes", "")}})
    return jsonify(row or {"error": "Not found"}), 200 if row else 404

@api.patch("/deposits/<deposit_id>/approve")
@roles_required("approver", "admin")
def approve_deposit(deposit_id):
    data = request.get_json(silent=True) or {}
    decision = data.get("decision")
    if decision not in ("approve", "reject"):
        return jsonify({"error": "decision must be approve or reject"}), 400
    status = "approved" if decision == "approve" else "rejected"
    row = db().update("deposits", {"id": f"eq.{deposit_id}", "status": "eq.verified"}, {"status": status, "approved_by": g.user_id, "approval_notes": data.get("notes", "")})
    if row:
        db().insert("audit_logs", {"actor_id": g.user_id, "deposit_id": deposit_id, "action": f"DEPOSIT_{status.upper()}", "details": {"notes": data.get("notes", "")}})
    return jsonify(row or {"error": "Not found or deposit is not verified"}), 200 if row else 404

@api.patch("/deposits/<deposit_id>/close")
@roles_required("approver", "admin")
def close_deposit(deposit_id):
    data = request.get_json(silent=True) or {}
    status = data.get("decision")
    if status not in ("released", "forfeited", "renewed"):
        return jsonify({"error": "decision must be released, forfeited, or renewed"}), 400
    row = db().update("deposits", {"id": f"eq.{deposit_id}", "status": "eq.approved"}, {"status": status, "closed_by": g.user_id, "closure_notes": data.get("notes", "")})
    if row:
        db().insert("audit_logs", {"actor_id": g.user_id, "deposit_id": deposit_id, "action": f"DEPOSIT_{status.upper()}", "details": {"notes": data.get("notes", "")}})
    return jsonify(row or {"error": "Not found or deposit is not approved"}), 200 if row else 404

@api.get("/dashboard/summary")
@require_auth
def summary():
    rows = db().select("deposits", {"select": "id,status,amount,maturity_date"})
    counts = {}
    total = 0
    for row in rows:
        counts[row["status"]] = counts.get(row["status"], 0) + 1
        total += float(row.get("amount") or 0)
    today = date.today().isoformat()
    upcoming = sum(1 for r in rows if r.get("maturity_date") and r["maturity_date"] >= today)
    return jsonify({"total_deposits": len(rows), "total_amount": total, "by_status": counts, "upcoming_maturities": upcoming})

@api.get("/reports/deposits.csv")
@require_auth
def export_csv():
    rows = db().select("deposits", {"select": "id,vendor_name,fdr_number,bank_name,amount,issue_date,maturity_date,status", "order": "created_at.desc"})
    output = io.StringIO()
    fields = ["id","vendor_name","fdr_number","bank_name","amount","issue_date","maturity_date","status"]
    writer = csv.DictWriter(output, fieldnames=fields)
    writer.writeheader()
    writer.writerows(rows)
    return Response(output.getvalue(), mimetype="text/csv", headers={"Content-Disposition": "attachment; filename=securevault-deposits.csv"})

@api.post("/documents/signed-upload-url")
@require_auth
def signed_upload_url():
    # Client-side direct upload is recommended using Supabase Storage + user JWT.
    # This endpoint intentionally does not create privileged URLs without a validated storage policy.
    return jsonify({"message": "Upload directly to the private fdr-documents bucket using the Supabase client and authenticated user session. See frontend upload service and README."}), 501
