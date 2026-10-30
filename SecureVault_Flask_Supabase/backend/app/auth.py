import os
import requests
from functools import wraps
from flask import request, jsonify, g
from .supabase_client import SupabaseREST

def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return jsonify({"error": "Missing bearer token"}), 401
        token = header.split(" ", 1)[1]
        base_url = os.getenv("SUPABASE_URL", "").rstrip("/")
        anon_key = os.getenv("SUPABASE_ANON_KEY", "")
        if not base_url or not anon_key:
            return jsonify({"error": "Set SUPABASE_URL and SUPABASE_ANON_KEY in backend/.env"}), 503
        try:
            # Ask Supabase Auth to validate the access token. This works with
            # the project's configured JWT signing algorithm without exposing
            # a JWT secret or service-role key in the application.
            response = requests.get(
                f"{base_url}/auth/v1/user",
                headers={"apikey": anon_key, "Authorization": f"Bearer {token}"},
                timeout=15
            )
            if response.status_code != 200:
                return jsonify({"error": "Invalid or expired access token"}), 401
            user = response.json()
            g.user_id = user["id"]
            g.user_email = user.get("email")
            g.access_token = token
            g.profile = SupabaseREST(token).profile(g.user_id)
            if not g.profile:
                return jsonify({"error": "Profile not found. Ask an administrator to assign a role."}), 403
        except (requests.RequestException, KeyError, ValueError):
            return jsonify({"error": "Could not validate session with Supabase Auth"}), 503
        return fn(*args, **kwargs)
    return wrapper

def roles_required(*roles):
    def decorator(fn):
        @wraps(fn)
        @require_auth
        def wrapper(*args, **kwargs):
            if g.profile.get("role") not in roles:
                return jsonify({"error": "Insufficient permissions"}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator
