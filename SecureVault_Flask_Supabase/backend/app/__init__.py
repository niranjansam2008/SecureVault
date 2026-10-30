import os
from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

def create_app():
    app = Flask(__name__)
    CORS(app, resources={r"/api/*": {"origins": os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")}},
         allow_headers=["Content-Type", "Authorization"], methods=["GET", "POST", "PATCH", "OPTIONS"])

    from .routes import api
    app.register_blueprint(api, url_prefix="/api")

    @app.get("/")
    def root():
        return jsonify({"name": "SecureVault API", "status": "running"})

    return app
