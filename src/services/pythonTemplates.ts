export const FLASK_APP_CODE = `# ============================================================
# Cloudflare R2 Media Vault - Flask Backend (app.py)
# ============================================================
import os
import time
import uuid
import json
import boto3
from botocore.config import Config
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, render_template, send_from_directory
from werkzeug.utils import secure_filename
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB limit

# Cloudflare R2 Configuration from Environment Variables
R2_ACCOUNT_ID = os.getenv("CLOUDFLARE_R2_ACCOUNT_ID", "your_account_id")
R2_ACCESS_KEY = os.getenv("CLOUDFLARE_R2_ACCESS_KEY_ID", "your_access_key")
R2_SECRET_KEY = os.getenv("CLOUDFLARE_R2_SECRET_ACCESS_KEY", "your_secret_key")
R2_BUCKET_NAME = os.getenv("CLOUDFLARE_R2_BUCKET_NAME", "my-vault")
R2_PUBLIC_DOMAIN = os.getenv("CLOUDFLARE_R2_PUBLIC_DOMAIN", "https://pub-yourdomain.r2.dev")

DB_FILE = "uploads_metadata.json"

# Initialize Boto3 S3 Client for Cloudflare R2
s3_client = boto3.client(
    service_name="s3",
    endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=R2_ACCESS_KEY,
    aws_secret_access_key=R2_SECRET_KEY,
    region_name="auto",
    config=Config(s3={"addressing_style": "virtual"})
)

def load_metadata():
    if not os.path.exists(DB_FILE):
        return []
    with open(DB_FILE, "r") as f:
        try:
            return json.load(f)
        except:
            return []

def save_metadata(data):
    with open(DB_FILE, "w") as f:
        json.dump(data, f, indent=2)

def cleanup_expired():
    """Removes expired files from R2 and metadata"""
    files = load_metadata()
    now = time.time()
    active_files = []
    
    for f in files:
        if f.get("expires_at") and now > f["expires_at"]:
            try:
                s3_client.delete_object(Bucket=R2_BUCKET_NAME, Key=f["storage_key"])
                print(f"[Auto-Delete] Expired file removed: {f['name']}")
            except Exception as e:
                print(f"[Error] Failed to delete {f['name']} from R2: {e}")
        else:
            active_files.append(f)
            
    save_metadata(active_files)
    return len(files) - len(active_files)

@app.route("/")
def index():
    cleanup_expired()
    return render_template("index.html")

@app.route("/api/files", methods=["GET"])
def get_files():
    cleanup_expired()
    files = load_metadata()
    now = time.time()
    for f in files:
        f["is_expired"] = bool(f.get("expires_at") and now > f["expires_at"])
    return jsonify(files)

@app.route("/api/upload", methods=["POST"])
def upload():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
        
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400

    retention = request.form.get("retention", "permanent") # permanent, 1day, 2days, 3days
    upload_time = time.time()
    
    expires_at = None
    if retention == "1day":
        expires_at = upload_time + (24 * 3600)
    elif retention == "2days":
        expires_at = upload_time + (48 * 3600)
    elif retention == "3days":
        expires_at = upload_time + (72 * 3600)

    filename = secure_filename(file.filename)
    extension = os.path.splitext(filename)[1]
    unique_key = f"uploads/{uuid.uuid4().hex[:8]}_{int(upload_time)}{extension}"
    
    # Upload to Cloudflare R2
    try:
        s3_client.upload_fileobj(
            file,
            R2_BUCKET_NAME,
            unique_key,
            ExtraArgs={
                "ContentType": file.content_type
            }
        )
    except Exception as e:
        return jsonify({"error": f"Cloudflare R2 Upload Failed: {str(e)}"}), 500

    public_url = f"{R2_PUBLIC_DOMAIN.rstrip('/')}/{unique_key}"

    file_record = {
        "id": str(uuid.uuid4()),
        "name": filename,
        "storage_key": unique_key,
        "content_type": file.content_type,
        "category": "video" if file.content_type.startswith("video") else "image",
        "size": request.content_length or 0,
        "public_url": public_url,
        "uploaded_at": upload_time,
        "expires_at": expires_at,
        "retention": retention
    }

    files = load_metadata()
    files.insert(0, file_record)
    save_metadata(files)

    return jsonify({"success": True, "file": file_record})

@app.route("/api/delete/<file_id>", methods=["DELETE"])
def delete_file(file_id):
    files = load_metadata()
    target = next((f for f in files if f["id"] == file_id), None)
    if not target:
        return jsonify({"error": "File not found"}), 404

    try:
        s3_client.delete_object(Bucket=R2_BUCKET_NAME, Key=target["storage_key"])
    except Exception as e:
        print(f"Warning: R2 deletion error: {e}")

    updated = [f for f in files if f["id"] != file_id]
    save_metadata(updated)
    return jsonify({"success": True})

if __name__ == "__main__":
    print("🚀 Cloudflare R2 Flask Web App running at http://localhost:5000")
    app.run(debug=True, port=5000)
`;

export const STREAMLIT_APP_CODE = `# ============================================================
# Cloudflare R2 Media Vault - Streamlit Web App (app.py)
# ============================================================
import streamlit as st
import boto3
from botocore.config import Config
import os
import time
import uuid
import json
from datetime import datetime, timedelta

st.set_page_config(
    page_title="Cloudflare R2 Media Vault",
    page_icon="☁️",
    layout="wide"
)

# Load configuration
st.sidebar.header("⚙️ Cloudflare R2 Settings")
R2_ACCOUNT_ID = st.sidebar.text_input("Account ID", value=os.getenv("R2_ACCOUNT_ID", ""))
R2_ACCESS_KEY = st.sidebar.text_input("Access Key ID", value=os.getenv("R2_ACCESS_KEY", ""), type="password")
R2_SECRET_KEY = st.sidebar.text_input("Secret Access Key", value=os.getenv("R2_SECRET_KEY", ""), type="password")
R2_BUCKET_NAME = st.sidebar.text_input("Bucket Name", value=os.getenv("R2_BUCKET_NAME", "my-vault"))
R2_PUBLIC_DOMAIN = st.sidebar.text_input("Public Domain", value=os.getenv("R2_PUBLIC_DOMAIN", "https://pub-xxxx.r2.dev"))

METADATA_FILE = "streamlit_uploads.json"

def get_s3_client():
    if not (R2_ACCOUNT_ID and R2_ACCESS_KEY and R2_SECRET_KEY and R2_BUCKET_NAME):
        return None
    return boto3.client(
        service_name="s3",
        endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=R2_ACCESS_KEY,
        aws_secret_access_key=R2_SECRET_KEY,
        region_name="auto"
    )

def load_files():
    if not os.path.exists(METADATA_FILE):
        return []
    with open(METADATA_FILE, "r") as f:
        try:
            return json.load(f)
        except:
            return []

def save_files(files):
    with open(METADATA_FILE, "w") as f:
        json.dump(files, f, indent=2)

def cleanup_expired():
    files = load_files()
    client = get_s3_client()
    now = time.time()
    active = []
    for f in files:
        if f.get("expires_at") and now > f["expires_at"]:
            if client:
                try:
                    client.delete_object(Bucket=R2_BUCKET_NAME, Key=f["key"])
                except:
                    pass
        else:
            active.append(f)
    save_files(active)

cleanup_expired()

st.title("☁️ Cloudflare R2 ফাইল আপলোড ও ম্যানেজমেন্ট সিস্টেম")
st.markdown("ছবি ও ভিডিও সহজে ড্র্যাগ-অ্যান্ড-ড্রপ করে Cloudflare R2 তে স্টোর করুন ও শেয়ারেবল লিংক পান।")

tab1, tab2 = st.tabs(["📤 ফাইল আপলোড (Upload)", "📊 ড্যাশবোর্ড (Dashboard)"])

with tab1:
    st.subheader("নতুন ফাইল আপলোড করুন")
    
    col1, col2 = st.columns([2, 1])
    
    with col1:
        uploaded_file = st.file_uploader(
            "ছবি অথবা ভিডিও সিলেক্ট বা ড্র্যাগ-অ্যান্ড-ড্রপ করুন:",
            type=["png", "jpg", "jpeg", "webp", "gif", "mp4", "webm", "mov"],
            help="সর্বোচ্চ ১০০ মেগাবাইট ফাইল আপলোড সমর্থিত"
        )
    
    with col2:
        retention = st.selectbox(
            "সংরক্ষণের মেয়াদ (Retention Policy):",
            options=["Permanent (স্থায়ী)", "1 Day (১ দিন)", "2 Days (২ দিন)", "3 Days (৩ দিন)"]
        )
        
    if uploaded_file is not None:
        file_bytes = uploaded_file.read()
        is_video = uploaded_file.type.startswith("video")
        
        # Preview
        if is_video:
            st.video(file_bytes)
        else:
            st.image(file_bytes, width=320)
            
        if st.button("🚀 Cloudflare R2 তে আপলোড করুন", type="primary"):
            client = get_s3_client()
            if not client:
                st.error("⚠️ দয়া করে বাম পাশের সাইডবারে আপনার Cloudflare R2 এর ক্রেডেনশিয়াল দিন।")
            else:
                with st.spinner("Cloudflare R2 তে আপলোড হচ্ছে..."):
                    ext = os.path.splitext(uploaded_file.name)[1]
                    now = time.time()
                    key = f"uploads/{uuid.uuid4().hex[:6]}_{int(now)}{ext}"
                    
                    try:
                        client.put_object(
                            Bucket=R2_BUCKET_NAME,
                            Key=key,
                            Body=file_bytes,
                            ContentType=uploaded_file.type
                        )
                        
                        # Calculate expiry
                        expires_at = None
                        if "1 Day" in retention:
                            expires_at = now + 86400
                        elif "2 Days" in retention:
                            expires_at = now + 172800
                        elif "3 Days" in retention:
                            expires_at = now + 259200
                            
                        pub_url = f"{R2_PUBLIC_DOMAIN.rstrip('/')}/{key}"
                        
                        record = {
                            "id": str(uuid.uuid4()),
                            "name": uploaded_file.name,
                            "key": key,
                            "type": "video" if is_video else "image",
                            "size": len(file_bytes),
                            "public_url": pub_url,
                            "uploaded_at": now,
                            "expires_at": expires_at,
                            "retention": retention
                        }
                        
                        files = load_files()
                        files.insert(0, record)
                        save_files(files)
                        
                        st.success("✅ ফাইলটি সফলভাবে আপলোড হয়েছে!")
                        st.code(pub_url, language="text")
                        st.info("👆 উপরের পাবলিক URL টি কপি করে যেকোনো জায়গায় শেয়ার করতে পারেন।")
                    except Exception as e:
                        st.error(f"আপলোড ব্যর্থ হয়েছে: {e}")

with tab2:
    st.subheader("📂 আপলোড করা ফাইল ড্যাশবোর্ড")
    files = load_files()
    
    if not files:
        st.info("এখনো কোনো ফাইল আপলোড করা হয়নি।")
    else:
        st.write(f"সর্বমোট ফাইল: {len(files)} টি")
        for idx, f in enumerate(files):
            with st.expander(f"{'🎥' if f['type'] == 'video' else '🖼️'} {f['name']} ({round(f['size'] / (1024*1024), 2)} MB)"):
                col_a, col_b = st.columns([2, 1])
                with col_a:
                    st.text(f"পাবলিক URL: {f['public_url']}")
                    st.code(f['public_url'])
                    exp_text = "স্থায়ী (Permanent)" if not f.get('expires_at') else f"অটো-ডিলিট হবে: {datetime.fromtimestamp(f['expires_at']).strftime('%Y-%m-%d %H:%M')}"
                    st.caption(f"স্টোরেজ কী: {f['key']} | মেয়াদ: {exp_text}")
                with col_b:
                    if st.button("🗑️ মুছে ফেলুন (Delete)", key=f"del_{f['id']}"):
                        client = get_s3_client()
                        if client:
                            try:
                                client.delete_object(Bucket=R2_BUCKET_NAME, Key=f["key"])
                            except:
                                pass
                        files = [x for x in files if x["id"] != f["id"]]
                        save_files(files)
                        st.rerun()
`;

export const PYTHON_REQUIREMENTS = `boto3>=1.34.0
flask>=3.0.0
streamlit>=1.32.0
python-dotenv>=1.0.0
werkzeug>=3.0.0
`;

export const PYTHON_ENV_EXAMPLE = `# Cloudflare R2 Credentials
CLOUDFLARE_R2_ACCOUNT_ID="your_cloudflare_account_id_here"
CLOUDFLARE_R2_ACCESS_KEY_ID="your_r2_access_key_id"
CLOUDFLARE_R2_SECRET_ACCESS_KEY="your_r2_secret_access_key"
CLOUDFLARE_R2_BUCKET_NAME="my-uploads-bucket"
CLOUDFLARE_R2_PUBLIC_DOMAIN="https://pub-xxxxxxxxxxxxxxxx.r2.dev"
`;
