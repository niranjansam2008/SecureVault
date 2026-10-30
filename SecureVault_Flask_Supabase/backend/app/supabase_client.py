import os
import requests

class SupabaseREST:
    def __init__(self, token):
        self.url = os.getenv("SUPABASE_URL", "").rstrip("/")
        self.anon = os.getenv("SUPABASE_ANON_KEY", "")
        self.token = token
        if not self.url or not self.anon:
            raise RuntimeError("Set SUPABASE_URL and SUPABASE_ANON_KEY in backend/.env")

    @property
    def headers(self):
        return {
            "apikey": self.anon,
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }

    def select(self, table, params=None):
        r = requests.get(f"{self.url}/rest/v1/{table}", headers=self.headers, params=params or {}, timeout=20)
        r.raise_for_status()
        return r.json()

    def insert(self, table, payload):
        r = requests.post(f"{self.url}/rest/v1/{table}", headers=self.headers, json=payload, timeout=20)
        r.raise_for_status()
        data = r.json()
        return data[0] if data else None

    def update(self, table, params, payload):
        r = requests.patch(f"{self.url}/rest/v1/{table}", headers=self.headers, params=params, json=payload, timeout=20)
        r.raise_for_status()
        data = r.json()
        return data[0] if data else None

    def profile(self, user_id):
        rows = self.select("profiles", {"id": f"eq.{user_id}", "select": "id,full_name,role,department"})
        return rows[0] if rows else None
